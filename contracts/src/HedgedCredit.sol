// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IngotMarket} from "./IngotMarket.sol";
import {Units} from "./libraries/Units.sol";

/// @title HedgedCredit
/// @notice Lending against compute revenue, where the hedge is part of the loan.
///
/// @dev The idea in one line. A borrower who will sell `H` GPU-hours at the realized rate `S`,
///      while short `H` GPU-hours struck at the forward `F`, receives:
///
///          H * S  +  H * (F - S)  =  H * F
///
///      Fixed, whatever the index does. The borrower stops carrying rental-rate risk, and — the
///      part that matters commercially — the lender stops underwriting a GPU price forecast and
///      starts underwriting a known number.
///
///      Today a lender cannot do this. They can ask the borrower to go hedge somewhere else and
///      hope they did, or they can price the uncertainty into the coupon, which is why identical
///      hardware funds at +225bps against a strong counterparty and +450-550bps against a weak
///      one. Here the hedge opens in the same transaction as the drawdown. It is not a product the
///      borrower has to remember to buy; there is no unhedged moment.
///
///      How that shows up in the accounting: the pool holds the short, so its margin equity moves
///      with the index. The borrower's obligation is `debt - hedgePnl`, which moves by exactly the
///      same amount in the opposite direction. `totalAssets()` computes both explicitly so the
///      cancellation is visible in the code rather than asserted in a pitch — and the test suite
///      pins it across a +/-60% index range.
///
///      One refinement the data forced. An operator's rate is not the index: measured across
///      23 providers over 78 days of posted H100 rates, provider levels sit anywhere from 45%
///      below the index to 237% above it. What they do share is movement — median tracking
///      error of 3.1%. So a hedge sized 1:1 on raw GPU-hours over-hedges a discount operator by
///      nearly a factor of two, and the residual is not small. Each loan therefore carries a
///      basis ratio, and the hedge is sized `offtake x basis`, which is also the quantity the
///      advance is measured against. A borrower at 55% of the index shorts 55% as many index
///      hours, and the cancellation in `totalAssets()` holds exactly as before.
///
///      What this does *not* remove is counterparty risk. If rates rise, the hedge loses, the
///      borrower's offchain revenue rises to match, and the protocol needs them to actually hand
///      that revenue over. That is why borrowers post margin, and why the production design routes
///      revenue through an address the contract controls. Rate risk is hedged here; the promise to
///      pay is still a promise.
contract HedgedCredit is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    struct Loan {
        address borrower;
        uint256 seriesId;
        /// @dev The borrower's own offtake, in GPU-hours. Informational: the hedge is sized
        ///      from it and the basis ratio, not from it alone.
        uint256 offtakeHours;
        /// @dev The borrower's realized rate as a share of the index, in bps. 5,500 means this
        ///      operator sells at 55% of the index level.
        uint16 basisRatioBps;
        /// @dev Index GPU-hours actually shorted: offtake x basis ratio.
        uint256 hedgeSize;
        /// @dev Fill price of the hedge. This is the rate the borrower's revenue is locked at.
        uint256 hedgeEntryPrice;
        uint256 principal;
        uint256 interest;
        uint256 margin;
        uint64 openedAt;
        uint64 maturity;
        bool closed;
    }

    uint256 public constant MINIMUM_LIQUIDITY = 1e6;

    IngotMarket public immutable market;
    IERC20 public immutable usdc;

    /// @notice Share of hedged revenue advanced as principal.
    uint16 public ltvBps = 7_000;
    /// @notice Borrower margin required, as a share of principal.
    uint16 public minMarginBps = 2_000;
    /// @notice Flat term interest on principal.
    uint16 public rateBps = 500;
    /// @notice Margin posted to the market per unit of hedge notional. Twice the market's initial
    ///         requirement by default, so an adverse move does not liquidate the hedge itself.
    uint16 public hedgeMarginBps = 4_000;
    /// @notice Grace period after maturity before a delinquent loan can be seized.
    uint32 public gracePeriod = 3 days;
    /// @notice Ceiling on a loan's basis ratio. Hyperscalers post rates well above the index, so
    ///         this allows for it, while still rejecting a typo that would short the market.
    uint16 public maxBasisRatioBps = 40_000;

    Loan[] internal _loans;

    /// @notice Borrower margin held by this contract. Collateral, not lender assets.
    uint256 public totalMarginHeld;

    mapping(address borrower => uint256[] loanIds) internal _loansOf;

    event LenderDeposited(address indexed lender, uint256 assets, uint256 shares);
    event LenderRedeemed(address indexed lender, uint256 shares, uint256 assets);
    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 indexed seriesId,
        uint256 hedgeSize,
        uint256 hedgeEntryPrice,
        uint256 principal,
        uint256 margin
    );
    event LoanClosed(uint256 indexed loanId, int256 hedgePnl, int256 netOwed, uint256 marginReturned);
    event LoanSeized(uint256 indexed loanId, address indexed keeper, int256 shortfall);
    event TermsSet(uint16 ltvBps, uint16 minMarginBps, uint16 rateBps, uint16 hedgeMarginBps);

    error ZeroAmount();
    error VaultInsolvent();
    error FirstDepositTooSmall(uint256 minimum);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error MarginTooSmall(uint256 posted, uint256 required);
    error NotBorrower();
    error LoanAlreadyClosed();
    error SeriesNotSettled();
    error NotYetDelinquent(uint64 seizableAt);
    error InvalidParameter();

    constructor(IngotMarket market_, IERC20 usdc_, address owner_)
        ERC20("Ingot Hedged Credit", "ingotCREDIT")
        Ownable(owner_)
    {
        market = market_;
        usdc = usdc_;
        usdc_.forceApprove(address(market_), type(uint256).max);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ---------------------------------------------------------------------
    // Valuation
    // ---------------------------------------------------------------------

    /// @notice Lender-owned assets, in USDC.
    ///
    /// @dev Written the long way on purpose. `market.equity` carries the hedge's mark-to-market,
    ///      and the receivables carry its mirror image, so the two index-sensitive terms cancel
    ///      and the total is invariant to the rental rate. That cancellation is the product.
    function totalAssets() public view returns (uint256) {
        int256 idle = usdc.balanceOf(address(this)).toInt256() - totalMarginHeld.toInt256();
        int256 hedgeEquity = market.equity(address(this));
        int256 receivables = totalReceivable();

        int256 total = idle + hedgeEquity + receivables;
        // forge-lint: disable-next-line(unsafe-typecast) — guarded positive.
        return total > 0 ? uint256(total) : 0;
    }

    /// @notice Sum of what borrowers owe once their hedge PnL is applied.
    function totalReceivable() public view returns (int256 total) {
        uint256 length = _loans.length;
        for (uint256 i = 0; i < length; ++i) {
            if (_loans[i].closed) continue;
            total += receivableOf(i);
        }
    }

    /// @notice What a borrower owes right now, net of the hedge held against their loan.
    function receivableOf(uint256 loanId) public view returns (int256) {
        Loan storage loan = _loans[loanId];
        if (loan.closed) return 0;
        return debtOf(loanId).toInt256() - hedgePnlOf(loanId);
    }

    function debtOf(uint256 loanId) public view returns (uint256) {
        Loan storage loan = _loans[loanId];
        return loan.closed ? 0 : loan.principal + loan.interest;
    }

    /// @notice Mark-to-market PnL of the short held against this loan.
    function hedgePnlOf(uint256 loanId) public view returns (int256) {
        Loan storage loan = _loans[loanId];
        if (loan.closed || loan.hedgeSize == 0) return 0;

        uint256 price = market.markPrice(loan.seriesId);
        int256 size = -loan.hedgeSize.toInt256();
        return Units.notional(size, price) - Units.notional(size, loan.hedgeEntryPrice);
    }

    /// @notice What this loan looks like if the index settles at `settlementPrice`, hedged against
    ///         the counterfactual where the borrower took the same loan unhedged.
    ///
    /// @dev This is the comparison the product exists to make, so it is a contract view rather than
    ///      a slide. Hedged, the borrower's resources are `hours * forward` no matter where the
    ///      index lands, and since LTV is below 100% those resources always cover the debt — the
    ///      lender is made whole at every settlement price. Unhedged, the borrower's resources are
    ///      `hours * settlement`; when rates fall far enough that figure drops through the debt and
    ///      the lender eats the difference.
    ///
    ///      Note what is *not* claimed: the borrower's cash payment still varies, because their
    ///      offchain revenue varies in the opposite direction by the same amount. What is fixed is
    ///      the total, and therefore the recovery.
    ///
    /// @return hedgePnl PnL of the short at that settlement price.
    /// @return hedgedResources Offtake revenue plus hedge PnL: flat at hours * forward.
    /// @return unhedgedResources Offtake revenue alone: moves one-for-one with the index.
    /// @return recoveryHedged What the lender gets back, hedged. Flat.
    /// @return recoveryUnhedged What the lender would get back unhedged. Craters as rates fall.
    function project(uint256 loanId, uint256 settlementPrice)
        external
        view
        returns (
            int256 hedgePnl,
            uint256 hedgedResources,
            uint256 unhedgedResources,
            uint256 recoveryHedged,
            uint256 recoveryUnhedged
        )
    {
        Loan storage loan = _loans[loanId];

        int256 size = -loan.hedgeSize.toInt256();
        hedgePnl = Units.notional(size, settlementPrice) - Units.notional(size, loan.hedgeEntryPrice);

        unhedgedResources = Units.absNotional(loan.hedgeSize.toInt256(), settlementPrice);

        int256 hedged = unhedgedResources.toInt256() + hedgePnl;
        // forge-lint: disable-next-line(unsafe-typecast) — guarded positive.
        hedgedResources = hedged > 0 ? uint256(hedged) : 0;

        uint256 debt = loan.principal + loan.interest;
        recoveryHedged = _recovery(debt, hedgedResources + loan.margin);
        recoveryUnhedged = _recovery(debt, unhedgedResources + loan.margin);
    }

    function _recovery(uint256 debt, uint256 resources) internal pure returns (uint256) {
        return resources < debt ? resources : debt;
    }

    function sharePrice() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e6;
        return (totalAssets() * 1e6) / supply;
    }

    function availableLiquidity() public view returns (uint256) {
        uint256 held = usdc.balanceOf(address(this));
        return held > totalMarginHeld ? held - totalMarginHeld : 0;
    }

    // ---------------------------------------------------------------------
    // Lenders
    // ---------------------------------------------------------------------

    function depositLender(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();

        uint256 supply = totalSupply();
        if (supply == 0) {
            if (assets <= MINIMUM_LIQUIDITY) revert FirstDepositTooSmall(MINIMUM_LIQUIDITY + 1);
            shares = assets - MINIMUM_LIQUIDITY;
            _mint(address(this), MINIMUM_LIQUIDITY);
        } else {
            uint256 assetsBefore = totalAssets();
            if (assetsBefore == 0) revert VaultInsolvent();
            shares = (assets * supply) / assetsBefore;
            if (shares == 0) revert ZeroAmount();
        }

        usdc.safeTransferFrom(msg.sender, address(this), assets);
        _mint(msg.sender, shares);

        emit LenderDeposited(msg.sender, assets, shares);
    }

    /// @notice Redeem shares for USDC, bounded by cash not already lent out or posted as margin.
    function redeemLender(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();

        uint256 supply = totalSupply();
        assets = (shares * totalAssets()) / supply;
        if (assets == 0) revert ZeroAmount();

        uint256 available = availableLiquidity();
        if (assets > available) revert InsufficientLiquidity(assets, available);

        _burn(msg.sender, shares);
        usdc.safeTransfer(msg.sender, assets);

        emit LenderRedeemed(msg.sender, shares, assets);
    }

    // ---------------------------------------------------------------------
    // Borrowing
    // ---------------------------------------------------------------------

    /// @notice Draw against an offtake, hedged in the same transaction.
    /// @param seriesId Series whose delivery window the offtake falls in.
    /// @param gpuHours Offtake size, 18 decimals.
    /// @param basisRatioBps The borrower's realized rate as a share of the index, in bps.
    ///        10,000 means they sell at the index; 5,500 means 45% below it.
    /// @param margin USDC posted by the borrower.
    /// @param minHedgePrice Worst acceptable fill on the hedge.
    function open(
        uint256 seriesId,
        uint256 gpuHours,
        uint16 basisRatioBps,
        uint256 margin,
        uint256 minHedgePrice
    ) external nonReentrant returns (uint256 loanId) {
        if (gpuHours == 0 || margin == 0) revert ZeroAmount();
        if (basisRatioBps == 0 || basisRatioBps > maxBasisRatioBps) revert InvalidParameter();

        // The hedge tracks the borrower's exposure, not their headline hour count.
        uint256 hedgeSize = (gpuHours * basisRatioBps) / Units.BPS;
        if (hedgeSize == 0) revert ZeroAmount();

        uint256 hedgedRevenue = Units.absNotional(hedgeSize.toInt256(), market.markPrice(seriesId));
        uint256 principal = (hedgedRevenue * ltvBps) / Units.BPS;

        _collectMargin(margin, principal);
        _fundHedge(hedgedRevenue, principal);

        // The hedge opens here, in the same call as the drawdown. There is no unhedged moment.
        uint256 entryPrice = market.trade(seriesId, -hedgeSize.toInt256(), minHedgePrice);

        loanId = _record(
            LoanTerms({
                seriesId: seriesId,
                offtakeHours: gpuHours,
                basisRatioBps: basisRatioBps,
                hedgeSize: hedgeSize,
                entryPrice: entryPrice,
                principal: principal,
                margin: margin
            })
        );
        usdc.safeTransfer(msg.sender, principal);
    }

    /// @dev Grouped to keep `open` inside the stack limit.
    struct LoanTerms {
        uint256 seriesId;
        uint256 offtakeHours;
        uint16 basisRatioBps;
        uint256 hedgeSize;
        uint256 entryPrice;
        uint256 principal;
        uint256 margin;
    }

    /// @dev Take the borrower's margin and check it covers the required share of principal.
    function _collectMargin(uint256 margin, uint256 principal) internal {
        uint256 required = (principal * minMarginBps) / Units.BPS;
        if (margin < required) revert MarginTooSmall(margin, required);

        usdc.safeTransferFrom(msg.sender, address(this), margin);
        totalMarginHeld += margin;
    }

    /// @dev Post margin for the short out of pool cash, once there is room for it and the draw.
    function _fundHedge(uint256 hedgedRevenue, uint256 principal) internal {
        uint256 hedgeMargin = (hedgedRevenue * hedgeMarginBps) / Units.BPS;
        uint256 available = availableLiquidity();
        if (principal + hedgeMargin > available) {
            revert InsufficientLiquidity(principal + hedgeMargin, available);
        }
        market.deposit(hedgeMargin);
    }

    function _record(LoanTerms memory terms) internal returns (uint256 loanId) {
        loanId = _loans.length;
        _loans.push(
            Loan({
                borrower: msg.sender,
                seriesId: terms.seriesId,
                offtakeHours: terms.offtakeHours,
                basisRatioBps: terms.basisRatioBps,
                hedgeSize: terms.hedgeSize,
                hedgeEntryPrice: terms.entryPrice,
                principal: terms.principal,
                interest: (terms.principal * rateBps) / Units.BPS,
                margin: terms.margin,
                openedAt: uint64(block.timestamp),
                maturity: market.seriesAt(terms.seriesId).expiry,
                closed: false
            })
        );
        _loansOf[msg.sender].push(loanId);

        emit LoanOpened(
            loanId,
            msg.sender,
            terms.seriesId,
            terms.hedgeSize,
            terms.entryPrice,
            terms.principal,
            terms.margin
        );
    }

    /// @notice Settle a matured loan: realize the hedge, net it against the debt, square up.
    /// @dev If the hedge gained, the borrower owes less by exactly that much. If it lost, they owe
    ///      more — and their offtake revenue rose by the same amount to pay for it.
    function close(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.borrower != msg.sender) revert NotBorrower();
        if (loan.closed) revert LoanAlreadyClosed();

        IngotMarket.Series memory series = market.seriesAt(loan.seriesId);
        if (!series.settled) revert SeriesNotSettled();

        int256 hedgePnl = hedgePnlOf(loanId);
        int256 netOwed = debtOf(loanId).toInt256() - hedgePnl;

        market.settlePosition(address(this), loan.seriesId);
        loan.closed = true;

        uint256 margin = loan.margin;
        totalMarginHeld -= margin;

        // The borrower's margin is applied first; anything left over goes back to them.
        uint256 marginReturned;
        if (netOwed > 0) {
            // forge-lint: disable-next-line(unsafe-typecast) — guarded positive.
            uint256 owed = uint256(netOwed);
            if (owed > margin) {
                usdc.safeTransferFrom(msg.sender, address(this), owed - margin);
            } else {
                marginReturned = margin - owed;
            }
        } else {
            // forge-lint: disable-next-line(unsafe-typecast) — netOwed is non-positive here.
            marginReturned = margin + uint256(-netOwed);
        }

        _recoverHedgeMargin();
        if (marginReturned > 0) usdc.safeTransfer(msg.sender, marginReturned);

        emit LoanClosed(loanId, hedgePnl, netOwed, marginReturned);
    }

    /// @notice Seize a loan the borrower has abandoned past the grace period.
    /// @dev The pool keeps the margin and whatever the hedge earned. Any remainder is a real loss
    ///      and shows up in share price, which is the honest place for it.
    function seize(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.closed) revert LoanAlreadyClosed();

        uint64 seizableAt = loan.maturity + gracePeriod;
        if (block.timestamp < seizableAt) revert NotYetDelinquent(seizableAt);

        IngotMarket.Series memory series = market.seriesAt(loan.seriesId);
        if (!series.settled) revert SeriesNotSettled();

        int256 netOwed = debtOf(loanId).toInt256() - hedgePnlOf(loanId);

        market.settlePosition(address(this), loan.seriesId);
        loan.closed = true;

        uint256 margin = loan.margin;
        totalMarginHeld -= margin; // forfeited into pool assets

        _recoverHedgeMargin();

        emit LoanSeized(loanId, msg.sender, netOwed - margin.toInt256());
    }

    /// @dev Pull free margin back out of the market once a hedge is closed.
    function _recoverHedgeMargin() internal {
        uint256 free = market.freeCollateral(address(this));
        if (free > 0) market.withdraw(free);
    }

    // ---------------------------------------------------------------------
    // Views and administration
    // ---------------------------------------------------------------------

    function loanCount() external view returns (uint256) {
        return _loans.length;
    }

    function loanAt(uint256 loanId) external view returns (Loan memory) {
        return _loans[loanId];
    }

    function loansOf(address borrower) external view returns (uint256[] memory) {
        return _loansOf[borrower];
    }

    function setTerms(uint16 ltv, uint16 minMargin, uint16 rate, uint16 hedgeMargin)
        external
        onlyOwner
    {
        if (ltv == 0 || ltv > 9_000) revert InvalidParameter();
        if (minMargin > Units.BPS || rate > 5_000) revert InvalidParameter();
        if (hedgeMargin == 0 || hedgeMargin > Units.BPS) revert InvalidParameter();
        ltvBps = ltv;
        minMarginBps = minMargin;
        rateBps = rate;
        hedgeMarginBps = hedgeMargin;
        emit TermsSet(ltv, minMargin, rate, hedgeMargin);
    }

    function setGracePeriod(uint32 period) external onlyOwner {
        gracePeriod = period;
    }

    function setMaxBasisRatio(uint16 bps) external onlyOwner {
        if (bps == 0) revert InvalidParameter();
        maxBasisRatioBps = bps;
    }

    /// @notice Add margin to the pool's market account if a hedge drifts close to its limit.
    function topUpHedgeMargin(uint256 amount) external onlyOwner {
        if (amount > availableLiquidity()) revert InsufficientLiquidity(amount, availableLiquidity());
        market.deposit(amount);
    }
}
