/**
 * Browser-compatible Payment Manager
 * 
 * Handles payment operations for ETH and USDC in browser environments
 * with support for MetaMask, Coinbase Wallet, and other browser wallets.
 */

import { ethers } from 'ethers';
import { IPaymentManager } from '../interfaces';
import {
  SDKError,
  JobCreationRequest,
  JobResult,
  PaymentOptions,
  TransactionResult,
  PaymentMethod
} from '../types';
import { ContractManager } from '../contracts/ContractManager';
import { SessionJobManager, SessionConfig, SessionJobParams } from '../contracts/SessionJobManager';

export class PaymentManager implements IPaymentManager {
  static readonly MIN_ETH_PAYMENT = '0.005';
  static readonly TOKENS_PER_PROOF = 1000;
  static readonly DEFAULT_PRICE_PER_TOKEN = 5000;
  static readonly DEFAULT_DURATION = 3600;
  static readonly DEFAULT_PROOF_INTERVAL = 300;
  private static readonly USDC_DECIMALS = 6;
  
  private contractManager: ContractManager;
  private sessionJobManager: SessionJobManager;
  private signer?: ethers.Signer;
  private initialized = false;

  constructor(
    contractManager: ContractManager,
    sessionJobManager?: SessionJobManager
  ) {
    this.contractManager = contractManager;
    this.sessionJobManager = sessionJobManager || new SessionJobManager(contractManager);
  }

  /**
   * Initialize with signer
   */
  async initialize(signer: ethers.Signer): Promise<void> {
    console.log('PaymentManager.initialize: Setting signer...');
    this.signer = signer;
    // ContractManager already has signer from SDK initialization
    // Just set it on sessionJobManager
    console.log('PaymentManager.initialize: Calling sessionJobManager.setSigner...');
    await this.sessionJobManager.setSigner(signer);
    console.log('PaymentManager.initialize: sessionJobManager.setSigner completed');
    this.initialized = true;
    console.log('PaymentManager.initialize: Initialization complete');
  }

  /**
   * Create a job with payment
   */
  async createJob(request: JobCreationRequest): Promise<JobResult> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const { model, prompt, provider, payment } = request;
      
      switch (payment.method) {
        case 'ETH':
          return await this.createETHJob(model, prompt, provider || '', payment);
        case 'USDC':
          return await this.createUSDCJob(model, prompt, provider || '', payment);
        default:
          throw new SDKError(
            `Unsupported payment method: ${payment.method}`,
            'UNSUPPORTED_PAYMENT_METHOD'
          );
      }
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to create job: ${error.message}`,
        'JOB_CREATION_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Create ETH job
   */
  private async createETHJob(
    model: string,
    prompt: string,
    provider: string,
    payment: PaymentOptions
  ): Promise<JobResult> {
    // Get job marketplace contract through public interface
    const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
    const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');
    const jobMarketplace = new ethers.Contract(
      jobMarketplaceAddress,
      jobMarketplaceABI,
      this.signer!
    );
    
    const tx = await jobMarketplace['createJob'](
      provider,
      model,
      prompt,
      { 
        value: payment.amount,
        gasLimit: 500000n
      }
    );
    
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new SDKError('Transaction failed', 'TRANSACTION_FAILED');
    }
    
    // Parse job ID from events
    let jobId: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const parsed = jobMarketplace.interface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });
        if (parsed && parsed.name === 'JobCreated' && parsed.args['jobId']) {
          jobId = BigInt(parsed.args['jobId'].toString());
          break;
        }
      } catch {}
    }
    
    if (!jobId) {
      throw new SDKError('Could not parse job ID from events', 'EVENT_PARSE_ERROR');
    }
    
    return {
      jobId,
      txHash: receipt.hash,
      status: 'pending'
    };
  }

  /**
   * Create USDC job
   */
  private async createUSDCJob(
    model: string,
    prompt: string,
    provider: string,
    payment: PaymentOptions
  ): Promise<JobResult> {
    if (!payment.tokenAddress) {
      throw new SDKError('Token address required for USDC payment', 'MISSING_TOKEN_ADDRESS');
    }
    
    // First approve USDC
    const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
    await this.approveToken(
      payment.tokenAddress,
      jobMarketplaceAddress,
      payment.amount
    );
    
    // Get job marketplace contract
    const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');
    const jobMarketplace = new ethers.Contract(
      jobMarketplaceAddress,
      jobMarketplaceABI,
      this.signer!
    );
    
    const tx = await jobMarketplace['createJobWithToken'](
      provider,
      model,
      prompt,
      payment.tokenAddress,
      payment.amount,
      { gasLimit: 500000n }
    );
    
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new SDKError('Transaction failed', 'TRANSACTION_FAILED');
    }
    
    // Parse job ID from events
    let jobId: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const parsed = jobMarketplace.interface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });
        if (parsed && (parsed.name === 'JobCreated' || parsed.name === 'JobCreatedWithToken') && parsed.args['jobId']) {
          jobId = BigInt(parsed.args['jobId'].toString());
          break;
        }
      } catch {}
    }
    
    if (!jobId) {
      throw new SDKError('Could not parse job ID from events', 'EVENT_PARSE_ERROR');
    }
    
    return {
      jobId,
      txHash: receipt.hash,
      status: 'pending'
    };
  }

  /**
   * Create a session job with USDC
   */
  async createSessionJob(
    model: string,
    provider: string,
    depositAmount: string,
    pricePerToken: number,
    proofInterval: number,
    duration: number
  ): Promise<{
    sessionId: bigint;
    jobId: bigint;
    txHash: string;
  }> {
    if (!this.initialized) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const sessionConfig: SessionConfig = {
        depositAmount,
        pricePerToken,
        proofInterval,
        duration
      };
      
      const params: SessionJobParams = {
        model,
        provider,
        sessionConfig
      };
      
      const result = await this.sessionJobManager.createSessionJob(params);
      
      return {
        sessionId: result.sessionId,
        jobId: result.jobId,
        txHash: result.txHash
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to create session job: ${error.message}`,
        'SESSION_JOB_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Approve token spending
   */
  async approveToken(
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint
  ): Promise<TransactionResult> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      // Get token contract using ContractManager's public method
      const provider = this.contractManager.getProvider();
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        this.signer
      );
      
      const tx = await tokenContract['approve'](
        spenderAddress,
        amount,
        { gasLimit: 100000n }
      );
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Approval failed', 'APPROVAL_FAILED');
      }
      
      return {
        hash: receipt.hash,
        from: receipt.from,
        to: receipt.to || tokenAddress,
        value: 0n,
        gasUsed: BigInt(receipt.gasUsed.toString()),
        status: 'success' as const,
        blockNumber: receipt.blockNumber,
        confirmations: 1
      };
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to approve token: ${error.message}`,
        'APPROVAL_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Check token allowance
   */
  async checkAllowance(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string
  ): Promise<bigint> {
    if (!this.initialized) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const provider = this.contractManager.getProvider();
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function allowance(address owner, address spender) view returns (uint256)'],
        provider
      );
      
      const allowance = await tokenContract['allowance'](ownerAddress, spenderAddress);
      return BigInt(allowance.toString());
    } catch (error: any) {
      throw new SDKError(
        `Failed to check allowance: ${error.message}`,
        'ALLOWANCE_CHECK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get token balance
   */
  async getTokenBalance(tokenAddress: string, address: string): Promise<bigint> {
    if (!this.initialized) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const provider = this.contractManager.getProvider();
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address account) view returns (uint256)'],
        provider
      );
      const balance = await tokenContract['balanceOf'](address);
      return BigInt(balance.toString());
    } catch (error: any) {
      throw new SDKError(
        `Failed to check balance: ${error.message}`,
        'BALANCE_CHECK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Claim payment for job
   */
  async claimPayment(jobId: bigint): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const jobMarketplace = this.contractManager.getContract('jobMarketplace');
      
      const tx = await jobMarketplace['claimPayment'](
        jobId,
        { gasLimit: 300000n }
      );
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Claim failed', 'CLAIM_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to claim payment: ${error.message}`,
        'CLAIM_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Submit checkpoint proof
   */
  async submitCheckpoint(
    jobId: bigint,
    tokensGenerated: number,
    proof: string
  ): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const result = await this.sessionJobManager.submitCheckpointProof(
        jobId,
        tokensGenerated,
        proof
      );
      return result.txHash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to submit checkpoint: ${error.message}`,
        'CHECKPOINT_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Complete session job
   */
  async completeSession(
    jobId: bigint,
    totalTokens: number,
    finalProof: string
  ): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const result = await this.sessionJobManager.completeSessionJob(
        jobId,
        totalTokens,
        finalProof
      );
      return result.txHash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to complete session: ${error.message}`,
        'SESSION_COMPLETE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: bigint): Promise<any> {
    if (!this.initialized) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const jobMarketplace = this.contractManager.getContract('jobMarketplace');
      const job = await jobMarketplace['jobs'](jobId);
      
      return {
        requester: job.requester,
        provider: job.provider,
        model: job.model,
        prompt: job.prompt,
        result: job.result,
        status: job.status,
        payment: job.payment?.toString(),
        timestamp: job.timestamp?.toString()
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to get job status: ${error.message}`,
        'JOB_STATUS_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get ETH balance
   */
  async getEthBalance(address: string): Promise<bigint> {
    if (!this.initialized) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const provider = this.contractManager.getProvider();
      const balance = await provider.getBalance(address);
      return BigInt(balance.toString());
    } catch (error: any) {
      throw new SDKError(
        `Failed to get ETH balance: ${error.message}`,
        'BALANCE_CHECK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Send ETH
   */
  async sendEth(to: string, amount: bigint): Promise<TransactionResult> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const tx = await this.signer.sendTransaction({
        to,
        value: amount,
        gasLimit: 21000n
      });
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Transaction failed', 'TRANSACTION_FAILED');
      }
      
      return {
        hash: receipt.hash,
        from: receipt.from,
        to: receipt.to || '',
        value: amount,
        gasUsed: BigInt(receipt.gasUsed.toString()),
        status: 'success' as const,
        blockNumber: receipt.blockNumber,
        confirmations: 1
      };
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to send ETH: ${error.message}`,
        'SEND_ETH_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Send tokens
   */
  async sendToken(
    tokenAddress: string,
    to: string,
    amount: bigint
  ): Promise<TransactionResult> {
    // Auto-initialize if not done yet
    if (!this.initialized || !this.signer) {
      const signer = this.contractManager.getSigner();
      if (signer) {
        await this.initialize(signer);
      } else {
        throw new SDKError('PaymentManager not initialized - no signer available', 'PAYMENT_NOT_INITIALIZED');
      }
    }

    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function transfer(address to, uint256 amount) returns (bool)'],
        this.signer
      );
      
      const tx = await tokenContract['transfer'](to, amount, { gasLimit: 100000n });
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Transfer failed', 'TRANSFER_FAILED');
      }
      
      return {
        hash: receipt.hash,
        from: receipt.from,
        to: receipt.to || tokenAddress,
        value: 0n,
        gasUsed: BigInt(receipt.gasUsed.toString()),
        status: 'success' as const,
        blockNumber: receipt.blockNumber,
        confirmations: 1
      };
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to send token: ${error.message}`,
        'SEND_TOKEN_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(
    to: string,
    data: string,
    value?: bigint
  ): Promise<bigint> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const provider = this.contractManager.getProvider();
      const estimatedGas = await provider.estimateGas({
        to,
        data,
        value: value || 0n
      });
      return BigInt(estimatedGas.toString());
    } catch (error: any) {
      throw new SDKError(
        `Failed to estimate gas: ${error.message}`,
        'GAS_ESTIMATION_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(txHash: string): Promise<TransactionResult> {
    if (!this.initialized) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const provider = this.contractManager.getProvider();
      const receipt = await provider.waitForTransaction(txHash);
      
      if (!receipt) {
        throw new SDKError('Transaction not found', 'TX_NOT_FOUND');
      }
      
      return {
        hash: receipt.hash,
        from: receipt.from,
        to: receipt.to || '',
        value: 0n,
        gasUsed: BigInt(receipt.gasUsed.toString()),
        status: receipt.status === 1 ? 'success' : 'failed',
        blockNumber: receipt.blockNumber,
        confirmations: 1
      };
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to wait for transaction: ${error.message}`,
        'TX_WAIT_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get payment history
   */
  async getPaymentHistory(
    userAddress: string,
    limit?: number
  ): Promise<any[]> {
    // This would require event filtering which is browser-compatible
    // Implementation depends on specific requirements
    throw new SDKError(
      'Payment history not yet implemented',
      'NOT_IMPLEMENTED'
    );
  }

  /**
   * Cancel job (if supported)
   */
  async cancelJob(jobId: bigint): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }

    try {
      const jobMarketplace = this.contractManager.getContract('jobMarketplace');
      
      const tx = await jobMarketplace['cancelJob'](
        jobId,
        { gasLimit: 200000n }
      );
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Cancel failed', 'CANCEL_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to cancel job: ${error.message}`,
        'CANCEL_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Check if PaymentManager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}