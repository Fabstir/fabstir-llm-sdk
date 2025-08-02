# Fabstir LLM SDK Configuration Guide

This guide covers all configuration options available in the Fabstir LLM SDK, including defaults, environment variables, and best practices.

## Table of Contents

- [Configuration Overview](#configuration-overview)
- [SDK Configuration](#sdk-configuration)
- [Mode Configuration](#mode-configuration)
- [Network Configuration](#network-configuration)
- [P2P Configuration](#p2p-configuration)
- [Contract Configuration](#contract-configuration)
- [Performance Configuration](#performance-configuration)
- [Security Configuration](#security-configuration)
- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)
- [Best Practices](#best-practices)

## Configuration Overview

The SDK can be configured through:

1. **Constructor options** - Direct configuration object
2. **Environment variables** - For sensitive data and deployment settings
3. **Configuration files** - For complex setups
4. **Runtime updates** - Some settings can be changed after initialization

### Configuration Priority

Configuration sources are applied in this order (highest to lowest priority):

1. Runtime method parameters
2. Constructor configuration object
3. Environment variables
4. Default values

## SDK Configuration

### Complete Configuration Interface

```typescript
interface SDKConfig {
  // Core settings
  mode?: "mock" | "production";                    // Default: "production"
  network?: string;                                // Default: "base-sepolia"
  debug?: boolean;                                 // Default: false
  
  // Component configurations
  p2pConfig?: P2PConfig;                          // P2P network settings
  contracts?: ContractConfig;                      // Smart contract addresses
  retryOptions?: RetryOptions;                     // Global retry settings
  performanceConfig?: PerformanceConfig;           // Performance tuning
  securityConfig?: SecurityConfig;                 // Security settings
  
  // Feature flags
  enablePerformanceTracking?: boolean;             // Default: false
  enableJobRecovery?: boolean;                     // Default: true
  enableAutoFailover?: boolean;                    // Default: true
  enableMetrics?: boolean;                         // Default: false
  
  // Advanced options
  failoverStrategy?: FailoverStrategy;             // Default: "automatic"
  nodeSelectionStrategy?: SelectionStrategy;       // Default: "balanced"
  cachingStrategy?: CachingStrategy;               // Default: "memory"
  
  // Timeouts and limits
  defaultTimeout?: number;                         // Default: 60000 (60s)
  maxConcurrentJobs?: number;                      // Default: 10
  maxRetries?: number;                             // Default: 3
  
  // Event handling
  eventConfig?: EventConfig;                       // Event emitter settings
}
```

### Minimal Configuration

```typescript
// Minimal production setup
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: ["/ip4/34.70.224.193/tcp/4001/p2p/12D3KooW..."]
  }
});

// Minimal mock setup (for development)
const sdk = new FabstirSDK({
  mode: "mock"
});
```

## Mode Configuration

### Mock Mode

Mock mode is designed for development and testing without real network connections:

```typescript
const sdk = new FabstirSDK({
  mode: "mock",
  
  // Mock-specific options
  mockConfig: {
    // Response generation
    defaultResponse: "Mock response for: {prompt}",
    responseDelay: 100,                   // Milliseconds
    streamingDelay: 50,                   // Delay between tokens
    
    // Behavior simulation
    simulateErrors: true,                 // Random errors for testing
    errorRate: 0.1,                       // 10% error rate
    
    // Mock data
    mockNodes: [
      {
        peerId: "12D3KooWMockNode1",
        capabilities: {
          models: ["llama-3.2-1b-instruct", "gpt-4"],
          maxTokens: 4096,
          pricePerToken: "1000000"
        }
      }
    ],
    
    // Performance simulation
    simulateLatency: true,
    latencyRange: [50, 200],              // Min/max ms
  }
});
```

### Production Mode

Production mode connects to real P2P network and blockchain:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  
  // Production-specific settings
  productionConfig: {
    // Network verification
    requireBootstrapConnection: true,      // Fail if can't connect
    minBootstrapNodes: 2,                 // Minimum connected nodes
    
    // Health checks
    enableHealthChecks: true,
    healthCheckInterval: 300000,          // 5 minutes
    
    // Resource limits
    maxMemoryUsage: 500 * 1024 * 1024,   // 500MB
    maxConnectionsPerNode: 3,
    
    // Blockchain settings
    confirmationBlocks: 2,                // Wait for confirmations
    gasMultiplier: 1.2,                   // Gas price buffer
  }
});
```

## Network Configuration

### Network Selection

```typescript
const sdk = new FabstirSDK({
  network: "base-sepolia",  // or "base-mainnet"
  
  // Custom network configuration
  networkConfig: {
    chainId: 84532,
    rpcUrl: "https://base-sepolia.public.blastapi.io",
    explorerUrl: "https://sepolia.basescan.org",
    
    // Gas settings
    gasPrice: "auto",              // "auto" | BigNumber
    maxFeePerGas: "50000000000",   // 50 gwei
    maxPriorityFeePerGas: "2000000000", // 2 gwei
    
    // Transaction settings
    txTimeout: 120000,             // 2 minutes
    txRetries: 3,
    
    // Block monitoring
    blockPollingInterval: 3000,    // 3 seconds
  }
});
```

### Multi-Network Support

```typescript
const sdk = new FabstirSDK({
  // Primary network
  network: "base-sepolia",
  
  // Fallback networks
  networks: {
    "base-sepolia": {
      rpcUrl: "https://base-sepolia.public.blastapi.io",
      contracts: {
        jobMarketplace: "0x742d35Cc...",
        paymentEscrow: "0x12892b2f...",
        nodeRegistry: "0x8Ba7968C..."
      }
    },
    "polygon-mumbai": {
      rpcUrl: "https://rpc-mumbai.maticvigil.com",
      contracts: {
        jobMarketplace: "0x456def...",
        paymentEscrow: "0x789abc...",
        nodeRegistry: "0xdef123..."
      }
    }
  },
  
  // Network selection strategy
  networkSelection: "latency" // "latency" | "cost" | "reliability"
});
```

## P2P Configuration

### Complete P2P Options

```typescript
const sdk = new FabstirSDK({
  p2pConfig: {
    // Required: Bootstrap nodes
    bootstrapNodes: [
      "/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg",
      "/ip4/35.185.215.242/tcp/4001/p2p/12D3KooWQH5gJ9YjDfRpLnBKY7vtkbPQkxQ5XbVJHmENw5YjLs2V"
    ],
    
    // Discovery mechanisms
    enableDHT: true,
    enableMDNS: true,
    enableBootstrapDiscovery: true,
    
    // Custom discovery
    customDiscovery: {
      enabled: true,
      endpoint: "https://nodes.fabstir.com/api/v1/peers",
      interval: 60000,
      timeout: 10000
    },
    
    // Connection settings
    dialTimeout: 30000,
    requestTimeout: 60000,
    keepAliveInterval: 30000,
    
    // Transport configuration
    transports: {
      tcp: { enabled: true, port: 0 },      // Random port
      websocket: { enabled: true, port: 0 },
      webrtc: { enabled: false }            // Disabled by default
    },
    
    // Listen addresses
    listenAddresses: [
      "/ip4/0.0.0.0/tcp/0",                // Any available port
      "/ip4/0.0.0.0/tcp/0/ws"              // WebSocket
    ],
    
    // Connection management
    connectionManager: {
      maxConnections: 100,
      minConnections: 10,
      autoDial: true,
      autoDialInterval: 10000,
      
      // Connection scoring
      scoreThresholds: {
        disconnect: -50,
        reconnect: -20,
        ban: -100
      }
    },
    
    // Protocol settings
    protocols: {
      job: "/fabstir/job/1.0.0",
      stream: "/fabstir/stream/1.0.0",
      discovery: "/fabstir/discovery/1.0.0"
    },
    
    // Relay configuration (for NAT traversal)
    relay: {
      enabled: true,
      hop: {
        enabled: false,    // Don't relay for others
        active: false
      },
      autoRelay: {
        enabled: true,
        maxListeners: 2
      }
    }
  }
});
```

### P2P Performance Tuning

```typescript
const sdk = new FabstirSDK({
  p2pConfig: {
    bootstrapNodes: [...],
    
    // Performance optimizations
    performance: {
      // Message batching
      messageBatching: true,
      batchSize: 10,
      batchTimeout: 100,
      
      // Connection pooling
      connectionPooling: true,
      poolSize: 20,
      poolTimeout: 300000,
      
      // Caching
      peerCaching: true,
      peerCacheTTL: 600000,        // 10 minutes
      peerCacheSize: 1000,
      
      // Bandwidth management
      maxBandwidth: 10485760,       // 10 MB/s
      bandwidthThrottling: true,
      
      // Concurrent operations
      maxConcurrentDials: 10,
      maxConcurrentStreams: 50
    }
  }
});
```

## Contract Configuration

### Contract Addresses

```typescript
const sdk = new FabstirSDK({
  contracts: {
    // Required contracts
    jobMarketplace: "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
    paymentEscrow: "0x12892b2fD2e484B88C19568E7D63bB3b9fE4dB02",
    nodeRegistry: "0x8Ba7968C30496aB344bc9e7595f5b9A185E3eD89",
    
    // Optional contracts
    disputeResolver: "0x123...",
    tokenRegistry: "0x456...",
    
    // Contract configuration
    config: {
      // Gas optimization
      useMulticall: true,           // Batch contract calls
      estimateGas: true,            // Auto gas estimation
      gasBuffer: 1.2,               // 20% gas buffer
      
      // Event monitoring
      eventPolling: true,
      eventBlockRange: 1000,        // Blocks per query
      eventConcurrency: 3,          // Parallel queries
      
      // Transaction management
      nonce: "auto",                // "auto" | "manual"
      replacementStrategy: "bump",   // "bump" | "cancel"
      bumpPercentage: 10            // 10% gas bump
    }
  }
});
```

### ABI Configuration

```typescript
const sdk = new FabstirSDK({
  contracts: {
    jobMarketplace: "0x742d35Cc...",
    
    // Custom ABIs
    abis: {
      jobMarketplace: customJobMarketplaceABI,
      paymentEscrow: customPaymentEscrowABI,
      nodeRegistry: customNodeRegistryABI
    },
    
    // ABI source
    abiSource: "etherscan"  // "etherscan" | "local" | "remote"
  }
});
```

## Performance Configuration

### Performance Tracking

```typescript
const sdk = new FabstirSDK({
  enablePerformanceTracking: true,
  
  performanceConfig: {
    // Metrics collection
    collectMetrics: true,
    metricsInterval: 60000,         // 1 minute
    metricsRetention: 3600000,      // 1 hour
    
    // Performance thresholds
    thresholds: {
      connectionTime: 5000,         // Alert if > 5s
      discoveryTime: 10000,         // Alert if > 10s
      jobSubmissionTime: 15000,     // Alert if > 15s
      tokenLatency: 500             // Alert if > 500ms
    },
    
    // Sampling
    sampling: {
      enabled: true,
      rate: 0.1,                    // Sample 10% of operations
      alwaysSample: ["error", "slow"] // Always track these
    },
    
    // Export settings
    export: {
      enabled: true,
      endpoint: "https://metrics.fabstir.com/v1/collect",
      interval: 300000,             // 5 minutes
      format: "otlp"                // OpenTelemetry
    }
  }
});
```

### Caching Configuration

```typescript
const sdk = new FabstirSDK({
  cachingStrategy: "memory",  // "memory" | "disk" | "hybrid" | "redis"
  
  cacheConfig: {
    // Memory cache
    memory: {
      maxSize: 100 * 1024 * 1024,  // 100MB
      ttl: 300000,                  // 5 minutes default
      
      // Specific TTLs
      ttls: {
        nodes: 600000,              // 10 minutes
        models: 3600000,            // 1 hour
        prices: 60000               // 1 minute
      }
    },
    
    // Disk cache (if enabled)
    disk: {
      directory: "./cache",
      maxSize: 1024 * 1024 * 1024,  // 1GB
      cleanup: true,
      cleanupInterval: 3600000      // 1 hour
    },
    
    // Redis cache (if enabled)
    redis: {
      url: "redis://localhost:6379",
      keyPrefix: "fabstir:",
      maxRetries: 3
    },
    
    // Cache behavior
    behavior: {
      readThrough: true,
      writeThrough: true,
      invalidateOnError: true,
      compressionThreshold: 1024   // Compress if > 1KB
    }
  }
});
```

## Security Configuration

### Security Settings

```typescript
const sdk = new FabstirSDK({
  securityConfig: {
    // Authentication
    authentication: {
      required: true,
      method: "signature",          // "signature" | "jwt" | "oauth"
      sessionDuration: 86400000,    // 24 hours
      
      // Signature verification
      signature: {
        algorithm: "ECDSA",
        challengeExpiry: 300000,    // 5 minutes
        nonceLength: 32
      }
    },
    
    // Encryption
    encryption: {
      transport: true,              // Enable TLS
      storage: true,                // Encrypt stored data
      algorithm: "AES-256-GCM",
      keyDerivation: "PBKDF2"
    },
    
    // Access control
    accessControl: {
      enabled: true,
      
      // Allowlist/Blocklist
      allowlist: [],                // Empty = allow all
      blocklist: [
        "12D3KooWBadNode1",
        "12D3KooWBadNode2"
      ],
      
      // Rate limiting
      rateLimit: {
        enabled: true,
        windowMs: 60000,            // 1 minute
        maxRequests: 100,
        
        // Different limits by operation
        limits: {
          submitJob: 10,
          discoverNodes: 50,
          createStream: 20
        }
      },
      
      // IP filtering
      ipFilter: {
        enabled: false,
        whitelist: [],
        blacklist: []
      }
    },
    
    // Audit logging
    audit: {
      enabled: true,
      logLevel: "info",             // "debug" | "info" | "warn" | "error"
      
      // What to log
      events: [
        "connection",
        "authentication",
        "jobSubmission",
        "payment",
        "error"
      ],
      
      // Log destination
      destination: "file",          // "file" | "syslog" | "remote"
      filePath: "./logs/audit.log",
      maxFileSize: 10485760,        // 10MB
      maxFiles: 5
    }
  }
});
```

### Privacy Configuration

```typescript
const sdk = new FabstirSDK({
  privacyConfig: {
    // Data minimization
    dataMinimization: {
      enabled: true,
      excludeFields: ["ip", "location", "deviceId"],
      anonymizeErrors: true
    },
    
    // Consent management
    consent: {
      required: true,
      types: ["analytics", "performance", "functional"],
      defaultConsent: {
        analytics: false,
        performance: true,
        functional: true
      }
    },
    
    // Data retention
    retention: {
      logs: 604800000,              // 7 days
      metrics: 2592000000,          // 30 days
      jobHistory: 7776000000        // 90 days
    }
  }
});
```

## Environment Variables

The SDK supports configuration through environment variables:

```bash
# Core settings
FABSTIR_MODE=production                          # or "mock"
FABSTIR_NETWORK=base-sepolia
FABSTIR_DEBUG=true

# Contract addresses
FABSTIR_JOB_MARKETPLACE=0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1
FABSTIR_PAYMENT_ESCROW=0x12892b2fD2e484B88C19568E7D63bB3b9fE4dB02
FABSTIR_NODE_REGISTRY=0x8Ba7968C30496aB344bc9e7595f5b9A185E3eD89

# P2P configuration
FABSTIR_BOOTSTRAP_NODES=/ip4/34.70.224.193/tcp/4001/p2p/12D3KooW...,/ip4/35.185.215.242/tcp/4001/p2p/12D3KooW...
FABSTIR_P2P_PORT=4001
FABSTIR_ENABLE_DHT=true
FABSTIR_ENABLE_MDNS=true

# Network settings
FABSTIR_RPC_URL=https://base-sepolia.public.blastapi.io
FABSTIR_CHAIN_ID=84532

# Performance
FABSTIR_ENABLE_PERFORMANCE_TRACKING=true
FABSTIR_ENABLE_METRICS=true
FABSTIR_CACHE_STRATEGY=memory

# Security
FABSTIR_ENABLE_ENCRYPTION=true
FABSTIR_ENABLE_AUDIT=true
FABSTIR_RATE_LIMIT=100

# Timeouts (milliseconds)
FABSTIR_DEFAULT_TIMEOUT=60000
FABSTIR_DIAL_TIMEOUT=30000
FABSTIR_REQUEST_TIMEOUT=60000

# Limits
FABSTIR_MAX_CONCURRENT_JOBS=10
FABSTIR_MAX_RETRIES=3
FABSTIR_MAX_CONNECTIONS=100
```

### Loading Environment Variables

```typescript
import dotenv from 'dotenv';
dotenv.config();

// SDK automatically reads environment variables
const sdk = new FabstirSDK({
  // Environment variables are used as defaults
  // Explicit config overrides environment variables
  mode: process.env.FABSTIR_MODE || "production"
});
```

## Configuration Examples

### Development Configuration

```typescript
const devConfig = {
  mode: "mock",
  debug: true,
  network: "base-sepolia",
  
  mockConfig: {
    simulateErrors: true,
    errorRate: 0.2,
    responseDelay: 500
  },
  
  performanceConfig: {
    collectMetrics: true,
    thresholds: {
      connectionTime: 10000,    // Relaxed for dev
      tokenLatency: 1000
    }
  },
  
  securityConfig: {
    authentication: {
      required: false          // Skip auth in dev
    }
  }
};

const sdk = new FabstirSDK(devConfig);
```

### Production Configuration

```typescript
const prodConfig = {
  mode: "production",
  debug: false,
  network: "base-mainnet",
  
  p2pConfig: {
    bootstrapNodes: [
      // Multiple bootstrap nodes for redundancy
      "/ip4/34.70.224.193/tcp/4001/p2p/12D3KooW...",
      "/ip4/35.185.215.242/tcp/4001/p2p/12D3KooW...",
      "/ip4/104.197.140.89/tcp/4001/p2p/12D3KooW..."
    ],
    
    connectionManager: {
      maxConnections: 200,
      minConnections: 20
    }
  },
  
  contracts: {
    jobMarketplace: process.env.JOB_MARKETPLACE!,
    paymentEscrow: process.env.PAYMENT_ESCROW!,
    nodeRegistry: process.env.NODE_REGISTRY!,
    
    config: {
      useMulticall: true,
      gasBuffer: 1.5          // Higher buffer for mainnet
    }
  },
  
  performanceConfig: {
    collectMetrics: true,
    export: {
      enabled: true,
      endpoint: process.env.METRICS_ENDPOINT!
    }
  },
  
  securityConfig: {
    authentication: { required: true },
    encryption: { transport: true, storage: true },
    audit: { enabled: true }
  },
  
  retryOptions: {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000
  }
};

const sdk = new FabstirSDK(prodConfig);
```

### High-Performance Configuration

```typescript
const highPerfConfig = {
  mode: "production",
  
  p2pConfig: {
    bootstrapNodes: [...],
    
    performance: {
      messageBatching: true,
      connectionPooling: true,
      maxConcurrentStreams: 100
    },
    
    connectionManager: {
      maxConnections: 500
    }
  },
  
  cachingStrategy: "hybrid",
  cacheConfig: {
    memory: { maxSize: 500 * 1024 * 1024 },  // 500MB
    disk: { maxSize: 10 * 1024 * 1024 * 1024 } // 10GB
  },
  
  maxConcurrentJobs: 50,
  
  performanceConfig: {
    sampling: { rate: 0.01 }  // Sample only 1%
  }
};

const sdk = new FabstirSDK(highPerfConfig);
```

## Best Practices

### 1. Environment-Specific Configuration

```typescript
// config/index.ts
export function getConfig(env: string): SDKConfig {
  const baseConfig = {
    network: process.env.FABSTIR_NETWORK,
    contracts: {
      jobMarketplace: process.env.JOB_MARKETPLACE!,
      paymentEscrow: process.env.PAYMENT_ESCROW!,
      nodeRegistry: process.env.NODE_REGISTRY!
    }
  };
  
  switch (env) {
    case 'development':
      return { ...baseConfig, mode: 'mock', debug: true };
    
    case 'staging':
      return { ...baseConfig, mode: 'production', debug: true };
    
    case 'production':
      return { 
        ...baseConfig, 
        mode: 'production',
        debug: false,
        securityConfig: { authentication: { required: true } }
      };
    
    default:
      throw new Error(`Unknown environment: ${env}`);
  }
}

// Usage
const sdk = new FabstirSDK(getConfig(process.env.NODE_ENV));
```

### 2. Configuration Validation

```typescript
import { z } from 'zod';

// Define configuration schema
const configSchema = z.object({
  mode: z.enum(['mock', 'production']),
  network: z.string(),
  p2pConfig: z.object({
    bootstrapNodes: z.array(z.string()).min(1)
  }).optional(),
  contracts: z.object({
    jobMarketplace: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    paymentEscrow: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    nodeRegistry: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
  }).optional()
});

// Validate configuration
function validateConfig(config: any): SDKConfig {
  try {
    return configSchema.parse(config);
  } catch (error) {
    console.error('Invalid configuration:', error);
    throw new Error('Configuration validation failed');
  }
}

// Usage
const config = validateConfig({
  mode: 'production',
  network: 'base-sepolia',
  // ...
});

const sdk = new FabstirSDK(config);
```

### 3. Dynamic Configuration

```typescript
class ConfigurableSDK {
  private sdk: FabstirSDK;
  
  constructor(initialConfig: SDKConfig) {
    this.sdk = new FabstirSDK(initialConfig);
  }
  
  async updateConfig(updates: Partial<SDKConfig>) {
    // Some settings require reconnection
    if (updates.mode || updates.network || updates.p2pConfig) {
      await this.sdk.disconnect();
      this.sdk = new FabstirSDK({
        ...this.sdk.config,
        ...updates
      });
      await this.sdk.connect(this.provider);
    } else {
      // Other settings can be updated dynamically
      Object.assign(this.sdk.config, updates);
    }
  }
}
```

### 4. Secret Management

```typescript
// Use environment variables for secrets
const config: SDKConfig = {
  mode: 'production',
  
  // Never hardcode sensitive data
  contracts: {
    jobMarketplace: process.env.JOB_MARKETPLACE!,
    paymentEscrow: process.env.PAYMENT_ESCROW!,
    nodeRegistry: process.env.NODE_REGISTRY!
  },
  
  securityConfig: {
    encryption: {
      // Load keys from secure storage
      encryptionKey: await loadFromVault('encryption-key'),
      signingKey: await loadFromVault('signing-key')
    }
  }
};
```

### 5. Performance Monitoring

```typescript
// Monitor configuration effectiveness
sdk.on('performance:metrics', (metrics) => {
  // Adjust configuration based on metrics
  if (metrics.operations.connect.averageTime > 5000) {
    console.warn('Slow connections detected, adjusting timeouts');
    sdk.updateConfig({
      p2pConfig: {
        dialTimeout: 60000,  // Increase timeout
        connectionManager: {
          maxConnections: 50  // Reduce connections
        }
      }
    });
  }
});
```

## Troubleshooting Configuration

### Common Issues

1. **Bootstrap Connection Failures**
   - Verify bootstrap node addresses are correct
   - Check firewall settings
   - Try alternative bootstrap nodes

2. **Contract Address Mismatch**
   - Ensure addresses match the network
   - Verify contract deployment
   - Check address checksums

3. **Performance Issues**
   - Enable caching
   - Reduce concurrent operations
   - Optimize connection limits

4. **Memory Leaks**
   - Set appropriate cache limits
   - Enable automatic cleanup
   - Monitor memory usage

### Debug Configuration

```typescript
const debugConfig: SDKConfig = {
  mode: 'production',
  debug: true,
  
  // Verbose logging
  logConfig: {
    level: 'debug',
    categories: ['p2p', 'contracts', 'jobs'],
    format: 'json',
    destination: 'stdout'
  },
  
  // Detailed metrics
  performanceConfig: {
    collectMetrics: true,
    sampling: { rate: 1.0 }  // Sample everything
  }
};
```