// src/index.ts
import { ethers } from "ethers";
import { EventEmitter } from "events";
import { ContractManager } from "./contracts";
import { ErrorCode, FabstirError } from "./errors";

// Export all types
export * from "./types";
export { ErrorCode, FabstirError } from "./errors";
export { ContractManager } from "./contracts";

// Main SDK configuration
export interface FabstirConfig {
  network?: "base-sepolia" | "base-mainnet" | "local";
  rpcUrl?: string;
  debug?: boolean;
  contractAddresses?: {
    jobMarketplace?: string;
    paymentEscrow?: string;
    nodeRegistry?: string;
  };
}

// Main SDK class
export class FabstirSDK extends EventEmitter {
  public config: FabstirConfig;
  public provider?: ethers.providers.Provider;
  public signer?: ethers.Signer;
  public contracts: ContractManager;

  private _isConnected: boolean = false;

  constructor(config: FabstirConfig = {}) {
    super();

    // Set default configuration
    this.config = {
      network: "base-sepolia",
      debug: false,
      ...config,
    };

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
  async submitJob(jobRequest: any): Promise<number> {
    throw new Error("Not implemented");
  }

  async estimateJobCost(jobRequest: any): Promise<any> {
    throw new Error("Not implemented");
  }

  async approvePayment(token: string, amount: any): Promise<any> {
    throw new Error("Not implemented");
  }

  async getJobDetails(jobId: number): Promise<any> {
    throw new Error("Not implemented");
  }

  async getJobStatus(jobId: number): Promise<any> {
    throw new Error("Not implemented");
  }

  onJobStatusChange(
    jobId: number,
    callback: (status: any) => void
  ): () => void {
    // Return unsubscribe function
    return () => {};
  }

  streamJobEvents(jobId: number, callback: (event: any) => void): () => void {
    // Return unsubscribe function
    return () => {};
  }

  async getJobHost(jobId: number): Promise<any> {
    throw new Error("Not implemented");
  }

  async waitForJobCompletion(jobId: number, options?: any): Promise<boolean> {
    throw new Error("Not implemented");
  }

  async getJobResult(jobId: number): Promise<any> {
    throw new Error("Not implemented");
  }

  async streamJobResponse(
    jobId: number,
    callback: (token: string) => void
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async getResultMetadata(jobId: number): Promise<any> {
    throw new Error("Not implemented");
  }

  async verifyResultProof(jobId: number): Promise<boolean> {
    throw new Error("Not implemented");
  }

  createResponseStream(
    jobId: number,
    options?: any
  ): AsyncIterableIterator<any> {
    throw new Error("Not implemented");
  }

  async withRetry(fn: () => Promise<any>, options: any): Promise<any> {
    throw new Error("Not implemented");
  }

  validateJobRequest(jobRequest: any): void {
    throw new Error("Not implemented");
  }
}
