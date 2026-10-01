// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";

import {IngotIndex} from "../src/IngotIndex.sol";
import {Seed} from "../script/Seed.s.sol";

contract SeedHarness is Seed {
    function noonOf(string memory date) external pure returns (uint64) {
        return _noonOf(date);
    }
}

/// @notice The deploy seeds the real index history. These prove every row of it clears the index's
///         production guards, and that the live publisher can continue from where it ends.
contract SeedHistoryTest is Test {
    IngotIndex internal index;
    SeedHarness internal seed;
    address internal owner = address(0x0A);

    uint64 internal constant DEPLOY_DAY = 1_790_856_000; // 2026-10-01 12:00 UTC
    uint64 internal constant FIRST_PRINT = 1_783_339_200; // 2026-07-06 12:00 UTC
    uint64 internal constant LAST_PRINT = 1_789_992_000; // 2026-09-21 12:00 UTC
    uint256 internal constant LAST_PRICE = 3_595_023_684_210_526_720; // the CSV's final row

    function setUp() public {
        vm.warp(DEPLOY_DAY);
        // Default guards: 25% deviation, five-minute spacing, one-hour finality.
        index = new IngotIndex("H100 on-demand, USD/GPU-hour", keccak256("v1"), "ipfs://m", owner);
        seed = new SeedHarness();
        vm.prank(owner);
        index.setPublisher(address(seed), true);
    }

    function test_backfillPublishesEveryRealPrint() public {
        (uint256 prints, uint256 lastPrice) = seed.backfill(index);

        assertEq(prints, 78);
        assertEq(index.observationCount(), 78);
        assertEq(lastPrice, LAST_PRICE);
        assertEq(index.observation(0).timestamp, FIRST_PRINT);
        assertEq(index.observation(77).timestamp, LAST_PRINT);

        // Backfilled prints are published now, so they settle once the finality delay passes.
        vm.warp(DEPLOY_DAY + index.finalityDelay());
        (uint256 price, uint64 observedAt) = index.latest();
        assertEq(price, LAST_PRICE);
        assertEq(observedAt, LAST_PRINT);
    }

    /// @dev The bug this replaced: a synthetic history ending near $2.26 put every live print
    ///      (around $3.60) outside the 25% guard, so the scheduled publisher would have reverted
    ///      forever. From the real history, a live print at today's level is accepted.
    function test_livePublisherContinuesFromTheRealLevel() public {
        seed.backfill(index);
        vm.prank(owner);
        index.setPublisher(address(this), true);

        index.publish(DEPLOY_DAY, 3.6e18, 30, 22);
        vm.warp(DEPLOY_DAY + index.finalityDelay());
        (uint256 price,) = index.latest();
        assertEq(price, 3.6e18);
    }

    function test_noonOf() public view {
        assertEq(seed.noonOf("1970-01-01"), 12 hours);
        assertEq(seed.noonOf("2024-02-29"), 1_709_208_000);
        assertEq(seed.noonOf("2026-07-06"), FIRST_PRINT);
        assertEq(seed.noonOf("2026-10-01"), DEPLOY_DAY);
    }

    function test_noonOfRejectsMalformedDates() public {
        vm.expectRevert(bytes("Seed: bad date"));
        seed.noonOf("2026-7-06");
        vm.expectRevert(bytes("Seed: bad digit"));
        seed.noonOf("2026-0x-06");
    }
}
