// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for browser-compatible SDK
 * All types must be browser-safe (no Node.js specific types)
 */

import { ethers } from 'ethers';

// ============= Core Types =============

export interface SDKConfig {
  rpcUrl?: string;
  contractAddresses?: {
    jobMarketplace: string;
    nodeRegistry: string;
    fabToken: string;
    usdcToken: string;
    hostEarnings?: string;
    paymentEscrow?: string;
    proofSystem?: string;
    baseAccountFactory?: string;
  };
  mode?: 'production' | 'development' | 'test';
  network?: NetworkConfig;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorer?: string;
}

export class SDKError extends Error {
  code: string;
  details?: any;
  
  constructor(message: string, code: string = 'SDK_ERROR', details?: any) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.details = details;
  }
}

// ============= Authentication Types =============

export interface AuthResult {
  signer: ethers.Signer;
  userAddress: string;
  eoaAddress?: string;
  s5Seed: string;
  network?: { chainId: number; name: string };
  isSmartWallet?: boolean;
}

export interface AuthOptions {
  privateKey?: string;
  rpcUrl?: string;
  useSmartWallet?: boolean;
  sponsorDeployment?: boolean;
  paymasterUrl?: string;
}

export type WalletProvider = 'metamask' | 'coinbase' | 'private-key';

// ============= Payment Types =============

export type PaymentMethod = 'ETH' | 'USDC' | 'FAB';

export interface PaymentOptions {
  method: PaymentMethod;
  amount: bigint;
  tokenAddress?: string;
}

export interface JobCreationRequest {
  model: string;
  prompt: string;
  provider?: string;
  maxTokens?: bigint;
  seed?: bigint;
  payment: PaymentOptions;
}

export interface JobResult {
  jobId: bigint;
  txHash: string;
  status: 'pending' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

// ============= Storage Types =============

export interface StorageOptions {
  encrypt?: boolean;
  compress?: boolean;
  metadata?: Record<string, any>;
}

export interface StorageResult {
  cid: string;
  url: string;
  size: number;
  timestamp: number;
}

export interface ConversationData {
  id: string;
  messages: Message[];
  metadata: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// ============= Session Types =============

export interface SessionConfig {
  depositAmount: string;
  pricePerToken: number;
  proofInterval: number;
  duration: number;
  minBalance?: string;
}

export interface SessionJob {
  sessionId: bigint;
  jobId: bigint;
  user: string;
  provider: string;
  model: string;
  deposit: bigint;
  tokensUsed: number;
  isActive: boolean;
  startTime: number;
  endTime: number;
}

export interface CheckpointProof {
  checkpoint: number;
  tokensGenerated: number;
  proofData: string;
  timestamp: number;
}

// ============= Host Types =============
// NOTE: HostInfo and other host types have been moved to types/models.ts
// to support the new model governance architecture. Import from there instead.

export interface MetricsSubmitResult {
  stored: boolean;
  location: 'local' | 'contract' | 'service';
  timestamp: number;
  transactionHash?: string;
}

// ============= Treasury Types =============

export interface TreasuryInfo {
  balance: bigint;
  totalDeposits: bigint;
  totalWithdrawals: bigint;
  feePercentage: number;
}

export interface TreasuryTransaction {
  type: 'deposit' | 'withdrawal' | 'fee';
  amount: bigint;
  token: string;
  from?: string;
  to?: string;
  txHash: string;
  timestamp: number;
}

// ============= Event Types =============

export interface EventCallback<T = any> {
  (data: T): void;
}

export interface EventEmitter {
  on(event: string, callback: EventCallback): void;
  off(event: string, callback: EventCallback): void;
  emit(event: string, data: any): void;
  once(event: string, callback: EventCallback): void;
}

// ============= Transaction Types =============

export interface TransactionOptions {
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  value?: bigint;
  nonce?: number;
}

export interface TransactionResult {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  gasUsed: bigint;
  status: 'success' | 'failed';
  blockNumber: number;
  confirmations: number;
}

// ============= Utility Types =============

export type Awaitable<T> = T | Promise<T>;

export type Optional<T> = T | undefined;

export type Nullable<T> = T | null;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

// ============= Constants =============

export const SUPPORTED_CHAINS = {
  BASE_SEPOLIA: 84532,
  BASE: 8453,
  ETHEREUM: 1,
  SEPOLIA: 11155111,
} as const;

export const DEFAULT_GAS_LIMIT = 500000n;
export const DEFAULT_PROOF_INTERVAL = 1000; // Proof checkpoints every 1000 tokens (production default)
export const DEFAULT_SESSION_DURATION = 86400; // 24 hours
export const DEFAULT_STAKE_AMOUNT = '1000'; // 1000 FAB tokens

// ============= Type Guards =============

export function isSDKError(error: any): error is SDKError {
  return error instanceof SDKError;
}

export function isBigInt(value: any): value is bigint {
  return typeof value === 'bigint';
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidTransactionHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

// ============= User Settings Types =============

export * from './settings.types';

// ============= RAG WebSocket Types =============

export * from './rag-websocket';