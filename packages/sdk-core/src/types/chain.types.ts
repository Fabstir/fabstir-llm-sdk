/**
 * Supported chain IDs
 */
export enum ChainId {
  BASE_SEPOLIA = 84532,
  OPBNB_TESTNET = 5611,
}

/**
 * Native token types
 */
export type NativeToken = 'ETH' | 'BNB';

/**
 * Contract addresses for a specific chain
 */
export interface ChainContracts {
  jobMarketplace: string;
  nodeRegistry: string;
  proofSystem: string;
  hostEarnings: string;
  modelRegistry: string;
  usdcToken: string;
  fabToken?: string; // Optional, not deployed on all chains
}

/**
 * Complete configuration for a blockchain network
 */
export interface ChainConfig {
  chainId: number;
  name: string;
  nativeToken: NativeToken;
  rpcUrl: string;
  contracts: ChainContracts;
  minDeposit: string; // In native token units (e.g., "0.0002" ETH)
  blockExplorer: string;
}