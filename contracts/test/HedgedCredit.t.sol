// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {console} from "forge-std/console.sol";
import {Vm} from "forge-std/Vm.sol";

import {Fixtures} from "./Fixtures.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {HedgedCredit} from "../src/HedgedCredit.sol";
import {IngotMarket} from "../src/IngotMarket.sol";
import {UnderwriterVault} from "../src/UnderwriterVault.sol";

contract HedgedCreditTest is Fixtures {
    using SafeCast for uint256;

    UnderwriterVault internal underwriter;
    HedgedCredit internal credit;
    uint256 internal seriesId;

    address internal lender = address(0x1E4D);
    address internal neocloud = address(0x60C1);

    /// @dev A tier-2 operator's monthly offtake: 100,000 GPU-hours, roughly 137 H100s for a month.
    uint256 internal constant OFFTAKE = 100_000e18;

    /// @dev This operator sells at the index. Tests that care about basis set their own.
    uint16 internal constant AT_INDEX = 10_000;

    function setUp() public {
        _deploy();
        _seedIndex(2.5 * 1e18);

        underwriter = new UnderwriterVault(market, IERC20(address(usdc)), owner);
        vault = address(underwriter);
        vm.prank(owner);
        market.setVault(address(underwriter));

        credit = new HedgedCredit(market, IERC20(address(usdc)), owner);

        vm.prank(owner);

        credit.setOpenBorrowing(true);

        seriesId = _listSeries(30, 0);

        // Underwriters stand ready to take the other side of the hedge.
        usdc.mint(alice, 2_000_000 * USDC_ONE);
        vm.startPrank(alice);
        usdc.approve(address(underwriter), type(uint256).max);
        underwriter.deposit(2_000_000 * USDC_ONE);
        vm.stopPrank();

        _lend(lender, 1_000_000 * USDC_ONE);
        usdc.mint(neocloud, 500_000 * USDC_ONE);
        vm.prank(neocloud);
        usdc.approve(address(credit), type(uint256).max);
    }

    function _lend(address who, uint256 amount) internal returns (uint256 shares) {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(credit), type(uint256).max);
        shares = credit.depositLender(amount);
        vm.stopPrank();
    }

    function _openLoan() internal returns (uint256 loanId) {
        uint256 margin = 60_000 * USDC_ONE;
        vm.prank(neocloud);
        loanId = credit.open(seriesId, OFFTAKE, AT_INDEX, margin, 0);
    }

    /// @dev Settle the series around `price`.
    ///
    ///      The contract settles to the *average* index over its delivery window, so moving the
    ///      rate on the last day barely moves the settlement price. To model rates falling for the
    ///      month, the rate has to fall early and hold — which is exactly how the real contract
    ///      behaves, and why a spot-settled design would have been the wrong choice here.
    function _settleAt(uint256 price) internal {
        _setSpot(price);

        uint64 expiry = market.seriesAt(seriesId).expiry;
        vm.warp(expiry + 1);
        clock = uint64(block.timestamp);

        // One more print past expiry so the window's right edge is covered.
        vm.prank(publisher);
        index.publish(clock, price, 150, 12);
        clock += uint64(index.finalityDelay()) + 1;
        vm.warp(clock);

        market.settleSeries(seriesId);
    }

    // ------------------------------------------------------------------
    // Origination
    // ------------------------------------------------------------------

    function test_open_lendsAgainstHedgedRevenueAndOpensTheShort() public {
        uint256 loanId = _openLoan();
        HedgedCredit.Loan memory loan = credit.loanAt(loanId);

        // 100,000 hours at ~$2.50 is ~$250,000 of revenue; 70% LTV is ~$175,000.
        assertApproxEqRel(loan.principal, 175_000 * USDC_ONE, 2e16, "principal at LTV");
        assertEq(loan.hedgeSize, OFFTAKE, "hedge matches the offtake exactly");
        assertGt(loan.hedgeEntryPrice, 0, "hedge filled");

        // The pool is short exactly the offtake.
        assertEq(market.positionOf(address(credit), seriesId).size, -int256(OFFTAKE), "short on the books");
        assertEq(usdc.balanceOf(neocloud), 500_000 * USDC_ONE - 60_000 * USDC_ONE + loan.principal, "drawn");
    }

    function test_open_requiresMargin() public {
        vm.prank(neocloud);
        vm.expectRevert();
        credit.open(seriesId, OFFTAKE, AT_INDEX, 1 * USDC_ONE, 0);
    }

    function test_open_boundedByPoolLiquidity() public {
        vm.prank(neocloud);
        vm.expectRevert();
        credit.open(seriesId, OFFTAKE * 20, AT_INDEX, 400_000 * USDC_ONE, 0);
    }

    // ------------------------------------------------------------------
    // The thesis
    // ------------------------------------------------------------------

    /// @dev Sweep the settlement price across a 25x range. Hedged, the borrower's resources and
    ///      the lender's recovery are both flat. Unhedged, recovery collapses as rates fall.
    function test_thesis_hedgedRecoveryIsFlatUnhedgedIsNot() public {
        uint256 loanId = _openLoan();

        uint256[] memory prices = new uint256[](5);
        prices[0] = 0.8 * 1e18;
        prices[1] = 1.75 * 1e18;
        prices[2] = 2.5 * 1e18;
        prices[3] = 3.5 * 1e18;
        prices[4] = 6.0 * 1e18;

        (, uint256 baseResources,, uint256 baseRecovery,) = credit.project(loanId, prices[2]);
        uint256 debt = credit.debtOf(loanId);

        assertEq(baseRecovery, debt, "hedged lender is made whole");

        for (uint256 i = 0; i < prices.length; ++i) {
            (, uint256 resources, uint256 unhedged, uint256 hedgedRecovery, uint256 unhedgedRecovery) =
                credit.project(loanId, prices[i]);

            assertApproxEqAbs(resources, baseResources, 2, "borrower resources fixed at the forward");
            assertEq(hedgedRecovery, debt, "lender whole at every settlement price");
            assertLe(unhedgedRecovery, hedgedRecovery, "unhedged never does better");

            if (unhedged + credit.loanAt(loanId).margin < debt) {
                assertLt(unhedgedRecovery, debt, "unhedged lender takes a loss when rates fall");
            }
        }

        // The concrete headline: at $0.80/hr the unhedged lender is short real money.
        (,,,, uint256 worstUnhedged) = credit.project(loanId, prices[0]);
        assertLt(worstUnhedged, debt, "unhedged shortfall at the low end");
    }

    /// @dev The same property, live: move the real index and watch pool NAV refuse to move.
    /// @dev Moving the index takes time in these tests, and interest accrues with time, so NAV is
    ///      compared net of the interest earned in between: what must not move is everything else.
    function test_thesis_poolNavIsIndexInvariant() public {
        uint256 loanId = _openLoan();
        uint256 navAtEntry = credit.totalAssets() - credit.accruedInterestOf(loanId);

        _setSpot(1.0 * 1e18); // -60%
        assertApproxEqAbs(
            credit.totalAssets() - credit.accruedInterestOf(loanId),
            navAtEntry,
            2,
            "NAV holds when rates collapse"
        );

        _setSpot(1.9 * 1e18);
        assertApproxEqAbs(
            credit.totalAssets() - credit.accruedInterestOf(loanId), navAtEntry, 2, "and on the way back"
        );

        _setSpot(3.6 * 1e18); // well above entry
        assertApproxEqAbs(
            credit.totalAssets() - credit.accruedInterestOf(loanId),
            navAtEntry,
            2,
            "NAV holds when rates spike"
        );
    }

    /// @dev Fuzz the claim rather than trusting five hand-picked prices.
    function testFuzz_hedgedRecoveryIsIndexInvariant(uint256 settlementPrice) public {
        uint256 loanId = _openLoan();
        settlementPrice = bound(settlementPrice, 0.05e18, 50e18);

        (,,, uint256 recoveryHedged,) = credit.project(loanId, settlementPrice);
        assertEq(recoveryHedged, credit.debtOf(loanId), "recovery independent of settlement");
    }

    /// @notice Prints the hedged-vs-unhedged recovery table. Run with -vv; this is the number set
    ///         the demo is built on.
    function test_demo_projectionTable() public {
        uint256 loanId = _openLoan();
        uint256 debt = credit.debtOf(loanId);
        HedgedCredit.Loan memory loan = credit.loanAt(loanId);

        console.log("offtake (GPU-hours)      ", loan.hedgeSize / 1e18);
        console.log("hedge struck at (USD/hr) ", loan.hedgeEntryPrice / 1e15); // milli-dollars
        console.log("principal (USDC)         ", loan.principal / 1e6);
        console.log("margin (USDC)            ", loan.margin / 1e6);
        console.log("debt (USDC)              ", debt / 1e6);
        console.log("---- settle | hedged recovery | unhedged recovery ----");

        uint256[] memory prices = new uint256[](6);
        prices[0] = 0.8e18;
        prices[1] = 1.2e18;
        prices[2] = 1.8e18;
        prices[3] = 2.5e18;
        prices[4] = 3.5e18;
        prices[5] = 6.0e18;

        for (uint256 i = 0; i < prices.length; ++i) {
            (,,, uint256 hedged, uint256 unhedged) = credit.project(loanId, prices[i]);
            console.log(prices[i] / 1e15, hedged / 1e6, unhedged / 1e6);
        }
    }

    // ------------------------------------------------------------------
    // Basis
    // ------------------------------------------------------------------

    /// @dev Measured across 23 providers over 78 days of real posted H100 rates, levels run from
    ///      45% below the index to 237% above it. A discount operator hedged 1:1 on raw hours
    ///      would be over-hedged by nearly 2x, so the hedge is sized by their basis.
    function test_basis_sizesTheHedgeToTheBorrowersExposure() public {
        uint16 discount = 5_500; // sells at 55% of the index, like a Voltage Park or GMI

        vm.prank(neocloud);
        uint256 loanId = credit.open(seriesId, OFFTAKE, discount, 40_000 * USDC_ONE, 0);

        HedgedCredit.Loan memory loan = credit.loanAt(loanId);
        assertEq(loan.offtakeHours, OFFTAKE, "offtake recorded as stated");
        assertEq(loan.basisRatioBps, discount, "basis recorded");
        assertEq(loan.hedgeSize, (OFFTAKE * discount) / 10_000, "hedge scaled to exposure");

        assertEq(
            market.positionOf(address(credit), seriesId).size,
            -int256((OFFTAKE * discount) / 10_000),
            "short is the scaled size, not the raw hour count"
        );
    }

    /// @dev Everything an indexer needs to show the hedge ratio is in the event, so the loan
    ///      book can be rebuilt from logs without a storage read per loan.
    function test_open_eventCarriesTheFullLoan() public {
        vm.recordLogs();
        vm.prank(neocloud);
        uint256 loanId = credit.open(seriesId, OFFTAKE, 5_500, 40_000 * USDC_ONE, 0);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = keccak256(
            "LoanOpened(uint256,address,uint256,uint256,uint16,uint256,uint256,uint256,uint256,uint256,uint64)"
        );
        HedgedCredit.Loan memory loan = credit.loanAt(loanId);

        uint256 found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(credit) || logs[i].topics[0] != topic) continue;
            ++found;
            assertEq(uint256(logs[i].topics[1]), loanId, "loanId");
            assertEq(address(uint160(uint256(logs[i].topics[2]))), neocloud, "borrower");
            assertEq(uint256(logs[i].topics[3]), seriesId, "seriesId");
            (
                uint256 offtake,
                uint16 basis,
                uint256 hedgeSize,
                uint256 entry,
                uint256 principal,
                uint256 interest,
                uint256 margin,
                uint64 maturity
            ) = abi.decode(
                logs[i].data, (uint256, uint16, uint256, uint256, uint256, uint256, uint256, uint64)
            );
            assertEq(offtake, loan.offtakeHours, "offtake");
            assertEq(basis, loan.basisRatioBps, "basis");
            assertEq(hedgeSize, loan.hedgeSize, "hedge size");
            assertEq(entry, loan.hedgeEntryPrice, "entry");
            assertEq(principal, loan.principal, "principal");
            assertEq(interest, loan.interest, "interest");
            assertEq(margin, loan.margin, "margin");
            assertEq(maturity, loan.maturity, "maturity");
        }
        assertEq(found, 1, "exactly one LoanOpened");
    }

    function test_basis_advanceScalesWithIt() public {
        vm.prank(neocloud);
        uint256 atIndex = credit.open(seriesId, OFFTAKE, AT_INDEX, 60_000 * USDC_ONE, 0);
        uint256 fullPrincipal = credit.loanAt(atIndex).principal;

        vm.prank(neocloud);
        uint256 discounted = credit.open(seriesId, OFFTAKE, 5_000, 40_000 * USDC_ONE, 0);
        uint256 halfPrincipal = credit.loanAt(discounted).principal;

        // Same hours, half the realized rate, half the advance.
        assertApproxEqRel(halfPrincipal * 2, fullPrincipal, 2e16, "advance tracks real revenue");
    }

    /// @dev Index invariance must survive the scaling, or the refinement broke the product.
    function test_basis_recoveryStillIndexInvariant() public {
        vm.prank(neocloud);
        uint256 loanId = credit.open(seriesId, OFFTAKE, 5_500, 40_000 * USDC_ONE, 0);

        uint256 debt = credit.debtOf(loanId);
        uint256[3] memory prices = [uint256(1e18), uint256(3.6e18), uint256(9e18)];

        for (uint256 i = 0; i < prices.length; ++i) {
            (,,, uint256 hedged,) = credit.project(loanId, prices[i]);
            assertEq(hedged, debt, "still whole at every settlement price");
        }
    }

    /// @dev The ceiling exists because the ratio is asserted rather than proven, and it scales
    ///      the advance directly. It sits just above the highest real provider level measured.
    function test_basis_ceilingAllowsRealLevelsAndNothingAbsurd() public {
        uint16 ceiling = credit.maxBasisRatioBps();
        assertEq(ceiling, 25_000, "just above the +237% observed at AWS");

        vm.prank(neocloud);
        credit.open(seriesId, 10_000e18, ceiling, 60_000 * USDC_ONE, 0);

        vm.prank(neocloud);
        vm.expectRevert(HedgedCredit.InvalidParameter.selector);
        credit.open(seriesId, 10_000e18, ceiling + 1, 60_000 * USDC_ONE, 0);
    }

    function test_basis_rejectsNonsense() public {
        vm.prank(neocloud);
        vm.expectRevert(HedgedCredit.InvalidParameter.selector);
        credit.open(seriesId, OFFTAKE, 0, 60_000 * USDC_ONE, 0);

        vm.prank(neocloud);
        vm.expectRevert(HedgedCredit.InvalidParameter.selector);
        credit.open(seriesId, OFFTAKE, 50_000, 60_000 * USDC_ONE, 0);
    }

    // ------------------------------------------------------------------
    // Closing
    // ------------------------------------------------------------------

    function test_close_whenRatesFall_hedgeGainOffsetsTheDebt() public {
        uint256 loanId = _openLoan();
        _settleAt(1.5 * 1e18); // rates fall through the window: the short gains

        int256 hedgePnl = credit.hedgePnlOf(loanId);
        assertGt(hedgePnl, 0, "short profits");

        // The borrower still writes a cheque — their offtake revenue fell too — but the hedge
        // gain has taken a large bite out of what they owe.
        uint256 debt = credit.debtOf(loanId);
        int256 netOwed = credit.receivableOf(loanId);
        assertLt(netOwed, debt.toInt256(), "obligation reduced by the hedge");
        assertApproxEqAbs(netOwed, debt.toInt256() - hedgePnl, 2, "reduced by exactly the hedge gain");

        vm.prank(neocloud);
        credit.close(loanId);

        assertTrue(credit.loanAt(loanId).closed, "closed");
        assertEq(credit.totalMarginHeld(), 0, "margin released");
    }

    function test_close_whenRatesRise_borrowerPaysTheDifference() public {
        uint256 loanId = _openLoan();
        _settleAt(3.5 * 1e18); // rates spike: the short loses, offchain revenue rose to match

        assertLt(credit.hedgePnlOf(loanId), 0, "short loses");

        uint256 balanceBefore = usdc.balanceOf(neocloud);
        vm.prank(neocloud);
        credit.close(loanId);

        assertLt(usdc.balanceOf(neocloud), balanceBefore, "borrower settles up");
        assertTrue(credit.loanAt(loanId).closed, "closed");
    }

    /// @dev Whichever way the index went, the pool ends up with the same money.
    function test_close_poolRecoversTheSameEitherWay() public {
        uint256 snapshot = vm.snapshotState();

        uint256 loanId = _openLoan();
        _settleAt(1.5 * 1e18);
        vm.prank(neocloud);
        credit.close(loanId);
        uint256 navAfterCrash = credit.totalAssets();

        vm.revertToState(snapshot);

        loanId = _openLoan();
        _settleAt(3.5 * 1e18);
        vm.prank(neocloud);
        credit.close(loanId);
        uint256 navAfterSpike = credit.totalAssets();

        assertApproxEqRel(navAfterCrash, navAfterSpike, 1e15, "same recovery, opposite scenarios");
    }

    function test_close_onlyBorrower() public {
        uint256 loanId = _openLoan();
        _settleAt(2.5 * 1e18);

        vm.prank(alice);
        vm.expectRevert(HedgedCredit.NotBorrower.selector);
        credit.close(loanId);
    }

    function test_close_requiresSettlement() public {
        uint256 loanId = _openLoan();
        vm.prank(neocloud);
        vm.expectRevert(HedgedCredit.SeriesNotSettled.selector);
        credit.close(loanId);
    }

    // ------------------------------------------------------------------
    // Default
    // ------------------------------------------------------------------

    function test_seize_requiresGracePeriod() public {
        uint256 loanId = _openLoan();
        _settleAt(2.5 * 1e18);

        vm.expectRevert();
        credit.seize(loanId);
    }

    function test_seize_forfeitsMarginToThePool() public {
        uint256 loanId = _openLoan();
        _settleAt(3.5 * 1e18); // hedge lost; borrower owes more and walks away

        vm.warp(credit.loanAt(loanId).maturity + credit.gracePeriod() + 1);

        credit.seize(loanId);

        assertTrue(credit.loanAt(loanId).closed, "resolved");
        assertEq(credit.totalMarginHeld(), 0, "margin forfeited into the pool");
    }

    // ------------------------------------------------------------------
    // Lenders
    // ------------------------------------------------------------------

    function test_lender_redeemBoundedByDeployedCapital() public {
        _openLoan();

        uint256 shares = credit.balanceOf(lender);
        uint256 available = credit.availableLiquidity();
        assertLt(available, credit.totalAssets(), "capital is working");

        vm.prank(lender);
        vm.expectRevert();
        credit.redeemLender(shares);
    }

    function test_lender_earnsInterestOverTheLoan() public {
        uint256 navBefore = credit.totalAssets();
        uint256 loanId = _openLoan();
        uint256 navAtOpen = credit.totalAssets();

        // Interest is recognized as it accrues, not at origination, so opening a loan does not
        // step NAV up: nothing to sandwich.
        assertLe(navAtOpen, navBefore, "no coupon booked at origination");

        // Halfway through the term, half the coupon is in NAV.
        HedgedCredit.Loan memory loan = credit.loanAt(loanId);
        vm.warp(loan.openedAt + (loan.maturity - loan.openedAt) / 2);
        assertApproxEqAbs(
            credit.accruedInterestOf(loanId), loan.interest / 2, 1, "half the coupon at half term"
        );

        _settleAt(2.5 * 1e18);
        vm.prank(neocloud);
        credit.close(loanId);

        assertGt(credit.totalAssets(), navBefore, "the full coupon reaches lenders at close");
    }

    function test_open_requiresApprovalWhenBorrowingIsClosed() public {
        vm.prank(owner);
        credit.setOpenBorrowing(false);

        vm.prank(neocloud);
        vm.expectRevert(HedgedCredit.BorrowerNotApproved.selector);
        credit.open(seriesId, OFFTAKE, AT_INDEX, 60_000 * USDC_ONE, 0);

        vm.prank(owner);
        credit.setBorrower(neocloud, true);
        vm.prank(neocloud);
        credit.open(seriesId, OFFTAKE, AT_INDEX, 60_000 * USDC_ONE, 0);
        assertEq(credit.openLoanCount(), 1);
    }

    function test_open_rejectsDustPrincipal() public {
        vm.prank(neocloud);
        vm.expectRevert();
        credit.open(seriesId, 10e18, AT_INDEX, 1 * USDC_ONE, 0);
    }

    /// @dev Closing one loan must leave every other hedge its full margin buffer. Withdrawing all
    ///      free collateral would cut the pool's market account to the market's 20% initial margin,
    ///      not the 40% the remaining hedges were funded with.
    function test_close_keepsTheBufferOnRemainingHedges() public {
        uint256 longSeries = _listSeries(60, 0);

        uint256 first = _openLoan(); // on the 30-day series
        vm.prank(neocloud);
        credit.open(longSeries, OFFTAKE, AT_INDEX, 60_000 * USDC_ONE, 0); // on the 60-day series

        _settleAt(2.5 * 1e18);
        vm.prank(neocloud);
        credit.close(first);

        uint256 buffer = market.marginRequirement(address(credit), credit.hedgeMarginBps());
        assertGt(buffer, 0, "the 60-day hedge is still live");
        assertGe(market.equity(address(credit)), int256(buffer), "and keeps its full buffer");
    }

    // ------------------------------------------------------------------
    // Hedge deficits
    // ------------------------------------------------------------------

    /// @dev Rates up 50%: the short loses more than the margin behind it, and settlement leaves
    ///      the pool's market account under water.
    function _settleIntoDeficit() internal returns (uint256 loanId) {
        loanId = _openLoan();
        _settleAt(3.75 * 1e18);
        market.settlePosition(address(credit), seriesId); // any keeper
        assertLt(market.balanceOf(address(credit)), 0, "pool account under water");
    }

    /// @dev Writing off the pool's deficit would be a step up in its NAV. A lender deposit that
    ///      sandwiches the write-off must not collect it: new cash settles the deficit first, and
    ///      there is nothing left to write off.
    function test_deficit_lenderDepositCannotSandwichAWriteOff() public {
        _openLoan();
        // Lenders take out every idle dollar, so the pool has nothing left to cover with.
        uint256 idle = credit.availableLiquidity();
        uint256 redeemable = (idle * credit.totalSupply()) / credit.totalAssets();
        vm.prank(lender);
        credit.redeemLender(redeemable);
        _settleAt(3.75 * 1e18);
        market.settlePosition(address(credit), seriesId);
        assertLt(market.balanceOf(address(credit)), 0, "pool account under water");
        assertLt(credit.availableLiquidity(), 1 * USDC_ONE, "and no cash to cover it");
        vm.warp(block.timestamp + market.shortfallGrace());

        address attacker = address(0xBAD);
        uint256 stake = 1_000_000 * USDC_ONE;
        usdc.mint(attacker, stake);
        vm.startPrank(attacker);
        usdc.approve(address(credit), type(uint256).max);
        uint256 shares = credit.depositLender(stake);
        assertGe(market.balanceOf(address(credit)), 0, "the deposit paid the market first");
        vm.expectRevert(IngotMarket.NoShortfall.selector);
        market.absorbShortfall(address(credit));
        vm.stopPrank();

        // Part of the stake is now in the market paying the hedge, owed back by the borrower, so
        // it cannot all leave at once — but none of it is a gain.
        uint256 worth = (shares * credit.totalAssets()) / credit.totalSupply();
        assertLe(worth, stake, "no profit from the round trip");
        assertEq(market.badDebt(), 0, "and underwriters wore nothing");
    }

    /// @dev Anyone may settle the pool's deficit from idle lender cash, NAV-neutrally, before the
    ///      grace period runs out.
    function test_deficit_anyoneCanCoverItFromIdleCash() public {
        _settleIntoDeficit();
        uint256 navBefore = credit.totalAssets();

        vm.prank(keeper);
        credit.coverMarketDeficit();

        assertGe(market.balanceOf(address(credit)), 0, "covered");
        assertEq(market.shortfallSince(address(credit)), 0, "and the shortfall is over");
        assertEq(credit.totalAssets(), navBefore, "NAV-neutral");
    }

    /// @dev A deficit covered on one loan must not leave its grace clock running, or the next
    ///      loan's deficit could be written off the moment it is recorded.
    function test_deficit_coveredShortfallDoesNotCarryOver() public {
        uint256 loanId = _settleIntoDeficit();
        vm.prank(neocloud);
        credit.close(loanId);
        assertEq(market.shortfallSince(address(credit)), 0, "cleared when the borrower paid");
    }

    /// @dev Recovering margin asks the market only for what it will release. With the market's
    ///      initial margin retuned above the pool's hedge buffer, close and seize still work.
    function test_close_survivesAMarketMarginAboveTheHedgeBuffer() public {
        uint256 longSeries = _listSeries(60, 0);
        uint256 loanId = _openLoan();
        vm.prank(neocloud);
        credit.open(longSeries, OFFTAKE, AT_INDEX, 60_000 * USDC_ONE, 0);

        vm.prank(owner);
        market.setRiskParams(5_000, 1_000, 10); // 50% initial margin, above the 40% buffer

        _settleAt(2.5 * 1e18);
        vm.prank(neocloud);
        credit.close(loanId);
        assertTrue(credit.loanAt(loanId).closed, "closed");
    }
}
