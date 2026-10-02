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
///      Authentication has two parts. The forwarder verifies DON signatures before it calls
///      anything, so `msg.sender == forwarder` proves *a* quorum produced the report. But the
///      forwarder is shared by every workflow on the chain, and the report body is whatever the
///      sending workflow chose to write — a tag in it proves nothing on its own. What the forwarder
///      does vouch for is the metadata it passes alongside: the workflow's ID, name and owner, taken
///      from the signed report header. So this contract also pins the expected workflow owner and,
///      optionally, the workflow ID, and only then trusts the body.
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

    /// @notice Account that deployed the workflow, as the forwarder reports it. Zero disables the
    ///         check, for local testing only.
    address public expectedWorkflowOwner;

    /// @notice Exact workflow ID to accept. Zero accepts any workflow from the expected owner, so
    ///         a redeploy of the same workflow does not need an on-chain update.
    bytes32 public expectedWorkflowId;

    event ForwarderSet(address indexed forwarder);
    event WorkflowTagSet(bytes32 indexed workflowTag);
    event ExpectedWorkflowSet(address indexed owner, bytes32 indexed workflowId);
    event ReportAccepted(uint64 observedAt, uint256 price, uint32 sampleCount, uint16 sourceCount);

    error NotForwarder(address caller);
    error UnexpectedWorkflow(bytes32 tag);
    error ForwarderNotSet();
    error UnexpectedWorkflowOwner(address owner);
    error UnexpectedWorkflowId(bytes32 workflowId);
    error MalformedMetadata();
    error WorkflowNotPinned();

    constructor(IngotIndex index_, bytes32 workflowTag_, address owner_) Ownable(owner_) {
        index = index_;
        workflowTag = workflowTag_;
        emit WorkflowTagSet(workflowTag_);
    }

    /// @notice Entry point the CRE forwarder calls with a DON-signed report.
    /// @param report ABI-encoded `(bytes32 tag, uint64 observedAt, uint256 price, uint32 samples,
    ///        uint16 sources)` produced by the workflow.
    /// @param metadata What the CRE forwarder passes from the signed header, packed as
    ///        `(bytes32 workflowId, bytes10 workflowName, address workflowOwner)`.
    function onReport(bytes calldata metadata, bytes calldata report) external {
        address forwarder_ = forwarder;
        if (forwarder_ == address(0)) revert ForwarderNotSet();
        if (msg.sender != forwarder_) revert NotForwarder(msg.sender);
        _checkWorkflow(metadata);

        (bytes32 tag, uint64 observedAt, uint256 price, uint32 sampleCount, uint16 sourceCount) =
            abi.decode(report, (bytes32, uint64, uint256, uint32, uint16));

        if (tag != workflowTag) revert UnexpectedWorkflow(tag);

        // Publishing guards — deviation band, minimum interval, monotonic timestamps — stay in the
        // index. A quorum is not licence to print anything.
        index.publish(observedAt, price, sampleCount, sourceCount);

        emit ReportAccepted(observedAt, price, sampleCount, sourceCount);
    }

    function _checkWorkflow(bytes calldata metadata) internal view {
        address owner_ = expectedWorkflowOwner;
        bytes32 id_ = expectedWorkflowId;
        // Fail closed. The forwarder is shared by every workflow on the chain, so with nothing
        // pinned any of them could print here by copying the tag.
        if (owner_ == address(0) && id_ == bytes32(0)) revert WorkflowNotPinned();
        if (metadata.length < 62) revert MalformedMetadata();

        bytes32 workflowId = bytes32(metadata[0:32]);
        address workflowOwner = address(bytes20(metadata[42:62]));
        if (owner_ != address(0) && workflowOwner != owner_) revert UnexpectedWorkflowOwner(workflowOwner);
        if (id_ != bytes32(0) && workflowId != id_) revert UnexpectedWorkflowId(workflowId);
    }

    function setExpectedWorkflow(address workflowOwner, bytes32 workflowId) external onlyOwner {
        expectedWorkflowOwner = workflowOwner;
        expectedWorkflowId = workflowId;
        emit ExpectedWorkflowSet(workflowOwner, workflowId);
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
