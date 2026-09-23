// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";

import {IngotIndex} from "../src/IngotIndex.sol";
import {IngotIndexReceiver} from "../src/IngotIndexReceiver.sol";

contract IngotIndexReceiverTest is Test {
    IngotIndex internal index;
    IngotIndexReceiver internal receiver;

    address internal owner = address(0xA11CE);
    address internal forwarder = address(0xF0);
    address internal stranger = address(0xDEAD);

    /// @dev The ASCII bytes32 of the workflow name, matching `bytes32FromAscii` in the workflow.
    ///      This started as keccak256 of the same string and the cross-language test caught it:
    ///      the payload decoded cleanly and the receiver rejected it, which is the failure mode
    ///      that test exists to find.
    bytes32 internal constant TAG = bytes32("ingot-h100-index-v1");
    uint64 internal constant GENESIS = 1_700_000_000;

    function setUp() public {
        vm.warp(GENESIS);

        index = new IngotIndex("H100 on-demand, USD/GPU-hour", keccak256("v1"), "ipfs://m", owner);
        receiver = new IngotIndexReceiver(index, TAG, owner);

        vm.startPrank(owner);
        receiver.setForwarder(forwarder);
        // The receiver becomes the index's publisher. A quorum replaces a key.
        index.setPublisher(address(receiver), true);
        vm.stopPrank();
    }

    function _report(uint64 observedAt, uint256 price) internal pure returns (bytes memory) {
        return abi.encode(TAG, observedAt, price, uint32(180), uint16(23));
    }

    function test_onReport_publishesThroughTheIndex() public {
        vm.warp(GENESIS + 1 hours);
        vm.prank(forwarder);
        receiver.onReport("", _report(GENESIS + 1 hours, 3.6e18));

        vm.warp(GENESIS + 1 hours + index.finalityDelay());
        (uint256 price, uint64 observedAt) = index.latest();
        assertEq(price, 3.6e18, "price landed");
        assertEq(observedAt, GENESIS + 1 hours, "timestamp landed");

        IngotIndex.Observation memory print = index.observation(0);
        assertEq(print.sampleCount, 180, "sample count carried through");
        assertEq(print.sourceCount, 23, "venue count carried through");
    }

    /// @dev The forwarder is the security boundary: it verifies DON signatures before calling.
    function test_onReport_rejectsAnyoneButTheForwarder() public {
        vm.warp(GENESIS + 1 hours);
        vm.expectRevert(abi.encodeWithSelector(IngotIndexReceiver.NotForwarder.selector, stranger));
        vm.prank(stranger);
        receiver.onReport("", _report(GENESIS + 1 hours, 3.6e18));
    }

    function test_onReport_rejectsAReportFromAnotherWorkflow() public {
        bytes32 other = keccak256("someone-elses-workflow");
        bytes memory report = abi.encode(other, uint64(GENESIS + 1 hours), uint256(3.6e18), uint32(1), uint16(1));

        vm.warp(GENESIS + 1 hours);
        vm.expectRevert(abi.encodeWithSelector(IngotIndexReceiver.UnexpectedWorkflow.selector, other));
        vm.prank(forwarder);
        receiver.onReport("", report);
    }

    function test_onReport_revertsBeforeAForwarderIsConfigured() public {
        IngotIndexReceiver fresh = new IngotIndexReceiver(index, TAG, owner);

        vm.warp(GENESIS + 1 hours);
        vm.expectRevert(IngotIndexReceiver.ForwarderNotSet.selector);
        vm.prank(forwarder);
        fresh.onReport("", _report(GENESIS + 1 hours, 3.6e18));
    }

    /// @dev A quorum is not licence to print anything: the index's own guards still apply.
    function test_onReport_stillSubjectToTheDeviationBand() public {
        vm.warp(GENESIS + 1 hours);
        vm.prank(forwarder);
        receiver.onReport("", _report(GENESIS + 1 hours, 3.6e18));

        vm.warp(GENESIS + 2 hours);
        vm.expectRevert(
            abi.encodeWithSelector(IngotIndex.DeviationTooLarge.selector, 3.6e18, 36e18, 2_500)
        );
        vm.prank(forwarder);
        receiver.onReport("", _report(GENESIS + 2 hours, 36e18));
    }

    function test_setForwarder_onlyOwner() public {
        vm.expectRevert();
        vm.prank(stranger);
        receiver.setForwarder(stranger);
    }

    // ------------------------------------------------------------------
    // Cross-language check
    // ------------------------------------------------------------------

    /// @notice Decode the exact bytes the CRE workflow's TypeScript encoder produced.
    ///
    /// @dev The workflow runs in a restricted WASM sandbox with no ABI library, so it hand-rolls
    ///      the encoding of `(bytes32, uint64, uint256, uint32, uint16)`. An encoder and a decoder
    ///      written in different languages agreeing "by inspection" is exactly the kind of thing
    ///      that is wrong in production, so this test reads the payload `pnpm simulate` wrote and
    ///      puts it through the real receiver.
    ///
    ///      Regenerate with: cd oracle && pnpm simulate
    function test_onReport_decodesThePayloadTheWorkflowEncoded() public {
        string memory raw = vm.readFile("../oracle/fixtures/report-payload.hex");
        bytes memory payload = vm.parseBytes(vm.trim(raw));

        assertEq(payload.length, 160, "five abi words");

        (bytes32 tag, uint64 observedAt, uint256 price, uint32 sampleCount, uint16 sourceCount) =
            abi.decode(payload, (bytes32, uint64, uint256, uint32, uint16));

        assertEq(tag, bytes32("ingot-h100-index-v1"), "tag round-trips through both languages");
        assertGt(observedAt, 1_700_000_000, "plausible timestamp");
        assertGt(price, 1e18, "a real H100 rate, not a scaling mistake");
        assertLt(price, 20e18, "and not an absurd one");
        assertGt(sourceCount, 2, "more venues than the methodology floor");
        assertGe(sampleCount, sourceCount, "at least one quote per venue");

        // And it survives the whole path: forwarder -> receiver -> index.
        vm.warp(observedAt);
        vm.prank(forwarder);
        receiver.onReport("", payload);

        vm.warp(observedAt + index.finalityDelay());
        (uint256 published,) = index.latest();
        assertEq(published, price, "the workflow's number is what settles");
    }

    /// @dev Once the receiver is the only publisher, no individual key can print.
    function test_keyHolderCannotPublishOnceReceiverIsTheOnlyPublisher() public {
        vm.warp(GENESIS + 1 hours);
        vm.expectRevert(IngotIndex.NotPublisher.selector);
        vm.prank(owner);
        index.publish(GENESIS + 1 hours, 3.6e18, 1, 1);
    }
}
