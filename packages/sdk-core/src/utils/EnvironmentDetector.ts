/**
 * Environment Detector - Comprehensive environment and capability detection
 */

export interface EnvironmentCapabilities {
  // Environment type
  type: 'browser' | 'node' | 'react-native' | 'electron' | 'unknown';
  
  // Browser details
  browser?: {
    name: string;
    version: string;
    engine: string;
    isMobile: boolean;
  };
  
  // Node.js details
  node?: {
    version: string;
    platform: string;
    arch: string;
  };
  
  // Wallet capabilities
  wallet: {
    hasMetaMask: boolean;
    hasWalletConnect: boolean;
    hasInjectedProvider: boolean;
    providerName?: string;
  };
  
  // Storage capabilities
  storage: {
    hasLocalStorage: boolean;
    hasSessionStorage: boolean;
    hasIndexedDB: boolean;
    hasCookies: boolean;
  };
  
  // Network capabilities
  network: {
    hasWebSocket: boolean;
    hasFetch: boolean;
    hasXHR: boolean;
    hasWebRTC: boolean;
  };
  
  // Crypto capabilities
  crypto: {
    hasWebCrypto: boolean;
    hasNodeCrypto: boolean;
    hasSubtleCrypto: boolean;
  };
  
  // Feature support
  features: {
    supportsWorkers: boolean;
    supportsWasm: boolean;
    supportsBigInt: boolean;
    supportsProxy: boolean;
  };
}

export class EnvironmentDetector {
  /**
   * Detect all environment capabilities
   */
  static detect(): EnvironmentCapabilities {
    const caps: EnvironmentCapabilities = {
      type: this.detectEnvironmentType(),
      wallet: this.detectWalletCapabilities(),
      storage: this.detectStorageCapabilities(),
      network: this.detectNetworkCapabilities(),
      crypto: this.detectCryptoCapabilities(),
      features: this.detectFeatureSupport()
    };
    
    // Add browser details if in browser
    if (caps.type === 'browser' && typeof window !== 'undefined') {
      caps.browser = this.detectBrowserDetails();
    }
    
    // Add Node.js details if in Node
    if (caps.type === 'node' && typeof process !== 'undefined') {
      caps.node = this.detectNodeDetails();
    }
    
    return caps;
  }
  
  /**
   * Detect environment type
   */
  private static detectEnvironmentType(): 'browser' | 'node' | 'react-native' | 'electron' | 'unknown' {
    // Check for React Native
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      return 'react-native';
    }
    
    // Check for Electron
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
      return 'electron';
    }
    
    // Check for browser
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
      return 'browser';
    }
    
    // Check for Node.js
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      return 'node';
    }
    
    return 'unknown';
  }
  
  /**
   * Detect browser details
   */
  private static detectBrowserDetails(): any {
    if (typeof navigator === 'undefined') return undefined;
    
    const ua = navigator.userAgent;
    const details = {
      name: 'Unknown',
      version: '0',
      engine: 'Unknown',
      isMobile: /Mobile|Android|iPhone|iPad/i.test(ua)
    };
    
    // Detect browser name and version
    if (ua.indexOf('Chrome') > -1) {
      details.name = 'Chrome';
      details.engine = 'Blink';
      const match = ua.match(/Chrome\/(\d+)/);
      if (match) details.version = match[1];
    } else if (ua.indexOf('Firefox') > -1) {
      details.name = 'Firefox';
      details.engine = 'Gecko';
      const match = ua.match(/Firefox\/(\d+)/);
      if (match) details.version = match[1];
    } else if (ua.indexOf('Safari') > -1) {
      details.name = 'Safari';
      details.engine = 'WebKit';
      const match = ua.match(/Version\/(\d+)/);
      if (match) details.version = match[1];
    } else if (ua.indexOf('Edge') > -1) {
      details.name = 'Edge';
      details.engine = 'Blink';
      const match = ua.match(/Edge\/(\d+)/);
      if (match) details.version = match[1];
    }
    
    return details;
  }
  
  /**
   * Detect Node.js details
   */
  private static detectNodeDetails(): any {
    if (typeof process === 'undefined') return undefined;
    
    return {
      version: process.versions?.node || 'unknown',
      platform: process.platform || 'unknown',
      arch: process.arch || 'unknown'
    };
  }
  
  /**
   * Detect wallet capabilities
   */
  private static detectWalletCapabilities(): EnvironmentCapabilities['wallet'] {
    const caps: EnvironmentCapabilities['wallet'] = {
      hasMetaMask: false,
      hasWalletConnect: false,
      hasInjectedProvider: false
    };
    
    if (typeof window !== 'undefined') {
      // Check for MetaMask
      caps.hasMetaMask = !!(window as any).ethereum?.isMetaMask;
      
      // Check for any injected provider
      caps.hasInjectedProvider = !!(window as any).ethereum;
      
      // Try to detect provider name
      if ((window as any).ethereum) {
        if ((window as any).ethereum.isMetaMask) {
          caps.providerName = 'MetaMask';
        } else if ((window as any).ethereum.isCoinbaseWallet) {
          caps.providerName = 'Coinbase Wallet';
        } else if ((window as any).ethereum.isWalletConnect) {
          caps.providerName = 'WalletConnect';
        } else if ((window as any).ethereum.isBraveWallet) {
          caps.providerName = 'Brave Wallet';
        } else {
          caps.providerName = 'Unknown Wallet';
        }
      }
    }
    
    return caps;
  }
  
  /**
   * Detect storage capabilities
   */
  private static detectStorageCapabilities(): EnvironmentCapabilities['storage'] {
    const caps: EnvironmentCapabilities['storage'] = {
      hasLocalStorage: false,
      hasSessionStorage: false,
      hasIndexedDB: false,
      hasCookies: false
    };
    
    if (typeof window !== 'undefined') {
      // Check localStorage
      try {
        caps.hasLocalStorage = !!window.localStorage;
        window.localStorage.setItem('test', 'test');
        window.localStorage.removeItem('test');
      } catch {
        caps.hasLocalStorage = false;
      }
      
      // Check sessionStorage
      try {
        caps.hasSessionStorage = !!window.sessionStorage;
      } catch {
        caps.hasSessionStorage = false;
      }
      
      // Check IndexedDB
      caps.hasIndexedDB = !!(window as any).indexedDB;
      
      // Check cookies
      caps.hasCookies = navigator.cookieEnabled || false;
    }
    
    return caps;
  }
  
  /**
   * Detect network capabilities
   */
  private static detectNetworkCapabilities(): EnvironmentCapabilities['network'] {
    return {
      hasWebSocket: typeof WebSocket !== 'undefined',
      hasFetch: typeof fetch !== 'undefined',
      hasXHR: typeof XMLHttpRequest !== 'undefined',
      hasWebRTC: typeof RTCPeerConnection !== 'undefined'
    };
  }
  
  /**
   * Detect crypto capabilities
   */
  private static detectCryptoCapabilities(): EnvironmentCapabilities['crypto'] {
    const caps: EnvironmentCapabilities['crypto'] = {
      hasWebCrypto: false,
      hasNodeCrypto: false,
      hasSubtleCrypto: false
    };
    
    // Check Web Crypto API
    if (typeof crypto !== 'undefined') {
      caps.hasWebCrypto = true;
      caps.hasSubtleCrypto = !!crypto.subtle;
    }
    
    // Check Node crypto
    if (typeof process !== 'undefined') {
      try {
        require('crypto');
        caps.hasNodeCrypto = true;
      } catch {
        // crypto module not available
      }
    }
    
    return caps;
  }
  
  /**
   * Detect feature support
   */
  private static detectFeatureSupport(): EnvironmentCapabilities['features'] {
    return {
      supportsWorkers: typeof Worker !== 'undefined',
      supportsWasm: typeof WebAssembly !== 'undefined',
      supportsBigInt: typeof BigInt !== 'undefined',
      supportsProxy: typeof Proxy !== 'undefined'
    };
  }
  
  /**
   * Check if environment meets requirements
   */
  static checkRequirements(requirements: {
    needsWallet?: boolean;
    needsStorage?: boolean;
    needsWebSocket?: boolean;
    needsCrypto?: boolean;
    needsP2P?: boolean;
  }): { 
    meets: boolean; 
    missing: string[];
  } {
    const caps = this.detect();
    const missing: string[] = [];
    
    if (requirements.needsWallet && !caps.wallet.hasInjectedProvider) {
      missing.push('Web3 wallet (MetaMask, etc.)');
    }
    
    if (requirements.needsStorage && !caps.storage.hasIndexedDB) {
      missing.push('IndexedDB storage');
    }
    
    if (requirements.needsWebSocket && !caps.network.hasWebSocket) {
      missing.push('WebSocket support');
    }
    
    if (requirements.needsCrypto && !caps.crypto.hasWebCrypto) {
      missing.push('Web Crypto API');
    }
    
    if (requirements.needsP2P && caps.type === 'browser') {
      // P2P requires Node.js or bridge connection
      console.warn('P2P features require bridge connection in browser');
    }
    
    return {
      meets: missing.length === 0,
      missing
    };
  }
}