/**
 * FabstirSDKFactory - Smart factory for creating appropriate SDK instance
 * 
 * Automatically detects environment and creates the right SDK:
 * - Browser: FabstirSDKCore
 * - Node.js: FabstirSDKNode (if available)
 */

import { FabstirSDKCore, FabstirSDKCoreConfig } from '../FabstirSDKCore';
import { SDKError } from '../types';

export interface SDKFactoryConfig extends FabstirSDKCoreConfig {
  // Force specific SDK type
  forceType?: 'core' | 'node' | 'auto';
  
  // Node-specific config (used if sdk-node is available)
  nodeConfig?: {
    p2pConfig?: any;
    proofConfig?: any;
    bridgeServerConfig?: any;
  };
}

export interface SDKEnvironment {
  isBrowser: boolean;
  isNode: boolean;
  hasWindow: boolean;
  hasProcess: boolean;
  hasMetaMask: boolean;
  nodeVersion?: string;
  userAgent?: string;
}

/**
 * Factory class for creating SDK instances
 */
export class FabstirSDKFactory {
  /**
   * Create SDK instance based on environment
   */
  static async create(config: SDKFactoryConfig = {}): Promise<FabstirSDKCore | any> {
    const env = this.detectEnvironment();
    const sdkType = this.determineSdkType(config.forceType, env);
    
    console.log(`[FabstirSDK] Environment: ${env.isBrowser ? 'Browser' : 'Node.js'}`);
    console.log(`[FabstirSDK] Creating ${sdkType} SDK`);
    
    if (sdkType === 'node') {
      return await this.createNodeSDK(config);
    } else {
      return this.createCoreSDK(config);
    }
  }
  
  /**
   * Create browser SDK
   */
  static createCoreSDK(config: SDKFactoryConfig): FabstirSDKCore {
    return new FabstirSDKCore(config);
  }
  
  /**
   * Create Node.js SDK (dynamic import)
   */
  static async createNodeSDK(config: SDKFactoryConfig): Promise<any> {
    try {
      // Dynamic import to avoid bundling sdk-node in browser
      const { FabstirSDKNode } = await import('@fabstir/sdk-node');
      
      // Merge node-specific config
      const nodeConfig = {
        ...config,
        ...config.nodeConfig
      };
      
      return new FabstirSDKNode(nodeConfig);
      
    } catch (error: any) {
      // sdk-node not available, fall back to core
      console.warn('[FabstirSDK] sdk-node not available, using sdk-core');
      console.warn('[FabstirSDK] P2P and EZKL features will require bridge connection');
      
      return this.createCoreSDK(config);
    }
  }
  
  /**
   * Detect current environment
   */
  static detectEnvironment(): SDKEnvironment {
    const env: SDKEnvironment = {
      isBrowser: false,
      isNode: false,
      hasWindow: typeof window !== 'undefined',
      hasProcess: typeof process !== 'undefined',
      hasMetaMask: false
    };
    
    // Check for browser
    if (env.hasWindow && typeof window.document !== 'undefined') {
      env.isBrowser = true;
      env.hasMetaMask = typeof window.ethereum !== 'undefined';
      env.userAgent = window.navigator?.userAgent;
    }
    
    // Check for Node.js
    if (env.hasProcess && process.versions && process.versions.node) {
      env.isNode = true;
      env.nodeVersion = process.versions.node;
    }
    
    // Edge cases
    if (!env.isBrowser && !env.isNode) {
      // Unknown environment, assume browser-like
      env.isBrowser = true;
    }
    
    return env;
  }
  
  /**
   * Determine which SDK type to use
   */
  static determineSdkType(
    forceType: string | undefined,
    env: SDKEnvironment
  ): 'core' | 'node' {
    // If forced, use that
    if (forceType === 'core' || forceType === 'node') {
      return forceType;
    }
    
    // Auto-detect based on environment
    if (env.isBrowser) {
      return 'core';
    } else if (env.isNode) {
      return 'node';
    } else {
      // Default to core for safety
      return 'core';
    }
  }
  
  /**
   * Check feature availability
   */
  static async checkFeatures(): Promise<{
    environment: SDKEnvironment;
    features: {
      contracts: boolean;
      storage: boolean;
      metamask: boolean;
      p2pDirect: boolean;
      p2pBridge: boolean;
      proofGeneration: boolean;
      bridgeServer: boolean;
    };
  }> {
    const env = this.detectEnvironment();
    
    const features = {
      contracts: true, // Always available
      storage: true,   // S5.js works everywhere
      metamask: env.hasMetaMask,
      p2pDirect: false,
      p2pBridge: true, // Can connect to bridge
      proofGeneration: false,
      bridgeServer: false
    };
    
    // Check for Node.js features
    if (env.isNode) {
      try {
        // Check if sdk-node is available
        await import('@fabstir/sdk-node');
        features.p2pDirect = true;
        features.proofGeneration = true;
        features.bridgeServer = true;
      } catch {
        // sdk-node not available
      }
    }
    
    return { environment: env, features };
  }
  
  /**
   * Create SDK with automatic configuration
   */
  static async createAutoConfigured(baseConfig?: Partial<SDKFactoryConfig>): Promise<any> {
    const env = this.detectEnvironment();
    
    // Build configuration based on environment
    const config: SDKFactoryConfig = {
      ...baseConfig
    };
    
    // Auto-configure for browser
    if (env.isBrowser) {
      // Use NEXT_PUBLIC_ or REACT_APP_ prefixed env vars
      if (!config.rpcUrl) {
        config.rpcUrl = 
          (window as any).NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA ||
          (window as any).REACT_APP_RPC_URL_BASE_SEPOLIA;
      }
      
      if (!config.contractAddresses) {
        config.contractAddresses = {
          jobMarketplace: (window as any).NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
          nodeRegistry: (window as any).NEXT_PUBLIC_CONTRACT_NODE_REGISTRY,
          // ... other contracts
        };
      }
      
      // Auto-configure bridge if URL is available
      if (!config.bridgeConfig) {
        const bridgeUrl = 
          (window as any).NEXT_PUBLIC_BRIDGE_URL ||
          (window as any).REACT_APP_BRIDGE_URL;
          
        if (bridgeUrl) {
          config.bridgeConfig = {
            url: bridgeUrl,
            autoConnect: true
          };
        }
      }
    }
    
    // Auto-configure for Node.js
    if (env.isNode) {
      // Use process.env
      if (!config.rpcUrl && process.env.RPC_URL_BASE_SEPOLIA) {
        config.rpcUrl = process.env.RPC_URL_BASE_SEPOLIA;
      }
      
      if (!config.contractAddresses) {
        config.contractAddresses = {
          jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
          nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
          // ... other contracts
        };
      }
      
      // Configure Node-specific features
      config.nodeConfig = {
        p2pConfig: {
          enabled: true,
          bootstrapNodes: process.env.P2P_BOOTSTRAP_NODES?.split(',')
        },
        proofConfig: {
          enabled: true,
          cacheDir: process.env.PROOF_CACHE_DIR || './proofs'
        },
        bridgeServerConfig: {
          enabled: process.env.BRIDGE_SERVER_ENABLED === 'true',
          port: process.env.BRIDGE_SERVER_PORT ? 
            parseInt(process.env.BRIDGE_SERVER_PORT) : 3000
        }
      };
    }
    
    return this.create(config);
  }
}

/**
 * Convenience function for creating SDK
 */
export async function createFabstirSDK(
  config?: SDKFactoryConfig
): Promise<FabstirSDKCore | any> {
  return FabstirSDKFactory.create(config || {});
}

/**
 * Convenience function for auto-configured SDK
 */
export async function createAutoSDK(
  config?: Partial<SDKFactoryConfig>
): Promise<any> {
  return FabstirSDKFactory.createAutoConfigured(config);
}

// Export for backward compatibility
export default FabstirSDKFactory;