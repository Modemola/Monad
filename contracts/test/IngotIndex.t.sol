// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IngotIndex} from "../src/IngotIndex.sol";

contract IngotIndexTest is Test {
    IngotIndex internal index;

    address internal owner = address(0xA11CE);
    address internal publisher = address(0xB0B);
    address internal stranger = address(0xDEAD);

    uint256 internal constant ONE = 1e18;
    uint64 internal constant GENESIS = 1_700_000_000;

    function setUp() public {
        vm.warp(GENESIS);
        index = new IngotIndex("H100-SXM-80GB on-demand, USD/GPU-hour", keccak256("v1"), "ipfs://m", owner);
        vm.prank(owner);
        index.setPublisher(publisher, true);
    }

    /// @dev Publish `price` stamped at `observedAt`, then let it finalize.
    function _publishFinal(uint64 observedAt, uint256 price) internal {
        vm.warp(observedAt);
        vm.prank(publisher);
        index.publish(observedAt, price, 150, 12);
        vm.warp(observedAt + index.finalityDelay());
    }

    /// @dev Widen the deviation band so a test can use round numbers. Also covers the guardian path.
    function _relaxGuards() internal {
        // Read first: vm.prank only applies to the very next call.
        uint32 delay = index.finalityDelay();
        uint32 interval = index.minInterval();
        vm.prank(owner);
        index.setGuards(delay, 10_000, interval);
    }

    // ------------------------------------------------------------------
    // Publishing
    // ------------------------------------------------------------------

    function test_publish_recordsObservation() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);

        (uint256 price, uint64 observedAt) = index.latest();
        assertEq(price, 2 * ONE, "price");
        assertEq(observedAt, GENESIS + 1 hours, "timestamp");
        assertEq(index.observationCount(), 1, "count");

        IngotIndex.Observation memory observation = index.observation(0);
        assertEq(observation.sampleCount, 150, "samples");
        assertEq(observation.sourceCount, 12, "sources");
        assertEq(observation.cumulative, 0, "genesis cumulative");
    }

    function test_publish_revertsForStranger() public {
        vm.expectRevert(IngotIndex.NotPublisher.selector);
        vm.prank(stranger);
        index.publish(GENESIS + 1 hours, 2 * ONE, 1, 1);
    }

    function test_publish_revertsOnZeroPrice() public {
        vm.warp(GENESIS + 1 hours);
        vm.expectRevert(IngotIndex.ZeroPrice.selector);
        vm.prank(publisher);
        index.publish(GENESIS + 1 hours, 0, 1, 1);
    }

    function test_publish_revertsOnFutureTimestamp() public {
        vm.expectRevert(IngotIndex.TimestampInFuture.selector);
        vm.prank(publisher);
        index.publish(GENESIS + 1 hours, 2 * ONE, 1, 1);
    }

    function test_publish_revertsWhenTimestampDoesNotAdvance() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);

        vm.warp(GENESIS + 3 hours);
        vm.expectRevert(IngotIndex.TimestampNotAdvancing.selector);
        vm.prank(publisher);
        index.publish(GENESIS + 1 hours, 2 * ONE, 1, 1);
    }

    function test_publish_revertsWhenTooSoon() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);

        uint64 tooSoon = GENESIS + 1 hours + 60;
        vm.warp(tooSoon);
        vm.expectRevert(IngotIndex.TooSoon.selector);
        vm.prank(publisher);
        index.publish(tooSoon, 2 * ONE, 1, 1);
    }

    /// @dev A scraper reading a broken venue must not be able to reprice the whole market.
    function test_publish_rejectsOutsizedDeviation() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);

        uint64 next = GENESIS + 2 hours;
        vm.warp(next);
        vm.expectRevert(
            abi.encodeWithSelector(IngotIndex.DeviationTooLarge.selector, 2 * ONE, 20 * ONE, 2_500)
        );
        vm.prank(publisher);
        index.publish(next, 20 * ONE, 1, 1);
    }

    function test_publish_acceptsMoveAtTheBand() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);
        // Exactly 25% up is inside the band.
        _publishFinal(GENESIS + 2 hours, 2.5 * 1e18);
        (uint256 price,) = index.latest();
        assertEq(price, 2.5 * 1e18);
    }

    // ------------------------------------------------------------------
    // Finality and revocation
    // ------------------------------------------------------------------

    function test_latest_ignoresProvisionalPrints() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);

        uint64 fresh = GENESIS + 3 hours;
        vm.warp(fresh);
        vm.prank(publisher);
        index.publish(fresh, 2.4 * 1e18, 1, 1);

        // The fresh print exists but is not yet readable by settlement.
        assertEq(index.observationCount(), 2, "stored");
        (uint256 price,) = index.latest();
        assertEq(price, 2 * ONE, "settlement still reads the finalized print");

        vm.warp(fresh + index.finalityDelay());
        (price,) = index.latest();
        assertEq(price, 2.4 * 1e18, "finalized after the delay");
    }

    function test_revokeLatest_removesProvisionalPrint() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);

        uint64 bad = GENESIS + 3 hours;
        vm.warp(bad);
        vm.prank(publisher);
        index.publish(bad, 2.4 * 1e18, 1, 1);

        vm.prank(owner); // guardian defaults to owner
        index.revokeLatest("stale venue quote");

        assertEq(index.observationCount(), 1, "popped");
        (uint256 price,) = index.latest();
        assertEq(price, 2 * ONE);
    }

    function test_revokeLatest_revertsOnceFinalized() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);

        vm.expectRevert(IngotIndex.AlreadyFinalized.selector);
        vm.prank(owner);
        index.revokeLatest("too late");
    }

    function test_revokeLatest_revertsForStranger() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);

        vm.expectRevert(IngotIndex.NotGuardian.selector);
        vm.prank(stranger);
        index.revokeLatest("nope");
    }

    // ------------------------------------------------------------------
    // Averaging
    // ------------------------------------------------------------------

    /// @dev Price is a step function: each print holds until the next one.
    function test_averageBetween_matchesHandComputedStepFunction() public {
        _relaxGuards();
        _publishFinal(GENESIS, 2 * ONE); // holds for 1h
        _publishFinal(GENESIS + 1 hours, 3 * ONE); // holds for 2h
        _publishFinal(GENESIS + 3 hours, 1 * ONE); // holds to the end
        // A window may only be averaged once a print covers its right edge: the index refuses to
        // let a stale price hold indefinitely into a settlement window.
        _publishFinal(GENESIS + 4 hours, 1.2 * 1e18);

        // Window GENESIS .. GENESIS+4h: 2 for 1h, 3 for 2h, 1 for 1h => 9/4 = 2.25
        uint256 average = index.averageBetween(GENESIS, GENESIS + 4 hours);
        assertEq(average, 2.25 * 1e18, "four hour average");

        // Sub-window entirely inside one step.
        assertEq(index.averageBetween(GENESIS + 90 minutes, GENESIS + 2 hours), 3 * ONE, "inside step");

        // Window straddling one boundary: 3 for 30m, 1 for 30m => 2
        assertEq(index.averageBetween(GENESIS + 150 minutes, GENESIS + 210 minutes), 2 * ONE, "straddle");
    }

    function test_averageBetween_revertsOnUnfinalizedWindow() public {
        _publishFinal(GENESIS, 2 * ONE);
        uint64 horizon = index.finalizedThrough();

        vm.expectRevert(
            abi.encodeWithSelector(IngotIndex.WindowNotFinalized.selector, horizon + 1, horizon)
        );
        index.averageBetween(GENESIS, horizon + 1);
    }

    function test_averageBetween_revertsBeforeGenesis() public {
        _publishFinal(GENESIS + 1 hours, 2 * ONE);
        vm.expectRevert(IngotIndex.WindowBeforeGenesis.selector);
        index.averageBetween(GENESIS, GENESIS + 1 hours);
    }

    function test_averageBetween_revertsOnEmptyWindow() public {
        _publishFinal(GENESIS, 2 * ONE);
        vm.expectRevert(IngotIndex.BadWindow.selector);
        index.averageBetween(GENESIS + 1 hours, GENESIS + 1 hours);
    }

    function test_twap_readsTrailingWindow() public {
        _relaxGuards();
        _publishFinal(GENESIS, 2 * ONE);
        _publishFinal(GENESIS + 1 hours, 4 * ONE);

        // finalizedThrough is GENESIS+1h; the trailing hour before it sat at 2.
        assertEq(index.twap(1 hours), 2 * ONE);
    }

    /// @dev A month of hourly prints, then averages read across the whole series. Exercises the
    ///      binary search at realistic depth.
    function test_averageBetween_overLongSeries() public {
        uint64 cursor = GENESIS;
        uint256 price = 2 * ONE;

        for (uint256 i = 0; i < 720; ++i) {
            _publishFinal(cursor, price);
            cursor += 1 hours;
            // Deterministic sawtooth well inside the deviation band.
            price = i % 2 == 0 ? (price * 105) / 100 : (price * 100) / 105;
        }

        uint64 last = index.finalizedThrough();
        uint256 whole = index.averageBetween(GENESIS, last);
        assertGt(whole, 0, "non-zero average");

        // Averaging the two halves must reproduce the whole-window average.
        uint64 middle = GENESIS + ((last - GENESIS) / 2);
        uint256 first = index.averageBetween(GENESIS, middle);
        uint256 second = index.averageBetween(middle, last);
        assertApproxEqAbs(whole, (first + second) / 2, 1e9, "halves reconcile");
    }

    // ------------------------------------------------------------------
    // Fuzz
    // ------------------------------------------------------------------

    /// @dev Any average over a series must sit within the min and max price of that series.
    function testFuzz_averageIsBoundedByObservedPrices(uint256 seed) public {
        uint64 cursor = GENESIS;
        uint256 price = 2 * ONE;
        uint256 min = type(uint256).max;
        uint256 max;

        for (uint256 i = 0; i < 24; ++i) {
            _publishFinal(cursor, price);
            if (price < min) min = price;
            if (price > max) max = price;

            cursor += 1 hours;
            // Move within +/-20%, staying inside the deviation band.
            uint256 move = uint256(keccak256(abi.encode(seed, i))) % 4_000; // 0..40%
            price = (price * (8_000 + move)) / 10_000;
            if (price == 0) price = 1;
        }

        uint256 average = index.averageBetween(GENESIS, index.finalizedThrough());
        assertGe(average, min, "at least the minimum");
        assertLe(average, max, "at most the maximum");
    }
}
