// Copyright (c) 2025 Fabstir — BUSL-1.1

/** Bidirectional mapping between numeric chain IDs and x402 network strings. */

const CHAIN_TO_NETWORK: Record<number, string> = {
  84532: 'base-sepolia',
  8453: 'base',
  5611: 'opbnb-testnet',
};

const NETWORK_TO_CHAIN: Record<string, number> = Object.fromEntries(
  Object.entries(CHAIN_TO_NETWORK).map(([k, v]) => [v, Number(k)])
);

/** Convert a numeric chain ID to its x402 network string. */
export function chainIdToX402Network(chainId: number): string {
  const network = CHAIN_TO_NETWORK[chainId];
  if (!network) throw new Error(`Unknown chain ID for x402: ${chainId}`);
  return network;
}

/** Convert an x402 network string to its numeric chain ID. */
export function x402NetworkToChainId(network: string): number {
  const chainId = NETWORK_TO_CHAIN[network];
  if (chainId === undefined) throw new Error(`Unknown x402 network: ${network}`);
  return chainId;
}
