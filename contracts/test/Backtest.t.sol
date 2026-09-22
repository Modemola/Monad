// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Fixtures} from "./Fixtures.sol";
import {HedgedCredit} from "../src/HedgedCredit.sol";
import {UnderwriterVault} from "../src/UnderwriterVault.sol";

/// @notice Replays 78 days of real posted H100 rental rates through the actual contracts.
///
/// @dev The series in data/h100_index.csv is built by tools/build_index.py from the public
///      gpu-rental-prices dataset (CC BY 4.0): a per-provider median, then a 10% trimmed mean
///      across providers, on-demand and secure capacity only.
///
///      Nothing here is a model of the protocol. The prices go into the real IngotIndex, the
///      loans go through the real HedgedCredit, and the settlement price is whatever the real
///      window average comes out to. Run with -vv for the tables.
contract BacktestTest is Fixtures {
    UnderwriterVault internal underwriter;
    HedgedCredit internal credit;

    uint256[] internal prices;
    string[] internal dates;

    address internal lender = address(0x1E4D);
    address internal neocloud = address(0x60C1);

    uint256 internal constant OFFTAKE = 50_000e18;
    uint16 internal constant AT_INDEX = 10_000;

    function setUp() public {
        _deploy();
        _loadSeries();

        underwriter = new UnderwriterVault(market, IERC20(address(usdc)), owner);
        vault = address(underwriter);
        vm.prank(owner);
        market.setVault(address(underwriter));

        credit = new HedgedCredit(market, IERC20(address(usdc)), owner);

        // Real day-to-day moves in this window reach 24.6%, just inside the default 25% band.
        // Widened here so a genuine print is never rejected by the circuit breaker mid-replay.
        uint32 delay = index.finalityDelay();
        uint32 interval = index.minInterval();
        vm.prank(owner);
        index.setGuards(delay, 6_000, interval);

        usdc.mint(alice, 5_000_000 * USDC_ONE);
        vm.startPrank(alice);
        usdc.approve(address(underwriter), type(uint256).max);
        underwriter.deposit(5_000_000 * USDC_ONE);
        vm.stopPrank();

        usdc.mint(lender, 2_000_000 * USDC_ONE);
        vm.startPrank(lender);
        usdc.approve(address(credit), type(uint256).max);
        credit.depositLender(2_000_000 * USDC_ONE);
        vm.stopPrank();

        usdc.mint(neocloud, 2_000_000 * USDC_ONE);
        vm.prank(neocloud);
        usdc.approve(address(credit), type(uint256).max);
    }

    /// @dev Parse date and 18-decimal price out of the CSV, skipping the header.
    function _loadSeries() internal {
        string memory raw = vm.readFile("data/h100_index.csv");
        string[] memory lines = vm.split(raw, "\n");

        for (uint256 i = 1; i < lines.length; ++i) {
            if (bytes(lines[i]).length == 0) continue;
            string[] memory cells = vm.split(lines[i], ",");
            dates.push(cells[0]);
            prices.push(vm.parseUint(cells[2]));
        }

        require(prices.length > 40, "series too short to backtest");
    }

    /// @dev Publish one day of the series, advancing the clock by exactly one day.
    ///
    ///      Two prints inside the day so the mark's trailing window reflects the level, with the
    ///      second landing early enough to finalize before the day closes. The exactness matters:
    ///      an earlier version added the finality delay on top of each day, so thirty replayed
    ///      days ran past a thirty-day contract and the next print arrived before the last one.
    function _publishDay(uint256 day) internal {
        uint64 dayStart = clock;

        vm.warp(dayStart + 8 hours);
        vm.prank(publisher);
        index.publish(dayStart + 8 hours, prices[day], 30, 20);

        vm.warp(dayStart + 16 hours);
        vm.prank(publisher);
        index.publish(dayStart + 16 hours, prices[day], 30, 20);

        clock = dayStart + 24 hours;
        vm.warp(clock);
    }

    // ------------------------------------------------------------------

    struct Cohort {
        uint256 struckPrice;
        uint256 settlementPrice;
        uint256 hedged;
        uint256 unhedged;
        uint256 debt;
    }

    /// @dev One cohort: list a contract, draw against an offtake, replay `tenorDays` of real
    ///      prices through it, settle, and read back what the lender recovered.
    function _runCohort(uint256 day, uint256 tenorDays) internal returns (Cohort memory result) {
        uint64 windowStart = uint64(block.timestamp);
        vm.prank(owner);
        uint256 seriesId = market.listSeries(windowStart, windowStart + uint64(tenorDays) * 1 days, 0);

        vm.prank(neocloud);
        uint256 loanId = credit.open(seriesId, OFFTAKE, AT_INDEX, 60_000 * USDC_ONE, 0);
        result.struckPrice = credit.loanAt(loanId).hedgeEntryPrice;

        for (uint256 i = 0; i < tenorDays; ++i) {
            _publishDay(day + i);
        }

        // Roll past expiry and cover the window's right edge with a real print.
        vm.warp(market.seriesAt(seriesId).expiry + 1);
        clock = uint64(block.timestamp);
        vm.prank(publisher);
        index.publish(clock, prices[day + tenorDays], 30, 20);
        clock += uint64(index.finalityDelay()) + 1;
        vm.warp(clock);

        market.settleSeries(seriesId);
        result.settlementPrice = market.seriesAt(seriesId).settlementPrice;

        (,,, uint256 hedged, uint256 unhedged) = credit.project(loanId, result.settlementPrice);
        result.hedged = hedged;
        result.unhedged = unhedged;
        result.debt = credit.debtOf(loanId);

        vm.prank(neocloud);
        credit.close(loanId);
    }

    /// @notice Walk a 30-day contract forward across the window, opening a hedged loan at each
    ///         listing and settling it at expiry. Reports what the lender actually recovered,
    ///         hedged and unhedged, at the realized settlement price.
    function test_backtest_walkForwardHedgedVersusUnhedged() public {
        console.log("Ingot backtest: real posted H100 rates");
        console.log("  days in series", prices.length);
        console.log(string.concat("  window ", dates[0], " .. ", dates[dates.length - 1]));
        console.log("");

        uint256 tenorDays = 30;
        uint256 cohorts;
        uint256 hedgedTotal;
        uint256 unhedgedTotal;
        uint256 debtTotal;

        // Prime the index so the first mark has history behind it.
        _publishDay(0);
        _publishDay(1);

        uint256 day = 2;
        while (day + tenorDays < prices.length) {
            Cohort memory cohort = _runCohort(day, tenorDays);

            console.log(string.concat("cohort opening ", dates[day], " settling ", dates[day + tenorDays]));
            console.log("  struck / settled (milli-$)", cohort.struckPrice / 1e15, cohort.settlementPrice / 1e15);
            console.log("  recovered hedged / unhedged / debt ($)", cohort.hedged / 1e6, cohort.unhedged / 1e6, cohort.debt / 1e6);

            hedgedTotal += cohort.hedged;
            unhedgedTotal += cohort.unhedged;
            debtTotal += cohort.debt;
            ++cohorts;

            day += tenorDays / 2; // overlapping cohorts, rolled every fortnight
        }

        console.log("");
        console.log("cohorts              ", cohorts);
        console.log("total debt        ($)", debtTotal / 1e6);
        console.log("hedged recovery   ($)", hedgedTotal / 1e6);
        console.log("unhedged recovery ($)", unhedgedTotal / 1e6);

        assertGt(cohorts, 0, "at least one cohort completed");
        assertEq(hedgedTotal, debtTotal, "hedged lender made whole in every cohort");
        assertLe(unhedgedTotal, hedgedTotal, "unhedged never does better");
    }

    /// @notice How far this window sat from breaking an unhedged lender, and what the hedge is
    ///         therefore worth.
    ///
    /// @dev The walk-forward above returns a negative result and it should be read as one: across
    ///      four cohorts the unhedged lender was made whole every time. At 70% advance with the
    ///      borrower posting 20% margin, the rate has to fall roughly a fifth before an unhedged
    ///      position takes a loss, and this window's worst settlement was 6% below its strike.
    ///
    ///      So the hedge did not rescue anyone here. What it does is remove the need for that
    ///      cushion: the hedged lender is whole at *every* settlement price, so the same risk
    ///      appetite supports a larger advance. This test measures the cushion rather than
    ///      claiming a crisis that did not happen.
    function test_backtest_marginOfSafetyAndWhatTheHedgeBuys() public {
        _publishDay(0);
        _publishDay(1);

        Cohort memory cohort = _runCohort(2, 30);

        uint256 loanId = credit.loanCount() - 1;
        uint256 debt = cohort.debt;

        // Largest settlement price at which the unhedged lender is still short.
        uint256 low = cohort.struckPrice / 10;
        uint256 high = cohort.struckPrice;
        for (uint256 i = 0; i < 40; ++i) {
            uint256 mid = (low + high) / 2;
            (,,,, uint256 unhedged) = credit.project(loanId, mid);
            if (unhedged < debt) low = mid;
            else high = mid;
        }

        uint256 breakeven = high;
        uint256 cushionBps = ((cohort.struckPrice - breakeven) * 10_000) / cohort.struckPrice;
        uint256 realizedBps = cohort.settlementPrice >= cohort.struckPrice
            ? 0
            : ((cohort.struckPrice - cohort.settlementPrice) * 10_000) / cohort.struckPrice;

        console.log("margin of safety, first cohort");
        console.log("  struck (milli-$)          ", cohort.struckPrice / 1e15);
        console.log("  unhedged breaks at        ", breakeven / 1e15);
        console.log("  cushion before a loss (bps)", cushionBps);
        console.log("  realized fall (bps)        ", realizedBps);
        console.log("");
        console.log("  hedged recovery is the debt at every price on this range;");
        console.log("  the unhedged lender needs the cushion, and pays for it in advance rate.");

        assertGt(cushionBps, 0, "an unhedged lender does have a breaking point");
        assertLt(realizedBps, cushionBps, "this window never reached it");

        // The hedged side has no breaking point on the same range.
        (,,, uint256 hedgedAtBreak,) = credit.project(loanId, breakeven);
        (,,, uint256 hedgedAtFloor,) = credit.project(loanId, cohort.struckPrice / 10);
        assertEq(hedgedAtBreak, debt, "hedged whole where unhedged breaks");
        assertEq(hedgedAtFloor, debt, "and at a tenth of the strike");
    }

    /// @notice What the window actually did, measured from the contracts' own view of it.
    function test_backtest_realizedIndexStatistics() public {
        for (uint256 i = 0; i < prices.length; ++i) {
            _publishDay(i);
        }

        uint256 low = type(uint256).max;
        uint256 high;
        for (uint256 i = 0; i < prices.length; ++i) {
            if (prices[i] < low) low = prices[i];
            if (prices[i] > high) high = prices[i];
        }

        console.log("realized index over the window (milli-dollars per GPU-hour)");
        console.log("  low ", low / 1e15);
        console.log("  high", high / 1e15);
        console.log("  peak-to-trough %", ((high - low) * 100) / low);

        (uint256 latest,) = index.latest();
        assertEq(latest, prices[prices.length - 1], "index ends on the last real print");
        assertGt(((high - low) * 100) / low, 10, "a window worth hedging");
    }
}
