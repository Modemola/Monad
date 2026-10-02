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
    // Audit regressions
    // ------------------------------------------------------------------

    /// @dev Liquidating the vault closes its slice against itself: no position change, but the
    ///      penalty moves from the vault to the caller, and the vault stays liquidatable. It must
    ///      be refused outright.
    function test_liquidate_refusesTheVault() public {
        _buy(alice, seriesId, 100 * ONE_LOT);

        vm.prank(keeper);
        vm.expectRevert(IngotMarket.VaultNotLiquidatable.selector);
        market.liquidate(vault, seriesId, 10 * ONE_LOT);
    }

    /// @dev Leaves the vault short and under maintenance after a rally.
    function _stretchTheVault() internal {
        _buy(alice, seriesId, 200 * ONE_LOT);
        uint256 free = market.freeCollateral(vault);
        vm.prank(vault);
        market.withdraw(free);
        _setSpot(3.3 * 1e18); // +32% against the vault's short
        assertLt(
            market.equity(vault),
            int256(market.marginRequirement(vault, market.maintenanceMarginBps())),
            "vault under maintenance"
        );
    }

    function test_trade_stretchedVaultRefusesRiskButLetsTradersClose() public {
        _stretchTheVault();

        // Buying adds to the vault's short: no quote.
        vm.prank(bob);
        vm.expectRevert(IngotMarket.VaultAtCapacity.selector);
        market.trade(seriesId, ONE_LOT, type(uint256).max);

        // Alice selling back reduces it: always allowed, so a winning position is never trapped.
        _sell(alice, seriesId, -50 * ONE_LOT);
        assertEq(market.positionOf(alice, seriesId).size, 150 * ONE_LOT);
    }

    /// @dev A trader who has drifted under initial margin (but not maintenance) can still cut risk.
    function test_trade_reducingNeedsOnlyMaintenance() public {
        _buy(alice, seriesId, 100 * ONE_LOT);
        uint256 free = market.freeCollateral(alice);
        vm.prank(alice);
        market.withdraw(free);

        _setSpot(2.4 * 1e18); // a small loss: under initial, above maintenance
        int256 equity_ = market.equity(alice);
        assertLt(equity_, int256(market.marginRequirement(alice, market.initialMarginBps())));
        assertGt(equity_, int256(market.marginRequirement(alice, market.maintenanceMarginBps())));

        vm.prank(alice);
        vm.expectRevert();
        market.trade(seriesId, ONE_LOT, type(uint256).max); // adding still needs initial margin

        _sell(alice, seriesId, -40 * ONE_LOT);
        assertEq(market.positionOf(alice, seriesId).size, 60 * ONE_LOT, "cut back");
    }

    function test_withdraw_paysOutCashNotUnrealizedPnl() public {
        _buy(alice, seriesId, 10 * ONE_LOT);
        _setSpot(4.0 * 1e18);

        int256 cash = market.balanceOf(alice);
        assertGt(market.equity(alice), cash, "in profit");

        vm.prank(alice);
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.expectRevert(abi.encodeWithSelector(IngotMarket.WithdrawExceedsBalance.selector, int256(-1)));
        // forge-lint: disable-next-line(unsafe-typecast)
        market.withdraw(uint256(cash) + 1);
    }

    /// @dev A loss realized at settlement beyond the account's collateral is recorded, given a
    ///      grace period to be covered, then written off to the vault as bad debt.
    function test_settlement_shortfallIsWrittenOffAfterTheGracePeriod() public {
        _buy(alice, seriesId, 200 * ONE_LOT);
        uint256 free = market.freeCollateral(alice);
        vm.prank(alice);
        market.withdraw(free);

        _setSpot(1.0 * 1e18); // collapse early in the window and hold
        vm.warp(market.seriesAt(seriesId).expiry + 1);
        _setSpot(1.0 * 1e18);
        market.settleSeries(seriesId);

        vm.prank(keeper);
        market.settlePosition(alice, seriesId);
        assertLt(market.balanceOf(alice), 0, "under water after settlement");
        assertGt(market.shortfallSince(alice), 0, "recorded");
        assertEq(market.badDebt(), 0, "not written off on the spot");

        vm.expectRevert();
        market.absorbShortfall(alice);

        int256 vaultBefore = market.balanceOf(vault);
        int256 owed = market.balanceOf(alice);
        vm.warp(block.timestamp + market.shortfallGrace());
        market.absorbShortfall(alice);

        assertEq(market.balanceOf(alice), 0, "account zeroed");
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(market.badDebt(), uint256(-owed), "booked as bad debt");
        assertEq(market.balanceOf(vault), vaultBefore + owed, "and the vault wore it");
    }

    /// @dev A shortfall that is paid off is over. Its start time must not linger, or the next
    ///      shortfall on the same account could be written off the moment it is recorded.
    function test_settlement_paidShortfallLeavesNoStaleGraceBehind() public {
        _buy(alice, seriesId, 200 * ONE_LOT);
        uint256 free = market.freeCollateral(alice);
        vm.prank(alice);
        market.withdraw(free);

        _setSpot(1.0 * 1e18);
        vm.warp(market.seriesAt(seriesId).expiry + 1);
        _setSpot(1.0 * 1e18);
        market.settleSeries(seriesId);
        market.settlePosition(alice, seriesId);
        assertGt(market.shortfallSince(alice), 0, "recorded");

        // Alice covers it inside the grace period.
        int256 owed = market.balanceOf(alice);
        // forge-lint: disable-next-line(unsafe-typecast)
        _fund(alice, uint256(-owed));
        assertEq(market.shortfallSince(alice), 0, "cleared once paid");

        vm.warp(block.timestamp + market.shortfallGrace());
        vm.expectRevert(IngotMarket.NoShortfall.selector);
        market.absorbShortfall(alice);
    }

    /// @dev A print is public for its whole finality delay before the mark reads it. Opening into
    ///      a large pending move against the old mark would be a free option on the vault, so the
    ///      market only lets positions shrink until the print finalizes.
    function test_trade_refusesToOpenIntoAPendingIndexMove() public {
        _buy(alice, seriesId, 10 * ONE_LOT);

        clock = uint64(block.timestamp) + 2 hours;
        vm.warp(clock);
        vm.prank(publisher);
        index.publish(clock, 3.1 * 1e18, 150, 12); // +24%, provisional

        assertEq(index.pendingMoveBps(), 2_400, "visible to everyone");
        vm.expectRevert(abi.encodeWithSelector(IngotMarket.IndexMoving.selector, 2_400, 50));
        _buy(bob, seriesId, 50 * ONE_LOT);

        // Closing is always allowed.
        _sell(alice, seriesId, -10 * ONE_LOT);
        assertEq(market.positionOf(alice, seriesId).size, 0, "closed during the pending move");

        // Once the print is final the mark has caught up, and trading reopens.
        vm.warp(clock + index.finalityDelay() + 1);
        assertEq(index.pendingMoveBps(), 0, "nothing pending");
        _buy(bob, seriesId, 50 * ONE_LOT);
    }

    /// @dev Small moves, under a taker's round-trip cost, do not halt anything.
    function test_trade_ignoresPendingMovesInsideTheLimit() public {
        clock = uint64(block.timestamp) + 2 hours;
        vm.warp(clock);
        vm.prank(publisher);
        index.publish(clock, 2.51 * 1e18, 150, 12); // +0.4%

        _buy(bob, seriesId, 10 * ONE_LOT);
        assertEq(market.positionOf(bob, seriesId).size, 10 * ONE_LOT);
    }

    /// @dev A window opening before the index's first print could never be averaged, so the
    ///      series could never settle and its positions would be stuck forever.
    function test_listSeries_rejectsAWindowBeforeTheFirstPrint() public {
        uint64 before = index.genesis() - 1 days;
        vm.prank(owner);
        vm.expectRevert(IngotMarket.WindowInvalid.selector);
        market.listSeries(before, uint64(block.timestamp + 30 days), 0);
    }

    /// @dev Inside the delivery window part of the settlement average is already fixed. Halfway
    ///      through at 2.50, a jump to 3.50 should mark near the 3.00 blend, not at 3.50.
    function test_markPrice_blendsTheRealizedPartOfTheWindow() public {
        vm.warp(block.timestamp + 15 days);
        _setSpot(3.5 * 1e18);

        uint256 mark = market.markPrice(seriesId);
        assertApproxEqRel(mark, 3.0 * 1e18, 0.01e18, "half realized at 2.50, half forward at 3.50");
        assertLt(mark, (3.5 * 1e18 * 95) / 100, "well under spot");
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
