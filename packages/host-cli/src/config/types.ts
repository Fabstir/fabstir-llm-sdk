export interface ConfigData {
  version: string;
  walletAddress: string;
  network: 'base-mainnet' | 'base-sepolia';
  rpcUrl: string;
  inferencePort: number;
  publicUrl: string;
  models: string[];
  pricePerToken: number;
  minSessionDeposit: number;
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