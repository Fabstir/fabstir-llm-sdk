// Batch call types for EIP-5792
export interface BatchCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: `0x${string}`;
}

// SDK configuration
export interface SDKConfig {
  chainId: number;
  rpcUrl?: string;
  appName?: string;
}

// Transaction result
export interface TransactionResult {
  id: string;
  status?: number;
  receipts?: Array<{
    transactionHash?: string;
  }>;
}

// USDC configuration on Base Sepolia
export const USDC_CONFIG = {
  address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
  decimals: 6,
} as const;