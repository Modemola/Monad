// Keeps the indexer in step with the contracts.
//
//   node scripts/sync.mjs           ABIs from ../contracts/out, addresses from deployments/
//   node scripts/sync.mjs --check   exit 1 if either is stale (CI)
//
// ABIs: config.yaml references events by name against these files, so an event signature can
// only change in Solidity. Addresses: the chains block of config.yaml is rewritten from
// contracts/deployments/<chainid>.json, which scripts/deploy.sh produces.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS_OUT = resolve(HERE, "../contracts/out");
const DEPLOYMENTS = resolve(HERE, "../contracts/deployments");
const CONFIG = resolve(HERE, "config.yaml");

const CONTRACTS = [
  { name: "IngotIndex", key: "index" },
  { name: "IngotMarket", key: "market" },
  { name: "UnderwriterVault", key: "underwriterVault" },
  { name: "HedgedCredit", key: "hedgedCredit" },
];

// Monad testnet only. Anvil is deliberately absent: HyperSync cannot see a local node, and a
// local rehearsal is better served by the simulated-event tests.
const CHAINS = [{ id: 10143, label: "Monad testnet" }];

// Until a deployment exists the config still has to parse, so each contract points at a
// placeholder. The indexer finds nothing there, which is the correct answer.
const PLACEHOLDER = "0x0000000000000000000000000000000000000000";

const check = process.argv.includes("--check");
const stale = [];

function write(path, contents) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  if (current === contents) return;
  if (check) {
    stale.push(path);
    return;
  }
  writeFileSync(path, contents);
  console.log(`wrote ${path.replace(`${HERE}/`, "")}`);
}

// ---------------------------------------------------------------- ABIs

for (const { name } of CONTRACTS) {
  const artifact = resolve(CONTRACTS_OUT, `${name}.sol/${name}.json`);
  if (!existsSync(artifact)) {
    console.error(`missing ${artifact} — run \`forge build\` in contracts/ first`);
    process.exit(1);
  }
  const events = JSON.parse(readFileSync(artifact, "utf8")).abi.filter((e) => e.type === "event");
  write(resolve(HERE, `abis/${name}.json`), `${JSON.stringify(events, null, 2)}\n`);
}

// ---------------------------------------------------------------- addresses

const chainBlocks = CHAINS.map(({ id, label }) => {
  const path = resolve(DEPLOYMENTS, `${id}.json`);
  const deployment = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
  const startBlock = deployment?.deployBlock ?? 0;
  const note = deployment ? "" : " # not deployed yet: run scripts/deploy.sh";

  const contracts = CONTRACTS.map(({ name, key }) => {
    const address = deployment?.[key] ?? PLACEHOLDER;
    return `      - name: ${name}\n        address: "${address}"`;
  }).join("\n");

  return `  - id: ${id} # ${label}\n    start_block: ${startBlock}${note}\n    contracts:\n${contracts}`;
}).join("\n");

const config = readFileSync(CONFIG, "utf8");
const marker = "\nchains:\n";
const at = config.indexOf(marker);
if (at === -1) {
  console.error("config.yaml has no top-level `chains:` block to rewrite");
  process.exit(1);
}
write(CONFIG, `${config.slice(0, at + marker.length)}${chainBlocks}\n`);

if (stale.length > 0) {
  console.error("stale — run `node indexer/scripts/sync.mjs` and commit:");
  for (const path of stale) console.error(`  ${path.replace(`${HERE}/`, "indexer/")}`);
  process.exit(1);
}
if (check) console.log("indexer ABIs and addresses are current");
