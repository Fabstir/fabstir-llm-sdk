// src/contracts-headless.ts
import { ethers } from 'ethers';
import { TOKEN_ADDRESSES, CONTRACT_ADDRESSES, ERC20_ABI } from './types/contracts.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load ABI dynamically to avoid JSON import issues
let JobMarketplaceABI: any;
try {
  // For ES modules in Node.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const abiPath = join(__dirname, 'contracts', 'JobMarketplace.abi.json');
  JobMarketplaceABI = JSON.parse(readFileSync(abiPath, 'utf8'));
} catch (error) {
  // Fallback: minimal ABI for testing
  JobMarketplaceABI = [
    'function postJob(string modelId, string prompt, uint256 offerPrice, uint32 maxTokens) payable returns (uint256)',
    'function postJobWithToken(string modelId, string prompt, uint256 offerPrice, uint32 maxTokens, address token, uint256 amount) returns (uint256)',
    'function getJobStatus(uint256 jobId) view returns (uint8)',
    'function claimJob(uint256 jobId)',
    'function submitResult(uint256 jobId, string resultHash)'
  ];
}

export interface ContractAddresses {
  jobMarketplace: string;
  paymentEscrow: string;
  nodeRegistry: string;
}

export interface JobDetails {
  prompt: string;
  modelId: string;
  maxTokens: number;
  seed: number;
  resultFormat: string;
  offerPrice: string;
}

export interface JobRequirements {
  minMemory?: number;
  minStorage?: number;
  gpuRequired?: boolean;
}

/**
 * HeadlessContractManager - Accepts signer in each method call
 * This allows for dynamic signer updates and better separation of concerns
 */
export class HeadlessContractManager {
  private chainId?: number;
  private config: any;
  
  constructor(config: any) {
    this.config = config;
  }
  
  /**
   * Update chain ID when network changes
   */
  async updateNetwork(provider: ethers.providers.Provider): Promise<void> {
    const network = await provider.getNetwork();
    this.chainId = network.chainId;
  }
  
  private getAddressesForNetwork(): ContractAddresses {
    // Use configured addresses if provided
    if (this.config.contractAddresses) {
      if (!this.config.contractAddresses.jobMarketplace) {
        throw new Error('jobMarketplace address is required in contractAddresses config');
      }
      return {
        jobMarketplace: this.config.contractAddresses.jobMarketplace,
        paymentEscrow: this.config.contractAddresses.paymentEscrow || undefined,
        nodeRegistry: this.config.contractAddresses.nodeRegistry || undefined
      };
    }
    
    // Base Sepolia (chainId: 84532)
    if (this.chainId === 84532) {
      return {
        jobMarketplace: CONTRACT_ADDRESSES.JobMarketplace,
        paymentEscrow: '0x1234567890123456789012345678901234567892',
        nodeRegistry: '0x1234567890123456789012345678901234567893'
      };
    }
    
    // Base Mainnet (chainId: 8453)
    if (this.chainId === 8453) {
      return {
        jobMarketplace: CONTRACT_ADDRESSES.JobMarketplace,
        paymentEscrow: '0x2345678901234567890123456789012345678902',
        nodeRegistry: '0x2345678901234567890123456789012345678903'
      };
    }
    
    // Default/Local addresses
    return {
      jobMarketplace: CONTRACT_ADDRESSES.JobMarketplace,
      paymentEscrow: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      nodeRegistry: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
    };
  }
  
  /**
   * Post a job with ETH payment
   * @param jobDetails - Job details
   * @param requirements - Job requirements
   * @param signer - Signer to use for transaction
   */
  async postJob(
    jobDetails: JobDetails,
    requirements: JobRequirements,
    signer: ethers.Signer
  ): Promise<ethers.ContractTransaction> {
    const addresses = this.getAddressesForNetwork();
    
    const jobMarketplace = new ethers.Contract(
      addresses.jobMarketplace,
      JobMarketplaceABI,
      signer
    );
    
    return jobMarketplace['postJob'](
      jobDetails.modelId,
      jobDetails.prompt,
      jobDetails.offerPrice,
      jobDetails.maxTokens,
      { value: jobDetails.offerPrice }
    );
  }
  
  /**
   * Post a job with token payment (e.g., USDC)
   * @param jobDetails - Job details
   * @param requirements - Job requirements
   * @param paymentToken - Token address for payment
   * @param paymentAmount - Amount of tokens to pay
   * @param signer - Signer to use for transaction
   */
  async postJobWithToken(
    jobDetails: JobDetails,
    requirements: JobRequirements,
    paymentToken: string,
    paymentAmount: string,
    signer: ethers.Signer
  ): Promise<ethers.ContractTransaction> {
    const addresses = this.getAddressesForNetwork();
    
    // First check and approve token if needed
    await this.ensureTokenApproval(
      paymentToken,
      addresses.jobMarketplace,
      paymentAmount,
      signer
    );
    
    const jobMarketplace = new ethers.Contract(
      addresses.jobMarketplace,
      JobMarketplaceABI,
      signer
    );
    
    return jobMarketplace['postJobWithToken'](
      jobDetails.modelId,
      jobDetails.prompt,
      jobDetails.offerPrice,
      jobDetails.maxTokens,
      paymentToken,
      paymentAmount
    );
  }
  
  /**
   * Ensure token approval for spending
   * @param tokenAddress - ERC20 token address
   * @param spender - Address that will spend tokens
   * @param amount - Amount to approve
   * @param signer - Signer to use for transaction
   */
  private async ensureTokenApproval(
    tokenAddress: string,
    spender: string,
    amount: string,
    signer: ethers.Signer
  ): Promise<void> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const signerAddress = await signer.getAddress();
    
    // Check current allowance
    const currentAllowance = await token['allowance'](signerAddress, spender);
    
    if (currentAllowance.lt(amount)) {
      // Approve spending
      const approveTx = await token['approve'](spender, amount);
      await approveTx.wait();
    }
  }
  
  /**
   * Get job status
   * @param jobId - Job ID to query
   * @param provider - Provider for read-only query
   */
  async getJobStatus(
    jobId: number,
    provider: ethers.providers.Provider
  ): Promise<number> {
    const addresses = this.getAddressesForNetwork();
    
    const jobMarketplace = new ethers.Contract(
      addresses.jobMarketplace,
      JobMarketplaceABI,
      provider
    );
    
    return jobMarketplace['getJobStatus'](jobId);
  }
  
  /**
   * Claim a job as a node operator
   * @param jobId - Job ID to claim
   * @param signer - Signer to use for transaction
   */
  async claimJob(
    jobId: number,
    signer: ethers.Signer
  ): Promise<ethers.ContractTransaction> {
    const addresses = this.getAddressesForNetwork();
    
    const jobMarketplace = new ethers.Contract(
      addresses.jobMarketplace,
      JobMarketplaceABI,
      signer
    );
    
    return jobMarketplace['claimJob'](jobId);
  }
  
  /**
   * Submit job result as a node operator
   * @param jobId - Job ID
   * @param resultHash - IPFS hash of result
   * @param signer - Signer to use for transaction
   */
  async submitResult(
    jobId: number,
    resultHash: string,
    signer: ethers.Signer
  ): Promise<ethers.ContractTransaction> {
    const addresses = this.getAddressesForNetwork();
    
    const jobMarketplace = new ethers.Contract(
      addresses.jobMarketplace,
      JobMarketplaceABI,
      signer
    );
    
    return jobMarketplace['submitResult'](jobId, resultHash);
  }
}