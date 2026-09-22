// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IngotIndex} from "../src/IngotIndex.sol";
import {IngotMarket} from "../src/IngotMarket.sol";
import {IIngotIndex} from "../src/interfaces/IIngotIndex.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Shared deployment and helpers for market-level tests.
abstract contract Fixtures is Test {
    IngotIndex internal index;
    IngotMarket internal market;
    MockUSDC internal usdc;

    address internal owner = address(0xA11CE);
    address internal publisher = address(0xB0B);
    address internal vault = address(0x7EA1);
    address internal alice = address(0xA1);
    address internal bob = address(0xB2);
    address internal keeper = address(0xC3);

    uint64 internal constant GENESIS = 1_700_000_000;
    uint256 internal constant ONE = 1e18;
    uint256 internal constant USDC_ONE = 1e6;

    /// @dev Price the index currently sits at, so helpers can step it around.
    uint256 internal spot;
    uint64 internal clock;

    function _deploy() internal {
        vm.warp(GENESIS);
        clock = GENESIS;

        index = new IngotIndex("H100 on-demand, USD/GPU-hour", keccak256("v1"), "ipfs://m", owner);
        usdc = new MockUSDC();
        market = new IngotMarket(IIngotIndex(address(index)), IERC20(address(usdc)), owner);

        vm.startPrank(owner);
        index.setPublisher(publisher, true);
        // Wide band so tests can move the index hard without fighting the circuit breaker.
        index.setGuards(index.finalityDelay(), 10_000, index.minInterval());
        market.setVault(vault);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Index helpers
    // ------------------------------------------------------------------

    /// @dev Move the index to `price` and make the market see it.
    ///
    ///      Two prints, not one. The mark reads a trailing TWAP, so a single fresh print sits at
    ///      the right edge of the window and the average still reflects the old price. A second
    ///      print a mark-window later is what actually moves the mark. This mirrors how the real
    ///      index behaves and is worth keeping in the tests rather than papering over.
    function _setSpot(uint256 price) internal {
        if (block.timestamp > clock) clock = uint64(block.timestamp);

        for (uint256 i = 0; i < 2; ++i) {
            clock += 2 hours;
            vm.warp(clock);
            vm.prank(publisher);
            index.publish(clock, price, 150, 12);
        }

        clock += uint64(index.finalityDelay()) + 1;
        vm.warp(clock);
        spot = price;
    }

    /// @dev Seed enough history that `markWindow` TWAPs resolve.
    function _seedIndex(uint256 price) internal {
        _setSpot(price);
    }

    // ------------------------------------------------------------------
    // Account helpers
    // ------------------------------------------------------------------

    function _fund(address account, uint256 amount) internal {
        usdc.mint(account, amount);
        vm.startPrank(account);
        usdc.approve(address(market), type(uint256).max);
        market.deposit(amount);
        vm.stopPrank();
    }

    function _listSeries(uint64 windowDays, int32 basisBps) internal returns (uint256 seriesId) {
        uint64 expiry = uint64(block.timestamp) + windowDays * 1 days;
        uint64 windowStart = uint64(block.timestamp);
        vm.prank(owner);
        seriesId = market.listSeries(windowStart, expiry, basisBps);
    }

    function _buy(address account, uint256 seriesId, int256 size) internal returns (uint256 price) {
        vm.prank(account);
        price = market.trade(seriesId, size, type(uint256).max);
    }

    function _sell(address account, uint256 seriesId, int256 size) internal returns (uint256 price) {
        vm.prank(account);
        price = market.trade(seriesId, size, 0);
    }

    /// @dev Total collateral the market is holding for everyone.
    function _sumBalances(address[] memory accounts) internal view returns (int256 total) {
        for (uint256 i = 0; i < accounts.length; ++i) {
            total += market.balanceOf(accounts[i]);
        }
    }

    function _sumEquity(address[] memory accounts) internal view returns (int256 total) {
        for (uint256 i = 0; i < accounts.length; ++i) {
            total += market.equity(accounts[i]);
        }
    }

    function _everyone() internal view returns (address[] memory accounts) {
        accounts = new address[](5);
        accounts[0] = alice;
        accounts[1] = bob;
        accounts[2] = vault;
        accounts[3] = keeper;
        accounts[4] = owner;
    }
}
