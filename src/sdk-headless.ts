// src/sdk-headless.ts
import { ethers } from "ethers";
import { EventEmitter } from "events";
import { HeadlessContractManager } from "./contracts-headless.js";
import { ErrorCode, FabstirError } from "./errors.js";
import { P2PClient } from "./p2p/client.js";
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

// Configuration without provider/signer
export interface HeadlessConfig {
  network?: "base-sepolia" | "base-mainnet" | "local";
  debug?: boolean;
  mode?: "mock" | "production";
  contractAddresses?: {
    jobMarketplace?: string;
    paymentEscrow?: string;
    nodeRegistry?: string;
  };
  p2pConfig?: P2PConfig;
  nodeDiscovery?: DiscoveryConfig;
  retryOptions?: RetryOptions;
  failoverStrategy?: FailoverStrategy;
  nodeBlacklistDuration?: number;
  enableJobRecovery?: boolean;
  recoveryDataTTL?: number;
  reliabilityThreshold?: number;
  nodeSelectionStrategy?: "reliability-weighted" | "random" | "price";
  maxCascadingRetries?: number;
  enableRecoveryReports?: boolean;
  enablePerformanceTracking?: boolean;
  discoveryConfig?: DiscoveryConfig;
}

/**
 * FabstirSDKHeadless - A headless SDK that accepts signers dynamically
 * This class can work in any JavaScript environment without browser dependencies
 */
export class FabstirSDKHeadless extends EventEmitter {
  public config: HeadlessConfig;
  public contracts: HeadlessContractManager;
  
  private provider?: ethers.providers.Provider;
  private signer?: ethers.Signer;
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
  private _mockTimeouts?: Map<number, NodeJS.Timeout[]>;

  constructor(config: HeadlessConfig = {}) {
    super();

    // Set default configuration
    this.config = {
      network: "base-sepolia",
      debug: false,
      mode: "mock",
      ...config,
    };

    // Validate mode
    if (this.config.mode !== "mock" && this.config.mode !== "production") {
      throw new Error(`Invalid SDK mode: ${this.config.mode}. Must be "mock" or "production"`);
    }

    // Initialize contract manager
    this.contracts = new HeadlessContractManager(this.config);

    // Initialize P2P client in production mode if config provided
    if (this.config.mode === "production" && this.config.p2pConfig) {
      this.initializeP2P();
    }
  }

  /**
   * Set or update the signer for blockchain operations
   * @param signer - ethers.Signer instance from the application
   */
  async setSigner(signer: ethers.Signer): Promise<void> {
    this.signer = signer;
    this.provider = signer.provider;

    if (!this.provider) {
      throw new Error("Signer must have a provider");
    }

    // Verify network
    const network = await this.provider.getNetwork();
    const expectedChainId = this.getExpectedChainId();

    if (network.chainId !== expectedChainId) {
      throw new Error(`Wrong network. Expected chain ID ${expectedChainId}, got ${network.chainId}`);
    }

    // Update contract manager with new network info
    await this.contracts.updateNetwork(this.provider);
    
    this._isConnected = true;
    
    // Emit connected event with address
    if (this.signer) {
      const address = await this.signer.getAddress();
      this.emit("connected", { address, chainId: network.chainId });
    }
  }

  /**
   * Remove the current signer
   */
  clearSigner(): void {
    this.signer = undefined;
    this.provider = undefined;
    this._isConnected = false;
    this.emit("disconnected");
  }

  /**
   * Check if SDK has a signer configured
   */
  hasSigner(): boolean {
    return this.signer !== undefined;
  }

  /**
   * Get current signer address if available
   */
  async getSignerAddress(): Promise<string | undefined> {
    if (!this.signer) return undefined;
    return await this.signer.getAddress();
  }

  private getExpectedChainId(): number {
    switch (this.config.network) {
      case "base-mainnet":
        return 8453;
      case "base-sepolia":
        return 84532;
      case "local":
        return 31337;
      default:
        return 84532; // Default to Base Sepolia
    }
  }

  private initializeP2P(): void {
    if (!this.config.p2pConfig) {
      throw new Error("P2P configuration required for production mode");
    }

    // Validate P2P config
    if (!this.config.p2pConfig.bootstrapNodes || this.config.p2pConfig.bootstrapNodes.length === 0) {
      throw new Error("At least one bootstrap node required for production mode");
    }

    this._p2pClient = new P2PClient(this.config.p2pConfig);
    
    // Set up P2P event listeners
    this._p2pClient.on('peer:connect', (peerId) => {
      this.emit('p2p:peer:connect', peerId);
    });
    
    this._p2pClient.on('peer:disconnect', (peerId) => {
      this.emit('p2p:peer:disconnect', peerId);
    });
    
    this._p2pClient.on('error', (error) => {
      this.emit('p2p:error', error);
    });
  }

  /**
   * Submit a job to the marketplace (requires signer)
   */
  async submitJob(request: Partial<JobRequest> & { prompt: string; modelId: string; offerPrice?: string; useP2P?: boolean }): Promise<JobResponse> {
    if (!this.signer) {
      throw new FabstirError(
        "No signer available. Call setSigner() first.",
        ErrorCode.CONNECTION_FAILED
      );
    }

    // Mock mode implementation
    if (this.config.mode === "mock") {
      return this.submitMockJob(request);
    }

    // Production mode - use P2P or contracts
    if (request.useP2P) {
      return this.submitP2PJob(request);
    } else {
      return this.submitContractJob(request);
    }
  }

  private async submitMockJob(request: any): Promise<JobResponse> {
    const jobId = Math.floor(Math.random() * 10000);
    
    // Store job
    this._jobs.set(jobId, {
      id: jobId,
      request,
      status: JobStatus.POSTED,
      createdAt: Date.now()
    });

    // Emit events
    this.emit("job:submitted", { jobId, request });

    // Simulate processing (store timeouts for cleanup)
    const processingTimeout = setTimeout(() => {
      const job = this._jobs.get(jobId);
      if (job) {
        job.status = JobStatus.PROCESSING;
        this.emit("job:processing", { jobId });
      }
    }, 1000);

    const completionTimeout = setTimeout(() => {
      const job = this._jobs.get(jobId);
      if (job) {
        job.status = JobStatus.COMPLETED;
        job.result = "Mock result for: " + request.prompt;
        this.emit("job:completed", { jobId, result: "Mock result" });
      }
    }, 3000);
    
    // Store timeouts for cleanup
    if (!this._mockTimeouts) {
      this._mockTimeouts = new Map();
    }
    this._mockTimeouts.set(jobId, [processingTimeout, completionTimeout]);

    return {
      requestId: String(jobId),
      nodeId: "mock-node",
      status: "accepted",
      estimatedTime: 3000
    };
  }

  private async submitP2PJob(request: any): Promise<JobResponse> {
    if (!this._p2pClient) {
      throw new FabstirError(
        "P2P client not initialized",
        ErrorCode.CONNECTION_FAILED
      );
    }

    // P2P job submission logic
    const jobId = this._p2pJobIdCounter++;
    
    // Discover nodes
    const nodes = await this.discoverNodes({
      modelId: request.modelId
    });

    if (nodes.length === 0) {
      throw new FabstirError(
        "No nodes available for model",
        ErrorCode.JOB_NOT_FOUND
      );
    }

    // Select best node and submit
    const node = nodes[0];
    if (!node) {
      throw new FabstirError(
        "No suitable node found",
        ErrorCode.JOB_NOT_FOUND
      );
    }
    // Convert to full JobRequest
    const fullRequest: JobRequest = {
      id: String(jobId),
      requester: await this.signer!.getAddress(),
      modelId: request.modelId,
      prompt: request.prompt,
      maxTokens: request.maxTokens || 1000,
      temperature: request.temperature,
      estimatedCost: ethers.BigNumber.from("1000000000000000"),
      timestamp: Date.now()
    };
    
    const response = await this._p2pClient.sendJobRequest(node.peerId, fullRequest);
    
    return response;
  }

  private async submitContractJob(request: any): Promise<JobResponse> {
    // Contract-based job submission
    // This would interact with smart contracts
    throw new Error("Contract job submission not yet implemented");
  }

  /**
   * Discover P2P nodes (doesn't require signer)
   */
  async discoverNodes(options: NodeDiscoveryOptions): Promise<DiscoveredNode[]> {
    if (this.config.mode === "mock") {
      // Return mock nodes
      return [
        {
          peerId: "mock-peer-1",
          multiaddrs: ["/ip4/127.0.0.1/tcp/4001"],
          capabilities: {
            models: [options.modelId],
            maxTokens: 4096,
            // streaming: true, // TODO: Add when type supports it
            pricePerToken: "1000000000000000"
          },
          reputation: 95,
          latency: 50,
          lastSeen: Date.now()
        }
      ];
    }

    if (!this._p2pClient) {
      throw new FabstirError(
        "P2P client not initialized",
        ErrorCode.CONNECTION_FAILED
      );
    }

    return this._p2pClient.findProviders(options.modelId);
  }

  /**
   * Get job status (may require signer for contract jobs)
   */
  async getJobStatus(jobId: number): Promise<JobStatus> {
    if (this.config.mode === "mock") {
      const job = this._jobs.get(jobId);
      return job?.status || JobStatus.FAILED;
    }

    // For contract jobs, would query blockchain
    if (jobId < 10000) {
      if (!this.signer) {
        throw new FabstirError(
          "Signer required for contract job status",
          ErrorCode.CONNECTION_FAILED
        );
      }
      // Query contract
    }

    // For P2P jobs
    const p2pJob = this._p2pJobStates.get(jobId);
    return p2pJob?.status || JobStatus.FAILED;
  }

  /**
   * Clean up resources
   */
  async disconnect(): Promise<void> {
    this.clearSigner();
    
    if (this._p2pClient) {
      await this._p2pClient.stop();
      this._p2pClient = undefined;
    }

    // Clear mock timeouts
    if (this._mockTimeouts) {
      for (const timeouts of this._mockTimeouts.values()) {
        timeouts.forEach(clearTimeout);
      }
      this._mockTimeouts.clear();
    }

    // Clear all state
    this._jobs.clear();
    this._jobEventEmitters.clear();
    this._payments.clear();
    this._paymentHistory.clear();
    this._activeStreams.clear();
    this._jobMappings.clear();
    this._p2pJobStates.clear();
    this._discoveryCache.clear();
    this._nodeReliability.clear();
    this._nodeBlacklist.clear();
    this._jobRecoveryData.clear();
    this._activeJobsByNode.clear();
    this._performanceMetrics.clear();
    this._operationTimings.clear();

    this.emit("disconnected");
  }
}