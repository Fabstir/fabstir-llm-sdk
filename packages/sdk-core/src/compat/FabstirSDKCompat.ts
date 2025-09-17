/**
 * FabstirSDKCompat - Compatibility layer for smooth migration
 * 
 * This class provides backward compatibility with the original FabstirSDK API
 * while using the new FabstirSDKCore under the hood.
 * 
 * @deprecated Use FabstirSDKCore directly for new code
 */

import { FabstirSDKCore } from '../FabstirSDKCore';
import { SDKError } from '../types';

/**
 * @deprecated Use FabstirSDKCore instead
 */
export class FabstirSDK {
  private core: FabstirSDKCore;
  private compatMode = true;
  private deprecationWarnings = new Set<string>();
  
  constructor(config: any = {}) {
    // Show deprecation warning once
    this.showDeprecationWarning('constructor', 'Use FabstirSDKCore instead');
    
    // Transform old config to new format
    const newConfig = this.transformConfig(config);
    
    // Create core SDK
    this.core = new FabstirSDKCore(newConfig);
  }
  
  /**
   * Transform old config format to new format
   */
  private transformConfig(oldConfig: any): any {
    const newConfig: any = {
      mode: oldConfig.mode,
      rpcUrl: oldConfig.rpcUrl,
      chainId: oldConfig.chainId,
      contractAddresses: oldConfig.contractAddresses,
      s5Config: oldConfig.s5Config || oldConfig.s5PortalUrl ? {
        portalUrl: oldConfig.s5PortalUrl,
        ...oldConfig.s5Config
      } : undefined,
      smartWallet: oldConfig.smartWallet
    };
    
    // Handle P2P config (will need bridge in browser)
    if (oldConfig.p2pConfig) {
      this.showDeprecationWarning('p2pConfig', 'P2P now requires bridge server connection');
      newConfig.bridgeConfig = {
        url: oldConfig.bridgeUrl || 'http://localhost:3000',
        autoConnect: true
      };
    }
    
    return newConfig;
  }
  
  /**
   * Show deprecation warning (only once per feature)
   */
  private showDeprecationWarning(feature: string, message: string): void {
    if (!this.deprecationWarnings.has(feature)) {
      console.warn(`[FabstirSDK Deprecation] ${feature}: ${message}`);
      this.deprecationWarnings.add(feature);
    }
  }
  
  /**
   * Authenticate - compatible with old API
   */
  async authenticate(privateKeyOrProvider?: string | any): Promise<any> {
    // Handle old-style authentication
    if (typeof privateKeyOrProvider === 'string') {
      // Private key provided
      return await this.core.authenticate('privatekey', { 
        privateKey: privateKeyOrProvider 
      });
    } else if (privateKeyOrProvider?.provider) {
      // Custom provider provided (not supported in browser)
      throw new SDKError(
        'Custom providers not supported in browser. Use MetaMask or private key.',
        'UNSUPPORTED_AUTH'
      );
    } else {
      // Default to MetaMask in browser
      if (typeof window !== 'undefined' && window.ethereum) {
        return await this.core.authenticate('metamask');
      } else {
        throw new SDKError(
          'No authentication method available',
          'NO_AUTH_METHOD'
        );
      }
    }
  }
  
  /**
   * Get managers - proxy to core
   */
  getAuthManager() {
    return this.core.getAuthManager();
  }
  
  getPaymentManager() {
    return this.core.getPaymentManager();
  }
  
  getStorageManager() {
    return this.core.getStorageManager();
  }
  
  getSessionManager() {
    return this.core.getSessionManager();
  }
  
  getHostManager() {
    return this.core.getHostManager();
  }
  
  getTreasuryManager() {
    return this.core.getTreasuryManager();
  }
  
  /**
   * Get DiscoveryManager - needs special handling
   */
  getDiscoveryManager() {
    this.showDeprecationWarning(
      'getDiscoveryManager',
      'P2P discovery now requires bridge connection. Use getBridgeClient() instead.'
    );
    
    // Return a compatibility wrapper
    return {
      createNode: async () => {
        const bridge = this.core.getBridgeClient();
        if (!bridge) {
          throw new SDKError(
            'P2P features require bridge connection. Call connectToBridge() first.',
            'BRIDGE_REQUIRED'
          );
        }
        const p2p = bridge.getP2PClient();
        await p2p.connect(bridge['config'].bridgeUrl);
        // Return actual client ID from authenticated address
        const signer = this.core.getSigner();
        if (signer) {
          const address = await signer.getAddress();
          return `client-${address.slice(2, 10)}`; // Use first 8 chars of address
        }
        throw new SDKError('Not authenticated', 'NOT_AUTHENTICATED');
      },
      
      discoverPeers: async () => {
        const bridge = this.core.getBridgeClient();
        if (!bridge) {
          throw new SDKError(
            'P2P features require bridge connection. Call connectToBridge() first.',
            'BRIDGE_REQUIRED'
          );
        }
        const p2p = bridge.getP2PClient();
        const result = await p2p.discoverNodes();
        return result.nodes;
      },
      
      findHost: async (criteria?: any) => {
        // Query NodeRegistry contract for active hosts
        try {
          const provider = this.core.getProvider();
          const contractAddresses = (this.core as any).contractAddresses;

          if (!contractAddresses?.nodeRegistry) {
            throw new SDKError('NodeRegistry contract address not configured', 'NO_NODE_REGISTRY');
          }

          // Import ethers and ABI
          const { ethers } = await import('ethers');
          const nodeRegistryABI = await import('../contracts/abis/NodeRegistry-CLIENT-ABI.json');

          // Create contract instance
          const nodeRegistry = new ethers.Contract(
            contractAddresses.nodeRegistry,
            nodeRegistryABI.default || nodeRegistryABI,
            provider
          );

          // Get all hosts
          const hosts = await nodeRegistry['getAllHosts']();

          // Filter for active hosts with stake
          const activeHosts = hosts.filter((host: any) => {
            return host.isActive && BigInt(host.stake.toString()) > 0n;
          });

          if (activeHosts.length === 0) {
            throw new SDKError('No active hosts available', 'NO_ACTIVE_HOSTS');
          }

          // Return random active host
          const randomIndex = Math.floor(Math.random() * activeHosts.length);
          return activeHosts[randomIndex].hostAddress;
        } catch (error: any) {
          // If it's already an SDKError, re-throw it
          if (error instanceof SDKError) {
            throw error;
          }
          // Otherwise wrap it
          throw new SDKError(
            `Failed to find host: ${error.message}`,
            'FIND_HOST_ERROR'
          );
        }
      }
    };
  }
  
  /**
   * Get InferenceManager - needs special handling for proofs
   */
  getInferenceManager() {
    this.showDeprecationWarning(
      'getInferenceManager',
      'Use SessionManager for inference. Proof generation requires bridge connection.'
    );
    
    const sessionManager = this.core.getSessionManager();
    const bridge = this.core.getBridgeClient();
    
    // Return compatibility wrapper
    return {
      startSession: sessionManager.createSession.bind(sessionManager),
      sendPrompt: sessionManager.sendPrompt.bind(sessionManager),
      endSession: sessionManager.endSession.bind(sessionManager),
      
      generateProof: async (sessionId: string, tokensUsed: number) => {
        if (!bridge) {
          // Return mock proof
          return '0x' + '00'.repeat(256);
        }
        
        const proofClient = bridge.getProofClient();
        const proofId = await proofClient.requestProof({
          sessionId,
          jobId: sessionId,
          tokensUsed
        });
        
        const result = await proofClient.getProofResult(proofId);
        return result.proof;
      }
    };
  }
  
  /**
   * Connect to bridge (new method, but useful for compat)
   */
  async connectToBridge(url?: string): Promise<void> {
    await this.core.connectToBridge(url);
  }
  
  /**
   * Check feature availability
   */
  isP2PAvailable(): boolean {
    return this.core.isP2PAvailable();
  }
  
  isProofAvailable(): boolean {
    return this.core.isProofAvailable();
  }
  
  /**
   * Get provider/signer (proxy to core)
   */
  get provider() {
    return this.core.getProvider();
  }
  
  get signer() {
    return this.core.getSigner();
  }
  
  /**
   * Compatibility properties
   */
  get config() {
    this.showDeprecationWarning('config', 'Config access pattern is deprecated');
    return (this.core as any).config;
  }
  
  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    await this.core.disconnect();
  }
}

// Export as default for maximum compatibility
export default FabstirSDK;