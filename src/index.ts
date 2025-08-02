// src/index.ts
import { ethers } from "ethers";
import { EventEmitter } from "events";
import { ContractManager } from "./contracts";
import { ErrorCode, FabstirError } from "./errors";
import { JobStatus, PaymentStatus } from "./types";

// Export all types
export * from "./types";
export { ErrorCode, FabstirError } from "./errors";
export { ContractManager } from "./contracts";
export { JobStatus } from "./types";
import { P2PConfig } from "./types";

// Main SDK configuration
export interface FabstirConfig {
  network?: "base-sepolia" | "base-mainnet" | "local";
  rpcUrl?: string;
  debug?: boolean;
  mode?: "mock" | "production";
  contractAddresses?: {
    jobMarketplace?: string;
    paymentEscrow?: string;
    nodeRegistry?: string;
  };
  p2pConfig?: P2PConfig;
}

// Main SDK class
export class FabstirSDK extends EventEmitter {
  public config: FabstirConfig;
  public provider?: ethers.providers.Provider;
  public signer?: ethers.Signer;
  public contracts: ContractManager;

  private _isConnected: boolean = false;
  private _jobs: Map<number, any> = new Map();
  private _jobEventEmitters: Map<number, EventEmitter> = new Map();
  private _payments: Map<number, any> = new Map();
  private _paymentHistory: Map<number, any[]> = new Map();
  private _paymentEventEmitter: EventEmitter = new EventEmitter();

  constructor(config: FabstirConfig = {}) {
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
      // Check if mode is null
      if (this.config.mode === null) {
        throw new Error(`Invalid SDK mode: null. Must be "mock" or "production"`);
      }
      // Check if mode is not a string
      if (typeof this.config.mode !== "string") {
        throw new Error(`Invalid SDK mode: ${this.config.mode}. Must be "mock" or "production"`);
      }
      // Check if mode is an empty string
      if (this.config.mode === "") {
        throw new Error(`Invalid SDK mode: . Must be "mock" or "production"`);
      }
      // Check if mode is a valid value
      if (this.config.mode !== "mock" && this.config.mode !== "production") {
        throw new Error(`Invalid SDK mode: ${this.config.mode}. Must be "mock" or "production"`);
      }
    }

    // Validate P2P configuration for production mode
    if (this.config.mode === "production") {
      if (!this.config.p2pConfig) {
        throw new Error("P2P configuration required for production mode");
      }

      // Validate bootstrap nodes
      if (!this.config.p2pConfig.bootstrapNodes || !Array.isArray(this.config.p2pConfig.bootstrapNodes)) {
        throw new Error("P2P configuration must include bootstrapNodes array");
      }

      if (this.config.p2pConfig.bootstrapNodes.length === 0) {
        throw new Error("At least one bootstrap node required for production mode");
      }

      // Validate bootstrap node format
      const validPrefixes = ['/ip4/', '/ip6/', '/dns4/', '/dnsaddr/'];
      for (const node of this.config.p2pConfig.bootstrapNodes) {
        if (typeof node !== 'string') {
          throw new Error("Bootstrap nodes must be strings");
        }
        
        const hasValidPrefix = validPrefixes.some(prefix => node.startsWith(prefix));
        if (!hasValidPrefix) {
          throw new Error(`Invalid bootstrap node format: ${node}`);
        }
      }

      // Apply defaults for optional P2P fields
      if (this.config.p2pConfig.enableDHT === undefined) {
        this.config.p2pConfig.enableDHT = true;
      }
      if (this.config.p2pConfig.enableMDNS === undefined) {
        this.config.p2pConfig.enableMDNS = true;
      }
      if (this.config.p2pConfig.dialTimeout === undefined) {
        this.config.p2pConfig.dialTimeout = 30000;
      }
      if (this.config.p2pConfig.requestTimeout === undefined) {
        this.config.p2pConfig.requestTimeout = 60000;
      }

      // Validate optional fields
      if (this.config.p2pConfig.enableDHT !== undefined && typeof this.config.p2pConfig.enableDHT !== 'boolean') {
        throw new Error("enableDHT must be a boolean");
      }
      if (this.config.p2pConfig.enableMDNS !== undefined && typeof this.config.p2pConfig.enableMDNS !== 'boolean') {
        throw new Error("enableMDNS must be a boolean");
      }
      if (this.config.p2pConfig.dialTimeout !== undefined) {
        if (typeof this.config.p2pConfig.dialTimeout !== 'number') {
          throw new Error("dialTimeout must be a number");
        }
        if (this.config.p2pConfig.dialTimeout <= 0) {
          throw new Error("dialTimeout must be a positive number");
        }
      }
      if (this.config.p2pConfig.requestTimeout !== undefined) {
        if (typeof this.config.p2pConfig.requestTimeout !== 'number' || this.config.p2pConfig.requestTimeout <= 0) {
          throw new Error("requestTimeout must be a positive number");
        }
      }
      if (this.config.p2pConfig.listenAddresses !== undefined) {
        if (!Array.isArray(this.config.p2pConfig.listenAddresses)) {
          throw new Error("listenAddresses must be an array");
        }
        for (const addr of this.config.p2pConfig.listenAddresses) {
          if (typeof addr !== 'string') {
            throw new Error("listenAddresses must be strings");
          }
        }
      }

      // Deep freeze p2pConfig
      if (this.config.p2pConfig) {
        Object.freeze(this.config.p2pConfig);
        if (this.config.p2pConfig.bootstrapNodes) {
          Object.freeze(this.config.p2pConfig.bootstrapNodes);
        }
        if (this.config.p2pConfig.listenAddresses) {
          Object.freeze(this.config.p2pConfig.listenAddresses);
        }
      }
    }

    // Make config immutable
    Object.freeze(this.config);

    // Initialize contract manager
    this.contracts = new ContractManager(this.config);

    if (this.config.debug) {
      console.log("[FabstirSDK] Initialized with config:", this.config);
    }
  }

  /**
   * Connect to a wallet provider
   */
  async connect(provider: ethers.providers.Provider): Promise<void> {
    try {
      this.provider = provider;

      // Get signer if available
      if ("getSigner" in provider) {
        this.signer = (
          provider as ethers.providers.JsonRpcProvider
        ).getSigner();
      }

      // Verify network
      const network = await provider.getNetwork();
      const expectedChainId = this.getExpectedChainId();

      if (network.chainId !== expectedChainId) {
        this._isConnected = false;
        throw new Error("Wrong network");
      }

      // Initialize contracts with provider
      await this.contracts.initialize(provider, this.signer);

      this._isConnected = true;
      this.emit("connected", { network, address: await this.getAddress() });

      if (this.config.debug) {
        console.log("[FabstirSDK] Connected to network:", network.name);
      }
    } catch (error: any) {
      this._isConnected = false;
      // Re-throw specific errors as-is
      if (error.message === "Wrong network") {
        throw error;
      }
      throw new FabstirError(
        "Failed to connect",
        ErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }

  /**
   * Get the connected address
   */
  async getAddress(): Promise<string | null> {
    if (!this.signer) return null;
    try {
      return await this.signer.getAddress();
    } catch (error) {
      return null;
    }
  }

  /**
   * Get the current chain ID
   */
  async getChainId(): Promise<number> {
    if (!this.provider) throw new Error("Not connected");
    const network = await this.provider.getNetwork();
    return network.chainId;
  }

  /**
   * Check if SDK is connected
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Disconnect from provider
   */
  async disconnect(): Promise<void> {
    this._isConnected = false;
    this.provider = undefined;
    this.signer = undefined;
    this.emit("disconnected");
  }

  /**
   * Get expected chain ID for configured network
   */
  private getExpectedChainId(): number {
    switch (this.config.network) {
      case "base-mainnet":
        return 8453;
      case "base-sepolia":
        return 84532;
      case "local":
        return 31337; // Hardhat/Anvil default
      default:
        return 84532; // Default to Base Sepolia
    }
  }

  // TODO: Implement these methods for the tests
  private _jobIdCounter: number = 0;
  
  async submitJob(jobRequest: any): Promise<number> {
    // Validate the job request first
    this.validateJobRequest(jobRequest);
    
    // Generate a mock job ID
    this._jobIdCounter++;
    const jobId = this._jobIdCounter;
    
    // Store job details
    const jobDetails = {
      id: jobId,
      status: JobStatus.POSTED,
      prompt: jobRequest.prompt,
      modelId: jobRequest.modelId,
      maxTokens: jobRequest.maxTokens,
      temperature: jobRequest.temperature || 0.7,
      paymentToken: jobRequest.paymentToken || 'USDC',
      maxPrice: jobRequest.maxPrice,
      client: await this.getAddress() || '0x0000000000000000000000000000000000000000',
      timestamp: Date.now(),
      host: null
    };
    
    this._jobs.set(jobId, jobDetails);
    
    // Create event emitter for this job
    const jobEmitter = new EventEmitter();
    this._jobEventEmitters.set(jobId, jobEmitter);
    
    // Create payment data
    const estimate = await this.estimateJobCost(jobRequest);
    const paymentData = {
      jobId,
      amount: estimate.estimatedCost,
      token: jobRequest.paymentToken || 'USDC',
      status: PaymentStatus.ESCROWED,
      payer: await this.getAddress() || '0x0000000000000000000000000000000000000000',
      recipient: '0x0000000000000000000000000000000000000000', // Will be set when job is claimed
      escrowedAt: Date.now(),
      releasedAt: undefined
    };
    
    this._payments.set(jobId, paymentData);
    
    // Initialize payment history
    this._paymentHistory.set(jobId, [{
      event: 'PaymentEscrowed',
      timestamp: Date.now(),
      data: {
        amount: paymentData.amount.toString(),
        token: paymentData.token
      }
    }]);
    
    // In a real implementation, this would:
    // 1. Call the JobMarketplace contract
    // 2. Emit events
    // 3. Return the actual job ID from the blockchain
    
    if (this.config.debug) {
      console.log(`[FabstirSDK] Submitted job ${jobId}`);
    }
    
    return jobId;
  }

  async estimateJobCost(jobRequest: any): Promise<any> {
    // Base price per token: $0.00001 (10 units in USDC 6 decimals)
    const pricePerToken = ethers.BigNumber.from(10);
    
    // Estimate prompt tokens: prompt.length / 4 (rough approximation)
    const promptTokens = Math.ceil(jobRequest.prompt.length / 4);
    
    // Total estimated tokens: prompt tokens + (maxTokens * 0.8) (assume 80% usage)
    const estimatedResponseTokens = Math.floor(jobRequest.maxTokens * 0.8);
    const estimatedTokens = promptTokens + estimatedResponseTokens;
    
    // Calculate estimated cost
    const estimatedCost = pricePerToken.mul(estimatedTokens);
    
    return {
      estimatedCost,
      estimatedTokens,
      pricePerToken,
      modelId: jobRequest.modelId,
      includesBuffer: true
    };
  }


  async getJobDetails(jobId: number): Promise<any> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    return { ...job };
  }

  async getJobStatus(jobId: number): Promise<JobStatus> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    return job.status;
  }

  onJobStatusChange(
    jobId: number,
    callback: (status: JobStatus) => void
  ): () => void {
    const jobEmitter = this._jobEventEmitters.get(jobId);
    if (!jobEmitter) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const handler = (status: JobStatus) => callback(status);
    jobEmitter.on('statusChange', handler);
    
    // Return unsubscribe function
    return () => {
      jobEmitter.removeListener('statusChange', handler);
    };
  }

  streamJobEvents(jobId: number, callback: (event: any) => void): () => void {
    const jobEmitter = this._jobEventEmitters.get(jobId);
    if (!jobEmitter) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const handler = (event: any) => callback(event);
    jobEmitter.on('event', handler);
    
    // Return unsubscribe function
    return () => {
      jobEmitter.removeListener('event', handler);
    };
  }

  async getJobHost(jobId: number): Promise<any> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    if (!job.host) {
      return null;
    }
    
    // Return mock host info
    return {
      address: job.host,
      reputation: 95,
      completedJobs: 42,
      failedJobs: 2,
      online: true,
      models: ['llama2-7b', 'llama2-13b'],
      stake: ethers.BigNumber.from('1000000000000000000') // 1 ETH
    };
  }

  async waitForJobCompletion(jobId: number, options?: any): Promise<boolean> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    // If already completed, return immediately
    if (job.status === JobStatus.COMPLETED) {
      return true;
    }
    
    const timeout = options?.timeout || 30000; // Default 30 seconds
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkStatus = setInterval(() => {
        const currentJob = this._jobs.get(jobId);
        if (currentJob?.status === JobStatus.COMPLETED) {
          clearInterval(checkStatus);
          resolve(true);
        } else if (Date.now() - startTime >= timeout) {
          clearInterval(checkStatus);
          resolve(false);
        }
      }, 100); // Check every 100ms
    });
  }

  async getJobResult(jobId: number): Promise<any> {
    const job = this._jobs.get(jobId);
    if (!job || !job.result) {
      throw new Error('Job result not found');
    }
    return { ...job.result };
  }

  async streamJobResponse(
    jobId: number,
    callback: (token: string) => void
  ): Promise<void> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    return new Promise((resolve, reject) => {
      const jobEmitter = this._jobEventEmitters.get(jobId);
      if (!jobEmitter) {
        reject(new Error(`Job ${jobId} not found`));
        return;
      }
      
      // Listen for tokens
      const tokenHandler = (token: string) => {
        callback(token);
      };
      
      // Listen for status changes
      const statusHandler = (status: JobStatus) => {
        if (status === JobStatus.COMPLETED) {
          jobEmitter.removeListener('token', tokenHandler);
          jobEmitter.removeListener('statusChange', statusHandler);
          resolve();
        } else if (status === JobStatus.FAILED) {
          jobEmitter.removeListener('token', tokenHandler);
          jobEmitter.removeListener('statusChange', statusHandler);
          reject(new Error('Job failed'));
        }
      };
      
      jobEmitter.on('token', tokenHandler);
      jobEmitter.on('statusChange', statusHandler);
      
      // Check if already completed
      if (job.status === JobStatus.COMPLETED) {
        jobEmitter.removeListener('token', tokenHandler);
        jobEmitter.removeListener('statusChange', statusHandler);
        resolve();
      } else if (job.status === JobStatus.FAILED) {
        jobEmitter.removeListener('token', tokenHandler);
        jobEmitter.removeListener('statusChange', statusHandler);
        reject(new Error('Job failed'));
      }
    });
  }

  async getResultMetadata(jobId: number): Promise<any> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const inferenceTime = job.result?.inferenceTime || 5000; // Default 5 seconds
    const tokensUsed = job.result?.tokensUsed || 0;
    const tokensPerSecond = inferenceTime > 0 ? (tokensUsed / (inferenceTime / 1000)) : 0;
    
    return {
      model: job.modelId,
      temperature: job.temperature || 0.7,
      inferenceTime,
      tokensPerSecond,
      totalTokens: tokensUsed
    };
  }

  async verifyResultProof(jobId: number): Promise<boolean> {
    throw new Error("Not implemented");
  }

  createResponseStream(
    jobId: number,
    options?: any
  ): AsyncIterableIterator<any> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const jobEmitter = this._jobEventEmitters.get(jobId);
    if (!jobEmitter) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    let tokenIndex = 0;
    const tokenQueue: any[] = [];
    let ended = false;
    let error: Error | null = null;
    
    // Set up token handler
    const tokenHandler = (token: string) => {
      tokenQueue.push({
        content: token,
        index: tokenIndex++,
        timestamp: Date.now()
      });
    };
    
    // Set up status handler
    const statusHandler = (status: JobStatus) => {
      if (status === JobStatus.COMPLETED) {
        ended = true;
        jobEmitter.removeListener('token', tokenHandler);
        jobEmitter.removeListener('statusChange', statusHandler);
      } else if (status === JobStatus.FAILED) {
        error = new Error('Job failed');
        ended = true;
        jobEmitter.removeListener('token', tokenHandler);
        jobEmitter.removeListener('statusChange', statusHandler);
      }
    };
    
    jobEmitter.on('token', tokenHandler);
    jobEmitter.on('statusChange', statusHandler);
    
    // Check initial status
    if (job.status === JobStatus.COMPLETED) {
      ended = true;
    } else if (job.status === JobStatus.FAILED) {
      error = new Error('Job failed');
      ended = true;
    }
    
    // Return async iterator
    return {
      async next() {
        // If there's an error, throw it
        if (error) {
          throw error;
        }
        
        // If we have tokens in queue, return them
        if (tokenQueue.length > 0) {
          const token = tokenQueue.shift()!;
          return { done: false, value: token };
        }
        
        // If ended and no more tokens, we're done
        if (ended) {
          return { done: true, value: undefined };
        }
        
        // Wait for more tokens or end
        return new Promise((resolve) => {
          const checkQueue = setInterval(() => {
            if (error) {
              clearInterval(checkQueue);
              throw error;
            }
            
            if (tokenQueue.length > 0) {
              clearInterval(checkQueue);
              const token = tokenQueue.shift()!;
              resolve({ done: false, value: token });
            } else if (ended) {
              clearInterval(checkQueue);
              resolve({ done: true, value: undefined });
            }
          }, 10);
        });
      },
      
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }

  async withRetry(fn: () => Promise<any>, options: any): Promise<any> {
    throw new Error("Not implemented");
  }

  validateJobRequest(jobRequest: any): void {
    // Validate prompt is not empty
    if (!jobRequest.prompt || jobRequest.prompt.trim() === '') {
      throw new Error('Invalid job request: prompt cannot be empty');
    }
    
    // Validate maxTokens is positive
    if (!jobRequest.maxTokens || jobRequest.maxTokens <= 0) {
      throw new Error('Invalid job request: maxTokens must be positive');
    }
    
    // Validate modelId is provided
    if (!jobRequest.modelId || jobRequest.modelId.trim() === '') {
      throw new Error('Invalid job request: modelId is required');
    }
  }
  
  // Testing helper methods
  async _simulateStatusChange(jobId: number, status: JobStatus): Promise<void> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    job.status = status;
    
    const jobEmitter = this._jobEventEmitters.get(jobId);
    if (jobEmitter) {
      jobEmitter.emit('statusChange', status);
    }
  }
  
  async _simulateJobEvent(jobId: number, event: any): Promise<void> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    // Handle specific event types
    if (event.type === 'claimed' && event.data?.host) {
      job.host = event.data.host;
      
      // Update payment recipient when job is claimed
      const payment = this._payments.get(jobId);
      if (payment) {
        payment.recipient = event.data.host;
      }
    }
    
    const jobEmitter = this._jobEventEmitters.get(jobId);
    if (jobEmitter) {
      jobEmitter.emit('event', { ...event, jobId });
    }
  }
  
  async _simulateJobResult(jobId: number, result: any): Promise<void> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    // Store the result with inference time
    job.result = {
      ...result,
      inferenceTime: result.inferenceTime || 5000 // Default 5 seconds
    };
  }
  
  async _simulateStreamToken(jobId: number, token: string): Promise<void> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const jobEmitter = this._jobEventEmitters.get(jobId);
    if (jobEmitter) {
      jobEmitter.emit('token', token);
    }
  }
  
  // Payment related methods
  async getPaymentDetails(jobId: number): Promise<any> {
    const payment = this._payments.get(jobId);
    if (!payment) {
      throw new Error(`Payment details not found for job ${jobId}`);
    }
    return { ...payment };
  }
  
  async calculateActualCost(jobId: number): Promise<any> {
    const job = this._jobs.get(jobId);
    if (!job || !job.result) {
      throw new Error(`Job ${jobId} not found or not completed`);
    }
    
    // Base price per token: $0.00001 (10 units in USDC 6 decimals)
    const pricePerToken = ethers.BigNumber.from(10);
    const tokensUsed = job.result.tokensUsed;
    const totalCost = pricePerToken.mul(tokensUsed);
    
    // Calculate breakdown: 85% host, 10% treasury, 5% stakers
    const hostPayment = totalCost.mul(85).div(100);
    const treasuryFee = totalCost.mul(10).div(100);
    const stakerReward = totalCost.mul(5).div(100);
    
    return {
      totalCost,
      tokensUsed,
      pricePerToken,
      breakdown: {
        hostPayment,
        treasuryFee,
        stakerReward
      }
    };
  }
  
  async approvePayment(token: string, amount: ethers.BigNumber): Promise<any> {
    // Generate mock transaction hash
    const randomBytes = ethers.utils.randomBytes(32);
    const hash = ethers.utils.hexlify(randomBytes);
    
    const tx = {
      hash,
      from: await this.getAddress() || '0x0000000000000000000000000000000000000000',
      to: '0x0000000000000000000000000000000000000000', // Mock token address
      value: ethers.BigNumber.from(0),
      wait: async () => ({
        transactionHash: hash,
        confirmations: 1,
        from: await this.getAddress() || '0x0000000000000000000000000000000000000000',
        to: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        status: 1,
        blockNumber: 1000000,
        blockHash: '0x' + '0'.repeat(64),
        transactionIndex: 0,
        gasUsed: ethers.BigNumber.from(50000),
        cumulativeGasUsed: ethers.BigNumber.from(50000),
        effectiveGasPrice: ethers.BigNumber.from('1000000000'),
        logs: [],
        logsBloom: '0x' + '0'.repeat(512),
        type: 2
      })
    };
    
    return tx;
  }
  
  async approveJobPayment(jobId: number): Promise<any> {
    const payment = this._payments.get(jobId);
    if (!payment) {
      throw new Error(`Payment not found for job ${jobId}`);
    }
    
    // Update payment status
    payment.status = PaymentStatus.RELEASED;
    payment.releasedAt = Date.now();
    
    // Update recipient to host if job was claimed
    const job = this._jobs.get(jobId);
    if (job && job.host) {
      payment.recipient = job.host;
    }
    
    // Add to payment history
    const history = this._paymentHistory.get(jobId) || [];
    history.push({
      event: 'PaymentReleased',
      timestamp: Date.now(),
      data: {
        amount: payment.amount.toString(),
        recipient: payment.recipient
      }
    });
    this._paymentHistory.set(jobId, history);
    
    // Emit payment event
    this._paymentEventEmitter.emit('payment', {
      type: 'PaymentReleased',
      jobId,
      amount: payment.amount,
      recipient: payment.recipient,
      timestamp: Date.now()
    });
    
    // Return mock transaction
    return this.approvePayment(payment.token, payment.amount);
  }
  
  async getPaymentStatus(jobId: number): Promise<PaymentStatus> {
    const payment = this._payments.get(jobId);
    if (!payment) {
      throw new Error(`Payment not found for job ${jobId}`);
    }
    return payment.status;
  }
  
  async requestRefund(jobId: number): Promise<any> {
    const payment = this._payments.get(jobId);
    if (!payment) {
      throw new Error(`Payment not found for job ${jobId}`);
    }
    
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    // Only allow refund for failed/cancelled jobs
    if (job.status !== JobStatus.FAILED && job.status !== JobStatus.CANCELLED) {
      throw new Error('Refund only available for failed or cancelled jobs');
    }
    
    // Update payment status
    payment.status = PaymentStatus.REFUNDED;
    payment.releasedAt = Date.now();
    
    // Add to payment history
    const history = this._paymentHistory.get(jobId) || [];
    history.push({
      event: 'PaymentRefunded',
      timestamp: Date.now(),
      data: {
        amount: payment.amount.toString(),
        reason: job.status
      }
    });
    this._paymentHistory.set(jobId, history);
    
    // Emit payment event
    this._paymentEventEmitter.emit('payment', {
      type: 'PaymentRefunded',
      jobId,
      amount: payment.amount,
      payer: payment.payer,
      timestamp: Date.now()
    });
    
    // Return mock transaction
    return this.approvePayment(payment.token, payment.amount);
  }
  
  async getPaymentHistory(jobId: number): Promise<any[]> {
    const history = this._paymentHistory.get(jobId);
    if (!history) {
      throw new Error(`Payment history not found for job ${jobId}`);
    }
    return [...history];
  }
  
  onPaymentEvent(callback: (event: any) => void): () => void {
    const handler = (event: any) => callback(event);
    this._paymentEventEmitter.on('payment', handler);
    
    // Return unsubscribe function
    return () => {
      this._paymentEventEmitter.removeListener('payment', handler);
    };
  }
  
  async calculateRefundAmount(jobId: number): Promise<ethers.BigNumber> {
    const job = this._jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const payment = this._payments.get(jobId);
    if (!payment) {
      throw new Error(`Payment not found for job ${jobId}`);
    }
    
    // Full refund for cancelled/failed jobs
    if (job.status === JobStatus.CANCELLED || job.status === JobStatus.FAILED) {
      return payment.amount;
    }
    
    // No refund for completed jobs
    if (job.status === JobStatus.COMPLETED) {
      return ethers.BigNumber.from(0);
    }
    
    // For other statuses, return full amount (could be adjusted based on business logic)
    return payment.amount;
  }
}
