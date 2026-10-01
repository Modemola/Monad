# Security model

What Ingot trusts, what it does not, and what a reviewer should push on. Written after a
security review of the protocol; findings are listed whether or not they were fixed.

## Fixed — second review

A second, adversarial review went through every contract and the off-chain publisher looking for
ways to take money. Each finding below was reproduced with a Foundry test first, then fixed, and
the test that reproduced it is now a regression test in the suite.

**The vault could be liquidated against itself, repeatedly.** `IngotMarket.liquidate(vault, …)`
closed the vault's slice against the vault: the position did not change, but the penalty still
moved from the vault to the caller, and the vault stayed liquidatable. Called in a loop while the
vault was under maintenance, it drained underwriter capital. The vault is now refused outright;
its limit is enforced by refusing to quote risk-adding trades.
`test_liquidate_refusesTheVault`.

**Settlement losses were never written off.** A loss realized at settlement could leave an account
flat with a negative balance forever, sitting in the vault's balance as a receivable nobody would
pay — overstating NAV to underwriters. Settlement now records the shortfall; after a three-day
grace (so a solvent integrator such as the credit pool can cover it) anyone can write it off
against the vault as bad debt. `test_settlement_shortfallIsWrittenOffAfterTheGracePeriod`.

**Traders were trapped when the vault was stretched.** The capacity check refused *every* trade
while the vault was under maintenance, including ones that reduced its risk, so a winning position
could not be closed. Only trades that grow vault inventory are refused now. Likewise a trader under
initial margin can always cut risk as long as they stay above maintenance.
`test_trade_stretchedVaultRefusesRiskButLetsTradersClose`, `test_trade_reducingNeedsOnlyMaintenance`.

**The mark ignored the part of the settlement already fixed.** A series settles to the average
over its delivery window, but the mark was spot carried by a basis for the whole window. Late in
the window that let anyone trade a nearly-known settlement against the vault at the wrong price.
Inside the window the mark is now the time-weighted blend of the realized average (finalized prints
only) and the forward for the remainder. `test_markPrice_blendsTheRealizedPartOfTheWindow`.

**The mark lagged a public price by hours.** The trailing TWAP ended at the newest finalized print,
so that print's price only entered the average when the *next* one arrived — up to six hours on the
keeper's schedule. The window now ends at the present with the newest finalized price held forward;
provisional prints still never count. `test_twap_endsNowWithTheNewestFinalizedPriceHeldForward`,
`test_twap_ignoresProvisionalPrints`.

**The deviation band could be walked in one transaction.** Prints may be backdated, so twelve of
them five minutes apart could move $2 to $29 inside one block, each within 25% of the last. Every
print must now also sit within the band of the newest *finalized* print, so a whole provisional run
stays within one band of what anything was marked against.
`test_publish_provisionalRunCannotWalkPastTheFinalizedBand`.

**The oracle receiver trusted a tag any workflow could write.** The CRE forwarder is shared by
every workflow on a chain, and the report body is written by the sender. The receiver now checks
the workflow owner (and optionally the workflow ID) from the metadata the forwarder vouches for.
`test_onReport_rejectsAnotherOwnersWorkflowEvenWithTheRightTag`.

**Closing one loan stripped the hedge buffer from every other.** The pool withdrew all collateral
above the market's 20% initial margin, undoing the 40% buffer the remaining hedges were funded with.
It now keeps `hedgeMarginBps` on every live hedge. `test_close_keepsTheBufferOnRemainingHedges`.

**Lender interest could be sandwiched.** The whole term's interest entered NAV the moment a loan
opened, so a lender could deposit just before a large draw and redeem just after. Interest now
accrues linearly to maturity. `test_lender_earnsInterestOverTheLoan`.

**Dust loans could freeze lending.** Valuation walked every loan ever opened. It now walks open
loans only, and a loan must draw at least 1,000 USDC. `test_open_rejectsDustPrincipal`.

**Anyone could borrow against a made-up offtake.** See *Accepted* below: borrowing is now gated by
an approved-borrower list, and the public testnet deployment opens it deliberately.
`test_open_requiresApprovalWhenBorrowingIsClosed`.

**Withdrawals paid out unrealized PnL.** A briefly wrong mark could be turned into USDC. Only
realized cash can be withdrawn now; unrealized PnL still backs margin.
`test_withdraw_paysOutCashNotUnrealizedPnl`.

**The keeper could publish stale data, or too soon.** It now refuses a source snapshot older than
36 hours, stamps prints with the chain's clock rather than the runner's, and waits out the index's
minimum interval measured from the newest print, provisional ones included.

## Fixed — first review

**Orders could be sandwiched for the full quote adjustment.** `IngotMarket.trade` and
`HedgedCredit.open` both take the worst acceptable fill and enforce it on chain, but the front end
originally submitted the extremes — max uint when buying, zero when selling — which disabled that
protection entirely. On a public mempool an attacker could push the vault's inventory-skewed quote,
let the victim fill against it, and unwind. Both surfaces now derive the bound from the quote the
trader was actually shown, with a visible tolerance control defaulting to 0.5%, and the bound is
displayed before the button.

**A freely mintable collateral token could reach mainnet.** `Deploy.s.sol` deploys `MockUSDC` when
`USDC_ADDRESS` is unset, and `MockUSDC.mint` is unrestricted — correct for a testnet a judge needs
funds on, catastrophic anywhere else. The script now reverts if that path is taken on a chain that
is not Monad testnet or a local node.

**The basis ceiling was far above any real operator.** `basisRatioBps` is asserted by the borrower
and scales the advance directly, so it is the one self-reported input that can be used to borrow
against revenue that does not exist. The ceiling was 400% of the index; the highest level measured
across 23 providers over 78 days was +237% (AWS). It is now 250%.

## Accepted, and why

**The basis ratio is asserted, not proven.** Lowering the ceiling bounds the damage; it does not
verify the claim. A borrower who overstates their realized rate borrows against revenue they do not
have. The honest fix is attestation — a zkTLS proof over provider invoices, or an oracle of the
borrower's realized rate — which is the same mechanism the production design needs in order to
route revenue at source. Until then this is underwriting, not code.

**Publishers are trusted within a band.** Any allowlisted publisher can print up to 25% from the
previous print every 5 minutes. There is no quorum and no median across publishers, so a single
compromised key can walk the index over a few hours, and settlement follows it. The finality delay
and tip revocation give a guardian a window to intervene, and every print carries its methodology
hash, sample count and venue count — but the mitigation today is operational, not cryptographic.
The fix is a quorum with a per-period median plus a cumulative drift cap on top of the per-print
band, and it does not change the read interface.

**Borrowing is open on the public testnet.** `HedgedCredit` gates `open` behind an approved-borrower
list, because the offtake and basis ratio are asserted by the borrower and the advance scales with
them. The testnet deployment calls `setOpenBorrowing(true)` so anyone can try the product with mock
USDC. A production deployment leaves it closed and approves borrowers after underwriting them.

**The credit product is undercollateralised on purpose.** A 70% advance against 20% borrower
margin means a borrower who draws and walks retains roughly 80% of the advance. The hedge removes
rate risk; it does not create an enforcement mechanism. This is stated in the product surface
rather than buried: *rate risk is hedged here — delivery risk and the promise to repay are not.*

**Owner powers are real.** The owner can list series, retune risk and credit terms, set the vault
address and move the index guardian. There is no timelock. For a hackathon deployment this is
deliberate; any real deployment needs the standard treatment.

## Invariants the tests hold

- The market is zero-sum: total equity equals total deposits through opening, index moves, partial
  closes, flips, liquidation and settlement.
- Positions always net to zero across traders and the vault, and open interest tracks them.
- Credit pool NAV is invariant to the index across a −60%/+44% range: the hedge's mark-to-market
  and the borrower's obligation cancel exactly.
- Hedged lender recovery equals the debt at every settlement price tested, including under a
  scaled basis ratio.
- An average over any index window is bounded by the minimum and maximum price in that window.

## Not yet addressed

- One key holds owner, guardian and publisher on the testnet deployment, and the scheduled keeper
  uses it. Production splits these: a multisig owner behind a timelock, a separate guardian, and the
  CRE receiver as the only publisher.
- If the pool's hedge itself were liquidated, a loan's hedge PnL would keep marking a position that
  no longer exists. The 40% hedge buffer (now preserved across closes) makes this remote, but the
  loan should record the liquidation and freeze its hedge PnL.
- A series whose window opens before the index's first print, or whose expiry is never covered by
  a print, cannot settle. Series are listed by the owner, and the keeper prints every six hours.

- Liquidation closes any amount up to the full position while an account is below maintenance,
  rather than stopping at the point health is restored.
- `markPrice` falls back from a trailing TWAP to a single print if the TWAP reverts, which is more
  manipulable than the primary path.
- Settling one loan calls `settlePosition` for the pool's whole position in that series. The
  accounting holds — realized PnL lands in the pool's balance and is subtracted from the remaining
  receivables — but it is a coupling worth removing.
