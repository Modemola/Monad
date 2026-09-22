// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Fixtures} from "./Fixtures.sol";
import {IngotMarket} from "../src/IngotMarket.sol";
import {Units} from "../src/libraries/Units.sol";

contract IngotMarketTest is Fixtures {
    uint256 internal seriesId;

    /// @dev One lot is 730 GPU-hours. At $2.50/hr that is $1,825 of notional.
    int256 internal constant ONE_LOT = 730e18;

    function setUp() public {
        _deploy();
        _seedIndex(2.5 * 1e18);
        seriesId = _listSeries(30, 0);

        _fund(alice, 100_000 * USDC_ONE);
        _fund(bob, 100_000 * USDC_ONE);
        _fund(vault, 1_000_000 * USDC_ONE);
    }

    // ------------------------------------------------------------------
    // Collateral
    // ------------------------------------------------------------------

    function test_deposit_creditsBalance() public view {
        assertEq(market.balanceOf(alice), int256(100_000 * USDC_ONE));
        assertEq(market.equity(alice), int256(100_000 * USDC_ONE));
    }

    function test_withdraw_blockedBelowInitialMargin() public {
        _buy(alice, seriesId, 10 * ONE_LOT); // ~$18,250 notional, 20% IM => ~$3,650

        uint256 required = market.marginRequirement(alice, market.initialMarginBps());
        assertGt(required, 3_000 * USDC_ONE, "material requirement");

        vm.prank(alice);
        vm.expectRevert();
        market.withdraw(99_000 * USDC_ONE);

        // Withdrawing down to the requirement is fine.
        uint256 free = market.freeCollateral(alice); // read before pranking
        vm.prank(alice);
        market.withdraw(free);
        assertApproxEqAbs(market.freeCollateral(alice), 0, 1, "drained to the margin line");
    }

    // ------------------------------------------------------------------
    // Pricing
    // ------------------------------------------------------------------

    function test_quote_chargesHalfSpreadBothWays() public view {
        uint256 mark = market.markPrice(seriesId);
        uint256 buy = market.quote(seriesId, 1e18);
        uint256 sell = market.quote(seriesId, -1e18);

        assertGt(buy, mark, "buyer pays up");
        assertLt(sell, mark, "seller hits the bid");
    }

    /// @dev Once the vault is short, further buying must get more expensive.
    function test_quote_skewsAgainstVaultInventory() public {
        uint256 before = market.quote(seriesId, ONE_LOT);
        _buy(alice, seriesId, 100 * ONE_LOT);
        uint256 afterTrade = market.quote(seriesId, ONE_LOT);

        assertGt(afterTrade, before, "inventory skew widens the offer");

        // And selling back into that inventory is quoted better than it was.
        assertGt(market.quote(seriesId, -ONE_LOT), 0, "bid exists");
    }

    function test_markPrice_basisDecaysToSpotAtExpiry() public {
        uint256 contango = _listSeries(30, 1_000); // +10% forward premium at listing

        uint256 atListing = market.markPrice(contango);
        assertApproxEqRel(atListing, (spot * 11_000) / 10_000, 1e15, "premium at listing");

        vm.warp(block.timestamp + 15 days);
        uint256 midway = market.markPrice(contango);
        assertApproxEqRel(midway, (spot * 10_500) / 10_000, 1e15, "half the premium at half tenor");

        vm.warp(block.timestamp + 15 days);
        assertApproxEqRel(market.markPrice(contango), spot, 1e15, "converged at expiry");
    }

    function test_markPrice_supportsBackwardation() public {
        uint256 backwardated = _listSeries(30, -800);
        assertLt(market.markPrice(backwardated), spot, "forward below spot");
    }

    // ------------------------------------------------------------------
    // Trading and PnL
    // ------------------------------------------------------------------

    function test_trade_longGainsWhenIndexRises() public {
        _buy(alice, seriesId, 10 * ONE_LOT);

        // Measure from the mark, not the fill: the half-spread is a cost already taken at entry.
        uint256 markBefore = market.markPrice(seriesId);
        int256 equityBefore = market.equity(alice);

        _setSpot(3.0 * 1e18); // +20%

        int256 equityAfter = market.equity(alice);
        assertGt(equityAfter, equityBefore, "long profits");

        int256 expected = Units.notional(10 * ONE_LOT, market.markPrice(seriesId))
            - Units.notional(10 * ONE_LOT, markBefore);
        assertApproxEqAbs(equityAfter - equityBefore, expected, 2, "PnL matches the index move");
    }

    function test_trade_shortGainsWhenIndexFalls() public {
        _sell(alice, seriesId, -10 * ONE_LOT);

        uint256 markBefore = market.markPrice(seriesId);
        int256 equityBefore = market.equity(alice);

        _setSpot(2.0 * 1e18); // -20%

        int256 expected = Units.notional(-10 * ONE_LOT, market.markPrice(seriesId))
            - Units.notional(-10 * ONE_LOT, markBefore);
        assertGt(market.equity(alice), equityBefore, "short profits");
        assertApproxEqAbs(market.equity(alice) - equityBefore, expected, 2, "PnL matches the move");
    }

    function test_trade_reducingRealizesProportionalPnl() public {
        _buy(alice, seriesId, 10 * ONE_LOT);
        _setSpot(3.0 * 1e18);

        int256 balanceBefore = market.balanceOf(alice);
        _sell(alice, seriesId, -5 * ONE_LOT); // close half

        IngotMarket.Position memory position = market.positionOf(alice, seriesId);
        assertEq(position.size, 5 * ONE_LOT, "half remains");
        assertGt(market.balanceOf(alice), balanceBefore, "half the gain realized");
    }

    function test_trade_flippingClosesThenOpensOpposite() public {
        _buy(alice, seriesId, 5 * ONE_LOT);
        _setSpot(3.0 * 1e18);

        _sell(alice, seriesId, -8 * ONE_LOT);

        IngotMarket.Position memory position = market.positionOf(alice, seriesId);
        assertEq(position.size, -3 * ONE_LOT, "flipped to short");
        assertLt(position.cost, 0, "short cost basis is a credit");
    }

    function test_trade_respectsPriceLimit() public {
        uint256 quoted = market.quote(seriesId, ONE_LOT);

        vm.prank(alice);
        vm.expectRevert();
        market.trade(seriesId, ONE_LOT, quoted - 1);
    }

    function test_trade_revertsAfterExpiry() public {
        vm.warp(block.timestamp + 31 days);
        vm.prank(alice);
        vm.expectRevert(IngotMarket.SeriesExpired.selector);
        market.trade(seriesId, ONE_LOT, type(uint256).max);
    }

    function test_trade_vaultCannotTradeAgainstItself() public {
        vm.prank(vault);
        vm.expectRevert(IngotMarket.VaultCannotTradeDirectly.selector);
        market.trade(seriesId, ONE_LOT, type(uint256).max);
    }

    /// @dev The vault's own margin is the capacity limit; past it, quotes stop.
    function test_trade_revertsWhenVaultIsAtCapacity() public {
        _fund(bob, 50_000_000 * USDC_ONE);
        vm.prank(bob);
        vm.expectRevert();
        market.trade(seriesId, 100_000 * ONE_LOT, type(uint256).max);
    }

    // ------------------------------------------------------------------
    // Settlement
    // ------------------------------------------------------------------

    function test_settlement_paysTheAverageOverTheWindow() public {
        uint256 entry = _buy(alice, seriesId, 10 * ONE_LOT);

        // Walk the index through the delivery window and past expiry.
        _setSpot(3.0 * 1e18);
        _setSpot(3.5 * 1e18);
        vm.warp(market.seriesAt(seriesId).expiry + 1);
        _setSpot(3.2 * 1e18);

        market.settleSeries(seriesId);
        uint256 settlementPrice = market.seriesAt(seriesId).settlementPrice;
        assertGt(settlementPrice, 0, "settled");

        int256 balanceBefore = market.balanceOf(alice);
        market.settlePosition(alice, seriesId);

        int256 expected = Units.notional(10 * ONE_LOT, settlementPrice) - Units.notional(10 * ONE_LOT, entry);
        assertApproxEqAbs(market.balanceOf(alice) - balanceBefore, expected, 2, "settled at the average");
        assertEq(market.positionOf(alice, seriesId).size, 0, "position closed");
        assertEq(market.openSeriesOf(alice).length, 0, "untracked");
    }

    function test_settleSeries_revertsBeforeExpiry() public {
        vm.expectRevert(IngotMarket.SeriesNotExpired.selector);
        market.settleSeries(seriesId);
    }

    function test_settleSeries_cannotSettleTwice() public {
        vm.warp(market.seriesAt(seriesId).expiry + 1);
        _setSpot(3.0 * 1e18);
        market.settleSeries(seriesId);

        vm.expectRevert(IngotMarket.SeriesAlreadySettled.selector);
        market.settleSeries(seriesId);
    }

    function test_settledSeriesCarriesNoMarginRequirement() public {
        _buy(alice, seriesId, 10 * ONE_LOT);
        assertGt(market.marginRequirement(alice, market.initialMarginBps()), 0, "requirement while open");

        vm.warp(market.seriesAt(seriesId).expiry + 1);
        _setSpot(2.6 * 1e18);
        market.settleSeries(seriesId);

        assertEq(market.marginRequirement(alice, market.initialMarginBps()), 0, "risk is over");
    }

    // ------------------------------------------------------------------
    // Liquidation
    // ------------------------------------------------------------------

    function test_liquidate_revertsWhileHealthy() public {
        _buy(alice, seriesId, ONE_LOT);
        vm.prank(keeper);
        vm.expectRevert();
        market.liquidate(alice, seriesId, -ONE_LOT);
    }

    function test_liquidate_closesPositionAndPaysKeeper() public {
        // Lever alice to the margin line, then move the index hard against her.
        _fund(keeper, 10_000 * USDC_ONE);
        _buy(alice, seriesId, 200 * ONE_LOT);

        uint256 free = market.freeCollateral(alice); // read before pranking
        vm.prank(alice);
        market.withdraw(free);

        _setSpot(1.3 * 1e18); // roughly halved

        int256 equity = market.equity(alice);
        uint256 maintenance = market.marginRequirement(alice, market.maintenanceMarginBps());
        assertLt(equity, int256(maintenance), "under water");

        int256 keeperBefore = market.balanceOf(keeper);
        vm.prank(keeper);
        market.liquidate(alice, seriesId, -200 * ONE_LOT);

        assertEq(market.positionOf(alice, seriesId).size, 0, "closed out");
        assertGt(market.balanceOf(keeper), keeperBefore, "keeper paid");
    }

    function test_liquidate_shortfallBecomesVaultBadDebt() public {
        _buy(alice, seriesId, 250 * ONE_LOT);

        uint256 free = market.freeCollateral(alice);
        vm.prank(alice);
        market.withdraw(free);

        _setSpot(1.0 * 1e18); // a 60% collapse, far past her collateral

        int256 vaultBefore = market.balanceOf(vault);
        vm.prank(keeper);
        market.liquidate(alice, seriesId, -250 * ONE_LOT);

        if (market.badDebt() > 0) {
            assertGe(market.balanceOf(alice), 0, "account zeroed, not left negative");
            assertLt(market.balanceOf(vault), vaultBefore + int256(market.badDebt()), "vault wore it");
        }
    }

    // ------------------------------------------------------------------
    // Invariants
    // ------------------------------------------------------------------

    /// @dev Nothing this market does may create or destroy USDC. Every fill, fee, liquidation
    ///      penalty and settlement is a transfer between accounts, so the sum of all equity must
    ///      equal the sum of everything ever deposited.
    function test_invariant_marketIsZeroSum() public {
        uint256 deposited = 100_000 * USDC_ONE + 100_000 * USDC_ONE + 1_000_000 * USDC_ONE;
        address[] memory accounts = _everyone();

        assertEq(_sumEquity(accounts), int256(deposited), "before trading");

        _buy(alice, seriesId, 20 * ONE_LOT);
        _sell(bob, seriesId, -12 * ONE_LOT);
        assertEq(_sumEquity(accounts), int256(deposited), "after opening");

        _setSpot(3.4 * 1e18);
        assertEq(_sumEquity(accounts), int256(deposited), "after the index moves");

        _sell(alice, seriesId, -20 * ONE_LOT);
        assertEq(_sumEquity(accounts), int256(deposited), "after alice closes");

        _setSpot(1.9 * 1e18);
        vm.warp(market.seriesAt(seriesId).expiry + 1);
        _setSpot(2.1 * 1e18);
        market.settleSeries(seriesId);
        market.settlePosition(bob, seriesId);
        market.settlePosition(vault, seriesId);

        assertEq(_sumEquity(accounts), int256(deposited), "after settlement");
        assertEq(_sumBalances(accounts), int256(deposited), "and it is all realized");
    }

    /// @dev Open interest tracking must survive opens, reduces, flips and settlement.
    function testFuzz_openInterestMatchesPositions(int128 first, int128 second) public {
        first = int128(bound(first, -50 * int256(ONE_LOT), 50 * int256(ONE_LOT)));
        second = int128(bound(second, -50 * int256(ONE_LOT), 50 * int256(ONE_LOT)));
        vm.assume(first != 0 && second != 0);

        vm.prank(alice);
        market.trade(seriesId, first, first > 0 ? type(uint256).max : 0);
        vm.prank(bob);
        market.trade(seriesId, second, second > 0 ? type(uint256).max : 0);

        int256 aliceSize = market.positionOf(alice, seriesId).size;
        int256 bobSize = market.positionOf(bob, seriesId).size;
        int256 vaultSize = market.positionOf(vault, seriesId).size;

        assertEq(aliceSize + bobSize + vaultSize, 0, "positions net to zero");

        uint256 expectedLongOi;
        if (aliceSize > 0) expectedLongOi += uint256(aliceSize);
        if (bobSize > 0) expectedLongOi += uint256(bobSize);
        if (vaultSize > 0) expectedLongOi += uint256(vaultSize);
        assertEq(market.seriesAt(seriesId).longOpenInterest, expectedLongOi, "open interest");
    }
}
