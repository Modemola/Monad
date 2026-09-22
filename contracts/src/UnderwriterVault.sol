// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IngotMarket} from "./IngotMarket.sol";

/// @title UnderwriterVault
/// @notice The other side of every trade on Ingot, owned by its depositors.
///
/// @dev This is the answer to the question every new derivatives venue dies on: who takes the
///      other side? Here it is a pool of USDC that quotes two-way continuously and is paid for it
///      through the half-spread, taker fees and whatever the inventory ends up being worth.
///
///      The vault holds no position logic of its own. It *is* the market's vault account, so its
///      risk is margined by the same engine as any trader and its solvency is enforced on every
///      fill. This contract is the ownership layer on top: shares in, shares out, NAV in between.
///
///      Two properties matter for depositors:
///
///      1. NAV is mark-to-market, not book. It includes unrealized PnL on open inventory, so the
///         share price reflects what the vault is actually worth right now.
///      2. Redemption is bounded by free collateral. Capital backing open positions cannot be
///         pulled out from under the traders relying on it, so a redemption that would breach the
///         vault's own initial margin reverts rather than silently under-collateralizing the book.
contract UnderwriterVault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    /// @dev Shares burned on the first deposit so share price cannot be manipulated by donating
    ///      assets into an almost-empty vault.
    uint256 public constant MINIMUM_LIQUIDITY = 1e6;

    IngotMarket public immutable market;
    IERC20 public immutable usdc;

    event Deposited(address indexed account, uint256 assets, uint256 shares);
    event Redeemed(address indexed account, uint256 shares, uint256 assets);

    error ZeroAmount();
    error VaultInsolvent();
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error FirstDepositTooSmall(uint256 minimum);

    constructor(IngotMarket market_, IERC20 usdc_, address owner_)
        ERC20("Ingot Underwriter Vault", "ingotUSDC")
        Ownable(owner_)
    {
        market = market_;
        usdc = usdc_;
        usdc_.forceApprove(address(market_), type(uint256).max);
    }

    /// @notice LP shares track USDC's six decimals so share price reads as a clean ratio.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ---------------------------------------------------------------------
    // Valuation
    // ---------------------------------------------------------------------

    /// @notice Mark-to-market value of everything the vault owns, in USDC.
    /// @dev Margin equity plus anything sitting idle here. Floors at zero: a vault underwater on
    ///      its inventory is worth nothing to new depositors, not a negative amount.
    function totalAssets() public view returns (uint256) {
        int256 total = market.equity(address(this)) + usdc.balanceOf(address(this)).toInt256();
        // forge-lint: disable-next-line(unsafe-typecast) — guarded positive.
        return total > 0 ? uint256(total) : 0;
    }

    /// @notice USDC that could be redeemed right now without breaching the vault's own margin.
    function availableLiquidity() public view returns (uint256) {
        return market.freeCollateral(address(this)) + usdc.balanceOf(address(this));
    }

    /// @notice Value of one whole share, scaled to USDC decimals.
    function sharePrice() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e6;
        return (totalAssets() * 1e6) / supply;
    }

    function previewDeposit(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return assets;
        return (assets * supply) / totalAssets();
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 0;
        return (shares * totalAssets()) / supply;
    }

    // ---------------------------------------------------------------------
    // Deposit and redeem
    // ---------------------------------------------------------------------

    /// @notice Underwrite the market with `assets` USDC.
    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();

        uint256 supply = totalSupply();
        if (supply == 0) {
            if (assets <= MINIMUM_LIQUIDITY) revert FirstDepositTooSmall(MINIMUM_LIQUIDITY + 1);
            shares = assets - MINIMUM_LIQUIDITY;
            _mint(address(this), MINIMUM_LIQUIDITY); // permanently locked
        } else {
            uint256 assetsBefore = totalAssets();
            if (assetsBefore == 0) revert VaultInsolvent();
            shares = (assets * supply) / assetsBefore;
            if (shares == 0) revert ZeroAmount();
        }

        usdc.safeTransferFrom(msg.sender, address(this), assets);
        market.deposit(assets);
        _mint(msg.sender, shares);

        emit Deposited(msg.sender, assets, shares);
    }

    /// @notice Burn `shares` and take the USDC back.
    /// @dev Bounded by free collateral: capital backing open positions stays where it is.
    function redeem(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();

        assets = previewRedeem(shares);
        if (assets == 0) revert ZeroAmount();

        uint256 available = availableLiquidity();
        if (assets > available) revert InsufficientLiquidity(assets, available);

        // Burn before touching the market so NAV cannot be read mid-redemption.
        _burn(msg.sender, shares);

        uint256 idle = usdc.balanceOf(address(this));
        if (idle < assets) market.withdraw(assets - idle);

        usdc.safeTransfer(msg.sender, assets);

        emit Redeemed(msg.sender, shares, assets);
    }

    /// @notice Push any idle USDC into the market as margin.
    /// @dev Only reachable if someone transfers USDC straight to this address.
    function sweep() external {
        uint256 idle = usdc.balanceOf(address(this));
        if (idle == 0) revert ZeroAmount();
        market.deposit(idle);
    }
}
