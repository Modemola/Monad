import type { Address } from "viem";

import { anvil, monadTestnet } from "./chains";

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
    market: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    underwriterVault: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    hedgedCredit: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
  },
  [monadTestnet.id]: undefined,
};

export function deploymentFor(chainId: number | undefined): Deployment | undefined {
  if (chainId === undefined) return undefined;
  return DEPLOYMENTS[chainId];
}
