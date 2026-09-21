# Metropolis Hackathon — Track Briefs

Source: https://hackathon.monad.xyz (track pages)

Shared across all four tracks:

- **Prize:** $30,000 USD per track, split evenly among 3 winners — $10,000 each.
- **Deadline:** Oct 14, 2026 at 04:59 GMT+1.
- **Note:** Create a project before choosing tracks and bounties.
- **Rubric:** weighted toward startup potential, applied consistently across all four tracks.
  - Technical Execution — 20%
  - Design & Craft — 20%
  - Originality & Track Insight — 15%
  - Founder & Market Readiness — 25%
  - Traction & Path Forward — 20%

## Deliverables (identical for all tracks)

- **Project Logo/Graphic:** JPG, JPEG, PNG, or WEBP (max 3MB).
- **Public GitHub Repository:** fully accessible by metropolis@hackathon.monad.xyz.
- **Technical Demo Video:** max 3 minutes, via YouTube, Loom, or Vimeo — must show the live working product, not slides or a code walkthrough.
- **Pitch Video:** max 2 minutes, introducing the team, the problem being solved, and why you're building it.
- **Live Product Link:** deployed on Monad Mainnet or Testnet, with clear access instructions and any necessary test login credentials for judges.
- **Product Advertisement (Optional):** max 30 seconds, via YouTube, Loom, or Vimeo — short, punchy promo clip. Not factored into judging; used for post-event social promotion and marketing.

---

## Track 1 — Onchain Finance & Trading

> New asset primitives, market structures, and the trading experiences that make them usable — all made possible by fast, cheap settlement.

### What this track is for

Financial markets onchain have matured enough to ask what should exist here that couldn't exist anywhere else. This track is for builders working on the asset layer itself — new instruments, new underlyings, new market structures — as well as the trading infrastructure and experiences that make them accessible. At 400ms blocks and 800ms finality on Monad, fully onchain markets that compete with centralised venues on execution quality are within reach, and that same speed opens up trading interfaces and interaction patterns that weren't previously possible.

Compute is emerging as one of the most important commodities in the world, yet GPU capacity still trades on opaque, bilateral terms — no real spot markets, no hedging tools. Companies using compute as loan collateral pay a premium above 5% because lenders can't underwrite or hedge the risk. That's starting to change: CME and ICE have both announced compute futures, and compute contracts are seeing real volume on prediction markets. Monad's throughput and sub-second settlement make it a strong candidate for where compute markets get built onchain.

Tokenized equities are arriving onchain fast, and once an equity is a programmable asset rather than just a static holding, a lot becomes possible: divisible to a cent, transferable without a broker, and actionable by any contract that touches it. This track wants to see the equity actually doing something — locked, streamed, conditioned, or distributed by a contract — not just held as another balance.

**Core question:** Where are the missing asset primitives — and what new trading experiences and financial products become possible when settlement is fast enough to stop being the bottleneck?

**Belongs here if:** the core output is a financial instrument, market, asset primitive, or trading experience — and the primary user is a trader, protocol, or financial product builder.

### Judging criteria (track-specific wording)

- **Technical Execution (20%)** — does the trading/market mechanism work end-to-end onchain? Real settlement and pricing/matching logic, not a UI mockup over static data.
- **Design & Craft (20%)** — is the trading experience trustworthy and legible? Clear pricing, clear risk disclosure, an interface a trader would actually trust with capital. Financial products live or die on whether users trust the UI.
- **Originality & Track Insight (15%)** — does this introduce a genuinely new asset primitive or market structure that couldn't exist without fast settlement, or is it a faster clone of an existing DeFi product?
- **Founder & Market Readiness (25%)** — does the team understand who the trader, protocol, or counterparty is and why this market doesn't already exist? Can they name a specific first user beyond "crypto traders"?
- **Traction & Path Forward (20%)** — any evidence of real usage or testing (even simulated volume or a handful of test trades), and a specific next step — a TVL/volume target, a liquidity partner plan, or a concrete fundraising/launch plan.

### Suggested starting points

1. Next-generation launchpads built around a specific emerging asset class (not another fair-launch meme bonding curve) — the moment a new asset class becomes liquid and tradeable onchain for the first time, it creates room for a launchpad purpose-built around it
2. Options written on non-traditional underlyings: social attention, creator growth trajectories, real-world event outcomes verified by oracle
3. Yield stripping: separate the yield from the principal of any interest-bearing asset and trade each leg independently
4. Execution-aware trading interfaces that expose Monad's sub-second finality directly to the user — real-time fills, live order books, no "pending" states
5. Mobile-first or simplified trading experiences built for a specific segment (new traders, a specific asset class, a specific region)
6. Embedded trading experiences inside wallets, games, or other apps that aren't trading-native
7. New order types or execution strategies (TWAP, grid, limit variants) surfaced through a genuinely better trading interface, not just backend logic
8. Compute Spot Exchange — an onchain CLOB for standardized compute contracts (e.g. "1 H100-hour, region X, delivered week N")
9. Compute Structured Products — vaults routing LP capital into compute-backed strategies: financing compute contracts, market-making compute contracts, or basis trades on a compute index
10. Tokenized Compute Yield — fractionalized GPU fleets or reserved cloud commitments turned into yield-bearing, transferable tokens with onchain revenue distribution
11. SLA Insurance & Performance Bonds — markets underwriting compute delivery (uptime, latency, delivery guarantees) with onchain slashing and payouts
12. Tokenized equities as a programmable asset — a contract that locks, streams, conditions, or distributes the equity itself, not just holds it. Must be genuinely impractical offchain (due to composability, minimum size) and not already common onchain. No live tokenized equity required — build against a mock ERC-20 standing in for a tokenized stock.

---

## Track 2 — Consumer Products & Payments

> Consumer-facing financial products that use onchain rails as a design advantage, for users who don't identify as crypto users.

### What this track is for

The infrastructure for onchain consumer finance has quietly crossed a threshold — near-instant settlement, gasless accounts, programmable money that can respond to behaviour in real time. This track is for builders who want to close the gap between what those rails make possible and what people can actually use. The products that make crypto feel obvious to someone who never wanted to think about blockchains are still largely unbuilt.

**Core question:** What does a financial product look like when onchain rails are leveraged as an advantage to design?

**Belongs here if:** the primary user is a consumer — someone who may not identify as a crypto user — and the core value is a financial experience, not a trading or market-making product.

### Judging criteria (track-specific wording)

- **Technical Execution (20%)** — do the payment/behavioral mechanics actually execute onchain with real conditional logic and settlement, not simulated?
- **Design & Craft (20%)** — would a non-crypto user complete the core flow without confusion or help? This track's central bar is an invisible blockchain — judge harshly on any point of friction that reveals "this is crypto."
- **Originality & Track Insight (15%)** — is this a genuinely new consumer financial experience enabled by onchain rails, or a wallet/payments app with new branding?
- **Founder & Market Readiness (25%)** — is there a specific, named consumer segment it serves, and does the team show real understanding of that user's behavior or pain point — not just "everyone needs payments"?
- **Traction & Path Forward (20%)** — evidence of user testing (even five friends trying it), and a concrete distribution plan — how would the next 100 users actually find this?

### Suggested starting points

1. Payments embedded in social gestures — splitting a bill, sending a gift, tipping a creator — where the financial action feels like a message, not a transaction
2. Commitment contracts that put real money behind behavioural goals — reduce screen time, hit a step count, quit a habit — verified automatically by device-native signals, with stakes redistributed to those who follow through
3. Accountability pools where groups collectively commit to a shared goal: those who fail fund the rewards of those who succeed
4. Income share agreements as a consumer product — fund a friend's course, career move, or creative project in exchange for a programmatic share of future earnings, settled automatically onstream
5. Programmable gifts that unlock on conditions — "here's $500 when you graduate", "here's your share when the company exits" — financial commitments that execute automatically without anyone having to remember or chase
6. Salary streaming at the individual level — get paid every second rather than bi-weekly, with idle balances earning yield in the background until you spend them
7. Micro-insurance that turns on and off by the minute — cover your laptop for the next three hours, insure a specific journey, pay only for the moments of actual exposure
8. Savings products where your yield rate is gated by behavioural goals you set and your social graph verifies

---

## Track 3 — Social, Attention & Culture

> Products where open social graphs, competitive feed algorithms, and community governance let cultural participation translate into real ownership.

### What this track is for

Social platforms, cultural markets, and the economies of attention share a common tension: the people generating value and those capturing it are rarely the same. This track is for builders exploring what changes when social graphs are open, feed algorithms are competitive, and cultural communities can govern and build on what they've created. At 800ms finality and 10,000 TPS on Monad, the experience gap that has made onchain social feel clunky closes — what comes next is the product question.

**Core question:** How do you build products where social participation, cultural engagement, and attention translate into real ownership and economic stake for the people generating them?

**Belongs here if:** the core user value is social connection, cultural participation, or community — even if financial mechanics are involved.

### Judging criteria (track-specific wording)

- Rubric weighted toward startup potential, applied consistently across all four tracks — track-specific look-fors below.
- **Technical Execution (20%)** — does the social/cultural/governance mechanism run onchain and produce correct, verifiable results?
- **Design & Craft (20%)** — does it feel like a genuine social or cultural product — inviting, fun, native to how people actually socialize — rather than a token-gated feature bolted onto a generic interface?
- **Originality & Track Insight (15%)** — does participation or attention translate into real, verifiable economic stake for the people generating it, or is the onchain layer decorative?
- **Founder & Market Readiness (25%)** — does the team understand the specific community or creator base they're targeting, and why that community would migrate from existing platforms?
- **Traction & Path Forward (20%)** — any real community engagement (even a small Discord or test group), and a specific plan for growth and creator acquisition.

### Suggested starting points

1. An algorithm marketplace where communities publish, sell, and compete on feed ranking strategies — creators migrate to the feeds that reward them
2. Social clients where the recommendation engine is trained and governed by the community it serves, not the platform hosting it
3. Attention futures: stake on content or creators you believe will break through before the crowd does, earn if you were right
4. Early-supporter registries that cryptographically prove — and financially reward — fans who were there before the audience arrived
5. Wallet-seeded social graphs that bootstrap new platforms by surfacing existing onchain relationships as a social layer
6. A TCG marketplace with real-time onchain order books — transparent price discovery, instant settlement, and no platform taking a 10–15% cut on every trade
7. TCGs where card scarcity, rule evolution, tournament structure, and prize pools are governed onchain by the player community — not a publisher
8. Automated market makers designed specifically for the long-tail of collectible assets, where thinly traded cards currently have no reliable price or exit
9. Rental and lending markets for high-value cards — letting competitive players access what they need without the capital outlay, and collectors earn yield on idle assets
10. Cross-game asset interoperability: a shared cultural asset layer where items from one game or collection carry provable history and value into others
11. Generative art that evolves — pieces whose visual properties, traits, or behaviour change based on onchain events, holder actions, community votes, or oracle-fed real-world data, moving the NFT from static collectible to living object
12. Style as an ownable asset — capturing a visual aesthetic or artistic identity as an NFT that can be licensed and applied to existing collections, generating derivative works with onchain attribution and automated revenue splits back to the style's creator

---

## Track 4 — Trust, Identity & AI Infrastructure

> Protocol-level primitives for trust, provenance, and user-owned data that make AI genuinely useful without any single platform capturing the value.

### What this track is for

AI has shifted the default assumptions the internet runs on — about identity, provenance, and what's real. At the same time, the personal context that makes AI genuinely useful tends to accumulate in platforms people don't own. This track is for builders working on the trust and data ownership layer: the primitives that need to exist at the protocol level for the rest of it to work. Monad provides specific building blocks — a native P256 precompile for WebAuthn verification, ERC-8004 as a first-class trustless agent registry, and BTX encrypted mempools — that make this space more tractable than it's been elsewhere.

**Core question:** What does the trust and data ownership layer look like for an AI-native internet — built in a way that's privacy-preserving, composable, and impossible for any single platform to capture?

**Belongs here if:** the primary output is a protocol, primitive, or infrastructure layer that other applications build on — not a standalone consumer product.

### Judging criteria (track-specific wording)

- **Technical Execution (20%)** — is the trust/identity/data primitive implemented correctly and securely — correct use of WebAuthn/P256, sound key derivation, no leaked secrets?
- **Design & Craft (20%)** — is the primitive usable by the developers who'd build on it — clear docs, clean interface or API — even without an end-user-facing UI? Design here means developer experience, not just visuals.
- **Originality & Track Insight (15%)** — does this solve trust, provenance, or data ownership in a way that's privacy-preserving and not capturable by a single platform, or does it just centralize the problem differently?
- **Founder & Market Readiness (25%)** — does the team know which specific applications or developers would adopt this primitive, and why they'd choose it over rolling their own?
- **Traction & Path Forward (20%)** — any evidence of developer interest (even one other team integrating it during the hackathon), and a specific plan to get more integrations post-event.

### Suggested starting points

1. Mobile-native proof of personhood using WebAuthn/P256 — no invasive biometrics, no centralised issuer, verified in a single tap on existing hardware
2. Content passports: every AI-generated asset carries a cryptographic certificate of origin and a tamper-evident audit trail that survives platform migration
3. A personal data locker that earns revenue when AI companies query your interaction history — you set the price, they pay per call
4. Cross-application AI memory: a user-owned context layer that persists across products so your AI assistant isn't amnesiac every time you switch apps
5. A marketplace where domain experts license their decision-making patterns to train specialised models — compensated per training run, not per data upload
6. Onchain credential attestations for real-world skills that any application can verify without a centralised middleman
7. Decentralised data labelling networks for physical AI — contributors earn stablecoin rewards for annotating robotics and sensor data, with onchain micropayments making global participation practical at scale
