// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IIngotIndex
/// @notice Read interface for the Ingot rental-rate index consumed by markets and credit contracts.
interface IIngotIndex {
    /// @notice Most recent finalized observation.
    /// @return price USD per GPU-hour, 18 decimals.
    /// @return observedAt Unix timestamp the price refers to.
    function latest() external view returns (uint256 price, uint64 observedAt);

    /// @notice Arithmetic time-weighted average price over `[from, to]`.
    /// @dev Reverts unless the whole window is covered by finalized observations.
    function averageBetween(uint64 from, uint64 to) external view returns (uint256 price);

    /// @notice Time-weighted average price over the `window` seconds ending now, the newest
    ///         finalized price held forward to the present.
    function twap(uint32 window) external view returns (uint256 price);

    /// @notice Timestamp of the newest finalized observation.
    function finalizedThrough() external view returns (uint64);

    /// @notice Timestamp of the first observation: no average can start before it.
    function genesis() external view returns (uint64);

    /// @notice Largest move, in basis points, between the newest finalized price and any print
    ///         still inside its finality delay. Zero when nothing is pending.
    /// @dev Provisional prints are public before they count. Consumers that quote against the
    ///      finalized price use this to stop quoting into a move everyone can already see.
    function pendingMoveBps() external view returns (uint256);
}
