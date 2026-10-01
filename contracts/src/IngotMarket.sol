// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IIngotIndex} from "./interfaces/IIngotIndex.sol";
import {Units} from "./libraries/Units.sol";

/// @title IngotMarket
/// @notice Cash-settled swaps on a compute rental index, margined in USDC.
///
/// @dev Structure:
///
///      A *series* is a dated contract settling to the average index over its delivery window,
///      mirroring how CME's compute futures settle. Positions are held in GPU-hours rather than
///      whole lots, because a hedge that cannot match an offtake exactly is not a hedge.
///
///      Liquidity is underwritten rather than matched. Every trade is against the vault account,
///      which quotes a two-way price off the mark: a fixed half-spread plus an inventory skew that
///      widens as the vault accumulates one-sided risk. The vault is an ordinary margin account
///      inside this contract, so its solvency is enforced by the same margin engine as everyone
///      else's — when the vault can no longer meet maintenance, quotes stop. That is the capacity
///      limit, and it is a property of the accounting rather than a parameter someone has to
///      remember to set.
///
///      Marking is continuous against the index rather than daily. That is the part that needs
///      Monad: marking every account on every block is only economical when gas is sub-cent and
///      finality is under a second.
///
///      Settlement is lazy and per-account. Nothing in this contract ever loops over all traders.
contract IngotMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using Units for int256;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Series {
        uint64 listedAt;
        uint64 windowStart;
        uint64 expiry;
        bool settled;
        /// @dev Forward premium over spot at listing, in bps, decaying linearly to zero at expiry.
        ///      Signed: compute forwards sit in backwardation as often as contango.
        int32 basisBps;
        uint256 settlementPrice;
        uint256 longOpenInterest;
    }

    struct Position {
        int256 size;
        /// @dev Signed notional paid to reach `size`. Positive for longs, negative for shorts.
        int256 cost;
        uint32 listIndex;
        bool tracked;
    }

    struct VaultParams {
        /// @dev Half-spread charged on every fill.
        uint16 spreadBps;
        /// @dev Price adjustment applied when vault inventory equals `skewScale`.
        uint16 skewCoefBps;
        /// @dev Maximum total adjustment, so a broken parameter cannot produce an absurd fill.
        uint16 maxAdjBps;
        /// @dev Inventory, in GPU-hours, at which the full skew adjustment applies.
        uint256 skewScale;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    IIngotIndex public immutable index;
    IERC20 public immutable usdc;

    /// @notice The account every trade is booked against.
    address public vault;

    /// @notice Trailing window used to derive spot from the index.
    uint32 public markWindow = 1 hours;

    uint16 public initialMarginBps = 2_000; // 20%
    uint16 public maintenanceMarginBps = 1_000; // 10%
    uint16 public takerFeeBps = 10; // 0.10%, paid to the vault
    uint16 public liquidationFeeBps = 100; // 1% of closed notional
    uint16 public liquidatorShareBps = 5_000; // half the penalty to the liquidator

    VaultParams public vaultParams =
        VaultParams({spreadBps: 25, skewCoefBps: 200, maxAdjBps: 1_000, skewScale: 200_000e18});

    Series[] internal _series;

    mapping(address account => int256 balance) public balanceOf;
    mapping(address account => mapping(uint256 seriesId => Position)) internal _positions;
    mapping(address account => uint256[] seriesIds) internal _openSeries;

    /// @notice Losses that exceeded an account's collateral and were absorbed by the vault.
    uint256 public badDebt;

    /// @notice How long a flat account left with a negative balance by settlement has to cover it
    ///         before anyone may write it off against the vault.
    uint32 public shortfallGrace = 3 days;

    /// @notice When settlement left an account flat and under water; zero when it is not.
    mapping(address account => uint64 since) public shortfallSince;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event SeriesListed(uint256 indexed seriesId, uint64 windowStart, uint64 expiry, int32 basisBps);
    event SeriesSettled(uint256 indexed seriesId, uint256 settlementPrice);
    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event Traded(
        address indexed account,
        uint256 indexed seriesId,
        int256 size,
        uint256 price,
        int256 realizedPnl,
        uint256 fee
    );
    event PositionSettled(address indexed account, uint256 indexed seriesId, int256 size, int256 realizedPnl);
    event Liquidated(
        address indexed account,
        uint256 indexed seriesId,
        address indexed liquidator,
        int256 size,
        uint256 price,
        uint256 penalty
    );
    event BadDebtAbsorbed(address indexed account, uint256 amount);
    event ShortfallRecorded(address indexed account, int256 balance);
    event VaultSet(address indexed vault);
    event VaultParamsSet(uint16 spreadBps, uint16 skewCoefBps, uint16 maxAdjBps, uint256 skewScale);
    event RiskParamsSet(uint16 initialMarginBps, uint16 maintenanceMarginBps, uint16 takerFeeBps);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error VaultNotSet();
    error VaultCannotTradeDirectly();
    error UnknownSeries();
    error SeriesExpired();
    error SeriesNotExpired();
    error SeriesAlreadySettled();
    error SeriesNotSettled();
    error ZeroSize();
    error ZeroAmount();
    error PriceLimitExceeded(uint256 quoted, uint256 limit);
    error InsufficientMargin(int256 equity, uint256 required);
    error VaultAtCapacity();
    error NotLiquidatable(int256 equity, uint256 maintenance);
    error NoPosition();
    error InvalidParameter();
    error WindowInvalid();
    error VaultNotLiquidatable();
    error WithdrawExceedsBalance(int256 balance);
    error NoShortfall();
    error ShortfallInGrace(uint64 absorbableAt);

    constructor(IIngotIndex index_, IERC20 usdc_, address owner_) Ownable(owner_) {
        index = index_;
        usdc = usdc_;
    }

    // ---------------------------------------------------------------------
    // Series lifecycle
    // ---------------------------------------------------------------------

    /// @notice List a dated contract settling to the average index over `[windowStart, expiry]`.
    function listSeries(uint64 windowStart, uint64 expiry, int32 basisBps)
        external
        onlyOwner
        returns (uint256 seriesId)
    {
        if (expiry <= windowStart || expiry <= block.timestamp) revert WindowInvalid();
        if (basisBps > 5_000 || basisBps < -5_000) revert InvalidParameter();

        seriesId = _series.length;
        _series.push(
            Series({
                listedAt: uint64(block.timestamp),
                windowStart: windowStart,
                expiry: expiry,
                settled: false,
                basisBps: basisBps,
                settlementPrice: 0,
                longOpenInterest: 0
            })
        );

        emit SeriesListed(seriesId, windowStart, expiry, basisBps);
    }

    /// @notice Fix a series' settlement price once the index has finalized through its expiry.
    /// @dev Permissionless: anyone may settle, nobody can settle early or twice.
    function settleSeries(uint256 seriesId) external {
        Series storage series = _requireSeries(seriesId);
        if (series.settled) revert SeriesAlreadySettled();
        if (block.timestamp < series.expiry) revert SeriesNotExpired();

        uint256 price = index.averageBetween(series.windowStart, series.expiry);
        series.settled = true;
        series.settlementPrice = price;

        emit SeriesSettled(seriesId, price);
    }

    /// @notice Realize a settled position into the account's balance.
    /// @dev Permissionless and idempotent, so a keeper can clean up abandoned positions.
    function settlePosition(address account, uint256 seriesId) public {
        Series storage series = _requireSeries(seriesId);
        if (!series.settled) revert SeriesNotSettled();

        Position storage position = _positions[account][seriesId];
        int256 size = position.size;
        if (size == 0) {
            if (position.tracked) _untrack(account, seriesId);
            return;
        }

        int256 realized = Units.notional(size, series.settlementPrice) - position.cost;
        balanceOf[account] += realized;

        // forge-lint: disable-next-line(unsafe-typecast) — guarded positive.
        if (size > 0) series.longOpenInterest -= uint256(size);

        position.size = 0;
        position.cost = 0;
        _untrack(account, seriesId);

        emit PositionSettled(account, seriesId, size, realized);

        // A loss realized at settlement can exceed the account's collateral, as one realized in
        // a liquidation can. Left on the account forever it would sit in the vault's balance as a
        // receivable nobody pays, overstating NAV. It is not written off on the spot, though:
        // settlement is permissionless, and a solvent integrator (the credit pool covers its
        // hedge from lender cash) must get the chance to pay before its loss lands on the vault.
        if (
            account != vault && _openSeries[account].length == 0 && balanceOf[account] < 0
                && shortfallSince[account] == 0
        ) {
            shortfallSince[account] = uint64(block.timestamp);
            emit ShortfallRecorded(account, balanceOf[account]);
        }
    }

    /// @notice Write off a flat account's settlement shortfall against the vault, once the grace
    ///         period has passed without it being covered.
    /// @dev Permissionless, so the loss reaches underwriter NAV without anyone's say-so.
    function absorbShortfall(address account) external {
        uint64 since = shortfallSince[account];
        if (since == 0) revert NoShortfall();
        uint64 absorbableAt = since + shortfallGrace;
        if (block.timestamp < absorbableAt) revert ShortfallInGrace(absorbableAt);

        shortfallSince[account] = 0;
        _absorbShortfall(account);
    }

    // ---------------------------------------------------------------------
    // Collateral
    // ---------------------------------------------------------------------

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balanceOf[msg.sender] += amount.toInt256();
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        balanceOf[msg.sender] -= amount.toInt256();
        // Only realized cash leaves. Unrealized PnL backs margin but is not paid out, so a mark
        // that is briefly wrong cannot be turned into USDC.
        if (balanceOf[msg.sender] < 0) revert WithdrawExceedsBalance(balanceOf[msg.sender]);

        int256 equity_ = equity(msg.sender);
        uint256 required = marginRequirement(msg.sender, initialMarginBps);
        if (equity_ < required.toInt256()) revert InsufficientMargin(equity_, required);

        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    /// @notice Open, increase, reduce or flip a position against the vault.
    /// @param seriesId Series to trade.
    /// @param size Signed GPU-hours. Positive buys compute exposure, negative sells it.
    /// @param priceLimit Worst acceptable fill: a maximum when buying, a minimum when selling.
    function trade(uint256 seriesId, int256 size, uint256 priceLimit)
        external
        nonReentrant
        returns (uint256 price)
    {
        address vault_ = vault;
        if (vault_ == address(0)) revert VaultNotSet();
        if (msg.sender == vault_) revert VaultCannotTradeDirectly();
        if (size == 0) revert ZeroSize();

        Series storage series = _requireSeries(seriesId);
        if (series.settled) revert SeriesAlreadySettled();
        if (block.timestamp >= series.expiry) revert SeriesExpired();

        price = quote(seriesId, size);
        if (size > 0) {
            if (price > priceLimit) revert PriceLimitExceeded(price, priceLimit);
        } else {
            if (price < priceLimit) revert PriceLimitExceeded(price, priceLimit);
        }

        uint256 fee = (Units.absNotional(size, price) * takerFeeBps) / Units.BPS;

        int256 traderBefore = _positions[msg.sender][seriesId].size;
        int256 vaultBefore = _positions[vault_][seriesId].size;

        int256 realized = _applyDelta(msg.sender, seriesId, size, price);
        _applyDelta(vault_, seriesId, -size, price);

        balanceOf[msg.sender] -= fee.toInt256();
        balanceOf[vault_] += fee.toInt256();

        _checkPostTrade(msg.sender, vault_, seriesId, traderBefore, vaultBefore);

        emit Traded(msg.sender, seriesId, size, price, realized, fee);
    }

    /// @notice Close an under-margined account's position at the mark, with a penalty.
    /// @param size Signed GPU-hours to close; sign must oppose the position.
    function liquidate(address account, uint256 seriesId, int256 size)
        external
        nonReentrant
        returns (uint256 price)
    {
        Series storage series = _requireSeries(seriesId);
        if (series.settled) revert SeriesAlreadySettled();
        // Liquidating the vault would close its slice against itself: the position would not
        // change, but the penalty would still move from the vault to the liquidator, and the
        // vault would stay liquidatable — a loop that drains underwriter capital. The vault's
        // limit is enforced by refusing to quote risk-adding trades instead.
        if (account == vault) revert VaultNotLiquidatable();

        int256 equity_ = equity(account);
        uint256 maintenance = marginRequirement(account, maintenanceMarginBps);
        if (equity_ >= maintenance.toInt256()) revert NotLiquidatable(equity_, maintenance);

        Position storage position = _positions[account][seriesId];
        int256 held = position.size;
        if (held == 0) revert NoPosition();
        if (size == 0 || Units.sameSign(held, size)) revert ZeroSize();
        if (Units.abs(size) > Units.abs(held)) size = -held;

        price = markPrice(seriesId);
        uint256 penalty = (Units.absNotional(size, price) * liquidationFeeBps) / Units.BPS;

        _applyDelta(account, seriesId, size, price);
        _applyDelta(vault, seriesId, -size, price);

        balanceOf[account] -= penalty.toInt256();
        uint256 liquidatorCut = (penalty * liquidatorShareBps) / Units.BPS;
        balanceOf[msg.sender] += liquidatorCut.toInt256();
        balanceOf[vault] += (penalty - liquidatorCut).toInt256();

        emit Liquidated(account, seriesId, msg.sender, size, price, penalty);

        _absorbShortfall(account);
    }

    // ---------------------------------------------------------------------
    // Pricing
    // ---------------------------------------------------------------------

    /// @notice Mark price of a series: what it is expected to settle at.
    /// @dev A series settles to the average index over its delivery window. Before the window
    ///      opens that is the forward: spot carried by a basis that decays to zero at expiry. Once
    ///      it is open, part of the average is already fixed by finalized prints, and the mark is
    ///      the time-weighted blend of that realized average and the forward for the remainder.
    ///      Marking the whole window at spot would let anyone trade a known, partly-fixed
    ///      settlement against the vault at the wrong price.
    function markPrice(uint256 seriesId) public view returns (uint256) {
        Series storage series = _requireSeries(seriesId);
        if (series.settled) return series.settlementPrice;

        uint256 forward = _forward(series);
        if (block.timestamp <= series.windowStart) return forward;

        uint64 fixedThrough;
        try index.finalizedThrough() returns (uint64 horizon) {
            fixedThrough = horizon;
        } catch {
            return forward;
        }
        if (fixedThrough > block.timestamp) fixedThrough = uint64(block.timestamp);
        if (fixedThrough > series.expiry) fixedThrough = series.expiry;
        if (fixedThrough <= series.windowStart) return forward;

        try index.averageBetween(series.windowStart, fixedThrough) returns (uint256 realized) {
            uint256 window = series.expiry - series.windowStart;
            uint256 elapsed = fixedThrough - series.windowStart;
            return (realized * elapsed + forward * (window - elapsed)) / window;
        } catch {
            // A window opening before the index's first print has no realized average to read.
            return forward;
        }
    }

    /// @dev Spot carried forward by a basis that decays linearly to zero at expiry.
    function _forward(Series storage series) internal view returns (uint256) {
        uint256 spot = _spot();
        if (block.timestamp >= series.expiry) return spot;

        uint256 remaining = series.expiry - block.timestamp;
        uint256 tenor = series.expiry - series.listedAt;
        // Widening int32 and uint64 into int256; both are far inside range.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 effective = (int256(series.basisBps) * int256(remaining)) / int256(tenor);

        // `basisBps` is clamped to +/-5000 at listing, so the multiplier stays in [5000, 15000].
        // forge-lint: disable-next-line(unsafe-typecast)
        return (spot * uint256(int256(Units.BPS) + effective)) / Units.BPS;
    }

    /// @notice Price the vault would fill `size` at right now.
    /// @dev Half-spread against the taker, plus an inventory skew evaluated at the midpoint of the
    ///      fill, so a trade that unwinds vault risk is quoted better than one that adds to it.
    function quote(uint256 seriesId, int256 size) public view returns (uint256) {
        uint256 mark = markPrice(seriesId);
        VaultParams memory params = vaultParams;

        int256 inventory = _positions[vault][seriesId].size;
        int256 midpoint = inventory - size / 2;

        int256 adjustment = size > 0 ? int256(uint256(params.spreadBps)) : -int256(uint256(params.spreadBps));
        adjustment -= (int256(uint256(params.skewCoefBps)) * midpoint) / int256(params.skewScale);

        int256 cap = int256(uint256(params.maxAdjBps));
        if (adjustment > cap) adjustment = cap;
        if (adjustment < -cap) adjustment = -cap;

        // `adjustment` is clamped to +/-maxAdjBps, itself capped at 5000 on write.
        // forge-lint: disable-next-line(unsafe-typecast)
        return (mark * uint256(int256(Units.BPS) + adjustment)) / Units.BPS;
    }

    /// @dev Spot from the index, preferring a trailing average over a single print.
    function _spot() internal view returns (uint256) {
        try index.twap(markWindow) returns (uint256 price) {
            return price;
        } catch {
            (uint256 price,) = index.latest();
            return price;
        }
    }

    // ---------------------------------------------------------------------
    // Account views
    // ---------------------------------------------------------------------

    /// @notice Collateral plus unrealized PnL across every open series.
    function equity(address account) public view returns (int256 total) {
        total = balanceOf[account];

        uint256[] storage ids = _openSeries[account];
        uint256 length = ids.length;
        for (uint256 i = 0; i < length; ++i) {
            uint256 seriesId = ids[i];
            Position storage position = _positions[account][seriesId];
            if (position.size == 0) continue;
            total += Units.notional(position.size, markPrice(seriesId)) - position.cost;
        }
    }

    /// @notice Margin required across every open series at `bps` of notional.
    /// @dev Settled series carry no requirement: their PnL is already fixed.
    function marginRequirement(address account, uint16 bps) public view returns (uint256 total) {
        uint256[] storage ids = _openSeries[account];
        uint256 length = ids.length;
        for (uint256 i = 0; i < length; ++i) {
            uint256 seriesId = ids[i];
            if (_series[seriesId].settled) continue;
            Position storage position = _positions[account][seriesId];
            if (position.size == 0) continue;
            total += (Units.absNotional(position.size, markPrice(seriesId)) * bps) / Units.BPS;
        }
    }

    /// @notice Equity above the initial margin requirement, floored at zero.
    function freeCollateral(address account) external view returns (uint256) {
        int256 equity_ = equity(account);
        int256 required = int256(marginRequirement(account, initialMarginBps));
        // forge-lint: disable-next-line(unsafe-typecast) — guarded strictly greater.
        return equity_ > required ? uint256(equity_ - required) : 0;
    }

    function positionOf(address account, uint256 seriesId) external view returns (Position memory) {
        return _positions[account][seriesId];
    }

    function openSeriesOf(address account) external view returns (uint256[] memory) {
        return _openSeries[account];
    }

    function seriesCount() external view returns (uint256) {
        return _series.length;
    }

    function seriesAt(uint256 seriesId) external view returns (Series memory) {
        return _series[seriesId];
    }

    // ---------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------

    function setVault(address vault_) external onlyOwner {
        vault = vault_;
        emit VaultSet(vault_);
    }

    function setVaultParams(VaultParams calldata params) external onlyOwner {
        if (params.skewScale == 0 || params.maxAdjBps > 5_000) revert InvalidParameter();
        vaultParams = params;
        emit VaultParamsSet(params.spreadBps, params.skewCoefBps, params.maxAdjBps, params.skewScale);
    }

    function setRiskParams(uint16 initial, uint16 maintenance, uint16 takerFee) external onlyOwner {
        if (maintenance == 0 || maintenance >= initial || initial > Units.BPS) revert InvalidParameter();
        if (takerFee > 500) revert InvalidParameter();
        initialMarginBps = initial;
        maintenanceMarginBps = maintenance;
        takerFeeBps = takerFee;
        emit RiskParamsSet(initial, maintenance, takerFee);
    }

    function setShortfallGrace(uint32 grace) external onlyOwner {
        if (grace > 30 days) revert InvalidParameter();
        shortfallGrace = grace;
    }

    function setMarkWindow(uint32 window) external onlyOwner {
        if (window == 0) revert InvalidParameter();
        markWindow = window;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Apply a size delta at `price`, realizing PnL on whatever portion is closed.
    function _applyDelta(address account, uint256 seriesId, int256 delta, uint256 price)
        internal
        returns (int256 realized)
    {
        Position storage position = _positions[account][seriesId];
        int256 held = position.size;

        if (held != 0 && !Units.sameSign(held, delta)) {
            uint256 heldAbs = Units.abs(held);
            uint256 closing = Units.abs(delta);
            if (closing > heldAbs) closing = heldAbs;

            // The slice of the existing position being removed keeps its own sign.
            int256 removed = held > 0 ? closing.toInt256() : -closing.toInt256();
            int256 costRemoved = (position.cost * closing.toInt256()) / heldAbs.toInt256();

            realized = Units.notional(removed, price) - costRemoved;
            balanceOf[account] += realized;

            position.size = held - removed;
            position.cost = position.cost - costRemoved;

            int256 remainder = delta + removed; // whatever is left flips the position
            if (remainder != 0) {
                position.size += remainder;
                position.cost += Units.notional(remainder, price);
            }
        } else {
            position.size = held + delta;
            position.cost = position.cost + Units.notional(delta, price);
        }

        _syncOpenInterest(seriesId, held, position.size);

        if (position.size == 0) {
            position.cost = 0;
            if (position.tracked) _untrack(account, seriesId);
        } else if (!position.tracked) {
            _track(account, seriesId);
        }
    }

    /// @dev Margin checks after a fill.
    ///
    ///      Opening or adding risk needs initial margin. Reducing it only needs the account to stay
    ///      above maintenance, so a trader who has drifted under initial margin can still cut back.
    ///
    ///      The vault's own margin is the market's capacity limit: a trade that adds to vault risk
    ///      cannot be quoted once the vault is under maintenance. A trade that reduces vault risk
    ///      always passes, so traders can always close against a stretched vault.
    function _checkPostTrade(
        address trader,
        address vault_,
        uint256 seriesId,
        int256 traderBefore,
        int256 vaultBefore
    ) internal view {
        bool traderReducing = _reduces(traderBefore, _positions[trader][seriesId].size);
        int256 traderEquity = equity(trader);
        uint256 traderRequired =
            marginRequirement(trader, traderReducing ? maintenanceMarginBps : initialMarginBps);
        if (traderEquity < traderRequired.toInt256()) {
            revert InsufficientMargin(traderEquity, traderRequired);
        }

        if (
            !_reduces(vaultBefore, _positions[vault_][seriesId].size)
                && equity(vault_) < marginRequirement(vault_, maintenanceMarginBps).toInt256()
        ) {
            revert VaultAtCapacity();
        }
    }

    /// @dev Once an account is flat, any negative balance left is real loss: the vault wears it
    ///      and it is recorded as bad debt. The vault itself is excluded — it is the backstop.
    function _absorbShortfall(address account) internal {
        address vault_ = vault;
        if (account == vault_) return;
        if (_openSeries[account].length != 0 || balanceOf[account] >= 0) return;
        // forge-lint: disable-next-line(unsafe-typecast) — guarded negative.
        uint256 shortfall = uint256(-balanceOf[account]);
        balanceOf[account] = 0;
        balanceOf[vault_] -= shortfall.toInt256();
        badDebt += shortfall;
        emit BadDebtAbsorbed(account, shortfall);
    }

    /// @dev True when a position moved strictly toward zero without flipping sides.
    function _reduces(int256 before, int256 current) internal pure returns (bool) {
        if (before == 0) return false;
        if (current == 0) return true;
        return Units.sameSign(before, current) && Units.abs(current) < Units.abs(before);
    }

    function _syncOpenInterest(uint256 seriesId, int256 before, int256 current) internal {
        Series storage series = _series[seriesId];
        // forge-lint: disable-next-line(unsafe-typecast) — guarded positive.
        if (before > 0) series.longOpenInterest -= uint256(before);
        // forge-lint: disable-next-line(unsafe-typecast) — guarded positive.
        if (current > 0) series.longOpenInterest += uint256(current);
    }

    function _track(address account, uint256 seriesId) internal {
        Position storage position = _positions[account][seriesId];
        position.listIndex = uint32(_openSeries[account].length);
        position.tracked = true;
        _openSeries[account].push(seriesId);
    }

    /// @dev Swap-and-pop, keeping the moved entry's cached index in step.
    function _untrack(address account, uint256 seriesId) internal {
        Position storage position = _positions[account][seriesId];
        uint256[] storage ids = _openSeries[account];

        uint256 removedIndex = position.listIndex;
        uint256 lastIndex = ids.length - 1;

        if (removedIndex != lastIndex) {
            uint256 movedSeriesId = ids[lastIndex];
            ids[removedIndex] = movedSeriesId;
            // Bounded by the number of listed series, which cannot approach 2^32.
            // forge-lint: disable-next-line(unsafe-typecast)
            _positions[account][movedSeriesId].listIndex = uint32(removedIndex);
        }

        ids.pop();
        position.tracked = false;
        position.listIndex = 0;
    }

    function _requireSeries(uint256 seriesId) internal view returns (Series storage) {
        if (seriesId >= _series.length) revert UnknownSeries();
        return _series[seriesId];
    }
}
