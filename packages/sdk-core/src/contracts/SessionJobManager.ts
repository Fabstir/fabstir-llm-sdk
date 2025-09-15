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
    const signerAddress = await signer.getAddress();
    console.log(`SessionJobManager.setSigner: Signer address is ${signerAddress}`);
    this.signer = signer;
    // Also ensure ContractManager has the signer
    await this.contractManager.setSigner(signer);
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

    // Create USDC token contract directly with proper ABI and signer
    const ERC20_ABI = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function balanceOf(address account) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)'
    ];

    const usdcAddress = this.contractManager.getUsdcTokenAddress();
    const usdcToken = new ethers.Contract(usdcAddress, ERC20_ABI, this.signer);
    
    // Convert deposit amount to token units (USDC has 6 decimals)
    const depositAmount = ethers.parseUnits(params.sessionConfig.depositAmount, 6);
    
    // Calculate minimum required balance (actual session cost)
    // pricePerToken is in units of 1/1000000 USDC per token
    // proofInterval is the number of tokens per session
    const actualCost = BigInt(params.sessionConfig.pricePerToken) * BigInt(params.sessionConfig.proofInterval);
    const minRequired = actualCost; // This is the actual amount that will be consumed
    
    // Check USDC balance
    const userAddress = await this.signer.getAddress();
    console.log(`SessionJobManager: Checking balance for address: ${userAddress}`);
    console.log(`SessionJobManager: Expected TEST_USER_1: 0xE93150462F96d60901f5132a5f396e3eF4706269`);
    console.log(`SessionJobManager: Signer type: ${this.signer.constructor.name}`);

    // Debug: Check if this might be a sub-account
    if (userAddress.toLowerCase().startsWith('0x999')) {
      console.log(`SessionJobManager: This appears to be a sub-account (starts with 0x999)`);
    }

    // Check if this is the main user account
    if (userAddress.toLowerCase() === '0xe93150462f96d60901f5132a5f396e3ef4706269') {
      console.log(`SessionJobManager: WARNING - Using TEST_USER_1 address, not sub-account!`);
    }

    const balance = await usdcToken.balanceOf(userAddress) as bigint;
    console.log(`SessionJobManager: Balance for ${userAddress}: ${ethers.formatUnits(balance, 6)} USDC`);

    // Check if user has sufficient balance for the requested deposit amount
    if (balance < depositAmount) {
      const errorMsg = `Insufficient USDC balance. Required: ${ethers.formatUnits(depositAmount, 6)} USDC, ` +
        `Available: ${ethers.formatUnits(balance, 6)} USDC. ` +
        `Please top up your USDC balance or reduce the deposit amount.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Also check against minimum required for session
    if (balance < minRequired) {
      const errorMsg = `Insufficient USDC balance for session. Minimum required: ${ethers.formatUnits(minRequired, 6)} USDC, ` +
        `Available: ${ethers.formatUnits(balance, 6)} USDC`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Use the requested deposit amount (we've verified the user has enough)
    const amountToUse = depositAmount;
    console.log(`Using ${ethers.formatUnits(amountToUse, 6)} USDC for session`)

    // Approve USDC spending - get the address from ContractManager directly
    const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
    console.log('JobMarketplace address:', jobMarketplaceAddress);
    console.log('USDC token address:', usdcAddress);
    console.log('User address:', userAddress);

    // Always refresh allowance check right before transaction
    const currentAllowance = await usdcToken.allowance(
      userAddress,
      jobMarketplaceAddress
    ) as bigint;

    console.log('Current USDC allowance:', ethers.formatUnits(currentAllowance, 6));
    console.log('Required deposit:', ethers.formatUnits(depositAmount, 6));

    // Note: Even if allowance shows as sufficient, it might have been consumed
    // by a previous transaction that hasn't been fully processed yet.

    let newAllowance = currentAllowance;

    // Always approve to ensure fresh allowance for each transaction
    // This prevents issues where previous transactions consumed the allowance
    console.log('Setting fresh USDC approval for this transaction...');
    const approveTx = await usdcToken.approve(
      jobMarketplaceAddress,
      amountToUse
    );
    const approveReceipt = await approveTx.wait(3); // Wait for 3 confirmations
    console.log('USDC approval complete:', approveReceipt.hash);

    // Verify the allowance was set - try multiple times with longer waits
    newAllowance = BigInt(0);
    for (let i = 0; i < 5; i++) {
      newAllowance = await usdcToken.allowance(
        userAddress,
        jobMarketplaceAddress
      ) as bigint;
      console.log(`Attempt ${i+1}/5 - New USDC allowance after approval:`, ethers.formatUnits(newAllowance, 6));

      if (newAllowance >= amountToUse) {
        console.log('✅ Allowance confirmed on-chain');
        break;
      }

      // No need for additional waiting - tx.wait(3) ensures confirmations
    }

    if (newAllowance < amountToUse) {
      throw new Error(
        `Approval failed. Required: ${ethers.formatUnits(amountToUse, 6)}, ` +
        `Got: ${ethers.formatUnits(newAllowance, 6)}`
      );
    }

    // Create session job with USDC token (using available balance)
    // Note: Model validation happens in the contract based on the host's registered models
    console.log('Creating session job with params:', {
      provider: params.provider,
      token: usdcAddress,
      deposit: amountToUse.toString(),
      pricePerToken: params.sessionConfig.pricePerToken,
      duration: params.sessionConfig.duration,
      proofInterval: params.sessionConfig.proofInterval
    });

    // Ensure the contract has a signer by connecting it explicitly
    const jobMarketplaceWithSigner = jobMarketplace.connect(this.signer);

    // Log the actual contract address being used
    const actualContractAddress = await jobMarketplaceWithSigner.getAddress();
    console.log('Actual JobMarketplace contract address being used:', actualContractAddress);
    console.log('Expected JobMarketplace address:', jobMarketplaceAddress);

    if (actualContractAddress.toLowerCase() !== jobMarketplaceAddress.toLowerCase()) {
      console.error('WARNING: Contract address mismatch!');
      console.error('Expected:', jobMarketplaceAddress);
      console.error('Actual:', actualContractAddress);
    }

    const tx = await jobMarketplaceWithSigner.createSessionJobWithToken(
      params.provider, // host address
      usdcAddress, // token address (USDC) - use the already obtained address
      amountToUse, // deposit amount (may be less than full $2 if using existing balance)
      params.sessionConfig.pricePerToken, // price per token
      params.sessionConfig.duration, // max duration
      params.sessionConfig.proofInterval // proof interval
    );

    console.log('Transaction sent, waiting for confirmation...');
    const receipt = await tx.wait(3); // Wait for 3 confirmations
    console.log('Transaction confirmed:', receipt.hash);
    
    // Parse events to get job ID (which is also the session ID for session jobs)
    const sessionCreatedEvent = receipt.logs.find(
      (log: any) => log.topics[0] === ethers.id('SessionJobCreated(uint256,address,address,uint256)')
    );

    if (!sessionCreatedEvent) {
      throw new Error('SessionJobCreated event not found');
    }

    // Decode event data - jobId is in topics[1], requester in topics[2], host in topics[3]
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

    // The contract method is submitProofOfWork
    // Correct parameter order: jobId, tokensClaimed, proof
    const tx = await jobMarketplace.submitProofOfWork(
      sessionId,  // jobId
      tokensGenerated,  // tokensClaimed
      proofData  // proof (bytes)
    );

    const receipt = await tx.wait(3); // Wait for 3 confirmations
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
    // submitProofOfWork expects: jobId, tokensClaimed, proof (in that order)
    const tx = await jobMarketplaceAsHost.submitProofOfWork(
      sessionId,  // jobId
      tokensGenerated,  // tokensClaimed
      proofData  // proof (bytes)
    );

    const receipt = await tx.wait(3); // Wait for 3 confirmations
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

    // The contract's completeSessionJob takes jobId and conversationCID
    // We'll pass an empty string for conversationCID if not needed
    const conversationCID = ''; // Optional conversation CID for S5 storage
    const tx = await jobMarketplace.completeSessionJob(sessionId, conversationCID);

    const receipt = await tx.wait(3); // Wait for 3 confirmations
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
    const receipt = await tx.wait(3); // Wait for 3 confirmations

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
    const receipt = await tx.wait(3); // Wait for 3 confirmations

    return receipt.hash;
  }
}