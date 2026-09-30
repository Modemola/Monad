// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Fixtures} from "./Fixtures.sol";
import {HedgedCredit} from "../src/HedgedCredit.sol";
import {IngotMarket} from "../src/IngotMarket.sol";
import {UnderwriterVault} from "../src/UnderwriterVault.sol";

/// @notice Records a realistic session against the real contracts for the indexer to replay.
///
/// @dev The indexer derives state the chain never emits — the vault's position and cost basis,
///      open interest after flips — by porting `_applyDelta` to TypeScript. That port is only
///      worth trusting if it is checked against the contracts themselves, so this test runs
///      opens, reduces, a flip, a revoked print, a hedged loan, a liquidation and settlement,
///      then writes every log plus the contract's own final state to
///      indexer/test/fixtures/trace.json. indexer/test/replay.test.ts feeds those exact logs
///      through the handlers and requires the indexed state to match to the unit.
///
///      CI regenerates the file and fails on any diff, so the fixture cannot drift from the code.
contract IndexerTraceTest is Fixtures {
    struct Stamped {
        address emitter;
        bytes32[] topics;
        bytes data;
        uint256 blockNumber;
        uint256 timestamp;
    }

    string internal constant OUT = "../indexer/test/fixtures/trace.json";
    int256 internal constant LOT = 730e18;

    UnderwriterVault internal underwriter;
    HedgedCredit internal credit;
    uint256 internal seriesId;
    uint256 internal loanId;

    address internal carol = address(0xCA201);
    address internal lender = address(0x1E4D);
    address internal neocloud = address(0x60C1);

    Stamped[] internal _trace;
    string[] internal _checkpoints;

    function test_trace_writeFixture() public {
        vm.recordLogs();
        vm.roll(1);
        _deploy();
        _seedIndex(2.5e18);
        _capture();

        _stand_up_pools();
        _trade_open_reduce_flip();
        _revoke_a_provisional_print();
        _checkpoint("after the flip and a revoked print");
        _open_hedged_loan();
        _liquidate_levered_long();
        _checkpoint("after the loan hedge and the liquidation");
        _settle();
        _checkpoint("after settlement, vault left unrealized");

        _write();
    }

    // ------------------------------------------------------------------ scenario

    function _stand_up_pools() internal {
        // CREATE2, so the recorded addresses do not depend on how a given Foundry version counts
        // the test contract's nonce across cheatcodes — the fixture must be byte-identical in CI.
        underwriter = new UnderwriterVault{salt: "underwriter"}(market, IERC20(address(usdc)), owner);
        vm.prank(owner);
        market.setVault(address(underwriter));
        _capture();

        usdc.mint(alice, 2_000_000 * USDC_ONE);
        vm.startPrank(alice);
        usdc.approve(address(underwriter), type(uint256).max);
        underwriter.deposit(2_000_000 * USDC_ONE);
        vm.stopPrank();
        _capture();

        credit = new HedgedCredit{salt: "credit"}(market, IERC20(address(usdc)), owner);
        usdc.mint(lender, 1_000_000 * USDC_ONE);
        vm.startPrank(lender);
        usdc.approve(address(credit), type(uint256).max);
        credit.depositLender(1_000_000 * USDC_ONE);
        vm.stopPrank();
        _capture();

        seriesId = _listSeries(30, 150);
        _fund(alice, 100_000 * USDC_ONE);
        _fund(bob, 100_000 * USDC_ONE);
        _capture();
    }

    function _trade_open_reduce_flip() internal {
        _buy(alice, seriesId, 20 * LOT);
        _capture();
        _sell(bob, seriesId, -12 * LOT);
        _capture();

        _setSpot(2.9e18);
        _capture();

        _sell(alice, seriesId, -30 * LOT); // closes 20 at a profit, flips to 10 short
        _capture();
        _buy(bob, seriesId, 5 * LOT); // reduces the short
        _buy(alice, seriesId, 3 * LOT); // same block: two fills, ordered by log index
        _capture();

        vm.prank(bob);
        market.withdraw(1_000 * USDC_ONE);
        _capture();
    }

    function _revoke_a_provisional_print() internal {
        clock += 2 hours;
        vm.warp(clock);
        vm.prank(publisher);
        index.publish(clock, 4.0e18, 3, 1);
        _capture();

        vm.prank(owner);
        index.revokeLatest("single-venue outlier");
        _capture();

        _setSpot(2.7e18); // the next print reuses the revoked id
        _capture();
    }

    function _open_hedged_loan() internal {
        usdc.mint(neocloud, 500_000 * USDC_ONE);
        vm.startPrank(neocloud);
        usdc.approve(address(credit), type(uint256).max);
        loanId = credit.open(seriesId, 100_000e18, 8_000, 60_000 * USDC_ONE, 0);
        vm.stopPrank();
        _capture();
    }

    function _liquidate_levered_long() internal {
        _fund(carol, 60_000 * USDC_ONE);
        _buy(carol, seriesId, 150 * LOT);
        uint256 free = market.freeCollateral(carol);
        vm.prank(carol);
        market.withdraw(free);
        _capture();

        _setSpot(1.2e18);
        _capture();

        _fund(keeper, 1_000 * USDC_ONE);
        vm.prank(keeper);
        market.liquidate(carol, seriesId, -150 * LOT);
        _capture();
    }

    function _settle() internal {
        _setSpot(1.9e18);
        _capture();

        vm.warp(market.seriesAt(seriesId).expiry + 1);
        clock = uint64(block.timestamp);
        vm.prank(publisher);
        index.publish(clock, 2.0e18, 150, 12);
        clock += uint64(index.finalityDelay()) + 1;
        vm.warp(clock);
        _capture();

        market.settleSeries(seriesId);
        market.settlePosition(alice, seriesId);
        market.settlePosition(bob, seriesId);
        _capture();

        vm.prank(neocloud);
        credit.close(loanId);
        _capture();

        uint256 shares = credit.balanceOf(lender) / 10;
        vm.prank(lender);
        credit.redeemLender(shares);
        _capture();

        // The vault is left holding its long unrealized on purpose: open interest must keep
        // counting it after the series settles, until someone calls settlePosition.
    }

    // ------------------------------------------------------------------ recording

    function _capture() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            address emitter = logs[i].emitter;
            bool ours = emitter == address(index) || emitter == address(market)
                || emitter == address(underwriter) || emitter == address(credit);
            if (!ours || emitter == address(0)) continue;
            _trace.push(Stamped(emitter, logs[i].topics, logs[i].data, block.number, block.timestamp));
        }
        vm.roll(block.number + 1);
    }

    function _write() internal {
        string memory json = string.concat(
            "{\n",
            '  "note": "Generated by contracts/test/IndexerTrace.t.sol. Do not edit.",\n',
            '  "contracts": ',
            _contractsJson(),
            ",\n",
            '  "logs": ',
            _logsJson(),
            ",\n",
            '  "vault": "',
            vm.toString(address(underwriter)),
            '",\n',
            '  "checkpoints": ',
            _checkpointsJson(),
            "\n}\n"
        );
        vm.writeFile(OUT, json);
    }

    function _contractsJson() internal view returns (string memory) {
        return string.concat(
            '{"IngotIndex": "',
            vm.toString(address(index)),
            '", "IngotMarket": "',
            vm.toString(address(market)),
            '", "UnderwriterVault": "',
            vm.toString(address(underwriter)),
            '", "HedgedCredit": "',
            vm.toString(address(credit)),
            '"}'
        );
    }

    function _logsJson() internal view returns (string memory out) {
        out = "[";
        for (uint256 i; i < _trace.length; ++i) {
            out = string.concat(out, i == 0 ? "\n    " : ",\n    ", _logJson(_trace[i]));
        }
        out = string.concat(out, "\n  ]");
    }

    function _logJson(Stamped storage s) internal view returns (string memory) {
        string memory topics = "[";
        for (uint256 i; i < s.topics.length; ++i) {
            topics = string.concat(topics, i == 0 ? '"' : ', "', vm.toString(s.topics[i]), '"');
        }
        topics = string.concat(topics, "]");

        return string.concat(
            '{"emitter": "',
            vm.toString(s.emitter),
            '", "block": ',
            vm.toString(s.blockNumber),
            ', "timestamp": ',
            vm.toString(s.timestamp),
            ', "topics": ',
            topics,
            ', "data": "',
            vm.toString(s.data),
            '"}'
        );
    }

    /// @dev Contract state at the last captured block, for the replay to compare against.
    function _checkpoint(string memory label) internal {
        address[6] memory accounts =
            [alice, bob, carol, address(underwriter), address(credit), keeper];

        string memory positions = "[";
        for (uint256 i; i < accounts.length; ++i) {
            IngotMarket.Position memory p = market.positionOf(accounts[i], seriesId);
            positions = string.concat(
                positions,
                i == 0 ? "\n        " : ",\n        ",
                '{"account": "',
                vm.toString(accounts[i]),
                '", "size": "',
                vm.toString(p.size),
                '", "cost": "',
                vm.toString(p.cost),
                '"}'
            );
        }
        positions = string.concat(positions, "\n      ]");

        IngotMarket.Series memory series = market.seriesAt(seriesId);
        string memory head = string.concat(
            '{\n      "label": "',
            label,
            '",\n      "block": ',
            vm.toString(block.number - 1),
            ',\n      "seriesId": "',
            vm.toString(seriesId),
            '",\n      "longOpenInterest": "',
            vm.toString(series.longOpenInterest),
            '",\n      "settled": ',
            series.settled ? "true" : "false",
            ',\n      "settlementPrice": "',
            vm.toString(series.settlementPrice)
        );
        _checkpoints.push(
            string.concat(
                head,
                '",\n      "badDebt": "',
                vm.toString(market.badDebt()),
                '",\n      "prints": ',
                vm.toString(index.observationCount()),
                ',\n      "loanClosed": ',
                address(credit) != address(0) && credit.loanCount() > loanId && credit.loanAt(loanId).closed
                    ? "true"
                    : "false",
                ',\n      "positions": ',
                positions,
                "\n    }"
            )
        );
    }

    function _checkpointsJson() internal view returns (string memory out) {
        out = "[";
        for (uint256 i; i < _checkpoints.length; ++i) {
            out = string.concat(out, i == 0 ? "\n    " : ",\n    ", _checkpoints[i]);
        }
        out = string.concat(out, "\n  ]");
    }
}
