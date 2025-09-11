/**
 * Session Job Manager for browser-compatible USDC payment flows
 * Based on the working base-usdc-mvp-flow.test.tsx implementation
 */

import { ethers, Contract, Signer } from 'ethers';
import { ContractManager } from './ContractManager';
import { TransactionHelper } from './TransactionHelper';

export interface SessionConfig {
  depositAmount: string; // e.g., '2' for $2 USDC
  pricePerToken: number; // e.g., 2000 for 0.002 USDC per token
  proofInterval: number; // e.g., 100 tokens
  duration: number; // in seconds
  minBalance?: string; // minimum balance to maintain
}

export interface SessionJobParams {
  model: string;
  provider: string;
  sessionConfig: SessionConfig;
}

export interface SessionResult {
  sessionId: bigint;
  jobId: bigint;
  txHash: string;
  depositAmount: bigint;
}

export class SessionJobManager {
  private contractManager: ContractManager;
  private signer?: Signer;
  
  constructor(contractManager: ContractManager) {
    this.contractManager = contractManager;
  }

  /**
   * Set signer for transactions
   */
  async setSigner(signer: Signer) {
    this.signer = signer;
    await this.contractManager.setSigner(signer);
  }

  /**
   * Create a session job with USDC payment
   */
  async createSessionJob(params: SessionJobParams): Promise<SessionResult> {
    if (!this.signer) {
      throw new Error('Signer not set. Call setSigner() first.');
    }

    const jobMarketplace = this.contractManager.getJobMarketplace();
    const usdcToken = this.contractManager.getUsdcToken();
    
    // Convert deposit amount to token units (USDC has 6 decimals)
    const depositAmount = ethers.parseUnits(params.sessionConfig.depositAmount, 6);
    
    // Check USDC balance
    const userAddress = await this.signer.getAddress();
    const balance = await usdcToken.balanceOf(userAddress) as bigint;
    
    if (balance < depositAmount) {
      throw new Error(
        `Insufficient USDC balance. Required: ${params.sessionConfig.depositAmount}, ` +
        `Available: ${ethers.formatUnits(balance, 6)}`
      );
    }

    // Approve USDC spending
    const currentAllowance = await usdcToken.allowance(
      userAddress,
      await jobMarketplace.getAddress()
    ) as bigint;
    
    if (currentAllowance < depositAmount) {
      const approveTx = await usdcToken.approve(
        await jobMarketplace.getAddress(),
        depositAmount
      );
      await approveTx.wait();
    }

    // Create session job
    const tx = await jobMarketplace.createSessionJob(
      params.model,
      params.provider,
      depositAmount,
      params.sessionConfig.pricePerToken,
      params.sessionConfig.proofInterval,
      params.sessionConfig.duration
    );

    const receipt = await tx.wait();
    
    // Parse events to get session ID and job ID
    const sessionCreatedEvent = receipt.logs.find(
      (log: any) => log.topics[0] === ethers.id('SessionJobCreated(uint256,uint256,address,string)')
    );
    
    if (!sessionCreatedEvent) {
      throw new Error('SessionJobCreated event not found');
    }

    // Decode event data
    const sessionId = BigInt(sessionCreatedEvent.topics[1]);
    const jobId = BigInt(sessionCreatedEvent.topics[2]);

    return {
      sessionId,
      jobId,
      txHash: receipt.hash,
      depositAmount
    };
  }

  /**
   * Submit checkpoint proof for a session
   */
  async submitCheckpointProof(
    sessionId: bigint,
    checkpoint: number,
    tokensGenerated: number,
    proofData: string
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not set');
    }

    const jobMarketplace = this.contractManager.getJobMarketplace();
    
    const tx = await jobMarketplace.submitCheckpointProof(
      sessionId,
      checkpoint,
      tokensGenerated,
      proofData
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Complete a session job
   */
  async completeSessionJob(
    sessionId: bigint,
    totalTokensGenerated: number,
    finalProof: string
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not set');
    }

    const jobMarketplace = this.contractManager.getJobMarketplace();
    
    const tx = await jobMarketplace.completeSessionJob(
      sessionId,
      totalTokensGenerated,
      finalProof
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Get session job details
   */
  async getSessionDetails(sessionId: bigint): Promise<{
    jobId: bigint;
    user: string;
    provider: string;
    deposit: bigint;
    tokensUsed: number;
    isActive: boolean;
    startTime: number;
    endTime: number;
  }> {
    const jobMarketplace = this.contractManager.getJobMarketplace();
    const details = await jobMarketplace.sessionJobs(sessionId);
    
    return {
      jobId: details.jobId,
      user: details.user,
      provider: details.provider,
      deposit: details.deposit,
      tokensUsed: details.tokensUsed,
      isActive: details.isActive,
      startTime: Number(details.startTime),
      endTime: Number(details.endTime)
    };
  }

  /**
   * Check USDC balance for an address
   */
  async getUSDCBalance(address: string): Promise<string> {
    const usdcToken = this.contractManager.getUsdcToken();
    const balance = await usdcToken.balanceOf(address) as bigint;
    return ethers.formatUnits(balance, 6); // USDC has 6 decimals
  }

  /**
   * Fund a sub-account from primary account
   */
  async fundSubAccount(
    fromAddress: string,
    toAddress: string,
    amount: string
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not set');
    }

    const usdcToken = this.contractManager.getUsdcToken();
    const amountWei = ethers.parseUnits(amount, 6);
    
    const tx = await usdcToken.transfer(toAddress, amountWei);
    const receipt = await tx.wait();
    
    return receipt.hash;
  }

  /**
   * Calculate required gas for session creation
   */
  async estimateSessionCreationGas(params: SessionJobParams): Promise<bigint> {
    const jobMarketplace = this.contractManager.getJobMarketplace();
    
    // Estimate gas for the transaction
    const gasEstimate = await this.contractManager.estimateGas(
      jobMarketplace,
      'createSessionJob',
      [
        params.model,
        params.provider,
        ethers.parseUnits(params.sessionConfig.depositAmount, 6),
        params.sessionConfig.pricePerToken,
        params.sessionConfig.proofInterval,
        params.sessionConfig.duration
      ]
    );

    // Add 20% buffer
    return (gasEstimate * 120n) / 100n;
  }

  /**
   * Get provider earnings from completed sessions
   */
  async getProviderEarnings(provider: string): Promise<string> {
    const hostEarnings = this.contractManager.getHostEarnings();
    const earnings = await hostEarnings.getAccumulatedEarnings(
      provider,
      await this.contractManager.getUsdcToken().getAddress()
    ) as bigint;
    
    return ethers.formatUnits(earnings, 6);
  }

  /**
   * Withdraw provider earnings
   */
  async withdrawProviderEarnings(tokenAddress: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not set');
    }

    const hostEarnings = this.contractManager.getHostEarnings();
    const tx = await hostEarnings.withdrawEarnings(tokenAddress);
    const receipt = await tx.wait();
    
    return receipt.hash;
  }
}