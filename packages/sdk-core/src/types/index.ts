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

// ============= Delta-Based Checkpoint Types =============
// Used for conversation recovery from node-published checkpoints

/**
 * A single conversation checkpoint delta stored by the node.
 * Contains only the messages since the last checkpoint (not cumulative).
 */
export interface CheckpointDelta {
  /** Session identifier */
  sessionId: string;
  /** Zero-based index of this checkpoint */
  checkpointIndex: number;
  /** On-chain proof hash for verification */
  proofHash: string;
  /** Token position at start of this delta */
  startToken: number;
  /** Token position at end of this delta */
  endToken: number;
  /** Messages in this delta (only new since last checkpoint) */
  messages: Message[];
  /** EIP-191 signature by host wallet */
  hostSignature: string;
}

/**
 * Entry in the checkpoint index pointing to a delta.
 */
export interface CheckpointIndexEntry {
  /** Zero-based index of this checkpoint */
  index: number;
  /** On-chain proof hash for verification */
  proofHash: string;
  /** S5 CID pointing to the CheckpointDelta (camelCase per convention) */
  deltaCid: string;
  /** S5 CID pointing to the proof data (optional) */
  proofCid?: string;
  /** [startToken, endToken] range for this checkpoint */
  tokenRange: [number, number];
  /** Unix timestamp when checkpoint was created */
  timestamp: number;
}

/**
 * Index of all checkpoints for a session, published by the host.
 */
export interface CheckpointIndex {
  /** Session identifier */
  sessionId: string;
  /** Host's Ethereum address */
  hostAddress: string;
  /** Array of checkpoint entries */
  checkpoints: CheckpointIndexEntry[];
  /** EIP-191 signature by host wallet over messages content */
  messagesSignature: string;
  /** EIP-191 signature by host wallet over checkpoints array */
  checkpointsSignature: string;
}

/**
 * Result of recovering a conversation from checkpoints.
 */
export interface RecoveredConversation {
  /** Merged messages from all deltas */
  messages: Message[];
  /** Total token count from last checkpoint */
  tokenCount: number;
  /** Checkpoint entries used for recovery */
  checkpoints: CheckpointIndexEntry[];
}

/**
 * Encrypted checkpoint delta (Phase 8).
 * Host encrypts delta with user's recovery public key before S5 upload.
 * Only user can decrypt during recovery.
 */
export interface EncryptedCheckpointDelta {
  /** Must be true for encrypted deltas */
  encrypted: true;
  /** Encryption version (currently 1) */
  version: number;
  /** User's recovery public key (echoed back for verification) */
  userRecoveryPubKey: string;
  /** Host's ephemeral public key for ECDH (compressed, 0x-prefixed) */
  ephemeralPublicKey: string;
  /** 24-byte nonce for XChaCha20 (hex, 48 chars) */
  nonce: string;
  /** Encrypted CheckpointDelta JSON (hex) */
  ciphertext: string;
  /** EIP-191 signature over keccak256(ciphertext) */
  hostSignature: string;
}

// ============= Blockchain Checkpoint Types (Phase 9) =============

/**
 * Checkpoint entry parsed from blockchain ProofSubmitted event.
 * Used for decentralized checkpoint recovery without requiring host to be online.
 */
export interface BlockchainCheckpointEntry {
  /** Job/session ID from the event */
  jobId: bigint;
  /** Host address that submitted the proof */
  host: string;
  /** Number of tokens claimed in this proof */
  tokensClaimed: bigint;
  /** Keccak256 hash of the proof data */
  proofHash: string;
  /** S5 CID of the STARK proof data */
  proofCID: string;
  /** S5 CID of the checkpoint delta (NEW in Phase 9) */
  deltaCID: string;
  /** Block number where the event was emitted */
  blockNumber: number;
  /** Transaction hash that emitted the event */
  transactionHash: string;
}

/**
 * Options for querying ProofSubmitted events from blockchain.
 */
export interface CheckpointQueryOptions {
  /** Start block for event query (default: 0) */
  fromBlock?: number;
  /** End block for event query (default: 'latest') */
  toBlock?: number | 'latest';
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

// ============= Permission Types =============

export * from './permissions.types';

// ============= Model Types =============

export type { ModelPricing, ModelWithAvailability, PriceRange } from './models';

// ============= Web Search Types =============

export * from './web-search.types';

// ============= Proof Types (Security Audit Migration) =============

export * from './proof.types';