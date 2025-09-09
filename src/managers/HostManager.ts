import { ethers } from 'ethers';
import { HostEarningsABI, JobMarketplaceABI, NodeRegistryABI, ERC20ABI } from '../contracts/abis';

export interface HostRegistrationParams {
  metadata: string;
  stakeAmount?: string; // Optional, defaults to MIN_STAKE
}

export interface HostInfo {
  operator: string;
  stakedAmount: ethers.BigNumber;
  active: boolean;
  metadata: string;
  isRegistered: boolean;
  models?: string[];
  endpoint?: string;
}

export default class HostManager {
  private nodeRegistryAddress: string;
  private fabTokenAddress: string;
  private provider?: ethers.providers.Provider;
  private signer?: ethers.Signer;

  constructor(nodeRegistryAddress: string, fabTokenAddress: string) {
    this.nodeRegistryAddress = nodeRegistryAddress;
    this.fabTokenAddress = fabTokenAddress;
  }

  setSigner(signer: ethers.Signer): void {
    this.signer = signer;
    this.provider = (signer as any).provider;
  }

  private getNodeRegistryContract(): ethers.Contract {
    if (!this.signer) {
      throw new Error('Signer not set. Call setSigner() first.');
    }

    return new ethers.Contract(this.nodeRegistryAddress, NodeRegistryABI, this.signer);
  }

  private getFabTokenContract(): ethers.Contract {
    if (!this.signer) {
      throw new Error('Signer not set. Call setSigner() first.');
    }

    return new ethers.Contract(this.fabTokenAddress, ERC20ABI, this.signer);
  }

  private parseHostModels(metadata: string): string[] {
    if (!metadata) return [];
    
    // Parse comma-separated models from metadata
    // Format: "model1,model2,capabilities"
    const parts = metadata.split(',').map(s => s.trim());
    
    // Filter out non-model entries (like 'inference')
    const models = parts.filter(part => 
      part.includes('llama') || 
      part.includes('gpt') || 
      part.includes('mistral') ||
      part.includes('claude') ||
      part.includes('gemma')
    );
    
    return models;
  }

  private parseHostEndpoint(metadata: string): string | undefined {
    if (!metadata) return undefined;
    
    // Check if metadata contains URL format
    if (metadata.includes('http://') || metadata.includes('https://') || 
        metadata.includes('ws://') || metadata.includes('wss://')) {
      // Extract URL from metadata
      const urlMatch = metadata.match(/(https?|wss?):\/\/[^\s,]+/);
      return urlMatch ? urlMatch[0] : undefined;
    }
    
    // Default endpoint construction based on host address could be added here
    return undefined;
  }

  async getHostInfo(address?: string): Promise<HostInfo> {
    const registry = this.getNodeRegistryContract();
    const hostAddress = address || (await this.signer!.getAddress());
    
    const nodeInfo = await registry.nodes(hostAddress);
    const isRegistered = nodeInfo.operator !== ethers.constants.AddressZero;

    const models = this.parseHostModels(nodeInfo.metadata);
    const endpoint = this.parseHostEndpoint(nodeInfo.metadata);

    return {
      operator: nodeInfo.operator,
      stakedAmount: nodeInfo.stakedAmount,
      active: nodeInfo.active,
      metadata: nodeInfo.metadata,
      isRegistered,
      models: models.length > 0 ? models : undefined,
      endpoint
    };
  }

  async getMinStake(): Promise<ethers.BigNumber> {
    const registry = this.getNodeRegistryContract();
    return await registry.MIN_STAKE();
  }

  async getFabBalance(address?: string): Promise<ethers.BigNumber> {
    const fabToken = this.getFabTokenContract();
    const hostAddress = address || (await this.signer!.getAddress());
    return await fabToken.balanceOf(hostAddress);
  }

  async registerHost(params: HostRegistrationParams): Promise<ethers.ContractTransaction> {
    const registry = this.getNodeRegistryContract();
    const fabToken = this.getFabTokenContract();
    const hostAddress = await this.signer!.getAddress();

    // Check if already registered
    const hostInfo = await this.getHostInfo();
    if (hostInfo.isRegistered) {
      throw new Error('Host is already registered');
    }

    // Get minimum stake
    const minStake = await this.getMinStake();
    const stakeAmount = params.stakeAmount 
      ? ethers.utils.parseUnits(params.stakeAmount, 18)
      : minStake;

    // Check FAB balance
    const fabBalance = await this.getFabBalance();
    if (fabBalance.lt(stakeAmount)) {
      throw new Error(`Insufficient FAB tokens. Need ${ethers.utils.formatUnits(stakeAmount, 18)} FAB, have ${ethers.utils.formatUnits(fabBalance, 18)} FAB`);
    }

    // Approve FAB tokens with proper gas configuration
    const allowance = await fabToken.allowance(hostAddress, this.nodeRegistryAddress);
    if (allowance.lt(stakeAmount)) {
      const approveTx = await fabToken.approve(this.nodeRegistryAddress, stakeAmount, {
        gasLimit: 100000,
        maxFeePerGas: ethers.utils.parseUnits('10', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
      });
      await approveTx.wait();
    }

    // Register host with gas configuration
    return await registry.registerNode(params.metadata, {
      gasLimit: 300000,
      maxFeePerGas: ethers.utils.parseUnits('10', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
    });
  }

  async unregisterHost(): Promise<ethers.ContractTransaction> {
    const registry = this.getNodeRegistryContract();

    // Check if registered
    const hostInfo = await this.getHostInfo();
    if (!hostInfo.isRegistered) {
      throw new Error('Host is not registered');
    }

    return await registry.unregisterNode({
      gasLimit: 200000,
      maxFeePerGas: ethers.utils.parseUnits('10', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
    });
  }

  async addStake(amount: string): Promise<ethers.ContractTransaction> {
    const registry = this.getNodeRegistryContract();
    const fabToken = this.getFabTokenContract();
    const hostAddress = await this.signer!.getAddress();

    // Check if registered
    const hostInfo = await this.getHostInfo();
    if (!hostInfo.isRegistered) {
      throw new Error('Host is not registered');
    }

    const stakeAmount = ethers.utils.parseUnits(amount, 18);

    // Check FAB balance
    const fabBalance = await this.getFabBalance();
    if (fabBalance.lt(stakeAmount)) {
      throw new Error(`Insufficient FAB tokens. Need ${amount} FAB, have ${ethers.utils.formatUnits(fabBalance, 18)} FAB`);
    }

    // Approve FAB tokens with gas configuration
    const approveTx = await fabToken.approve(this.nodeRegistryAddress, stakeAmount, {
      gasLimit: 100000,
      maxFeePerGas: ethers.utils.parseUnits('10', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
    });
    await approveTx.wait();

    return await registry.stake(stakeAmount, {
      gasLimit: 200000,
      maxFeePerGas: ethers.utils.parseUnits('10', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
    });
  }

  async updateMetadata(newMetadata: string): Promise<ethers.ContractTransaction> {
    const registry = this.getNodeRegistryContract();

    // Check if registered
    const hostInfo = await this.getHostInfo();
    if (!hostInfo.isRegistered) {
      throw new Error('Host is not registered');
    }

    return await registry.updateMetadata(newMetadata);
  }

  async getAvailableLLMModels(address?: string): Promise<string[]> {
    const hostInfo = await this.getHostInfo(address);
    
    if (!hostInfo.isRegistered) {
      throw new Error('Host is not registered');
    }
    
    // Return parsed models from metadata
    return hostInfo.models || [];
  }

  async getHostEndpoint(address?: string): Promise<string | undefined> {
    const hostInfo = await this.getHostInfo(address);
    
    if (!hostInfo.isRegistered) {
      return undefined;
    }
    
    // If endpoint is in metadata, return it
    if (hostInfo.endpoint) {
      return hostInfo.endpoint;
    }
    
    // Otherwise, construct default endpoint based on host address
    // This assumes hosts run on standard ports - adjust as needed
    const hostAddress = address || (await this.signer!.getAddress());
    
    // Default to localhost for testing, but in production this would
    // need to be obtained from discovery or configuration
    return process.env.NODE_ENV === 'test' 
      ? 'http://localhost:8080'
      : undefined;
  }

  async queryNodeCapabilities(address?: string): Promise<{ models: any[], status: string, error?: string }> {
    try {
      const endpoint = await this.getHostEndpoint(address);
      
      if (!endpoint) {
        return { 
          models: [], 
          status: 'offline',
          error: 'No endpoint available for host'
        };
      }
      
      // Query the node's /v1/models endpoint
      const httpEndpoint = endpoint.replace('ws://', 'http://').replace('wss://', 'https://');
      const response = await fetch(`${httpEndpoint}/v1/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (!response.ok) {
        return {
          models: [],
          status: 'error',
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
      
      const data = await response.json();
      return {
        models: data.models || [],
        status: 'online'
      };
      
    } catch (error: any) {
      // Node is offline or unreachable
      return {
        models: [],
        status: 'offline',
        error: error.message
      };
    }
  }

  /**
   * Withdraw accumulated host earnings from HostEarnings contract
   * @param tokenAddress The token address to withdraw (e.g., USDC)
   * @returns Transaction receipt
   */
  async withdrawEarnings(tokenAddress: string): Promise<ethers.ContractReceipt> {
    try {
      const hostEarningsAddress = process.env.CONTRACT_HOST_EARNINGS;
      if (!hostEarningsAddress) {
        throw new Error('CONTRACT_HOST_EARNINGS environment variable is not set');
      }

      if (!this.signer) {
        throw new Error('Signer not set. Call setSigner() first.');
      }
      const signer = this.signer;
      
      // Use centralized ABI import
      const hostEarningsContract = new ethers.Contract(
        hostEarningsAddress,
        HostEarningsABI,
        signer
      );

      // Call withdrawAll function
      const tx = await hostEarningsContract.withdrawAll(tokenAddress, {
        gasLimit: 200000
      });
      
      const receipt = await tx.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Host earnings withdrawal transaction failed');
      }
      
      return receipt;
    } catch (error: any) {
      // Don't throw on "No earnings to withdraw" - that's expected sometimes
      if (error.message.includes('No earnings') || error.message.includes('Nothing to withdraw')) {
        console.log('No host earnings available to withdraw');
        return { status: 0 } as any;
      }
      throw new Error(`Failed to withdraw host earnings: ${error.message}`);
    }
  }

  /**
   * Check accumulated earnings for the host
   * @param tokenAddress The token address to check earnings for
   * @returns Accumulated earnings as BigNumber
   */
  async checkAccumulatedEarnings(tokenAddress: string): Promise<ethers.BigNumber> {
    try {
      const hostEarningsAddress = process.env.CONTRACT_HOST_EARNINGS;
      if (!hostEarningsAddress) {
        throw new Error('CONTRACT_HOST_EARNINGS environment variable is not set');
      }

      if (!this.signer) {
        throw new Error('Signer not set. Call setSigner() first.');
      }
      const signer = this.signer;
      const hostAddress = await signer.getAddress();
      
      // Use centralized ABI import
      const hostEarningsContract = new ethers.Contract(
        hostEarningsAddress,
        HostEarningsABI,
        signer
      );

      // Call getBalance function (correct ABI method name)
      return await hostEarningsContract.getBalance(hostAddress, tokenAddress);
    } catch (error: any) {
      throw new Error(`Failed to check accumulated earnings: ${error.message}`);
    }
  }

  /**
   * Submit proof of work for a session
   * @param jobId The session job ID
   * @param proof The proof bytes (e.g., EZKL proof)
   * @param tokensProven Number of tokens proven
   * @returns Transaction receipt
   */
  async submitProofOfWork(jobId: string | number, proof: string, tokensProven: number): Promise<ethers.ContractReceipt> {
    try {
      if (!this.signer) {
        throw new Error('Signer not set. Call setSigner() first.');
      }
      const signer = this.signer;
      
      const jobMarketplaceAddress = process.env.CONTRACT_JOB_MARKETPLACE;
      if (!jobMarketplaceAddress) {
        throw new Error('CONTRACT_JOB_MARKETPLACE environment variable is not set');
      }
      
      const jobMarketplace = new ethers.Contract(
        jobMarketplaceAddress,
        JobMarketplaceABI,
        signer
      );
      
      const tx = await jobMarketplace.submitProofOfWork(
        jobId,
        proof,
        tokensProven,
        { gasLimit: 300000 }
      );
      const receipt = await tx.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Proof submission failed');
      }
      
      return receipt;
    } catch (error: any) {
      throw new Error(`Failed to submit proof: ${error.message}`);
    }
  }

  /**
   * Claim payment for a completed session job (calls claimWithProof)
   * @param jobId The session job ID to claim payment for
   * @returns Transaction receipt
   */
  async claimSessionPayment(jobId: string | number): Promise<ethers.ContractReceipt> {
    try {
      if (!this.signer) {
        throw new Error('Signer not set. Call setSigner() first.');
      }
      const signer = this.signer;
      
      // Use centralized ABI import
      const marketplaceAddress = process.env.CONTRACT_JOB_MARKETPLACE;
      
      if (!marketplaceAddress) {
        throw new Error('CONTRACT_JOB_MARKETPLACE environment variable is not set');
      }
      
      const marketplaceContract = new ethers.Contract(
        marketplaceAddress,
        JobMarketplaceABI,
        signer
      );

      // Call claimWithProof function
      const tx = await marketplaceContract.claimWithProof(jobId, {
        gasLimit: 300000
      });
      
      const receipt = await tx.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Claim payment transaction failed');
      }
      
      return receipt;
    } catch (error: any) {
      throw new Error(`Failed to claim session payment: ${error.message}`);
    }
  }

  /**
   * Withdraw all available earnings for all supported tokens
   * @returns Object with withdrawal results for each token
   */
  async withdrawAllEarnings(): Promise<{ [token: string]: ethers.ContractReceipt | null }> {
    const results: { [token: string]: ethers.ContractReceipt | null } = {};
    
    // Always try USDC first
    const usdcAddress = process.env.CONTRACT_USDC_TOKEN;
    if (usdcAddress) {
      try {
        const earnings = await this.checkAccumulatedEarnings(usdcAddress);
        if (earnings && earnings.gt(0)) {
          results.usdc = await this.withdrawEarnings(usdcAddress);
        } else {
          results.usdc = null;
        }
      } catch (error: any) {
        console.error(`Failed to withdraw USDC earnings: ${error.message}`);
        results.usdc = null;
      }
    }
    
    return results;
  }
}