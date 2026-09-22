# Security model

What Ingot trusts, what it does not, and what a reviewer should push on. Written after a
security review of the protocol; findings are listed whether or not they were fixed.

## Fixed

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

- Liquidation closes any amount up to the full position while an account is below maintenance,
  rather than stopping at the point health is restored.
- `markPrice` falls back from a trailing TWAP to a single print if the TWAP reverts, which is more
  manipulable than the primary path.
- Settling one loan calls `settlePosition` for the pool's whole position in that series. The
  accounting holds — realized PnL lands in the pool's balance and is subtracted from the remaining
  receivables — but it is a coupling worth removing.
