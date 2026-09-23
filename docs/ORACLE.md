# The index publisher, as a Chainlink CRE workflow

*Sponsor bounty: Best workflow with CRE.*

## The problem this fixes

`IngotIndex` trusts an allowlisted set of publisher keys. Any one of them can print within the
deviation band every interval, so a single compromised key can walk the settlement price over a
few hours — and every position, liquidation and settlement follows it. The finality delay and tip
revocation buy a guardian time to intervene, but the trust is still a key.

`docs/SECURITY.md` lists this as an accepted finding with the mechanism it would need: *"a quorum
with a per-period median plus a cumulative drift cap."* This is that mechanism.

## What runs where

```
  cron (hourly)
        │
        ▼
  ┌─────────────────────── CRE DON ───────────────────────┐
  │  each node, independently:                            │
  │    HTTP capability → venue rate endpoints             │
  │    methodology.ts  → per-venue median,                │
  │                      then 10% trimmed mean            │
  │                                                       │
  │  across nodes:                                        │
  │    consensusMedianAggregation()                       │
  └───────────────────────────┬───────────────────────────┘
                              │ one DON-signed report
                              ▼
                     CRE forwarder (Monad)
                              │
                              ▼
                    IngotIndexReceiver.onReport
                              │
                              ▼
                       IngotIndex.publish
```

Two aggregations doing two different jobs. **Within a node**, a trimmed mean across venues — that
is the index methodology, unchanged from `tools/build_index.py`. **Across nodes**, a median — that
is the consensus. A node that is lied to by one venue, rate-limited, or simply wrong cannot move
the published number.

## Why the receiver authenticates on the forwarder alone

`IngotIndexReceiver.onReport` checks `msg.sender == forwarder` and a workflow tag carried in the
report body. It does not re-parse CRE's 109-byte metadata header.

That is deliberate. The forwarder is the contract that verifies DON signatures before it calls
anything, so `msg.sender == forwarder` *is* the proof a quorum produced the report. Re-deriving
workflow identity from byte offsets in a header would add a second, weaker check that could be
wrong without being obviously wrong. The tag lives in the body, which the workflow and the
receiver both define, so both sides are verifiable.

**The index's own guards still apply.** A quorum is not licence to print anything: deviation band,
minimum interval and monotonic timestamps are enforced in `IngotIndex` exactly as before.

## Layout

| | |
|---|---|
| `oracle/workflow.ts` | The CRE workflow: cron trigger, node-mode fetch, median consensus, EVM write |
| `oracle/methodology.ts` | The index methodology, shared by the workflow and the simulator |
| `oracle/simulate.ts` | Runs the whole thing locally over a real venue snapshot |
| `oracle/fixtures/` | One real snapshot, and the encoded report body it produces |
| `contracts/src/IngotIndexReceiver.sol` | On-chain landing pad |

Monad testnet is a first-class chain in the CRE SDK's selector table
(`2183018362218727504`, chain id 10143) — this is a supported path, not a workaround.

## Running it

```bash
cd oracle
pnpm install
pnpm simulate     # the workflow's logic over a real snapshot
pnpm typecheck    # the workflow against the real SDK types
```

A representative run:

```
one node's print
  price        $3.5945 / GPU-hour
  venues       23
  quotes       31

consensus across 5 nodes
  node prices  $3.594, $3.609, $3.584, $3.598, $99.000
  median       $3.5981
  note         the $99.00 node is outvoted, not averaged in
```

## The two things that caught real bugs

**`tsc` against the real SDK types.** The first version passed a `Uint8Array` as the report
payload. Protobuf JSON carries `bytes` as base64, so it had to be encoded — a mismatch that would
have surfaced only at DON runtime.

**The cross-language encoding test.** The workflow runs in a restricted WASM sandbox with no ABI
library, so it hand-rolls the encoding of `(bytes32, uint64, uint256, uint32, uint16)`. An encoder
and a decoder written in different languages agreeing *by inspection* is exactly what is wrong in
production. `test_onReport_decodesThePayloadTheWorkflowEncoded` reads the payload `pnpm simulate`
wrote and puts it through the real receiver — and on its first run it failed, because the workflow
encoded the tag as ASCII `bytes32` while the receiver had been configured with `keccak256` of the
same string. The payload decoded cleanly and the receiver rejected it, which is precisely the
failure that test exists to find.

## Deploying against a live DON

`Deploy.s.sol` deploys the receiver and installs it as a publisher. Registering the workflow with
a DON needs the CRE CLI and a funded registration, which this environment cannot reach; the logic
is identical on both paths because both import the same `methodology.ts`. After registration:

```bash
cast send <indexReceiver> 'setForwarder(address)' <cre-forwarder>
```

Then revoke the deployer as a publisher, and the index has no key left to compromise:

```bash
cast send <index> 'setPublisher(address,bool)' <deployer> false
```
