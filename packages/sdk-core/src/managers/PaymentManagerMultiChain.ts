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
  PaymentMethod,
  CreateDelegateAuthParams,
  DelegateAuthorizationResult,
  GetDelegateAuthParams,
  DelegateAuthorizationStatus,
  RevokeDelegateParams,
  RevokeDelegateResult
} from '../types';
import { ChainId, ChainConfig } from '../types/chain.types';
import { ChainRegistry } from '../config/ChainRegistry';
import { JobMarketplaceWrapper } from '../contracts/JobMarketplace';
import { DELEGATION_ERRORS } from '../types/errors';
import {
  UnsupportedChainError,
  ChainMismatchError,
  InsufficientDepositError
} from '../errors/ChainErrors';
import { LLM_PROOF_INTERVAL } from '../config/llm-config';

export interface SessionJobParams {
  host: string;
  amount: string;
  pricePerToken: number;
  duration: number;
  chainId?: number;
  useDeposit?: boolean;
  paymentToken?: string;
  proofInterval?: number;
  /** AUDIT-F3: Timeout window in seconds (60-3600, default 300) */
  proofTimeoutWindow?: number;
  modelId?: string;  // Optional bytes32 model ID for model-specific pricing
}

export interface DepositBalances {
  native: string;
  tokens?: { [address: string]: string };
}

export class PaymentManager implements IPaymentManager {
  static readonly MIN_ETH_PAYMENT = '0.0001'; // UUPS upgrade - reduced minimum
  static readonly TOKENS_PER_PROOF = 100;
  // NO DEFAULT PRICE - must be explicitly set from host's registered price
  static readonly DEFAULT_DURATION = 3600;
  private static readonly USDC_DECIMALS = 6;

  private signer?: Signer;
  private currentChainId: number;
  private marketplaceWrappers: Map<number, JobMarketplaceWrapper>;
  private initialized = false;
  /** Set in delegate-pays mode: the payer (owner) whose USDC funds sessions. */
  private delegatePayer?: string;

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

  /**
   * Get proof submission details for checkpoint recovery.
   *
   * @param sessionId - The session/job ID
   * @param proofIndex - Index of the proof submission (0-based)
   * @returns Proof submission details including proofHash, tokensClaimed, timestamp, verified, deltaCID
   */
  async getProofSubmission(
    sessionId: bigint,
    proofIndex: number
  ): Promise<{
    proofHash: string;
    tokensClaimed: bigint;
    timestamp: bigint;
    verified: boolean;
    deltaCID: string;  // Added in AUDIT remediation
  }> {
    const wrapper = this.getWrapper(this.currentChainId);
    return wrapper.getProofSubmission(sessionId, proofIndex);
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

    // Price MUST be explicitly set - no fallback to arbitrary defaults
    if (!params.pricePerToken || params.pricePerToken <= 0) {
      throw new SDKError(
        'pricePerToken is required and must be positive. Use host.pricePerToken from the registered host.',
        'MISSING_PRICE'
      );
    }
    const pricePerToken = params.pricePerToken;
    const duration = params.duration || PaymentManager.DEFAULT_DURATION;
    const proofInterval = params.proofInterval || LLM_PROOF_INTERVAL;

    console.log('[PaymentManager] createSessionJob params:', {
      host: params.host,
      amount: params.amount,
      pricePerToken: pricePerToken,
      duration: duration,
      proofInterval: proofInterval,
      proofTimeoutWindow: params.proofTimeoutWindow,
      paymentToken: params.paymentToken,
      useDeposit: params.useDeposit
    });

    // Delegate-pays branch (2.1): payer-funded USDC session via the V2 delegation
    // contract. USDC-only; all pre-flight checks run BEFORE any chain write.
    if (this.delegatePayer) {
      const paymentToken = params.paymentToken;
      if (!paymentToken || paymentToken === ethers.ZeroAddress) {
        throw new SDKError(
          'Delegated sessions are USDC-only: a non-zero ERC-20 paymentToken is required',
          'DELEGATE_USDC_REQUIRED'
        );
      }
      if (!this.signer) {
        throw new SDKError('PaymentManager not initialized', 'NOT_INITIALIZED');
      }
      const delegateAddr = await this.signer.getAddress();
      const chain = this.getChainConfig(params.chainId);
      const isUSDC = paymentToken.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
      const amountBase = ethers.parseUnits(params.amount, isUSDC ? 6 : 18);

      if (!(await wrapper.isDelegateAuthorized(this.delegatePayer, delegateAddr))) {
        throw new SDKError(
          `Delegate ${delegateAddr} is not authorized by payer ${this.delegatePayer}`,
          'DELEGATE_NOT_AUTHORIZED'
        );
      }
      const remaining = await this.checkAllowance(this.delegatePayer, chain.contracts.jobMarketplace, paymentToken);
      if (remaining < amountBase) {
        throw new SDKError(
          `Delegate allowance insufficient: remaining ${remaining}, needed ${amountBase}`,
          'DELEGATE_ALLOWANCE_INSUFFICIENT',
          { remaining: remaining.toString(), needed: amountBase.toString() }
        );
      }
      const balance = await this.getTokenBalance(this.delegatePayer, paymentToken);
      if (balance < amountBase) {
        throw new SDKError(
          `Payer USDC balance insufficient: balance ${balance}, needed ${amountBase}`,
          'DELEGATE_BALANCE_INSUFFICIENT',
          { balance: balance.toString(), needed: amountBase.toString() }
        );
      }
      try {
        return await wrapper.createSessionForModelAsDelegate({
          payer: this.delegatePayer, modelId: params.modelId!, host: params.host,
          paymentToken, amount: params.amount, pricePerToken, duration,
          proofInterval, proofTimeoutWindow: params.proofTimeoutWindow,
        });
      } catch (e: any) {
        const m = e?.message || '';
        if (m.includes(DELEGATION_ERRORS.NOT_DELEGATE)) throw new SDKError(m, 'DELEGATE_NOT_AUTHORIZED');
        if (m.includes(DELEGATION_ERRORS.ERC20_ONLY)) throw new SDKError(m, 'DELEGATE_USDC_REQUIRED');
        if (m.includes(DELEGATION_ERRORS.BAD_PARAMS)) throw new SDKError(m, 'DELEGATE_BAD_PARAMS');
        throw e;
      }
    }

    // Create from deposit or direct payment
    if (params.useDeposit) {
      // Create session from pre-funded deposit
      // AUDIT-F5: Now supports model-specific pricing via createSessionFromDepositForModel
      return await wrapper.createSessionFromDeposit({
        host: params.host,
        paymentToken: params.paymentToken || ethers.ZeroAddress,
        deposit: params.amount,
        pricePerToken,
        duration,
        proofInterval,
        proofTimeoutWindow: params.proofTimeoutWindow,  // AUDIT-F3
        modelId: params.modelId
      });
    } else {
      // Create session with direct payment - supports model-specific pricing
      return await wrapper.createSessionJob({
        host: params.host,
        pricePerToken,
        duration,
        proofInterval,
        proofTimeoutWindow: params.proofTimeoutWindow,  // AUDIT-F3
        paymentAmount: params.amount,
        paymentToken: params.paymentToken || ethers.ZeroAddress,
        modelId: params.modelId  // Uses createSessionJobForModel when set
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
    throw new SDKError(
      'createJob() is deprecated. Use createSessionJob() with explicit pricePerToken from host registration.',
      'DEPRECATED_METHOD'
    );
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

  // ============= Delegate Authorization API (Sub-phase 1.1) =============
  // Conveniences over approveToken + JobMarketplaceWrapper.authorizeDelegate.
  // Operate on the bridge-payer (Constraint 10); revoke's approve(0) is isolated.

  /**
   * Authorize a delegate to spend the payer's USDC up to `allowanceCap`:
   * approve(marketplace, cap) THEN authorizeDelegate(delegate, true). USDC-only.
   */
  async createDelegateAuthorization(
    params: CreateDelegateAuthParams
  ): Promise<DelegateAuthorizationResult> {
    const chain = this.getChainConfig(params.chainId);
    const token = params.token ?? chain.contracts.usdcToken;
    if (!token || token === ethers.ZeroAddress) {
      throw new SDKError(
        'Delegated authorization requires a non-zero ERC-20 (USDC) token',
        'DELEGATE_USDC_REQUIRED'
      );
    }
    const approveReceipt = await this.approveToken(
      chain.contracts.jobMarketplace,
      params.allowanceCap,
      token
    );
    const authTx = await this.getWrapper(params.chainId).authorizeDelegate(params.delegate, true);
    await authTx.wait(3);
    return { approveTxHash: approveReceipt.hash, authorizeTxHash: authTx.hash };
  }

  /**
   * Read whether `delegate` is authorized for `payer` and the live remaining
   * USDC allowance (token base units).
   */
  async getDelegateAuthorization(
    params: GetDelegateAuthParams
  ): Promise<DelegateAuthorizationStatus> {
    const chain = this.getChainConfig(params.chainId);
    const token = params.token ?? chain.contracts.usdcToken;
    // Two independent reads — run them concurrently.
    const [authorized, remaining] = await Promise.all([
      this.getWrapper(params.chainId).isDelegateAuthorized(params.payer, params.delegate),
      this.checkAllowance(params.payer, chain.contracts.jobMarketplace, token),
    ]);
    return { authorized, remaining };
  }

  /**
   * Revoke a delegate by bundling BOTH on-chain actions so the UI cannot
   * half-revoke: authorizeDelegate(delegate, false) THEN approve(marketplace, 0).
   */
  async revokeDelegate(params: RevokeDelegateParams): Promise<RevokeDelegateResult> {
    const chain = this.getChainConfig(params.chainId);
    const token = params.token ?? chain.contracts.usdcToken;
    const revokeTx = await this.getWrapper(params.chainId).authorizeDelegate(params.delegate, false);
    await revokeTx.wait(3);
    try {
      const approveReceipt = await this.approveToken(chain.contracts.jobMarketplace, 0n, token);
      return { revokeTxHash: revokeTx.hash, approveTxHash: approveReceipt.hash };
    } catch (e) {
      throw new SDKError(
        'Delegate revoke incomplete: allowance not zeroed after deauthorization',
        'DELEGATE_REVOKE_INCOMPLETE',
        { revokeTxHash: revokeTx.hash, cause: (e as Error)?.message }
      );
    }
  }

  /** Enter delegate-pays mode: record the payer (owner) funding sessions (1.2). */
  setDelegatePayer(payer: string): void {
    this.delegatePayer = payer;
  }

  /** The payer set in delegate-pays mode, or undefined when self-funded. */
  getDelegatePayer(): string | undefined {
    return this.delegatePayer;
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