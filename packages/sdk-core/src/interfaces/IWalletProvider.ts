import { ethers } from 'ethers';

/**
 * Transaction request for wallet operations
 */
export interface TransactionRequest {
  to?: string;
  from?: string;
  value?: bigint;
  data?: string;
  nonce?: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  chainId?: number;
}

/**
 * Transaction response from wallet operations
 */
export interface TransactionResponse extends ethers.TransactionResponse {
  hash: string;
  from: string;
  wait: (confirmations?: number) => Promise<ethers.TransactionReceipt>;
}

/**
 * Wallet capabilities to help SDK adapt behavior
 */
export interface WalletCapabilities {
  /** Whether the wallet supports gasless transactions (e.g., via paymaster) */
  supportsGaslessTransactions: boolean;

  /** Whether the wallet can switch between chains */
  supportsChainSwitching: boolean;

  /** Whether this is a smart account wallet */
  supportsSmartAccounts: boolean;

  /** Whether deposits need to go to a different account */
  requiresDepositAccount: boolean;
}

/**
 * Common interface for all wallet providers
 * Supports both EOA and Smart Account wallets
 */
export interface IWalletProvider {
  // Core wallet functions

  /** Connect to the wallet, optionally specifying target chain */
  connect(chainId?: number): Promise<void>;

  /** Disconnect from the wallet */
  disconnect(): Promise<void>;

  /** Check if wallet is connected */
  isConnected(): boolean;

  // Account management

  /** Get the wallet address (EOA or smart account) */
  getAddress(): Promise<string>;

  /** Get deposit account for gasless operations (may differ from wallet address) */
  getDepositAccount(): Promise<string>;

  // Chain management

  /** Get the current chain ID */
  getCurrentChainId(): Promise<number>;

  /** Switch to a different chain */
  switchChain(chainId: number): Promise<void>;

  /** Get list of supported chain IDs */
  getSupportedChains(): number[];

  // Transaction handling

  /** Send a transaction through the wallet */
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;

  /** Sign a message with the wallet */
  signMessage(message: string): Promise<string>;

  // Balance queries

  /** Get balance of native token or specified token */
  getBalance(token?: string): Promise<string>;

  // Provider capabilities

  /** Get wallet capabilities for SDK adaptation */
  getCapabilities(): WalletCapabilities;
}