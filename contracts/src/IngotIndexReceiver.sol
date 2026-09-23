// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IngotIndex} from "./IngotIndex.sol";

/// @title IngotIndexReceiver
/// @notice Receives index prints from a Chainlink CRE workflow and forwards them to the index.
///
/// @dev This contract exists to fix a specific weakness. `IngotIndex` trusts an allowlisted set of
///      publishers: any one of them can print within the deviation band every interval, so a single
///      compromised key can walk the settlement price over a few hours. Operational mitigations —
///      the finality delay, tip revocation — buy time but do not remove the trust.
///
///      With this receiver installed as the only publisher, a print requires a quorum instead of a
///      key. The CRE workflow runs on a Decentralized Oracle Network: each node fetches venue
///      rates independently, the DON takes the median across nodes, and the signed result is
///      delivered here by the CRE forwarder. No single node — and no single operator — can move
///      the index.
///
///      Authentication is the forwarder, deliberately and only. The forwarder is the contract that
///      verifies DON signatures before it calls anything, so `msg.sender == forwarder` *is* the
///      proof that a quorum produced this report. Rather than re-parse CRE's 109-byte metadata
///      header at byte offsets, the workflow tag is carried in the report body, which this contract
///      and the workflow both define — verifiable on both sides rather than assumed.
contract IngotIndexReceiver is Ownable {
    /// @notice The index this receiver publishes into.
    IngotIndex public immutable index;

    /// @notice The CRE forwarder permitted to deliver reports.
    address public forwarder;

    /// @notice Tag the workflow stamps into every report body, so a report from some other
    ///         workflow pointed at this receiver is rejected.
    /// @dev The ASCII form of the workflow name, i.e. `bytes32("ingot-h100-index-v1")` — not a
    ///      hash of it. Legible in an explorer, and the workflow's encoder rejects names longer
    ///      than 32 bytes rather than truncating.
    bytes32 public workflowTag;

    event ForwarderSet(address indexed forwarder);
    event WorkflowTagSet(bytes32 indexed workflowTag);
    event ReportAccepted(uint64 observedAt, uint256 price, uint32 sampleCount, uint16 sourceCount);

    error NotForwarder(address caller);
    error UnexpectedWorkflow(bytes32 tag);
    error ForwarderNotSet();

    constructor(IngotIndex index_, bytes32 workflowTag_, address owner_) Ownable(owner_) {
        index = index_;
        workflowTag = workflowTag_;
        emit WorkflowTagSet(workflowTag_);
    }

    /// @notice Entry point the CRE forwarder calls with a DON-signed report.
    /// @param report ABI-encoded `(bytes32 tag, uint64 observedAt, uint256 price, uint32 samples,
    ///        uint16 sources)` produced by the workflow.
    /// @dev `metadata` is CRE's report header. It is accepted and ignored: the forwarder has
    ///      already verified the DON signatures it describes, and everything this contract needs
    ///      to check is in the body.
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external {
        address forwarder_ = forwarder;
        if (forwarder_ == address(0)) revert ForwarderNotSet();
        if (msg.sender != forwarder_) revert NotForwarder(msg.sender);

        (bytes32 tag, uint64 observedAt, uint256 price, uint32 sampleCount, uint16 sourceCount) =
            abi.decode(report, (bytes32, uint64, uint256, uint32, uint16));

        if (tag != workflowTag) revert UnexpectedWorkflow(tag);

        // Publishing guards — deviation band, minimum interval, monotonic timestamps — stay in the
        // index. A quorum is not licence to print anything.
        index.publish(observedAt, price, sampleCount, sourceCount);

        emit ReportAccepted(observedAt, price, sampleCount, sourceCount);
    }

    function setForwarder(address forwarder_) external onlyOwner {
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    function setWorkflowTag(bytes32 workflowTag_) external onlyOwner {
        workflowTag = workflowTag_;
        emit WorkflowTagSet(workflowTag_);
    }
}
