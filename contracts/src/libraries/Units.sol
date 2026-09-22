// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Units
/// @notice Shared scaling conventions for Ingot.
///
/// @dev Three quantities show up everywhere and mixing them up is the easiest way to lose money:
///
///      - `size`  : GPU-hours, signed, 18 decimals. Positive is long compute (you gain when rental
///                  rates rise). A contract lot is 730 GPU-hours, matching the CME unit, but sizes
///                  are not restricted to whole lots — a hedge should match an offtake exactly.
///      - `price` : USD per GPU-hour, 18 decimals. Straight from the index.
///      - `value` : USDC, 6 decimals, signed where it represents a cost basis or a PnL.
///
///      size (1e18) * price (1e18) = 1e36, and USDC is 1e6, so notional divides by 1e30.
library Units {
    /// @notice GPU-hours in one contract lot (CME Silicon Data parity).
    int256 internal constant LOT_HOURS = 730e18;

    /// @dev size * price scaling factor down to USDC's 6 decimals.
    int256 internal constant NOTIONAL_DIVISOR = 1e30;

    uint256 internal constant BPS = 10_000;

    /// @notice Signed notional value in USDC of `size` GPU-hours at `price`.
    /// @dev Truncates toward zero, which is the same direction for longs and shorts, so rounding
    ///      does not systematically favour either side of the book.
    function notional(int256 size, uint256 price) internal pure returns (int256) {
        return (size * int256(price)) / NOTIONAL_DIVISOR;
    }

    /// @notice Absolute notional value in USDC of `size` GPU-hours at `price`.
    function absNotional(int256 size, uint256 price) internal pure returns (uint256) {
        int256 value = notional(size, price);
        return uint256(value >= 0 ? value : -value);
    }

    function abs(int256 value) internal pure returns (uint256) {
        return uint256(value >= 0 ? value : -value);
    }

    function sameSign(int256 a, int256 b) internal pure returns (bool) {
        return (a >= 0) == (b >= 0);
    }

    /// @notice Convert whole lots to a GPU-hour size.
    function lotsToSize(int256 lots) internal pure returns (int256) {
        return lots * LOT_HOURS;
    }
}
