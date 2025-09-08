import { ethers } from 'ethers';

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

    const abi = [
      'function registerNode(string metadata) external',
      'function unregisterNode() external',
      'function stake(uint256 amount) external',
      'function updateMetadata(string newMetadata) external',
      'function nodes(address) view returns (address operator, uint256 stakedAmount, bool active, string metadata)',
      'function MIN_STAKE() view returns (uint256)',
      'event NodeRegistered(address indexed operator, uint256 stakedAmount, string metadata)',
      'event NodeUnregistered(address indexed operator, uint256 returnedAmount)',
      'event StakeAdded(address indexed operator, uint256 additionalAmount)',
      'event MetadataUpdated(address indexed operator, string newMetadata)'
    ];

    return new ethers.Contract(this.nodeRegistryAddress, abi, this.signer);
  }

  private getFabTokenContract(): ethers.Contract {
    if (!this.signer) {
      throw new Error('Signer not set. Call setSigner() first.');
    }

    const abi = [
      'function balanceOf(address account) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ];

    return new ethers.Contract(this.fabTokenAddress, abi, this.signer);
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
}