// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {console} from "forge-std/console.sol";

import {Fixtures} from "./Fixtures.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {HedgedCredit} from "../src/HedgedCredit.sol";
import {UnderwriterVault} from "../src/UnderwriterVault.sol";

contract HedgedCreditTest is Fixtures {
    using SafeCast for uint256;

    UnderwriterVault internal underwriter;
    HedgedCredit internal credit;
    uint256 internal seriesId;

    address internal lender = address(0x1E4D);
    address internal neocloud = address(0x60C1);

    /// @dev A tier-2 operator's monthly offtake: 100,000 GPU-hours, roughly 137 H100s for a month.
    uint256 internal constant OFFTAKE = 100_000e18;

    function setUp() public {
        _deploy();
        _seedIndex(2.5 * 1e18);

        underwriter = new UnderwriterVault(market, IERC20(address(usdc)), owner);
        vault = address(underwriter);
        vm.prank(owner);
        market.setVault(address(underwriter));

        credit = new HedgedCredit(market, IERC20(address(usdc)), owner);

        seriesId = _listSeries(30, 0);

        // Underwriters stand ready to take the other side of the hedge.
        usdc.mint(alice, 2_000_000 * USDC_ONE);
        vm.startPrank(alice);
        usdc.approve(address(underwriter), type(uint256).max);
        underwriter.deposit(2_000_000 * USDC_ONE);
        vm.stopPrank();

        _lend(lender, 1_000_000 * USDC_ONE);
        usdc.mint(neocloud, 500_000 * USDC_ONE);
        vm.prank(neocloud);
        usdc.approve(address(credit), type(uint256).max);
    }

    function _lend(address who, uint256 amount) internal returns (uint256 shares) {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(credit), type(uint256).max);
        shares = credit.depositLender(amount);
        vm.stopPrank();
    }

    function _openLoan() internal returns (uint256 loanId) {
        uint256 margin = 60_000 * USDC_ONE;
        vm.prank(neocloud);
        loanId = credit.open(seriesId, OFFTAKE, margin, 0);
    }

    /// @dev Settle the series around `price`.
    ///
    ///      The contract settles to the *average* index over its delivery window, so moving the
    ///      rate on the last day barely moves the settlement price. To model rates falling for the
    ///      month, the rate has to fall early and hold — which is exactly how the real contract
    ///      behaves, and why a spot-settled design would have been the wrong choice here.
    function _settleAt(uint256 price) internal {
        _setSpot(price);

        uint64 expiry = market.seriesAt(seriesId).expiry;
        vm.warp(expiry + 1);
        clock = uint64(block.timestamp);

        // One more print past expiry so the window's right edge is covered.
        vm.prank(publisher);
        index.publish(clock, price, 150, 12);
        clock += uint64(index.finalityDelay()) + 1;
        vm.warp(clock);

        market.settleSeries(seriesId);
    }

    // ------------------------------------------------------------------
    // Origination
    // ------------------------------------------------------------------

    function test_open_lendsAgainstHedgedRevenueAndOpensTheShort() public {
        uint256 loanId = _openLoan();
        HedgedCredit.Loan memory loan = credit.loanAt(loanId);

        // 100,000 hours at ~$2.50 is ~$250,000 of revenue; 70% LTV is ~$175,000.
        assertApproxEqRel(loan.principal, 175_000 * USDC_ONE, 2e16, "principal at LTV");
        assertEq(loan.hedgeSize, OFFTAKE, "hedge matches the offtake exactly");
        assertGt(loan.hedgeEntryPrice, 0, "hedge filled");

        // The pool is short exactly the offtake.
        assertEq(market.positionOf(address(credit), seriesId).size, -int256(OFFTAKE), "short on the books");
        assertEq(usdc.balanceOf(neocloud), 500_000 * USDC_ONE - 60_000 * USDC_ONE + loan.principal, "drawn");
    }

    function test_open_requiresMargin() public {
        vm.prank(neocloud);
        vm.expectRevert();
        credit.open(seriesId, OFFTAKE, 1 * USDC_ONE, 0);
    }

    function test_open_boundedByPoolLiquidity() public {
        vm.prank(neocloud);
        vm.expectRevert();
        credit.open(seriesId, OFFTAKE * 20, 400_000 * USDC_ONE, 0);
    }

    // ------------------------------------------------------------------
    // The thesis
    // ------------------------------------------------------------------

    /// @dev Sweep the settlement price across a 25x range. Hedged, the borrower's resources and
    ///      the lender's recovery are both flat. Unhedged, recovery collapses as rates fall.
    function test_thesis_hedgedRecoveryIsFlatUnhedgedIsNot() public {
        uint256 loanId = _openLoan();

        uint256[] memory prices = new uint256[](5);
        prices[0] = 0.8 * 1e18;
        prices[1] = 1.75 * 1e18;
        prices[2] = 2.5 * 1e18;
        prices[3] = 3.5 * 1e18;
        prices[4] = 6.0 * 1e18;

        (, uint256 baseResources,, uint256 baseRecovery,) = credit.project(loanId, prices[2]);
        uint256 debt = credit.debtOf(loanId);

        assertEq(baseRecovery, debt, "hedged lender is made whole");

        for (uint256 i = 0; i < prices.length; ++i) {
            (, uint256 resources, uint256 unhedged, uint256 hedgedRecovery, uint256 unhedgedRecovery)
            = credit.project(loanId, prices[i]);

            assertApproxEqAbs(resources, baseResources, 2, "borrower resources fixed at the forward");
            assertEq(hedgedRecovery, debt, "lender whole at every settlement price");
            assertLe(unhedgedRecovery, hedgedRecovery, "unhedged never does better");

            if (unhedged + credit.loanAt(loanId).margin < debt) {
                assertLt(unhedgedRecovery, debt, "unhedged lender takes a loss when rates fall");
            }
        }

        // The concrete headline: at $0.80/hr the unhedged lender is short real money.
        (,,,, uint256 worstUnhedged) = credit.project(loanId, prices[0]);
        assertLt(worstUnhedged, debt, "unhedged shortfall at the low end");
    }

    /// @dev The same property, live: move the real index and watch pool NAV refuse to move.
    function test_thesis_poolNavIsIndexInvariant() public {
        _openLoan();
        uint256 navAtEntry = credit.totalAssets();

        _setSpot(1.0 * 1e18); // -60%
        assertApproxEqAbs(credit.totalAssets(), navAtEntry, 2, "NAV holds when rates collapse");

        _setSpot(1.9 * 1e18);
        assertApproxEqAbs(credit.totalAssets(), navAtEntry, 2, "and on the way back");

        _setSpot(3.6 * 1e18); // well above entry
        assertApproxEqAbs(credit.totalAssets(), navAtEntry, 2, "NAV holds when rates spike");
    }

    /// @dev Fuzz the claim rather than trusting five hand-picked prices.
    function testFuzz_hedgedRecoveryIsIndexInvariant(uint256 settlementPrice) public {
        uint256 loanId = _openLoan();
        settlementPrice = bound(settlementPrice, 0.05e18, 50e18);

        (,,, uint256 recoveryHedged,) = credit.project(loanId, settlementPrice);
        assertEq(recoveryHedged, credit.debtOf(loanId), "recovery independent of settlement");
    }

    /// @notice Prints the hedged-vs-unhedged recovery table. Run with -vv; this is the number set
    ///         the demo is built on.
    function test_demo_projectionTable() public {
        uint256 loanId = _openLoan();
        uint256 debt = credit.debtOf(loanId);
        HedgedCredit.Loan memory loan = credit.loanAt(loanId);

        console.log("offtake (GPU-hours)      ", loan.hedgeSize / 1e18);
        console.log("hedge struck at (USD/hr) ", loan.hedgeEntryPrice / 1e15); // milli-dollars
        console.log("principal (USDC)         ", loan.principal / 1e6);
        console.log("margin (USDC)            ", loan.margin / 1e6);
        console.log("debt (USDC)              ", debt / 1e6);
        console.log("---- settle | hedged recovery | unhedged recovery ----");

        uint256[] memory prices = new uint256[](6);
        prices[0] = 0.8e18;
        prices[1] = 1.2e18;
        prices[2] = 1.8e18;
        prices[3] = 2.5e18;
        prices[4] = 3.5e18;
        prices[5] = 6.0e18;

        for (uint256 i = 0; i < prices.length; ++i) {
            (,,, uint256 hedged, uint256 unhedged) = credit.project(loanId, prices[i]);
            console.log(prices[i] / 1e15, hedged / 1e6, unhedged / 1e6);
        }
    }

    // ------------------------------------------------------------------
    // Closing
    // ------------------------------------------------------------------

    function test_close_whenRatesFall_hedgeGainOffsetsTheDebt() public {
        uint256 loanId = _openLoan();
        _settleAt(1.5 * 1e18); // rates fall through the window: the short gains

        int256 hedgePnl = credit.hedgePnlOf(loanId);
        assertGt(hedgePnl, 0, "short profits");

        // The borrower still writes a cheque — their offtake revenue fell too — but the hedge
        // gain has taken a large bite out of what they owe.
        uint256 debt = credit.debtOf(loanId);
        int256 netOwed = credit.receivableOf(loanId);
        assertLt(netOwed, debt.toInt256(), "obligation reduced by the hedge");
        assertApproxEqAbs(netOwed, debt.toInt256() - hedgePnl, 2, "reduced by exactly the hedge gain");

        vm.prank(neocloud);
        credit.close(loanId);

        assertTrue(credit.loanAt(loanId).closed, "closed");
        assertEq(credit.totalMarginHeld(), 0, "margin released");
    }

    function test_close_whenRatesRise_borrowerPaysTheDifference() public {
        uint256 loanId = _openLoan();
        _settleAt(3.5 * 1e18); // rates spike: the short loses, offchain revenue rose to match

        assertLt(credit.hedgePnlOf(loanId), 0, "short loses");

        uint256 balanceBefore = usdc.balanceOf(neocloud);
        vm.prank(neocloud);
        credit.close(loanId);

        assertLt(usdc.balanceOf(neocloud), balanceBefore, "borrower settles up");
        assertTrue(credit.loanAt(loanId).closed, "closed");
    }

    /// @dev Whichever way the index went, the pool ends up with the same money.
    function test_close_poolRecoversTheSameEitherWay() public {
        uint256 snapshot = vm.snapshotState();

        uint256 loanId = _openLoan();
        _settleAt(1.5 * 1e18);
        vm.prank(neocloud);
        credit.close(loanId);
        uint256 navAfterCrash = credit.totalAssets();

        vm.revertToState(snapshot);

        loanId = _openLoan();
        _settleAt(3.5 * 1e18);
        vm.prank(neocloud);
        credit.close(loanId);
        uint256 navAfterSpike = credit.totalAssets();

        assertApproxEqRel(navAfterCrash, navAfterSpike, 1e15, "same recovery, opposite scenarios");
    }

    function test_close_onlyBorrower() public {
        uint256 loanId = _openLoan();
        _settleAt(2.5 * 1e18);

        vm.prank(alice);
        vm.expectRevert(HedgedCredit.NotBorrower.selector);
        credit.close(loanId);
    }

    function test_close_requiresSettlement() public {
        uint256 loanId = _openLoan();
        vm.prank(neocloud);
        vm.expectRevert(HedgedCredit.SeriesNotSettled.selector);
        credit.close(loanId);
    }

    // ------------------------------------------------------------------
    // Default
    // ------------------------------------------------------------------

    function test_seize_requiresGracePeriod() public {
        uint256 loanId = _openLoan();
        _settleAt(2.5 * 1e18);

        vm.expectRevert();
        credit.seize(loanId);
    }

    function test_seize_forfeitsMarginToThePool() public {
        uint256 loanId = _openLoan();
        _settleAt(3.5 * 1e18); // hedge lost; borrower owes more and walks away

        vm.warp(credit.loanAt(loanId).maturity + credit.gracePeriod() + 1);

        credit.seize(loanId);

        assertTrue(credit.loanAt(loanId).closed, "resolved");
        assertEq(credit.totalMarginHeld(), 0, "margin forfeited into the pool");
    }

    // ------------------------------------------------------------------
    // Lenders
    // ------------------------------------------------------------------

    function test_lender_redeemBoundedByDeployedCapital() public {
        _openLoan();

        uint256 shares = credit.balanceOf(lender);
        uint256 available = credit.availableLiquidity();
        assertLt(available, credit.totalAssets(), "capital is working");

        vm.prank(lender);
        vm.expectRevert();
        credit.redeemLender(shares);
    }

    function test_lender_earnsInterestOverTheLoan() public {
        uint256 navBefore = credit.totalAssets();
        uint256 loanId = _openLoan();

        // Interest is recognized at origination, so NAV steps up by the coupon.
        assertGt(credit.totalAssets(), navBefore, "coupon accrues to lenders");

        _settleAt(2.5 * 1e18);
        vm.prank(neocloud);
        credit.close(loanId);

        assertGt(credit.totalAssets(), navBefore, "and survives settlement");
    }
}
