import type { Address } from "viem";

import { LOCAL_CHAIN_ENABLED, anvil, monadTestnet } from "./chains";

export type Deployment = {
  usdc: Address;
  index: Address;
  market: Address;
  underwriterVault: Address;
  hedgedCredit: Address;
};

/// Filled by `pnpm sync:addresses`, which reads contracts/deployments/<chainid>.json.
/// Kept as a checked-in map rather than a fetch so the app renders addresses without a
/// round trip and a judge can see exactly what is deployed.
export const DEPLOYMENTS: Record<number, Deployment | undefined> = {
  [anvil.id]: {
    usdc: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    index: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    market: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    underwriterVault: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    hedgedCredit: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
  },
  [monadTestnet.id]: undefined,
};

function isUsable(chainId: number): boolean {
  return chainId !== anvil.id || LOCAL_CHAIN_ENABLED;
}

export function deploymentFor(chainId: number | undefined): Deployment | undefined {
  if (chainId === undefined || !isUsable(chainId)) return undefined;
  return DEPLOYMENTS[chainId];
}

/// Chains this build can actually serve, deployed ones first. The generated block above can hold
/// a local rehearsal's addresses; this is where they stop mattering outside development.
export function usableDeployments(): Array<[number, Deployment]> {
  return Object.entries(DEPLOYMENTS)
    .map(([id, value]) => [Number(id), value] as const)
    .filter((entry): entry is readonly [number, Deployment] => entry[1] !== undefined && isUsable(entry[0]))
    .map(([id, value]) => [id, value]);
}
