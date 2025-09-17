export interface ConfigData {
  version: string;
  walletAddress: string;
  privateKey?: string; // Added for wallet storage
  network: 'base-mainnet' | 'base-sepolia';
  rpcUrl: string;
  inferencePort: number;
  publicUrl: string;
  models: string[];
  pricePerToken: number;
  minSessionDeposit?: number; // Made optional
  minJobDeposit?: number; // Added for compatibility
  contracts?: {
    jobMarketplace?: string;
    nodeRegistry?: string;
    proofSystem?: string;
    hostEarnings?: string;
    fabToken?: string;
    usdcToken?: string;
  };
}

export interface WalletInfo {
  address: string;
  privateKey?: string;
  mnemonic?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export type PartialConfig = Partial<ConfigData>;