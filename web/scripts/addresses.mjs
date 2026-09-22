// Copies contracts/deployments/<chainid>.json into lib/addresses.ts.
// Run from web/: node scripts/addresses.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHAINS = [
  { id: 31337, key: "anvil.id" },
  { id: 10143, key: "monadTestnet.id" },
];

const entries = CHAINS.map(({ id, key }) => {
  const path = resolve(`../contracts/deployments/${id}.json`);
  if (!existsSync(path)) return `  [${key}]: undefined,`;

  const d = JSON.parse(readFileSync(path, "utf8"));
  const fields = ["usdc", "index", "market", "underwriterVault", "hedgedCredit"]
    .map((f) => `    ${f}: "${d[f]}",`)
    .join("\n");
  return `  [${key}]: {\n${fields}\n  },`;
}).join("\n");

const source = readFileSync("lib/addresses.ts", "utf8");
const updated = source.replace(
  /export const DEPLOYMENTS[\s\S]*?\n};/,
  `export const DEPLOYMENTS: Record<number, Deployment | undefined> = {\n${entries}\n};`,
);
writeFileSync("lib/addresses.ts", updated);
console.log("synced lib/addresses.ts");
