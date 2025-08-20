// src/fabstir-sdk-headless.ts
/**
 * Headless SDK implementation that accepts signer from external source
 * No React/UI dependencies - pure TypeScript
 */

import { ethers } from "ethers";
import { EventEmitter } from "events";
import { ContractManager } from "./contracts.js";
import { ErrorCode, FabstirError } from "./errors.js";
import { 
  JobStatus, 
  PaymentStatus, 
  DiscoveryConfig, 
  NodeDiscoveryOptions, 
  DiscoveredNode,
  JobRequest,
  JobResponse,
  JobNegotiation,
  NegotiationOptions,
  P2PResponseStream,
  JobMapping,
  ChainReorgEvent,
  P2PJobState,
  RetryOptions,
  NodeReliabilityRecord,
  JobRecoveryInfo,
  ErrorRecoveryReport,
  FailoverStrategy,
  OperationMetrics,
  ModeTransitionOptions,
  ModeTransitionReport,
  SystemHealthReport,
  PerformanceMetrics,
  ResponseStreamOptions,
  P2PConfig
} from "./types.js";
import { P2PClient } from "./p2p/client.js";

// SDK configuration without provider/signer requirement
export interface HeadlessSDKConfig {
  network?: "base-sepolia" | "base-mainnet" | "local";
  rpcUrl?: string;
  debug?: boolean;
  mode?: "mock" | "production";
  contractAddresses?: {
    jobMarketplace?: string;
    paymentEscrow?: string;
    nodeRegistry?: string;
    usdc?: string;
  };
  p2pConfig?: P2PConfig;
  retryOptions?: RetryOptions;
}

/**
 * Headless SDK that can work with any signer source
 * Signer is provided externally via setSigner() method
 */
export class FabstirSDKHeadless extends EventEmitter {
  public config: HeadlessSDKConfig;
  private signer?: ethers.Signer;
  private provider?: ethers.providers.Provider;
  public contracts: ContractManager;

  private _isConnected: boolean = false;
  private _jobs: Map<number, any> = new Map();
  private _jobEventEmitters: Map<number, EventEmitter> = new Map();
  private _payments: Map<number, any> = new Map();
  private _paymentHistory: Map<number, any[]> = new Map();
  private _paymentEventEmitter: EventEmitter = new EventEmitter();
  private _p2pClient?: P2PClient;
  private _discoveryCache: Map<string, { nodes: DiscoveredNode[]; timestamp: number }> = new Map();
  private _activeStreams: Map<number, P2PResponseStream> = new Map();
  private _jobMappings: Map<number, any> = new Map();
  private _p2pJobStates: Map<number, any> = new Map();
  private _p2pJobIdCounter: number = 10000;
  
  // Error recovery properties
  private _nodeReliability: Map<string, NodeReliabilityRecord> = new Map();
  private _nodeBlacklist: Map<string, number> = new Map();
  private _jobRecoveryData: Map<number | string, JobRecoveryInfo> = new Map();
  private _retryStats = {
    totalRetries: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    reportStartTime: Date.now()
  };
  private _activeJobsByNode: Map<string, Set<number | string>> = new Map();
  
  // Performance tracking properties
  private _performanceMetrics: Map<string, OperationMetrics> = new Map();
  private _streamingMetrics = {
    totalTokens: 0,
    tokenLatencies: [] as number[],
    lastTokenTime: 0
  };
  private _operationTimings: Map<string, number[]> = new Map();

  constructor(config: HeadlessSDKConfig = {}) {
    super();

    // Set default configuration
    this.config = {
      network: "base-sepolia",
      debug: false,
      mode: "mock",
      ...config,
    };

    // Validate mode
    if (this.config.mode !== undefined) {
      if (this.config.mode === null) {
        throw new Error(`Invalid SDK mode: null. Must be "mock" or "production"`);
      }
      if (typeof this.config.mode !== "string") {
        throw new Error(`Invalid SDK mode: ${this.config.mode}. Must be "mock" or "production"`);
      }
      if (this.config.mode !== "mock" && this.config.mode !== "production") {
        throw new Error(`Invalid SDK mode: ${this.config.mode}. Must be "mock" or "production"`);
      }
    }

    // Validate P2P configuration for production mode
    if (this.config.mode === "production" && this.config.p2pConfig) {
      this.validateP2PConfig(this.config.p2pConfig);
    }

    // Initialize contract manager (without provider/signer yet)
    this.contracts = new ContractManager(this.config);

    // Initialize P2P client if configured (doesn't need signer)
    if (this.config.mode === "production" && this.config.p2pConfig) {
      this.initializeP2PClient();
    }

    if (this.config.debug) {
      console.log("[FabstirSDKHeadless] Initialized in", this.config.mode, "mode");
    }
  }

  private validateP2PConfig(p2pConfig: P2PConfig): void {
    if (!p2pConfig.bootstrapNodes || !Array.isArray(p2pConfig.bootstrapNodes)) {
      throw new Error("P2P configuration must include bootstrapNodes array");
    }
    if (p2pConfig.bootstrapNodes.length === 0) {
      throw new Error("At least one bootstrap node required for production mode");
    }
    for (const node of p2pConfig.bootstrapNodes) {
      if (typeof node !== 'string') {
        throw new Error("Bootstrap nodes must be strings");
      }
    }
    // Apply defaults
    if (p2pConfig.enableDHT === undefined) p2pConfig.enableDHT = true;
    if (p2pConfig.enableMDNS === undefined) p2pConfig.enableMDNS = true;
    if (p2pConfig.dialTimeout === undefined) p2pConfig.dialTimeout = 30000;
    if (p2pConfig.requestTimeout === undefined) p2pConfig.requestTimeout = 60000;
  }

  private async initializeP2PClient(): Promise<void> {
    if (!this.config.p2pConfig) return;
    
    try {
      this._p2pClient = new P2PClient(this.config.p2pConfig);
      
      // Set up P2P event listeners
      this._p2pClient.on('peer:connect', (peerId) => {
        this.emit('p2p:peer:connect', peerId);
      });
      
      this._p2pClient.on('peer:disconnect', (peerId) => {
        this.emit('p2p:peer:disconnect', peerId);
      });
      
      this._p2pClient.on('connection:retry', (data) => {
        this.emit('p2p:connection:retry', data);
      });
      
      this._p2pClient.on('connection:failed', (data) => {
        this.emit('p2p:connection:failed', data);
      });

      // Start P2P client with retry logic
      await this.startP2PWithRetry();
      
    } catch (error) {
      if (this.config.debug) {
        console.error("[FabstirSDKHeadless] Failed to initialize P2P client:", error);
      }
      // P2P failure is not critical for SDK operation
    }
  }

  private async startP2PWithRetry(): Promise<void> {
    if (!this._p2pClient) return;
    
    const retryOptions = this.config.retryOptions || {};
    let lastError: Error | null = null;
    let attempts = 0;
    const maxRetries = retryOptions.maxRetries || 3;
    
    while (attempts < maxRetries) {
      try {
        await this._p2pClient.start();
        this.emit("p2p:started");
        
        if (this.config.debug) {
          console.log("[FabstirSDKHeadless] P2P client started");
        }
        break;
      } catch (error: any) {
        lastError = error;
        attempts++;
        
        if (attempts < maxRetries) {
          const delay = Math.min(
            (retryOptions.initialDelay || 100) * Math.pow(retryOptions.backoffFactor || 2, attempts - 1),
            retryOptions.maxDelay || 5000
          );
          
          if (this.config.debug) {
            console.log(`[FabstirSDKHeadless] P2P start failed, retrying in ${delay}ms (attempt ${attempts}/${maxRetries})`);
          }
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    if (attempts === maxRetries && lastError) {
      throw new FabstirError(
        ErrorCode.CONNECTION_ERROR,
        `Failed to start P2P client after ${maxRetries} attempts: ${lastError.message}`
      );
    }
  }

  /**
   * Set or update the signer
   * This is the main method for providing wallet connectivity
   */
  async setSigner(signer: ethers.Signer): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.signer = signer;
      this.provider = signer.provider;

      if (!this.provider) {
        throw new Error("Signer must have a provider");
      }

      // Verify network
      const network = await this.provider.getNetwork();
      const expectedChainId = this.getExpectedChainId();

      if (network.chainId !== expectedChainId) {
        this._isConnected = false;
        throw new Error(`Wrong network. Expected chain ID ${expectedChainId}, got ${network.chainId}`);
      }

      // Initialize contracts with signer
      await this.contracts.initialize(this.provider, this.signer);

      this._isConnected = true;

      // Get user address
      const address = await signer.getAddress();
      
      // Record operation metrics
      this.recordOperationTiming('setSigner', Date.now() - startTime);
      
      // Emit connected event
      this.emit("connected", { 
        address,
        chainId: network.chainId,
        network: this.config.network 
      });

      if (this.config.debug) {
        console.log("[FabstirSDKHeadless] Signer set successfully:", address);
      }
    } catch (error: any) {
      this._isConnected = false;
      
      // Record failure metrics
      this.recordOperationTiming('setSigner', Date.now() - startTime, false);
      
      throw new FabstirError(
        ErrorCode.CONNECTION_ERROR,
        `Failed to set signer: ${error.message}`
      );
    }
  }

  /**
   * Update signer (e.g., when wallet changes)
   * Alias for setSigner for compatibility
   */
  async updateSigner(signer: ethers.Signer): Promise<void> {
    return this.setSigner(signer);
  }

  /**
   * Connect with provider or signer (for backward compatibility)
   * Handles both ethers.Provider and ethers.Signer inputs
   */
  async connect(providerOrSigner: ethers.providers.Provider | ethers.Signer | any): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Check if it's a signer (has getAddress method)
      if (providerOrSigner && typeof providerOrSigner.getAddress === 'function') {
        // It's a signer - use setSigner directly
        await this.setSigner(providerOrSigner as ethers.Signer);
        return;
      }
      
      // It's a provider or mock provider
      this.provider = providerOrSigner;

      // For mock mode, don't require a real provider
      if (this.config.mode === 'mock') {
        this._isConnected = true;
        
        // If the mock provider has getSigner, try to use it
        if (providerOrSigner && typeof providerOrSigner.getSigner === 'function') {
          try {
            const signer = providerOrSigner.getSigner();
            if (signer && typeof signer.getAddress === 'function') {
              this.signer = signer;
              const address = await signer.getAddress();
              this.emit("connected", { 
                address,
                chainId: 84532,
                network: this.config.network 
              });
              if (this.config.debug) {
                console.log("[FabstirSDKHeadless] Connected with mock signer:", address);
              }
              return;
            }
          } catch (e) {
            // Mock signer failed, continue without it
          }
        }
        
        // Mock mode without signer
        this.emit("connected", { 
          readOnly: true,
          chainId: 84532,
          network: this.config.network 
        });
        if (this.config.debug) {
          console.log("[FabstirSDKHeadless] Connected in mock mode");
        }
        return;
      }

      // Production mode - need a real provider
      if (!providerOrSigner) {
        throw new Error("Provider is required in production mode");
      }

      // Try to get signer if available
      if ("getSigner" in providerOrSigner) {
        const signer = (providerOrSigner as ethers.providers.JsonRpcProvider).getSigner();
        await this.setSigner(signer);
      } else {
        // Provider-only mode (limited functionality)
        const network = await providerOrSigner.getNetwork();
        const expectedChainId = this.getExpectedChainId();

        if (network.chainId !== expectedChainId) {
          throw new Error(`Wrong network. Expected chain ID ${expectedChainId}, got ${network.chainId}`);
        }

        // Initialize contracts with provider only (read-only)
        await this.contracts.initialize(providerOrSigner);
        
        this._isConnected = true;
        this.emit("connected", { 
          readOnly: true,
          chainId: network.chainId,
          network: this.config.network 
        });

        if (this.config.debug) {
          console.log("[FabstirSDKHeadless] Connected in read-only mode");
        }
      }
    } catch (error: any) {
      this._isConnected = false;
      // In mock mode, don't throw errors for connection issues
      if (this.config.mode === 'mock') {
        this._isConnected = true;
        this.emit("connected", { 
          readOnly: true,
          chainId: 84532,
          network: this.config.network 
        });
        if (this.config.debug) {
          console.log("[FabstirSDKHeadless] Mock mode: ignoring connection error");
        }
        return;
      }
      throw new FabstirError(
        ErrorCode.CONNECTION_ERROR,
        `Failed to connect: ${error.message}`
      );
    }
  }

  /**
   * Disconnect the SDK
   */
  async disconnect(): Promise<void> {
    try {
      this._isConnected = false;
      this.signer = undefined;
      this.provider = undefined;

      // Stop P2P client if running
      if (this._p2pClient) {
        await this._p2pClient.stop();
        this._p2pClient = undefined;
      }

      // Clear all state
      this._jobs.clear();
      this._jobEventEmitters.clear();
      this._payments.clear();
      this._paymentHistory.clear();
      this._discoveryCache.clear();
      this._activeStreams.clear();
      this._jobMappings.clear();
      this._p2pJobStates.clear();
      this._nodeReliability.clear();
      this._nodeBlacklist.clear();
      this._jobRecoveryData.clear();
      this._activeJobsByNode.clear();
      this._performanceMetrics.clear();
      this._operationTimings.clear();

      this.emit("disconnected");

      if (this.config.debug) {
        console.log("[FabstirSDKHeadless] Disconnected");
      }
    } catch (error: any) {
      throw new FabstirError(
        ErrorCode.CONNECTION_ERROR,
        `Failed to disconnect: ${error.message}`
      );
    }
  }

  /**
   * Getter for isConnected (supports both property and method access)
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Check if SDK has read-only access (provider but no signer)
   */
  isReadOnly(): boolean {
    return this._isConnected && this.provider !== undefined && this.signer === undefined;
  }

  /**
   * Get current address (for backward compatibility)
   */
  async getAddress(): Promise<string | undefined> {
    if (this.signer) {
      return await this.signer.getAddress();
    }
    return undefined;
  }

  /**
   * Get current chain ID (for backward compatibility)
   */
  async getChainId(): Promise<number> {
    if (this.provider) {
      const network = await this.provider.getNetwork();
      return network.chainId;
    }
    // Return expected chain ID for mock mode
    if (this.config.mode === 'mock') {
      return 84532; // Base Sepolia
    }
    throw new Error("No provider available");
  }

  /**
   * Get current signer if available
   */
  getSigner(): ethers.Signer | undefined {
    return this.signer;
  }

  /**
   * Get current provider if available
   */
  getProvider(): ethers.providers.Provider | undefined {
    return this.provider;
  }

  /**
   * Ensure signer is available for write operations
   */
  private ensureSigner(operationName: string): ethers.Signer {
    if (!this.signer) {
      throw new FabstirError(
        ErrorCode.CONNECTION_ERROR,
        `No signer available for ${operationName}. Call setSigner() first or provide a signer.`
      );
    }
    return this.signer;
  }

  /**
   * Ensure provider is available for read operations
   */
  private ensureProvider(operationName: string): ethers.providers.Provider {
    if (!this.provider) {
      throw new FabstirError(
        ErrorCode.CONNECTION_ERROR,
        `No provider available for ${operationName}. Call setSigner() or connect() first.`
      );
    }
    return this.provider;
  }

  private getExpectedChainId(): number {
    switch (this.config.network) {
      case "base-sepolia":
        return 84532;
      case "base-mainnet":
        return 8453;
      case "local":
        return 31337;
      default:
        return 84532; // Default to Base Sepolia
    }
  }

  private recordOperationTiming(operation: string, duration: number, success: boolean = true): void {
    if (!this._operationTimings.has(operation)) {
      this._operationTimings.set(operation, []);
    }
    this._operationTimings.get(operation)!.push(duration);
    
    // Update metrics
    if (!this._performanceMetrics.has(operation)) {
      this._performanceMetrics.set(operation, {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Number.MAX_VALUE,
        maxTime: 0,
        errors: 0,
        successRate: 0
      });
    }
    
    const metrics = this._performanceMetrics.get(operation)!;
    metrics.count++;
    metrics.totalTime += duration;
    
    if (success) {
      // Update min/max
      metrics.minTime = Math.min(metrics.minTime, duration);
      metrics.maxTime = Math.max(metrics.maxTime, duration);
    } else {
      metrics.errors++;
    }
    
    metrics.averageTime = metrics.totalTime / metrics.count;
    metrics.successRate = (metrics.count - metrics.errors) / metrics.count;
  }

  // ===== Job Submission Methods =====

  /**
   * Post a job with token payment (USDC or ETH)
   * Can optionally accept a signer override
   */
  async postJobWithToken(
    jobDetails: any,
    requirements: any,
    paymentToken: string,
    paymentAmount: bigint,
    overrideSigner?: ethers.Signer
  ): Promise<ethers.ContractTransaction> {
    const signer = overrideSigner || this.ensureSigner('postJobWithToken');
    
    if (this.config.mode === "mock") {
      return this.mockPostJobWithToken(jobDetails, requirements, paymentToken, paymentAmount);
    }
    
    // In production mode, delegate to contract manager
    // Pass signer explicitly to contract manager
    return this.contracts.postJobWithToken(
      jobDetails,
      requirements,
      paymentToken,
      paymentAmount,
      signer
    );
  }

  /**
   * Approve USDC spending
   */
  async approveUSDC(amount: bigint, overrideSigner?: ethers.Signer): Promise<ethers.ContractTransaction> {
    const signer = overrideSigner || this.ensureSigner('approveUSDC');
    
    if (this.config.mode === "mock") {
      return this.mockApproveUSDC(amount);
    }
    
    return this.contracts.approveUSDC(amount, signer);
  }

  /**
   * Check USDC allowance
   */
  async checkUSDCAllowance(owner: string): Promise<bigint> {
    this.ensureProvider('checkUSDCAllowance');
    
    if (this.config.mode === "mock") {
      return BigInt(1000000000); // Mock: return large allowance
    }
    
    return this.contracts.checkUSDCAllowance(owner, this.provider!);
  }

  // ===== P2P Methods (don't need signer) =====

  /**
   * Discover nodes for a specific model
   */
  async discoverNodes(options: NodeDiscoveryOptions): Promise<DiscoveredNode[]> {
    if (this.config.mode === "mock") {
      return this.mockDiscoverNodes(options);
    }
    
    if (!this._p2pClient) {
      throw new FabstirError(
        ErrorCode.P2P_ERROR,
        "P2P client not initialized"
      );
    }
    
    // Check cache first
    const cacheKey = `${options.modelId}:${options.minReputation || 0}`;
    const cached = this._discoveryCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
      return cached.nodes;
    }
    
    const nodes = await this._p2pClient.findProviders(options.modelId, {
      timeout: options.maxLatency
    });
    
    // Update cache
    this._discoveryCache.set(cacheKey, { nodes, timestamp: Date.now() });
    
    return nodes;
  }

  // ===== Legacy compatibility methods =====
  
  /**
   * Submit a job (legacy method for backward compatibility)
   * Internally calls postJobWithToken with ETH as payment
   */
  async submitJob(jobRequest: any): Promise<number> {
    if (this.config.mode === "mock") {
      // Mock mode: return a random job ID
      const jobId = Math.floor(Math.random() * 1000000);
      this._jobs.set(jobId, {
        ...jobRequest,
        status: JobStatus.POSTED,
        timestamp: Date.now()
      });
      
      if (this.config.debug) {
        console.log("[FabstirSDKHeadless] Mock job submitted:", jobId);
      }
      
      return jobId;
    }
    
    // Production mode would call postJobWithToken
    throw new Error("submitJob not implemented in production mode. Use postJobWithToken instead.");
  }
  
  /**
   * Get job status (legacy method)
   */
  async getJobStatus(jobId: number): Promise<JobStatus> {
    if (this.config.mode === "mock") {
      const job = this._jobs.get(jobId);
      return job?.status || JobStatus.FAILED;
    }
    
    // Production mode would query contract
    throw new Error("getJobStatus not implemented in production mode");
  }
  
  /**
   * Create response stream (legacy method)
   */
  createResponseStream(jobId: number): any {
    if (this.config.mode === "mock") {
      // Return a mock stream
      const stream = new EventEmitter();
      
      // Simulate streaming tokens
      setTimeout(() => {
        stream.emit('token', { content: 'Hello', index: 0 });
        stream.emit('token', { content: ' world', index: 1 });
        stream.emit('end', { tokensGenerated: 2 });
      }, 100);
      
      return stream;
    }
    
    // Production mode would create real P2P stream
    throw new Error("createResponseStream not implemented in production mode");
  }
  
  /**
   * Get available models (legacy method)
   */
  async getModels(): Promise<string[]> {
    if (this.config.mode === "mock") {
      return ['gpt-4', 'llama2-7b', 'claude-2'];
    }
    
    // Production mode would discover from network
    return [];
  }
  
  /**
   * Estimate job cost (legacy method)
   */
  async estimateCost(jobRequest: any): Promise<bigint> {
    if (this.config.mode === "mock") {
      // Mock: simple calculation
      const tokensEstimate = jobRequest.maxTokens || 100;
      return BigInt(tokensEstimate * 1000000); // 1M wei per token
    }
    
    // Production mode would calculate based on model pricing
    throw new Error("estimateCost not implemented in production mode");
  }
  
  /**
   * Wait for job completion (legacy method)
   */
  async waitForJobCompletion(jobId: number, timeout: number = 30000): Promise<any> {
    if (this.config.mode === "mock") {
      // Mock: simulate completion after delay
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            jobId,
            result: "Mock result for job " + jobId,
            tokensUsed: 10
          });
        }, 1000);
      });
    }
    
    throw new Error("waitForJobCompletion not implemented in production mode");
  }
  
  /**
   * Validate job request (legacy method)
   */
  validateJobRequest(jobRequest: any): void {
    if (!jobRequest.modelId) {
      throw new Error("modelId is required");
    }
    if (!jobRequest.prompt) {
      throw new Error("prompt is required");
    }
    if (jobRequest.maxTokens && jobRequest.maxTokens < 1) {
      throw new Error("maxTokens must be positive");
    }
  }

  // ===== Mock implementations =====

  private mockPostJobWithToken(
    jobDetails: any,
    requirements: any,
    paymentToken: string,
    paymentAmount: bigint
  ): ethers.ContractTransaction {
    const mockTx: any = {
      hash: `0x${Math.random().toString(16).substr(2, 64)}`,
      wait: async () => ({
        transactionHash: mockTx.hash,
        status: 1,
        events: []
      })
    };
    
    // Store job in mock state
    const jobId = Math.floor(Math.random() * 1000000);
    this._jobs.set(jobId, {
      ...jobDetails,
      requirements,
      paymentToken,
      paymentAmount,
      status: JobStatus.POSTED
    });
    
    if (this.config.debug) {
      console.log("[FabstirSDKHeadless] Mock job posted:", jobId);
    }
    
    return mockTx as ethers.ContractTransaction;
  }

  private mockApproveUSDC(amount: bigint): ethers.ContractTransaction {
    const mockTx: any = {
      hash: `0x${Math.random().toString(16).substr(2, 64)}`,
      wait: async () => ({
        transactionHash: mockTx.hash,
        status: 1,
        events: []
      })
    };
    
    if (this.config.debug) {
      console.log("[FabstirSDKHeadless] Mock USDC approved:", amount.toString());
    }
    
    return mockTx as ethers.ContractTransaction;
  }

  private mockDiscoverNodes(options: NodeDiscoveryOptions): DiscoveredNode[] {
    return [
      {
        peerId: "mock-node-1",
        multiaddrs: ["/ip4/127.0.0.1/tcp/4001"],
        capabilities: {
          models: [options.modelId],
          maxTokens: 4096,
          pricePerToken: "1000000"
        },
        reputation: 95,
        latency: 50,
        lastSeen: Date.now()
      },
      {
        peerId: "mock-node-2",
        multiaddrs: ["/ip4/127.0.0.1/tcp/4002"],
        capabilities: {
          models: [options.modelId],
          maxTokens: 8192,
          pricePerToken: "1500000"
        },
        reputation: 88,
        latency: 75,
        lastSeen: Date.now()
      }
    ];
  }

  // ===== P2P Status Methods (for backward compatibility) =====
  
  /**
   * Get P2P status (for backward compatibility)
   */
  getP2PStatus(): string {
    if (this.config.mode === 'mock') {
      return 'disabled';
    }
    return this._p2pClient?.isStarted() ? 'connected' : 'disconnected';
  }

  /**
   * Check if P2P is enabled (for backward compatibility)
   */
  isP2PEnabled(): boolean {
    return this.config.mode === 'production' && this.config.p2pConfig !== undefined;
  }

  /**
   * Check if P2P is connected (for backward compatibility)
   */
  isP2PConnected(): boolean {
    if (this.config.mode === 'mock') {
      return false;
    }
    return this._p2pClient?.isStarted() || false;
  }
}

// Also export as default for convenience
export default FabstirSDKHeadless;