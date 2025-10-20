// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Multi-Chain Payment Manager
 *
 * Handles payment operations across multiple chains (Base Sepolia, opBNB)
 * with support for deposit/withdrawal pattern and gasless operations.
 */

import { ethers, Signer } from 'ethers';
import { IPaymentManager } from '../interfaces';
import {
  SDKError,
  JobCreationRequest,
  JobResult,
  PaymentOptions,
  TransactionResult,
  PaymentMethod
} from '../types';
import { ChainId, ChainConfig } from '../types/chain.types';
import { ChainRegistry } from '../config/ChainRegistry';
import { JobMarketplaceWrapper } from '../contracts/JobMarketplace';
import {
  UnsupportedChainError,
  ChainMismatchError,
  InsufficientDepositError
} from '../errors/ChainErrors';

export interface SessionJobParams {
  host: string;
  amount: string;
  pricePerToken: number;
  duration: number;
  chainId?: number;
  useDeposit?: boolean;
  paymentToken?: string;
  proofInterval?: number;
}

export interface DepositBalances {
  native: string;
  tokens?: { [address: string]: string };
}

export class PaymentManager implements IPaymentManager {
  static readonly MIN_ETH_PAYMENT = '0.0002'; // Updated for multi-chain
  static readonly TOKENS_PER_PROOF = 100;
  static readonly DEFAULT_PRICE_PER_TOKEN = 1000000;
  static readonly DEFAULT_DURATION = 3600;
  static readonly DEFAULT_PROOF_INTERVAL = 300;
  private static readonly USDC_DECIMALS = 6;

  private signer?: Signer;
  private currentChainId: number;
  private marketplaceWrappers: Map<number, JobMarketplaceWrapper>;
  private initialized = false;

  constructor(signer?: Signer, chainId?: number) {
    if (!chainId) {
      chainId = ChainId.BASE_SEPOLIA; // Default to Base Sepolia
    }

    if (!ChainRegistry.isChainSupported(chainId)) {
      throw new UnsupportedChainError(chainId, ChainRegistry.getSupportedChains());
    }

    this.currentChainId = chainId;
    this.marketplaceWrappers = new Map();

    // If signer provided, initialize immediately
    if (signer) {
      this.signer = signer;
      this.initialized = true;
      this.initializeWrapper(chainId);
    }
  }

  /**
   * Initialize with signer (for backward compatibility)
   */
  async initialize(signer: Signer): Promise<void> {
    this.signer = signer;
    this.initialized = true;
    this.initializeWrapper(this.currentChainId);
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  private initializeWrapper(chainId: number): void {
    if (!this.signer) {
      throw new Error('Signer not initialized');
    }

    if (!this.marketplaceWrappers.has(chainId)) {
      const wrapper = new JobMarketplaceWrapper(chainId, this.signer!);
      this.marketplaceWrappers.set(chainId, wrapper);
    }
  }

  private getWrapper(chainId?: number): JobMarketplaceWrapper {
    const targetChain = chainId || this.currentChainId;

    if (!this.marketplaceWrappers.has(targetChain)) {
      this.initializeWrapper(targetChain);
    }

    return this.marketplaceWrappers.get(targetChain)!;
  }

  /**
   * Get current chain ID
   */
  getCurrentChainId(): number {
    return this.currentChainId;
  }

  /**
   * Switch to a different chain
   */
  async switchChain(chainId: number): Promise<void> {
    if (!ChainRegistry.isChainSupported(chainId)) {
      throw new UnsupportedChainError(chainId, ChainRegistry.getSupportedChains());
    }

    this.currentChainId = chainId;

    // Initialize wrapper for new chain if needed
    if (this.signer && !this.marketplaceWrappers.has(chainId)) {
      this.initializeWrapper(chainId);
    }
  }

  /**
   * Get chain configuration
   */
  getChainConfig(chainId?: number): ChainConfig {
    const targetChain = chainId || this.currentChainId;
    return ChainRegistry.getChain(targetChain);
  }

  // Deposit Management Methods

  /**
   * Deposit native token (ETH/BNB)
   */
  async depositNative(amount: string, chainId?: number): Promise<TransactionResult> {
    const wrapper = this.getWrapper(chainId);
    const tx = await wrapper.depositNative(amount);
    await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      chainId: wrapper.getChainId()
    };
  }

  /**
   * Withdraw native token
   */
  async withdrawNative(amount: string, chainId?: number): Promise<TransactionResult> {
    const wrapper = this.getWrapper(chainId);
    const tx = await wrapper.withdrawNative(amount);
    await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      chainId: wrapper.getChainId()
    };
  }

  /**
   * Deposit ERC20 token
   */
  async depositToken(token: string, amount: string, chainId?: number): Promise<TransactionResult> {
    const wrapper = this.getWrapper(chainId);
    const tx = await wrapper.depositToken(token, amount);
    await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      chainId: wrapper.getChainId()
    };
  }

  /**
   * Withdraw ERC20 token
   */
  async withdrawToken(token: string, amount: string, chainId?: number): Promise<TransactionResult> {
    const wrapper = this.getWrapper(chainId);
    const tx = await wrapper.withdrawToken(token, amount);
    await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      chainId: wrapper.getChainId()
    };
  }

  /**
   * Get deposit balance
   */
  async getDepositBalance(chainId?: number): Promise<DepositBalances> {
    const wrapper = this.getWrapper(chainId);
    if (!this.signer) {
      throw new Error('Signer not initialized');
    }
    const address = await this.signer.getAddress();
    const nativeBalance = await wrapper.getDepositBalance(address);

    return {
      native: nativeBalance
    };
  }

  /**
   * Get deposit balances for multiple tokens
   */
  async getDepositBalances(tokens: string[], chainId?: number): Promise<DepositBalances> {
    const wrapper = this.getWrapper(chainId);
    if (!this.signer) {
      throw new Error('Signer not initialized');
    }
    const address = await this.signer.getAddress();

    const nativeBalance = await wrapper.getDepositBalance(address);
    const tokenBalances: { [address: string]: string } = {};

    for (const token of tokens) {
      tokenBalances[token] = await wrapper.getDepositBalance(address, token);
    }

    return {
      native: nativeBalance,
      tokens: tokenBalances
    };
  }

  // Session Job Methods

  /**
   * Create session job with multi-chain support
   */
  async createSessionJob(params: SessionJobParams): Promise<number> {
    // Validate host address
    if (!ethers.isAddress(params.host)) {
      throw new Error('Invalid address: ' + params.host);
    }

    // Verify chain if specified
    if (params.chainId && this.signer) {
      const provider = this.signer.provider;
      if (provider) {
        const network = await provider.getNetwork();
        const currentChain = Number(network.chainId);
        if (currentChain !== params.chainId) {
          throw new ChainMismatchError(params.chainId, currentChain, 'createSessionJob');
        }
      }
    }

    const wrapper = this.getWrapper(params.chainId);

    // Set defaults
    const pricePerToken = params.pricePerToken || PaymentManager.DEFAULT_PRICE_PER_TOKEN;
    const duration = params.duration || PaymentManager.DEFAULT_DURATION;
    const proofInterval = params.proofInterval || PaymentManager.DEFAULT_PROOF_INTERVAL;

    console.log('[PaymentManager] createSessionJob params:', {
      host: params.host,
      amount: params.amount,
      pricePerToken: pricePerToken,
      duration: duration,
      proofInterval: proofInterval,
      paymentToken: params.paymentToken,
      useDeposit: params.useDeposit
    });

    // Create from deposit or direct payment
    if (params.useDeposit) {
      // Create session from pre-funded deposit
      return await wrapper.createSessionFromDeposit({
        host: params.host,
        paymentToken: params.paymentToken || ethers.ZeroAddress,
        deposit: params.amount,
        pricePerToken,
        duration,
        proofInterval
      });
    } else {
      // Create session with direct payment
      return await wrapper.createSessionJob({
        host: params.host,
        pricePerToken,
        duration,
        proofInterval,
        paymentAmount: params.amount,
        paymentToken: params.paymentToken || ethers.ZeroAddress
      });
    }
  }

  /**
   * Complete session job
   */
  async completeSessionJob(jobId: number, conversationCID: string, chainId?: number): Promise<TransactionResult> {
    const wrapper = this.getWrapper(chainId);
    const tx = await wrapper.completeSessionJob(jobId, conversationCID);
    await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      chainId: wrapper.getChainId()
    };
  }

  /**
   * Complete session (alias for completeSessionJob for compatibility)
   */
  async completeSession(jobId: number, conversationCID: string, chainId?: number): Promise<TransactionResult> {
    return this.completeSessionJob(jobId, conversationCID, chainId);
  }

  /**
   * Get session job details
   */
  async getSessionJob(jobId: number, chainId?: number): Promise<any> {
    const wrapper = this.getWrapper(chainId);
    return await wrapper.getSessionJob(jobId);
  }

  /**
   * Get user sessions (stub for full implementation)
   */
  async getUserSessions(chainId?: number): Promise<any[]> {
    // This would query events or contract state for user's sessions
    // For now, return empty array
    return [];
  }

  /**
   * Get host sessions (stub for full implementation)
   */
  async getHostSessions(host: string, chainId?: number): Promise<any[]> {
    // This would query events or contract state for host's sessions
    // For now, return empty array
    return [];
  }

  // Legacy IPaymentManager interface implementation

  async createJob(request: JobCreationRequest): Promise<JobResult> {
    // Convert to new session job
    const jobId = await this.createSessionJob({
      host: request.hostAddress || '',
      amount: request.paymentAmount.toString(),
      pricePerToken: PaymentManager.DEFAULT_PRICE_PER_TOKEN,
      duration: PaymentManager.DEFAULT_DURATION
    });

    return {
      jobId: jobId.toString(),
      success: true,
      transactionHash: '',
      timestamp: Date.now()
    };
  }

  async processPayment(jobId: string, options: PaymentOptions): Promise<TransactionResult> {
    // Legacy method - convert to completion
    return await this.completeSessionJob(Number(jobId), '', this.currentChainId);
  }

  async getBalance(): Promise<{ eth: string; usdc: string }> {
    const balances = await this.getDepositBalance();
    const chain = this.getChainConfig();

    const usdcBalance = await this.getWrapper().getDepositBalance(
      await this.signer!.getAddress(),
      chain.contracts.usdcToken
    );

    return {
      eth: balances.native,
      usdc: usdcBalance
    };
  }

  async approveUSDC(amount: string): Promise<TransactionResult> {
    // Approval handled differently in deposit pattern
    return {
      success: true,
      transactionHash: '',
      chainId: this.currentChainId
    };
  }

  getSupportedPaymentMethods(): PaymentMethod[] {
    return ['ETH', 'USDC'];
  }

  async validatePaymentAmount(amount: string, method: PaymentMethod): Promise<boolean> {
    const chain = this.getChainConfig();
    const minDeposit = parseFloat(chain.minDeposit);
    const requestedAmount = parseFloat(amount);

    return requestedAmount >= minDeposit;
  }

  /**
   * Get ERC20 token balance for an address
   * @param address - Address to check balance for
   * @param tokenAddress - ERC20 token contract address
   * @returns Token balance as bigint (in token's smallest unit)
   */
  async getTokenBalance(address: string, tokenAddress: string): Promise<bigint> {
    if (!this.signer) {
      throw new SDKError('PaymentManager not initialized', 'NOT_INITIALIZED');
    }

    const provider = this.signer.provider;
    if (!provider) {
      throw new SDKError('No provider available', 'NO_PROVIDER');
    }

    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );

    const balance = await tokenContract.balanceOf(address);
    return balance;
  }

  /**
   * Get native token (ETH/BNB) balance for an address
   * @param address - Address to check balance for
   * @returns Native balance as bigint (in wei)
   */
  async getNativeBalance(address: string): Promise<bigint> {
    if (!this.signer) {
      throw new SDKError('PaymentManager not initialized', 'NOT_INITIALIZED');
    }

    const provider = this.signer.provider;
    if (!provider) {
      throw new SDKError('No provider available', 'NO_PROVIDER');
    }

    const balance = await provider.getBalance(address);
    return balance;
  }

  /**
   * Check ERC20 token allowance
   * @param owner - Token owner address
   * @param spender - Spender address (e.g., JobMarketplace)
   * @param tokenAddress - ERC20 token contract address
   * @returns Allowance amount as bigint (in token's smallest unit)
   */
  async checkAllowance(
    owner: string,
    spender: string,
    tokenAddress: string
  ): Promise<bigint> {
    if (!this.signer) {
      throw new SDKError('PaymentManager not initialized', 'NOT_INITIALIZED');
    }

    const provider = this.signer.provider;
    if (!provider) {
      throw new SDKError('No provider available', 'NO_PROVIDER');
    }

    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      provider
    );

    const allowance = await tokenContract.allowance(owner, spender);
    return allowance;
  }

  /**
   * Approve ERC20 token spending
   * @param spender - Spender address (e.g., JobMarketplace)
   * @param amount - Amount to approve (in token's smallest unit)
   * @param tokenAddress - ERC20 token contract address
   * @returns Transaction receipt
   */
  async approveToken(
    spender: string,
    amount: bigint,
    tokenAddress: string
  ): Promise<ethers.TransactionReceipt> {
    if (!this.signer) {
      throw new SDKError('PaymentManager not initialized', 'NOT_INITIALIZED');
    }

    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function approve(address spender, uint256 amount) returns (bool)'],
      this.signer
    );

    const tx = await tokenContract.approve(spender, amount);
    const receipt = await tx.wait();

    if (!receipt) {
      throw new SDKError('Transaction failed - no receipt', 'TX_FAILED');
    }

    return receipt;
  }

  /**
   * Send ERC20 tokens to another address
   * @param to - Recipient address
   * @param amount - Amount to send as bigint (in token's smallest unit)
   * @param tokenAddress - ERC20 token contract address
   * @returns Transaction receipt
   */
  async sendToken(
    to: string,
    amount: bigint,
    tokenAddress: string
  ): Promise<ethers.TransactionReceipt> {
    if (!this.signer) {
      throw new SDKError('PaymentManager not initialized', 'NOT_INITIALIZED');
    }

    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      this.signer
    );

    const tx = await tokenContract.transfer(to, amount);
    const receipt = await tx.wait();

    if (!receipt) {
      throw new SDKError('Transaction failed - no receipt', 'TX_FAILED');
    }

    return receipt;
  }
}