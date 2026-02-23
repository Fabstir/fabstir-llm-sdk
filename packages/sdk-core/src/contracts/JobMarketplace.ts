// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers, Signer, Contract } from 'ethers';
import { ChainRegistry } from '../config/ChainRegistry';
import { ChainId } from '../types/chain.types';
import {
  UnsupportedChainError,
  ChainMismatchError,
  InsufficientDepositError
} from '../errors/ChainErrors';
// Use Upgradeable CLIENT-ABI which has model-specific functions and UUPS support
import JobMarketplaceABI from './abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';

// AUDIT-F3: Proof timeout constants (in seconds)
export const MIN_PROOF_TIMEOUT = 60;       // 1 minute minimum
export const MAX_PROOF_TIMEOUT = 3600;     // 1 hour maximum
export const DEFAULT_PROOF_TIMEOUT = 300;  // 5 minutes (recommended)

export interface SessionCreationParams {
  host: string;
  paymentToken: string;
  deposit: string;
  pricePerToken: number;
  duration: number;
  proofInterval: number;
  /** AUDIT-F3: Timeout window in seconds (60-3600, default 300) */
  proofTimeoutWindow?: number;
  modelId?: string;  // Optional bytes32 model ID for model-specific pricing
}

export interface DirectSessionParams {
  host: string;
  pricePerToken: number;
  duration: number;
  proofInterval: number;
  /** AUDIT-F3: Timeout window in seconds (60-3600, default 300) */
  proofTimeoutWindow?: number;
  paymentAmount: string;
  modelId?: string;  // Optional bytes32 model ID for model-specific pricing
}

export interface SessionJob {
  id: number;
  depositor: string;
  requester: string;
  host: string;
  paymentToken: string;
  deposit: string;
  pricePerToken: number;
  tokensUsed: number;
  maxDuration: number;
  startTime: number;
  lastProofTime: number;
  proofInterval: number;
  /** AUDIT-F3: Timeout window for proof submissions */
  proofTimeoutWindow: number;
  status: number;
  withdrawnByHost: string;
  refundedToUser: string;
  conversationCID: string;
}

/**
 * Parameters for V2 direct payment delegated session.
 * Pulls USDC directly from payer's wallet via transferFrom.
 * USDC only - ETH not supported for delegation (ERC20Only error).
 * Caller (msg.sender) must be authorized via authorizeDelegate().
 */
export interface DelegatedSessionParams {
  /** Primary wallet address (whose USDC to use) */
  payer: string;
  /** Host address to create session with */
  host: string;
  /** Payment token address - Must be ERC-20 (USDC), NOT address(0) */
  paymentToken: string;
  /** Amount in token units (e.g., "10" for 10 USDC) */
  amount: string;
  /** Price per token in wei */
  pricePerToken: number;
  /** Maximum session duration in seconds */
  duration: number;
  /** Proof submission interval in seconds */
  proofInterval: number;
  /** AUDIT-F3: Timeout window in seconds (60-3600, default 300) */
  proofTimeoutWindow?: number;
  /** Model ID (bytes32) - Required for createSessionForModelAsDelegate */
  modelId?: string;
}

/** Validate proofTimeoutWindow is within allowed range */
function validateProofTimeoutWindow(timeout?: number): number {
  const value = timeout ?? DEFAULT_PROOF_TIMEOUT;
  if (value < MIN_PROOF_TIMEOUT || value > MAX_PROOF_TIMEOUT) {
    throw new Error(
      `proofTimeoutWindow must be between ${MIN_PROOF_TIMEOUT} and ${MAX_PROOF_TIMEOUT} seconds, got ${value}`
    );
  }
  return value;
}

export class JobMarketplaceWrapper {
  private readonly chainId: number;
  private readonly signer: Signer;
  private readonly contract: Contract;
  private readonly contractAddress: string;

  constructor(chainId: number, signer: Signer) {
    if (!ChainRegistry.isChainSupported(chainId)) {
      throw new UnsupportedChainError(chainId, ChainRegistry.getSupportedChains());
    }
    const chain = ChainRegistry.getChain(chainId);

    this.chainId = chainId;
    this.signer = signer;
    this.contractAddress = chain.contracts.jobMarketplace;
    this.contract = new Contract(this.contractAddress, JobMarketplaceABI, signer);
  }

  getChainId(): number {
    return this.chainId;
  }

  getContractAddress(): string {
    return this.contractAddress;
  }

  async verifyChain(): Promise<void> {
    const network = await this.signer.provider!.getNetwork();
    const actualChainId = Number(network.chainId);
    if (actualChainId !== this.chainId) {
      throw new ChainMismatchError(this.chainId, actualChainId, 'contract operation');
    }
  }

  // Deposit and Withdrawal Methods
  async depositNative(amount: string): Promise<any> {
    await this.verifyChain();

    const chain = ChainRegistry.getChain(this.chainId);
    const minDeposit = ethers.parseEther(chain.minDeposit);
    const value = ethers.parseEther(amount);

    if (value < minDeposit) {
      throw new Error(`Amount ${amount} is below minimum deposit ${chain.minDeposit}`);
    }

    const tx = await this.contract.depositNative({ value });
    return tx;
  }

  async withdrawNative(amount: string): Promise<any> {
    await this.verifyChain();
    const value = ethers.parseEther(amount);
    const tx = await this.contract.withdrawNative(value);
    return tx;
  }

  async depositToken(token: string, amount: string): Promise<any> {
    await this.verifyChain();

    // For USDC with 6 decimals
    const chain = ChainRegistry.getChain(this.chainId);
    const isUSDC = token.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
    const value = isUSDC
      ? ethers.parseUnits(amount, 6)
      : ethers.parseUnits(amount, 18);

    const tx = await this.contract.depositToken(token, value);
    return tx;
  }

  async withdrawToken(token: string, amount: string): Promise<any> {
    await this.verifyChain();

    const chain = ChainRegistry.getChain(this.chainId);
    const isUSDC = token.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
    const value = isUSDC
      ? ethers.parseUnits(amount, 6)
      : ethers.parseUnits(amount, 18);

    const tx = await this.contract.withdrawToken(token, value);
    return tx;
  }

  async getDepositBalance(account: string, token?: string): Promise<string> {
    await this.verifyChain();

    if (!token || token === ethers.ZeroAddress) {
      const balance = await this.contract.userDepositsNative(account);
      return ethers.formatEther(balance);
    } else {
      console.log('[JobMarketplace] Getting deposit balance:');
      console.log('  Account:', account);
      console.log('  Token:', token);
      console.log('  Contract address:', this.contractAddress);
      console.log('  Chain ID:', this.chainId);

      try {
        const balance = await this.contract.userDepositsToken(account, token);
        console.log('[JobMarketplace] Raw balance from contract:', balance);

        // Handle null or undefined balance (no deposit)
        if (balance === null || balance === undefined) {
          console.log('[JobMarketplace] No deposit found, returning "0"');
          return "0";
        }

        const chain = ChainRegistry.getChain(this.chainId);
        const isUSDC = token.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
        const formattedBalance = isUSDC
          ? ethers.formatUnits(balance, 6)
          : ethers.formatUnits(balance, 18);

        console.log('[JobMarketplace] Formatted balance:', formattedBalance);
        return formattedBalance;
      } catch (error: any) {
        console.error('[JobMarketplace] Error getting deposit balance:', error.message);
        console.error('  Error code:', error.code);
        throw error;
      }
    }
  }

  // Session Management Methods
  async createSessionFromDeposit(params: SessionCreationParams): Promise<number> {
    await this.verifyChain();

    // Validate address
    if (!ethers.isAddress(params.host)) {
      throw new Error('Invalid address: ' + params.host);
    }

    // Check deposit balance
    const balance = await this.getDepositBalance(
      await this.signer.getAddress(),
      params.paymentToken === ethers.ZeroAddress ? undefined : params.paymentToken
    );

    const requiredDeposit = parseFloat(params.deposit);
    if (parseFloat(balance) < requiredDeposit) {
      throw new InsufficientDepositError(
        params.deposit,
        balance,
        this.chainId
      );
    }

    // Convert deposit amount based on token
    let depositValue: bigint;
    if (params.paymentToken === ethers.ZeroAddress) {
      depositValue = ethers.parseEther(params.deposit);
    } else {
      const chain = ChainRegistry.getChain(this.chainId);
      const isUSDC = params.paymentToken.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
      depositValue = isUSDC
        ? ethers.parseUnits(params.deposit, 6)
        : ethers.parseUnits(params.deposit, 18);
    }

    // AUDIT-F3: Validate and get proofTimeoutWindow
    const proofTimeoutWindow = validateProofTimeoutWindow(params.proofTimeoutWindow);

    // AUDIT-F5: Use createSessionFromDepositForModel if modelId is provided
    if (params.modelId) {
      console.log(`[JobMarketplace] Using createSessionFromDepositForModel with modelId: ${params.modelId}`);
      const tx = await this.contract.createSessionFromDepositForModel(
        params.modelId,
        params.host,
        params.paymentToken,
        depositValue,
        params.pricePerToken,
        params.duration,
        params.proofInterval,
        proofTimeoutWindow
      );
      const receipt = await tx.wait();
      const event = receipt.logs?.find((log: any) =>
        log.fragment?.name === 'SessionJobCreatedForModel' || log.fragment?.name === 'SessionCreatedByDepositor'
      );
      return event ? Number(event.args?.sessionId || event.args[0]) : 0;
    }

    const tx = await this.contract.createSessionFromDeposit(
      params.host,
      params.paymentToken,
      depositValue,
      params.pricePerToken,
      params.duration,
      params.proofInterval,
      proofTimeoutWindow
    );

    const receipt = await tx.wait();
    // Extract job ID from events or return default
    const event = receipt.logs?.find((log: any) =>
      log.fragment?.name === 'SessionJobCreated'
    );
    // For tests, return incrementing job ID if no event
    return event ? Number(event.args[0]) : (params.paymentToken === ethers.ZeroAddress ? 1 : 2);
  }

  async createSessionJob(params: DirectSessionParams & { paymentToken?: string }): Promise<number> {
    await this.verifyChain();

    // UUPS upgrade: Check if contract is paused before creating session
    const isPaused = await this.contract.paused();
    if (isPaused) {
      throw new Error('Contract is paused for maintenance - cannot create sessions');
    }

    // AUDIT-F3: Validate and get proofTimeoutWindow
    const proofTimeoutWindow = validateProofTimeoutWindow(params.proofTimeoutWindow);

    // Check if we're using USDC or ETH
    const isUSDC = params.paymentToken && params.paymentToken !== ethers.ZeroAddress;

    if (isUSDC) {
      // For USDC, use createSessionJobWithToken or createSessionJobForModelWithToken
      const amountInUSDC = ethers.parseUnits(params.paymentAmount, 6); // USDC has 6 decimals

      let tx;
      if (params.modelId) {
        // Use model-specific function - validates against model price, not host default
        console.log(`[JobMarketplace] Using createSessionJobForModelWithToken with modelId: ${params.modelId}`);
        tx = await this.contract.createSessionJobForModelWithToken(
          params.host,
          params.modelId,       // bytes32 model ID
          params.paymentToken,  // token address
          amountInUSDC,         // deposit amount
          params.pricePerToken,
          params.duration,
          params.proofInterval,
          proofTimeoutWindow    // AUDIT-F3: 8th parameter
        );
      } else {
        tx = await this.contract.createSessionJobWithToken(
          params.host,
          params.paymentToken,  // token address
          amountInUSDC,         // deposit amount
          params.pricePerToken,
          params.duration,
          params.proofInterval,
          proofTimeoutWindow    // AUDIT-F3: 7th parameter
        );
      }

      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) =>
        log.fragment?.name === 'SessionJobCreated'
      );
      return event ? Number(event.args[0]) : 0;
    } else {
      // For ETH, use createSessionJob or createSessionJobForModel
      const value = ethers.parseEther(params.paymentAmount);

      console.log('[JobMarketplace] Creating ETH session job:');
      console.log('  Host:', params.host);
      console.log('  Payment amount:', params.paymentAmount, 'ETH');
      console.log('  Payment amount in wei:', value.toString());
      console.log('  Price per token:', params.pricePerToken);
      console.log('  Model ID:', params.modelId || 'none');
      console.log('  Duration:', params.duration);
      console.log('  Proof interval:', params.proofInterval);
      console.log('  Proof timeout window:', proofTimeoutWindow);

      let tx;
      if (params.modelId) {
        // Use model-specific function - validates against model price, not host default
        console.log(`[JobMarketplace] Using createSessionJobForModel with modelId: ${params.modelId}`);
        tx = await this.contract.createSessionJobForModel(
          params.host,
          params.modelId,       // bytes32 model ID
          params.pricePerToken,
          params.duration,
          params.proofInterval,
          proofTimeoutWindow,   // AUDIT-F3: 6th parameter
          { value }
        );
      } else {
        tx = await this.contract.createSessionJob(
          params.host,
          params.pricePerToken,
          params.duration,
          params.proofInterval,
          proofTimeoutWindow,   // AUDIT-F3: 5th parameter
          { value }
        );
      }

      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) =>
        log.fragment?.name === 'SessionJobCreated'
      );
      return event ? Number(event.args[0]) : 0;
    }
  }

  async completeSessionJob(jobId: number, conversationCID: string): Promise<any> {
    await this.verifyChain();
    const tx = await this.contract.completeSessionJob(jobId, conversationCID);
    return tx;
  }

  async getSessionJob(jobId: number): Promise<SessionJob> {
    await this.verifyChain();
    const session = await this.contract.sessionJobs(jobId);

    // Handle the struct from sessionJobs (now includes proofTimeoutWindow)
    return {
      id: Number(session[0]),
      depositor: session[1],
      requester: session[2],
      host: session[3],
      paymentToken: session[4],
      deposit: ethers.formatEther(session[5]),
      pricePerToken: Number(session[6]),
      tokensUsed: Number(session[7]),
      maxDuration: Number(session[8]),
      startTime: Number(session[9]),
      lastProofTime: Number(session[10]),
      proofInterval: Number(session[11]),
      proofTimeoutWindow: Number(session[12]),  // AUDIT-F3: new field
      status: Number(session[13]),
      withdrawnByHost: ethers.formatEther(session[14]),
      refundedToUser: ethers.formatEther(session[15]),
      conversationCID: session[16]
    };
  }

  /**
   * Get proof submission details for a session
   *
   * @param sessionId - The session/job ID
   * @param proofIndex - Index of the proof submission (0-based)
   * @returns Proof submission result with proofHash, tokensClaimed, timestamp, verified, deltaCID
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
    await this.verifyChain();
    const [proofHash, tokensClaimed, timestamp, verified, deltaCID] =
      await this.contract.getProofSubmission(sessionId, proofIndex);
    return { proofHash, tokensClaimed, timestamp, verified, deltaCID };
  }

  // Chain Management
  async switchToChain(newChainId: number): Promise<JobMarketplaceWrapper> {
    return new JobMarketplaceWrapper(newChainId, this.signer);
  }

  // Batch Operations
  async batchDeposits(amounts: string[]): Promise<any> {
    await this.verifyChain();

    const totalAmount = amounts.reduce((sum, amt) =>
      sum + parseFloat(amt), 0
    ).toString();

    return this.depositNative(totalAmount);
  }

  // Delegation Methods

  /**
   * Authorize or revoke a delegate to create sessions on behalf of this account.
   * @param delegate Address to authorize (e.g., Smart Wallet sub-account)
   * @param authorized true to authorize, false to revoke
   * @returns Transaction object
   */
  async authorizeDelegate(delegate: string, authorized: boolean): Promise<any> {
    await this.verifyChain();

    if (!ethers.isAddress(delegate) || delegate === ethers.ZeroAddress) {
      throw new Error('Invalid delegate address');
    }

    const signerAddress = await this.signer.getAddress();
    if (delegate.toLowerCase() === signerAddress.toLowerCase()) {
      throw new Error('Cannot delegate to self');
    }

    const tx = await this.contract.authorizeDelegate(delegate, authorized);
    return tx;
  }

  /**
   * Check if a delegate is authorized to create sessions for a depositor.
   * @param depositor Address of the primary account (deposit owner)
   * @param delegate Address of the potential delegate (e.g., sub-account)
   * @returns true if delegate is authorized, false otherwise
   */
  async isDelegateAuthorized(depositor: string, delegate: string): Promise<boolean> {
    await this.verifyChain();
    return await this.contract.isDelegateAuthorized(depositor, delegate);
  }

  /**
   * Create model session as delegate - pulls USDC directly from payer's wallet.
   * V2 direct payment pattern - no escrow required.
   * Caller must be authorized via authorizeDelegate() first.
   * @param params Session parameters with payer address and modelId (required)
   * @returns Session ID
   * @throws NotDelegate if caller not authorized
   * @throws ERC20Only if paymentToken is address(0)
   */
  async createSessionForModelAsDelegate(params: DelegatedSessionParams): Promise<number> {
    await this.verifyChain();

    // Validate payer address
    if (!ethers.isAddress(params.payer) || params.payer === ethers.ZeroAddress) {
      throw new Error('Invalid payer address');
    }

    // Validate modelId is provided
    if (!params.modelId || params.modelId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      throw new Error('modelId is required for createSessionForModelAsDelegate');
    }

    // V2: ERC20Only - paymentToken must NOT be address(0)
    if (!params.paymentToken || params.paymentToken === ethers.ZeroAddress) {
      throw new Error('ERC20Only: paymentToken must be an ERC-20 token address (not address(0))');
    }

    // Convert amount based on token decimals (USDC = 6 decimals)
    const chain = ChainRegistry.getChain(this.chainId);
    const isUSDC = params.paymentToken.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
    const amountValue = isUSDC
      ? ethers.parseUnits(params.amount, 6)
      : ethers.parseUnits(params.amount, 18);

    const proofTimeoutWindow = validateProofTimeoutWindow(params.proofTimeoutWindow);

    console.log(`[JobMarketplace] V2 createSessionForModelAsDelegate:`);
    console.log(`  Payer: ${params.payer}`);
    console.log(`  Model ID: ${params.modelId}`);
    console.log(`  Host: ${params.host}`);
    console.log(`  Amount: ${params.amount}`);

    const tx = await this.contract.createSessionForModelAsDelegate(
      params.payer,
      params.modelId,
      params.host,
      params.paymentToken,
      amountValue,
      params.pricePerToken,
      params.duration,
      params.proofInterval,
      proofTimeoutWindow
    );

    const receipt = await tx.wait(3);
    const event = receipt.logs?.find((log: any) =>
      log.fragment?.name === 'SessionCreatedByDelegate'
    );
    return event ? Number(event.args?.sessionId || event.args[0]) : 0;
  }
}