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
    console.log('SessionJobManager.setSigner: Setting signer...');
    this.signer = signer;
    // ContractManager already has the signer, don't call setSigner again
    console.log('SessionJobManager.setSigner: Complete');
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
    
    // Calculate minimum required balance (actual session cost)
    // pricePerToken is in units of 1/1000000 USDC per token
    // proofInterval is the number of tokens per session
    const actualCost = BigInt(params.sessionConfig.pricePerToken) * BigInt(params.sessionConfig.proofInterval);
    const minRequired = actualCost; // This is the actual amount that will be consumed
    
    // Check USDC balance
    const userAddress = await this.signer.getAddress();
    const balance = await usdcToken.balanceOf(userAddress) as bigint;
    
    // For deposit model: only check if we have enough for the actual session cost
    if (balance < minRequired) {
      throw new Error(
        `Insufficient USDC balance for session. Required: ${ethers.formatUnits(minRequired, 6)}, ` +
        `Available: ${ethers.formatUnits(balance, 6)}`
      );
    }
    
    // Use either the full deposit amount or the current balance, whichever is smaller
    const amountToUse = balance < depositAmount ? balance : depositAmount;
    console.log(`Using ${ethers.formatUnits(amountToUse, 6)} USDC for session (balance: ${ethers.formatUnits(balance, 6)})`)

    // Approve USDC spending
    const jobMarketplaceAddress = await jobMarketplace.getAddress();
    console.log('JobMarketplace address:', jobMarketplaceAddress);
    
    const currentAllowance = await usdcToken.allowance(
      userAddress,
      jobMarketplaceAddress
    ) as bigint;
    
    console.log('Current USDC allowance:', ethers.formatUnits(currentAllowance, 6));
    console.log('Required deposit:', ethers.formatUnits(depositAmount, 6));
    
    if (currentAllowance < amountToUse) {
      console.log('Approving USDC spending...');
      const approveTx = await usdcToken.approve(
        jobMarketplaceAddress,
        amountToUse
      );
      const approveReceipt = await approveTx.wait();
      console.log('USDC approval complete:', approveReceipt.hash);
      
      // Wait for blockchain confirmation
      console.log('Waiting for blockchain confirmation...');
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds for blockchain
      
      // Verify the allowance was set
      const newAllowance = await usdcToken.allowance(
        userAddress,
        jobMarketplaceAddress
      ) as bigint;
      console.log('New USDC allowance after approval:', ethers.formatUnits(newAllowance, 6));
      
      if (newAllowance < amountToUse) {
        throw new Error(
          `Approval failed. Required: ${ethers.formatUnits(amountToUse, 6)}, ` +
          `Got: ${ethers.formatUnits(newAllowance, 6)}`
        );
      }
    } else {
      console.log('Sufficient allowance already exists');
    }

    // Create session job with USDC token (using available balance)
    const tx = await jobMarketplace.createSessionJobWithToken(
      params.provider, // host address
      await usdcToken.getAddress(), // token address (USDC)
      amountToUse, // deposit amount (may be less than full $2 if using existing balance)
      params.sessionConfig.pricePerToken, // price per token
      params.sessionConfig.duration, // max duration
      params.sessionConfig.proofInterval // proof interval
    );

    const receipt = await tx.wait();
    
    // Parse events to get job ID (which is also the session ID for session jobs)
    const sessionCreatedEvent = receipt.logs.find(
      (log: any) => log.topics[0] === ethers.id('SessionJobCreatedWithToken(uint256,address,uint256)')
    );
    
    if (!sessionCreatedEvent) {
      throw new Error('SessionJobCreatedWithToken event not found');
    }

    // Decode event data - jobId is in topics[1], token address in topics[2]
    const jobId = BigInt(sessionCreatedEvent.topics[1]);
    const sessionId = jobId; // For session jobs, sessionId equals jobId

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
    
    // The contract method is actually submitProofOfWork
    // It takes: jobId, ekzlProof (bytes), tokensInBatch
    const tx = await jobMarketplace.submitProofOfWork(
      sessionId,  // jobId
      proofData,  // ekzlProof
      tokensGenerated  // tokensInBatch
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Submit checkpoint proof as host (requires host signer)
   */
  async submitCheckpointProofAsHost(
    sessionId: bigint,
    checkpoint: number,
    tokensGenerated: number,
    proofData: string,
    hostSigner: Signer
  ): Promise<string> {
    // Create a new contract instance with host signer
    const jobMarketplaceAddress = await this.contractManager.getJobMarketplace().getAddress();
    const jobMarketplaceAbi = this.contractManager.getJobMarketplace().interface;
    
    const jobMarketplaceAsHost = new Contract(
      jobMarketplaceAddress,
      jobMarketplaceAbi,
      hostSigner
    );
    
    // Submit proof as host
    const tx = await jobMarketplaceAsHost.submitProofOfWork(
      sessionId,  // jobId
      proofData,  // ekzlProof
      tokensGenerated  // tokensInBatch
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
    
    // The contract's completeSessionJob only takes jobId as parameter
    // The totalTokensGenerated and finalProof are not needed for completion
    // The contract automatically settles based on proven tokens from checkpoints
    const tx = await jobMarketplace.completeSessionJob(sessionId);

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