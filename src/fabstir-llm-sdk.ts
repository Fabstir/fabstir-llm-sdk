// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import JobMarketplaceABI from './contracts/JobMarketplace.abi.json';
import { 
  JobSubmissionParams, 
  TOKEN_ADDRESSES, 
  CONTRACT_ADDRESSES, 
  ERC20_ABI,
  JobStatus 
} from './types/contracts';

interface FabstirLLMSDKEvents {
  jobSubmitted: (data: { jobId: string; paymentToken: string; txHash: string }) => void;
  connected: (data: { address: string }) => void;
  disconnected: () => void;
}

export declare interface FabstirLLMSDK {
  on<K extends keyof FabstirLLMSDKEvents>(event: K, listener: FabstirLLMSDKEvents[K]): this;
  emit<K extends keyof FabstirLLMSDKEvents>(event: K, ...args: Parameters<FabstirLLMSDKEvents[K]>): boolean;
}

export class FabstirLLMSDK extends EventEmitter {
  private provider: ethers.providers.Provider;
  private signer?: ethers.Signer;
  private jobMarketplace?: ethers.Contract;
  private usdcContract?: ethers.Contract;

  constructor(provider: ethers.providers.Provider) {
    super();
    this.provider = provider;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.signer) {
      if ('getSigner' in this.provider) {
        this.signer = (this.provider as ethers.providers.Web3Provider).getSigner();
      } else {
        throw new Error('Provider does not support getSigner');
      }
    }

    if (!this.jobMarketplace) {
      this.jobMarketplace = new ethers.Contract(
        CONTRACT_ADDRESSES.JobMarketplace,
        JobMarketplaceABI,
        this.signer
      );
    }

    if (!this.usdcContract) {
      this.usdcContract = new ethers.Contract(
        TOKEN_ADDRESSES.USDC,
        ERC20_ABI,
        this.signer
      );
    }
  }

  async submitJob(params: JobSubmissionParams): Promise<string> {
    await this.ensureInitialized();

    // Validate required parameters
    if (!params.modelId || !params.prompt || !params.maxTokens || !params.offerPrice) {
      throw new Error('Missing required job parameters');
    }

    // Determine payment method (default to ETH for backward compatibility)
    const paymentToken = params.paymentToken || 'ETH';

    if (paymentToken === 'USDC') {
      return this.submitJobWithUSDC(params);
    } else if (paymentToken === 'ETH') {
      return this.submitJobWithETH(params);
    } else {
      throw new Error(`Unsupported payment token: ${paymentToken}`);
    }
  }

  private async submitJobWithUSDC(params: JobSubmissionParams): Promise<string> {
    if (!this.signer || !this.jobMarketplace || !this.usdcContract) {
      throw new Error('SDK not initialized');
    }

    const userAddress = await this.signer.getAddress();
    const paymentAmount = params.paymentAmount || params.offerPrice;

    // Check USDC balance
    const balance = await this.usdcContract['balanceOf'](userAddress);
    if (balance < BigInt(paymentAmount)) {
      throw new Error('Insufficient USDC balance');
    }

    // Check and set allowance if needed
    const currentAllowance = await this.usdcContract['allowance'](
      userAddress,
      CONTRACT_ADDRESSES.JobMarketplace
    );

    if (currentAllowance < BigInt(paymentAmount)) {
      // Approving USDC spending...
      const approveTx = await this.usdcContract['approve'](
        CONTRACT_ADDRESSES.JobMarketplace,
        paymentAmount
      );
      await approveTx.wait();
      // USDC approval confirmed
    }

    // Call postJobWithToken
    // Calling postJobWithToken with USDC payment...
    const tx = await this.jobMarketplace['postJobWithToken'](
      params.modelId,
      params.prompt,
      params.offerPrice,
      params.maxTokens,
      TOKEN_ADDRESSES.USDC,
      paymentAmount
    );

    const receipt = await tx.wait();
    
    // Extract job ID from event logs
    const jobId = this.extractJobIdFromReceipt(receipt);
    // Job submitted with USDC. Job ID: ${jobId}
    
    this.emit('jobSubmitted', { jobId, paymentToken: 'USDC', txHash: receipt.hash });
    
    return jobId;
  }

  private async submitJobWithETH(params: JobSubmissionParams): Promise<string> {
    if (!this.jobMarketplace) {
      throw new Error('SDK not initialized');
    }

    // Call postJob with ETH payment (msg.value)
    // Calling postJob with ETH payment...
    const tx = await this.jobMarketplace['postJob'](
      params.modelId,
      params.prompt,
      params.offerPrice,
      params.maxTokens,
      { value: params.offerPrice }
    );

    const receipt = await tx.wait();
    
    // Extract job ID from event logs
    const jobId = this.extractJobIdFromReceipt(receipt);
    // Job submitted with ETH. Job ID: ${jobId}
    
    this.emit('jobSubmitted', { jobId, paymentToken: 'ETH', txHash: receipt.hash });
    
    return jobId;
  }

  private extractJobIdFromReceipt(receipt: any): string {
    // Look for JobPosted event in logs
    if (receipt.logs && receipt.logs.length > 0) {
      // Assuming the first topic is the event signature and second is the job ID
      const jobIdHex = receipt.logs[0].topics[1];
      if (jobIdHex) {
        return BigInt(jobIdHex).toString();
      }
    }
    
    // Fallback: return a placeholder if no job ID found
    return '0';
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    await this.ensureInitialized();
    
    if (!this.jobMarketplace) {
      throw new Error('JobMarketplace contract not initialized');
    }

    // This would need to be implemented based on actual contract method
    // For now, returning a mock status
    return JobStatus.PENDING;
  }

  async connect(): Promise<void> {
    await this.ensureInitialized();
    const address = await this.signer?.getAddress();
    if (address) {
      this.emit('connected', { address });
    }
  }

  async disconnect(): Promise<void> {
    this.signer = undefined;
    this.jobMarketplace = undefined;
    this.usdcContract = undefined;
    this.emit('disconnected');
  }
}