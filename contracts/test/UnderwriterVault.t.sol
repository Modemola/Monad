// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Fixtures} from "./Fixtures.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {UnderwriterVault} from "../src/UnderwriterVault.sol";

contract UnderwriterVaultTest is Fixtures {
    UnderwriterVault internal underwriter;
    uint256 internal seriesId;

    int256 internal constant ONE_LOT = 730e18;

    address internal lpOne = address(0x11);
    address internal lpTwo = address(0x22);

    function setUp() public {
        _deploy();
        _seedIndex(2.5 * 1e18);

        underwriter = new UnderwriterVault(market, IERC20(address(usdc)), owner);
        vault = address(underwriter); // fixtures track the vault account
        vm.prank(owner);
        market.setVault(address(underwriter));

        seriesId = _listSeries(30, 0);

        _fund(alice, 200_000 * USDC_ONE);
        _fund(bob, 200_000 * USDC_ONE);
    }

    function _lpDeposit(address lp, uint256 amount) internal returns (uint256 shares) {
        usdc.mint(lp, amount);
        vm.startPrank(lp);
        usdc.approve(address(underwriter), type(uint256).max);
        shares = underwriter.deposit(amount);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Share accounting
    // ------------------------------------------------------------------

    function test_firstDepositLocksMinimumLiquidity() public {
        uint256 shares = _lpDeposit(lpOne, 100_000 * USDC_ONE);

        assertEq(shares, 100_000 * USDC_ONE - underwriter.MINIMUM_LIQUIDITY(), "dead shares withheld");
        assertEq(underwriter.balanceOf(address(underwriter)), underwriter.MINIMUM_LIQUIDITY(), "locked");
        assertApproxEqAbs(underwriter.totalAssets(), 100_000 * USDC_ONE, 1, "assets deployed as margin");
    }

    function test_firstDepositMustExceedMinimum() public {
        usdc.mint(lpOne, 1000);
        vm.startPrank(lpOne);
        usdc.approve(address(underwriter), type(uint256).max);
        vm.expectRevert();
        underwriter.deposit(1000);
        vm.stopPrank();
    }

    function test_secondDepositorGetsProportionalShares() public {
        _lpDeposit(lpOne, 100_000 * USDC_ONE);
        uint256 sharesTwo = _lpDeposit(lpTwo, 50_000 * USDC_ONE);

        // No PnL yet, so the second depositor's share should track their contribution.
        assertApproxEqRel(sharesTwo, 50_000 * USDC_ONE, 1e15, "half of the first stake");
        assertApproxEqAbs(underwriter.totalAssets(), 150_000 * USDC_ONE, 2, "pooled");
    }

    function test_depositsAfterProfitAreDiluted() public {
        _lpDeposit(lpOne, 100_000 * USDC_ONE);

        // Traders pay the spread and fees to the vault on the way in and out.
        _buy(alice, seriesId, 20 * ONE_LOT);
        _sell(alice, seriesId, -20 * ONE_LOT);

        uint256 assetsAfterFees = underwriter.totalAssets();
        assertGt(assetsAfterFees, 100_000 * USDC_ONE, "vault earned the round trip");

        uint256 sharesTwo = _lpDeposit(lpTwo, 100_000 * USDC_ONE);
        assertLt(sharesTwo, 100_000 * USDC_ONE, "later money buys fewer shares");
    }

    // ------------------------------------------------------------------
    // Underwriting economics
    // ------------------------------------------------------------------

    /// @dev The whole LP pitch: quoting both sides earns the spread and the taker fee.
    function test_vaultEarnsOnARoundTrip() public {
        _lpDeposit(lpOne, 250_000 * USDC_ONE);
        uint256 before = underwriter.totalAssets();

        _buy(alice, seriesId, 30 * ONE_LOT);
        _sell(alice, seriesId, -30 * ONE_LOT);

        assertGt(underwriter.totalAssets(), before, "vault ends the round trip ahead");
        assertEq(market.positionOf(address(underwriter), seriesId).size, 0, "and flat");
    }

    /// @dev NAV is mark-to-market: inventory losses show up immediately, not at settlement.
    function test_navReflectsUnrealizedInventoryLoss() public {
        _lpDeposit(lpOne, 250_000 * USDC_ONE);
        _buy(alice, seriesId, 40 * ONE_LOT); // vault is now short

        uint256 before = underwriter.totalAssets();
        _setSpot(3.2 * 1e18); // rates rise, the short loses

        assertLt(underwriter.totalAssets(), before, "NAV marks down straight away");
    }

    // ------------------------------------------------------------------
    // Redemption
    // ------------------------------------------------------------------

    function test_redeem_returnsAssets() public {
        uint256 shares = _lpDeposit(lpOne, 100_000 * USDC_ONE);

        vm.prank(lpOne);
        uint256 assets = underwriter.redeem(shares / 2);

        assertApproxEqRel(assets, 50_000 * USDC_ONE, 1e15, "half out");
        assertEq(usdc.balanceOf(lpOne), assets, "paid in USDC");
    }

    /// @dev Capital backing open positions cannot be pulled out from under the traders using it.
    function test_redeem_boundedByFreeCollateral() public {
        uint256 shares = _lpDeposit(lpOne, 100_000 * USDC_ONE);
        _buy(alice, seriesId, 50 * ONE_LOT); // ties up vault margin

        uint256 available = underwriter.availableLiquidity();
        uint256 requested = underwriter.previewRedeem(shares);
        assertLt(available, requested, "not all of it is free");

        vm.prank(lpOne);
        vm.expectRevert(
            abi.encodeWithSelector(UnderwriterVault.InsufficientLiquidity.selector, requested, available)
        );
        underwriter.redeem(shares);
    }

    function test_redeem_partialUpToAvailable() public {
        uint256 shares = _lpDeposit(lpOne, 100_000 * USDC_ONE);
        _buy(alice, seriesId, 50 * ONE_LOT);

        uint256 available = underwriter.availableLiquidity();
        uint256 redeemable = (shares * available) / underwriter.previewRedeem(shares);

        vm.prank(lpOne);
        uint256 assets = underwriter.redeem(redeemable - 1);
        assertGt(assets, 0, "partial redemption works");
    }

    function test_redeem_wholeVaultOnceTradersAreFlat() public {
        uint256 shares = _lpDeposit(lpOne, 100_000 * USDC_ONE);

        _buy(alice, seriesId, 20 * ONE_LOT);
        _setSpot(2.8 * 1e18);
        _sell(alice, seriesId, -20 * ONE_LOT);

        assertEq(market.positionOf(address(underwriter), seriesId).size, 0, "vault flat");

        vm.prank(lpOne);
        uint256 assets = underwriter.redeem(shares);
        assertGt(assets, 0, "LP exits");
    }

    // ------------------------------------------------------------------
    // Invariants
    // ------------------------------------------------------------------

    /// @dev Share price may rise or fall with inventory, but the vault must never hand out more
    ///      than its NAV across a full cycle of deposits, trading and redemptions.
    function test_invariant_lpsNeverRedeemMoreThanNav() public {
        _lpDeposit(lpOne, 150_000 * USDC_ONE);
        _lpDeposit(lpTwo, 150_000 * USDC_ONE);

        _buy(alice, seriesId, 25 * ONE_LOT);
        _sell(bob, seriesId, -15 * ONE_LOT);
        _setSpot(2.9 * 1e18);
        _sell(alice, seriesId, -25 * ONE_LOT);
        _buy(bob, seriesId, 15 * ONE_LOT);

        uint256 nav = underwriter.totalAssets();
        uint256 supply = underwriter.totalSupply();

        uint256 sharesOne = underwriter.balanceOf(lpOne);
        uint256 sharesTwo = underwriter.balanceOf(lpTwo);

        uint256 claimOne = underwriter.previewRedeem(sharesOne);
        uint256 claimTwo = underwriter.previewRedeem(sharesTwo);
        uint256 lockedClaim = underwriter.previewRedeem(underwriter.MINIMUM_LIQUIDITY());

        assertEq(sharesOne + sharesTwo + underwriter.MINIMUM_LIQUIDITY(), supply, "shares account for");
        assertLe(claimOne + claimTwo + lockedClaim, nav, "claims never exceed NAV");
    }
}
