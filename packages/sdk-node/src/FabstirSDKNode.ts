// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * FabstirSDKNode - Server-side SDK with full P2P and proof capabilities
 * 
 * Extends FabstirSDKCore with Node.js-specific features:
 * - Direct P2P networking via libp2p
 * - EZKL proof generation
 * - Built-in bridge server
 */

import { FabstirSDKCore, FabstirSDKCoreConfig } from '@fabstir/sdk-core';
import { UnifiedBridgeServer } from './bridge/UnifiedBridgeServer';
import { EZKLProofGenerator } from './proof/EZKLProofGenerator';
import { P2PBridgeServer } from './p2p/P2PBridgeServer';
import { ethers } from 'ethers';

export interface FabstirSDKNodeConfig extends FabstirSDKCoreConfig {
  // P2P configuration
  p2pConfig?: {
    enabled?: boolean;
    bootstrapNodes?: string[];
    listen?: string[];
    enableDHT?: boolean;
    enableMDNS?: boolean;
  };
  
  // Proof generation configuration
  proofConfig?: {
    enabled?: boolean;
    cacheDir?: string;
    modelPath?: string;
    settingsPath?: string;
  };
  
  // Bridge server configuration
  bridgeServerConfig?: {
    enabled?: boolean;
    port?: number;
    corsOrigin?: string;
  };
  
  // Node.js specific RPC options
  nodeRpcConfig?: {
    timeout?: number;
    retryCount?: number;
    keepAlive?: boolean;
  };
}

export class FabstirSDKNode extends FabstirSDKCore {
  private nodeConfig: FabstirSDKNodeConfig;
  private bridgeServer?: UnifiedBridgeServer;
  private proofGenerator?: EZKLProofGenerator;
  private p2pServer?: P2PBridgeServer;
  private isServerMode = false;
  
  constructor(config: FabstirSDKNodeConfig = {}) {
    super(config);
    this.nodeConfig = config;
    
    // Initialize Node.js specific components
    this.initializeNodeComponents();
  }
  
  /**
   * Initialize Node.js specific components
   */
  private initializeNodeComponents(): void {
    // Initialize proof generator if enabled
    if (this.nodeConfig.proofConfig?.enabled !== false) {
      this.proofGenerator = new EZKLProofGenerator(this.nodeConfig.proofConfig);
    }
    
    // Initialize P2P server if enabled
    if (this.nodeConfig.p2pConfig?.enabled !== false) {
      this.p2pServer = new P2PBridgeServer(this.nodeConfig.p2pConfig);
    }
  }
  
  /**
   * Start bridge server to serve browser clients
   */
  async startBridgeServer(port?: number): Promise<void> {
    if (this.bridgeServer) {
      throw new Error('Bridge server already running');
    }
    
    const serverPort = port || this.nodeConfig.bridgeServerConfig?.port || 3000;
    
    // Create unified bridge server
    this.bridgeServer = new UnifiedBridgeServer({
      port: serverPort,
      corsOrigin: this.nodeConfig.bridgeServerConfig?.corsOrigin || '*',
      p2pConfig: this.nodeConfig.p2pConfig,
      proofConfig: this.nodeConfig.proofConfig
    });
    
    await this.bridgeServer.start();
    this.isServerMode = true;
    
    console.log(`Bridge server started on port ${serverPort}`);
    console.log(`Browser clients can connect to: http://localhost:${serverPort}`);
  }
  
  /**
   * Stop bridge server
   */
  async stopBridgeServer(): Promise<void> {
    if (!this.bridgeServer) {
      return;
    }
    
    await this.bridgeServer.stop();
    this.bridgeServer = undefined;
    this.isServerMode = false;
    
    console.log('Bridge server stopped');
  }
  
  /**
   * Generate EZKL proof directly (without bridge)
   */
  async generateProof(input: {
    sessionId: string;
    jobId: string | bigint;
    tokensUsed: number;
    modelHash: string;
    inputData: any[];
    outputData: any[];
  }): Promise<{
    proof: string;
    publicInputs: string[];
    proofType: 'ezkl';
  }> {
    if (!this.proofGenerator) {
      throw new Error('Proof generator not initialized');
    }
    
    const result = await this.proofGenerator.generateProof(input);
    
    return {
      proof: result.proof,
      publicInputs: result.publicInputs,
      proofType: result.proofType
    };
  }
  
  /**
   * Start P2P node directly (without bridge)
   */
  async startP2PNode(): Promise<string> {
    if (!this.p2pServer) {
      this.p2pServer = new P2PBridgeServer(this.nodeConfig.p2pConfig);
    }
    
    // Start the P2P server which includes libp2p node
    await this.p2pServer.start(8080); // Use different port from bridge
    
    // Get the peer ID
    const status = await this.p2pServer['handleGetStatus']();
    return status.peerId || 'unknown';
  }
  
  /**
   * Stop P2P node
   */
  async stopP2PNode(): Promise<void> {
    if (!this.p2pServer) {
      return;
    }
    
    await this.p2pServer.stop();
    this.p2pServer = undefined;
  }
  
  /**
   * Override authenticate to support Node.js environments
   */
  async authenticate(method: string = 'privatekey', options?: any): Promise<void> {
    if (method === 'privatekey' && options?.privateKey) {
      // In Node.js, we can use JsonRpcProvider directly
      if (!this.nodeConfig.rpcUrl) {
        throw new Error('RPC URL required for Node.js authentication');
      }
      
      const provider = new ethers.JsonRpcProvider(
        this.nodeConfig.rpcUrl,
        undefined,
        this.nodeConfig.nodeRpcConfig
      );
      
      // Set provider and signer on the parent class
      (this as any).provider = provider;
      (this as any).signer = new ethers.Wallet(options.privateKey, provider);
      (this as any).authenticated = true;
      
      // Initialize contract manager
      const ContractManager = (await import('@fabstir/sdk-core')).ContractManager;
      (this as any).contractManager = new ContractManager(
        provider,
        (this as any).signer,
        this.nodeConfig.contractAddresses!
      );
      
      // Initialize managers
      await (this as any).initializeManagers();
    } else {
      // Fall back to parent implementation for browser-based auth
      await super.authenticate(method, options);
    }
  }
  
  /**
   * Get proof generator instance
   */
  getProofGenerator(): EZKLProofGenerator | undefined {
    return this.proofGenerator;
  }
  
  /**
   * Get P2P server instance
   */
  getP2PServer(): P2PBridgeServer | undefined {
    return this.p2pServer;
  }
  
  /**
   * Get bridge server instance
   */
  getBridgeServer(): UnifiedBridgeServer | undefined {
    return this.bridgeServer;
  }
  
  /**
   * Check if running in server mode
   */
  isInServerMode(): boolean {
    return this.isServerMode;
  }
  
  /**
   * Override to indicate Node environment
   */
  getEnvironment(): 'browser' | 'node' {
    return 'node';
  }
  
  /**
   * Get SDK version
   */
  getVersion(): string {
    return '1.0.0-node';
  }
  
  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Stop servers
    await this.stopBridgeServer();
    await this.stopP2PNode();
    
    // Clear Node.js specific components
    this.proofGenerator = undefined;
    
    // Call parent cleanup
    await this.disconnect();
  }
}