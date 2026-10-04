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
  [anvil.id]: undefined,
  [monadTestnet.id]: {
    usdc: "0xe841dF0566e532822c50997e3084eF6fFB58ca5D",
    index: "0xaD065A9D41092f371A83f730B3b375D171a066AC",
    market: "0x5811068aEb4037A7690D28387E29Fe0c4f90b820",
    underwriterVault: "0x7D8fb842ca5dC152854ED535B4b0C0e3b2ca82Ae",
    hedgedCredit: "0xcd7a1B8Fd9c67dAC3a97443c77199930eb6334D9",
  },
};

function isUsable(chainId: number): boolean {
  return chainId !== anvil.id || LOCAL_CHAIN_ENABLED;
}

export function deploymentFor(chainId: number | undefined): Deployment | undefined {
  if (chainId === undefined || !isUsable(chainId)) return undefined;
  return DEPLOYMENTS[chainId];
}

/// Chains this build can actually serve, deployed ones first. The generated block above can hold
/// a local rehearsal's addresses; this is where they stop mattering outside development. Where the
/// local chain is usable at all it is preferred, as in the wagmi chain order.
export function usableDeployments(): Array<[number, Deployment]> {
  return Object.entries(DEPLOYMENTS)
    .map(([id, value]) => [Number(id), value] as const)
    .filter((entry): entry is readonly [number, Deployment] => entry[1] !== undefined && isUsable(entry[0]))
    .sort(([a], [b]) => Number(b === anvil.id) - Number(a === anvil.id))
    .map(([id, value]) => [id, value]);
}
