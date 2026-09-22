# Video scripts

Two required videos. Both are judged; the technical demo must show the live product, not slides
and not a code walkthrough.

Record the demo against the deployed testnet app with a wallet already connected and funded, in a
clean browser window at 1280×800 or larger. Do a silent dry run first — the timings below assume
you are not hunting for a button.

---

## 1. Technical demo — max 3:00

**What judges are checking:** does the trading/market mechanism work end to end onchain, with real
settlement and real pricing logic, not a UI over static data.

### 0:00 – 0:25 — The index

*Screen: Terminal page, index chart filled.*

> This is Ingot, live on Monad. What you're looking at is a rental-rate index for one NVIDIA H100,
> in dollars per GPU-hour, published onchain. Every print carries the hash of the methodology that
> produced it, how many quotes it was built from, and how many venues those came from. A print is
> provisional before it's settleable, so a broken scrape can be revoked before money moves against
> it.

*Action: hover the chart so the crosshair and tooltip follow.*

### 0:25 – 1:00 — Trading it

*Screen: order ticket.*

> Contracts are cash-settled swaps on that index, in 730 GPU-hour lots — the same unit CME uses for
> the compute futures they listed on October 5th.

*Action: type 10 lots. Let the quote populate.*

> Before I sign anything the ticket shows the mark, my actual fill including the spread, the
> notional, the margin it locks, the fee, and the worst price this order can fill at — which is
> enforced onchain, not just displayed.

*Action: submit. Wait for the fill.*

> That's filled. Monad settles it in under a second, which is what lets positions mark
> continuously against the index instead of once a day.

*Action: point at the position card — size, unrealized, health.*

### 1:00 – 2:15 — The part that doesn't exist anywhere else

*Screen: Credit page.*

> Here's what the market is actually for. This is a GPU operator borrowing against next month's
> compute revenue.

*Action: enter 100,000 hours. Set realized rate to 55%.*

> They sell 100,000 GPU-hours. They don't sell at the index — this operator sells at 55% of it,
> and that's typical: we measured 23 providers over 78 days and levels ran from 45% below the index
> to 237% above. So the hedge is sized to their actual exposure, 55,000 index hours, not their
> headline hour count.

*Action: enter margin, submit. Wait.*

> One transaction. The loan drew down and the hedge opened in the same call — there's no window
> where they're exposed, and no hoping they went and hedged somewhere else.

*Action: move to the recovery chart. Drag the slider slowly from right to left.*

> Now the important bit. I'm sweeping the rate this contract could settle at. The blue line is
> what the lender gets back hedged. It doesn't move. The orange line is the same loan unhedged —
> and as the rate falls, it falls through the debt.
>
> Every point on that chart is a number this contract returned. The browser can't draw it without
> asking the chain.

### 2:15 – 2:45 — Who takes the other side

*Screen: Underwrite page.*

> Every trade fills against this vault. It quotes both ways off the mark and earns the spread, and
> it's an ordinary margin account in the same engine as every trader — so when it can't meet
> maintenance, quotes stop. Capacity isn't a setting anybody has to remember to tune.

*Action: point at NAV and the live inventory figure.*

> And NAV is marked to market, so LPs see what the vault is worth right now, not at book.

### 2:45 – 3:00 — Close

*Screen: back to the recovery chart.*

> Index, market, margin engine, and a credit product where the hedge is part of the loan. Seventy-
> seven tests, replayed against seventy-eight days of real posted H100 prices. It's live on Monad
> testnet — the link's in the submission.

---

## 2. Pitch — max 2:00

**What judges are checking:** who you are, what problem you're solving, why you're building it.
Talk to camera. No slides needed.

### 0:00 – 0:20 — Who and what

> I'm [name], and this is Ingot — a market for the price of compute, and the credit layer it
> unlocks.

### 0:20 – 0:55 — The problem, concretely

> Compute is one of the most valuable commodities in the world and it trades like a private
> handshake. In our own data, on an average day, the dearest provider's posted H100 rate is six
> times the cheapest. Same chip, same day. There's no forward curve and no way to hedge.
>
> That missing hedge has a price, and it lands on credit. CoreWeave borrows at 225 basis points
> over against a strong counterparty and 450 to 550 against a weak one — on identical hardware.
> That spread isn't hardware risk. It's cash-flow risk nobody can lay off, priced into tens of
> billions of dollars of GPU-backed debt.

### 0:55 – 1:25 — Why now, and why this

> On October 5th the CME listed compute futures. Compute is officially a commodity now. But that
> contract clears through NYMEX, needs a futures broker, and is closed to almost everyone who
> actually carries the exposure — the mid-size clouds and AI companies across forty countries.
>
> Ingot is that venue, onchain. And it does something the CME contract structurally can't: the
> hedge composes into the loan. The borrower doesn't go buy protection separately — it opens in
> the same transaction as the drawdown.

### 1:25 – 1:50 — What that's worth

> Here's the number that matters. A lender today needs the rate to fall more than half before an
> unhedged loan goes bad — so they only advance against that cushion. The cushion isn't free; it's
> the advance rate the borrower doesn't get. Hedged, the lender is made whole at every settlement
> price. Same risk appetite, materially bigger advance.

### 1:50 – 2:00 — Why you

> [One or two sentences, in your own words: why you're the person building this. If you've spoken
> to a GPU broker or a neocloud, name them here — that single sentence is worth more than anything
> else in this video.]

---

## Production notes

- **Do the dry run.** Both scripts assume smooth navigation. Fumbling for a button costs more
  seconds than any sentence here.
- **Record audio separately if you can.** Screen-recorder microphone audio is the most common
  reason a good demo reads as amateur.
- **Don't speed-read.** If you're over time, cut a sentence rather than talking faster. The 2:15
  credit section is the one to protect; the underwriter section is the one to cut.
- **Have the wallet funded and approved beforehand.** An approval popup mid-demo burns fifteen
  seconds and breaks the flow.
- **Say "testnet" once, plainly.** Trying to obscure it reads worse than stating it.
