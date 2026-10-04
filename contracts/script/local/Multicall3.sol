// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice The `aggregate3` entry point of the canonical Multicall3, for local chains only.
/// @dev Monad testnet has Multicall3 at 0xcA11bde05977b3631167028862bE2a173976CA11, and the web
///      app batches its reads through it. Anvil starts empty, so `scripts/deploy.sh` places this
///      runtime code at the same address; local runs then batch exactly as the testnet does. Only
///      the one function the app's client calls is implemented.
contract Multicall3 {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory results) {
        results = new Result[](calls.length);
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool success, bytes memory returnData) = calls[i].target.call(calls[i].callData);
            require(success || calls[i].allowFailure, "Multicall3: call failed");
            results[i] = Result(success, returnData);
        }
    }
}
