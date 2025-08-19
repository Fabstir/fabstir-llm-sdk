import { ethers } from 'ethers';

// Job submission parameters
export interface JobSubmissionParams {
  modelId: string;
  prompt: string;
  maxTokens: number;
  offerPrice: string;
  paymentToken?: 'ETH' | 'USDC';
  paymentAmount?: string;
  temperature?: number;
  seed?: number;
  resultFormat?: string;
}

// JobDetails struct - matches contract's 6 field requirement
export interface JobDetails {
  prompt: string;
  modelId: string;
  maxTokens: number;
  seed: number;
  resultFormat: string;
  offerPrice: string;
}

// JobRequirements struct
export interface JobRequirements {
  minMemory?: number;
  minStorage?: number;
  gpuRequired?: boolean;
}

// Payment token addresses on mainnet
export const TOKEN_ADDRESSES = {
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F'
} as const;

// Contract addresses
export const CONTRACT_ADDRESSES = {
  JobMarketplace: '0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6',
  PaymentEscrow: '0x0000000000000000000000000000000000000000', // Update when deployed
  NodeRegistry: '0x0000000000000000000000000000000000000000' // Update when deployed
} as const;

// ERC20 minimal ABI for token operations
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

// Job status enum
export enum JobStatus {
  PENDING = 0,
  PROCESSING = 1,
  COMPLETED = 2,
  FAILED = 3,
  CANCELLED = 4
}