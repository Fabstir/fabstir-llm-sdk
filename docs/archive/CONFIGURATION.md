# Fabstir LLM SDK Configuration Guide

This guide covers all configuration options available in the Fabstir LLM SDK with the manager-based architecture.

## Table of Contents

- [Configuration Overview](#configuration-overview)
- [SDK Configuration](#sdk-configuration)
- [Manager Configurations](#manager-configurations)
- [Network Configuration](#network-configuration)
- [Contract Configuration](#contract-configuration)
- [Storage Configuration](#storage-configuration)
- [P2P Configuration](#p2p-configuration)
- [Payment Configuration](#payment-configuration)
- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)
- [Best Practices](#best-practices)

## Configuration Overview

The Fabstir LLM SDK uses a centralized configuration approach through the main `FabstirSDK` class, which then configures all managers appropriately.

### Configuration Priority

Configuration sources are applied in this order (highest to lowest priority):

1. Runtime method parameters
2. Constructor configuration object
3. Environment variables
4. Default values

### Configuration Flow

```
FabstirSDK(config)
    ├── AuthManager (uses SDK's RPC URL)
    ├── PaymentManager (uses contract addresses)
    ├── StorageManager (uses S5 portal URL)
    ├── DiscoveryManager (uses P2P settings)
    └── SessionManager (uses all manager configs)
```

## SDK Configuration

### SDKConfig Interface

```typescript
interface SDKConfig {
  // Network configuration
  rpcUrl?: string;
  
  // Storage configuration
  s5PortalUrl?: string;
  
  // Contract addresses
  contractAddresses?: {
    jobMarketplace?: string;
    nodeRegistry?: string;
    proofSystem?: string;
    usdcToken?: string;
    fabToken?: string;
  };
  
  // Optional debug mode
  debug?: boolean;
}
```

### Basic Configuration

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';

const sdk = new FabstirSDK({
  rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY',
  s5PortalUrl: 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p',
  contractAddresses: {
    jobMarketplace: '0xD937c594682Fe74E6e3d06239719805C04BE804A',
    nodeRegistry: '0x87516C13Ea2f99de598665e14cab64E191A0f8c4',
    usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  }
});
```

### Default Values

```typescript
// Default RPC URL
const DEFAULT_RPC_URL = 'https://base-sepolia.g.alchemy.com/v2/demo';

// Default S5 Portal
const DEFAULT_S5_PORTAL = 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p';

// Default contract addresses (Base Sepolia - Jan 2025)
const DEFAULT_CONTRACTS = {
  jobMarketplace: '0xD937c594682Fe74E6e3d06239719805C04BE804A',
  nodeRegistry: '0x87516C13Ea2f99de598665e14cab64E191A0f8c4',
  proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
  usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62'
};
```

## Manager Configurations

### 1. AuthManager Configuration

AuthManager is configured through authentication:

```typescript
// Authentication options
interface AuthOptions {
  privateKey?: string;  // For private-key provider
  rpcUrl?: string;      // Override SDK's RPC URL
}

// Authenticate with options
await sdk.authenticate(privateKey);

// Or with provider type
const authManager = sdk.getAuthManager();
await authManager.authenticate('private-key', {
  privateKey: '0x...',
  rpcUrl: 'custom-rpc-url'
});
```

### 2. PaymentManager Configuration

PaymentManager uses contract addresses from SDK config:

```typescript
// Payment constants
const PAYMENT_CONSTANTS = {
  MIN_ETH_PAYMENT: '0.005',        // 0.005 ETH minimum
  DEFAULT_PRICE_PER_TOKEN: 5000,   // 5000 wei per token
  DEFAULT_DURATION: 3600,          // 1 hour
  DEFAULT_PROOF_INTERVAL: 300,     // 5 minutes
  TOKENS_PER_PROOF: 1000           // Tokens per proof
};

// Payment split configuration
const PAYMENT_SPLIT = {
  host: 0.9,      // 90% to host
  treasury: 0.1   // 10% to treasury
};
```

### 3. StorageManager Configuration

StorageManager configuration:

```typescript
// S5 storage constants
const STORAGE_CONFIG = {
  DEFAULT_S5_PORTAL: 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p',
  SEED_MESSAGE: 'Generate S5 seed for Fabstir LLM',
  REGISTRY_PREFIX: 'fabstir-llm',
  CONVERSATION_PATH: 'home/conversations'
};

// Custom S5 portal
const storageManager = new StorageManager(customS5PortalUrl);
```

### 4. DiscoveryManager Configuration

P2P discovery configuration:

```typescript
// Discovery options
interface DiscoveryOptions {
  listen?: string[];     // Listen addresses
  bootstrap?: string[];  // Bootstrap nodes
}

// Discovery constants
const DISCOVERY_CONFIG = {
  DEFAULT_LISTEN: ['/ip4/127.0.0.1/tcp/0'],
  MIN_CONNECTIONS: 0,
  MAX_CONNECTIONS: 10,
  PROTOCOL_PREFIX: '/fabstir-llm/1.0.0'
};

// Configure discovery
await discoveryManager.createNode({
  listen: ['/ip4/0.0.0.0/tcp/4001'],
  bootstrap: [
    '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooW...'
  ]
});
```

### 5. SessionManager Configuration

SessionManager uses configuration from all other managers:

```typescript
// Session options
interface SessionOptions {
  paymentType: 'ETH' | 'USDC';
  amount: string;
  pricePerToken?: number;      // Default: 5000
  duration?: number;            // Default: 3600
  proofInterval?: number;       // Default: 300
  hostAddress?: string;         // Direct host selection
  tokenAddress?: string;        // For USDC payments
  hostCriteria?: {              // Auto-discovery criteria
    minReputation?: number;
    maxLatency?: number;
    requiredModels?: string[];
  };
}

// Session defaults
const SESSION_DEFAULTS = {
  DEFAULT_PRICE_PER_TOKEN: 5000,
  DEFAULT_DURATION: 3600,
  DEFAULT_PROOF_INTERVAL: 300,
  MIN_ETH_PAYMENT: '0.005'
};
```

## Network Configuration

### Supported Networks

```typescript
enum Network {
  BASE_SEPOLIA = 84532,     // Testnet
  BASE_MAINNET = 8453,      // Mainnet (future)
  LOCAL = 31337            // Local development
}

// Network-specific configuration
const NETWORK_CONFIG = {
  [Network.BASE_SEPOLIA]: {
    name: 'base-sepolia',
    rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/',
    explorer: 'https://sepolia.basescan.org'
  },
  [Network.BASE_MAINNET]: {
    name: 'base',
    rpcUrl: 'https://base.g.alchemy.com/v2/',
    explorer: 'https://basescan.org'
  }
};
```

### RPC Configuration

```typescript
// Alchemy RPC
const alchemyRpc = 'https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY';

// Infura RPC
const infuraRpc = 'https://base-sepolia.infura.io/v3/YOUR_PROJECT_ID';

// QuickNode RPC
const quickNodeRpc = 'https://YOUR_ENDPOINT.base-sepolia.quiknode.pro/';

// Local node
const localRpc = 'http://localhost:8545';
```

## Contract Configuration

### Contract Addresses

```typescript
// Base Sepolia (January 2025)
const CONTRACTS_BASE_SEPOLIA = {
  jobMarketplace: '0xD937c594682Fe74E6e3d06239719805C04BE804A',
  nodeRegistry: '0x87516C13Ea2f99de598665e14cab64E191A0f8c4',
  proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
  usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62'
};

// Override specific contracts
const sdk = new FabstirSDK({
  contractAddresses: {
    jobMarketplace: '0xCustomAddress',
    // Other contracts use defaults
  }
});
```

### Contract ABIs

ABIs are located in:
- `src/contracts/JobMarketplace.abi.json`
- `docs/compute-contracts-reference/client-abis/`

## Storage Configuration

### S5 Network Configuration

```typescript
// S5 portal options
const S5_PORTALS = {
  // Official S5 portal
  official: 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p',
  
  // Custom portal
  custom: 'wss://YOUR_PORTAL/s5/p2p',
  
  // Local portal
  local: 'ws://localhost:5050/s5/p2p'
};

// S5 configuration in SDK
const sdk = new FabstirSDK({
  s5PortalUrl: S5_PORTALS.official
});
```

### Storage Paths

```typescript
// Storage key patterns
const STORAGE_PATHS = {
  conversations: 'home/conversations/{sessionId}',
  proofs: 'home/proofs/{jobId}/{proofId}',
  metadata: 'home/metadata/{sessionId}',
  userPrefs: 'home/preferences'
};
```

## P2P Configuration

### Bootstrap Nodes

```typescript
// Production bootstrap nodes
const BOOTSTRAP_NODES_PRODUCTION = [
  '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg',
  '/ip4/35.185.215.242/tcp/4001/p2p/12D3KooWQH5gJ9YjDfRpLnBKY7vtkbPQkxQ5XbVJHmENw5YjLs2V'
];

// Development bootstrap nodes
const BOOTSTRAP_NODES_DEV = [
  '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWLocal'
];
```

### Listen Addresses

```typescript
// Listen configuration
const LISTEN_ADDRESSES = {
  // All interfaces
  all: ['/ip4/0.0.0.0/tcp/4001'],
  
  // Localhost only
  local: ['/ip4/127.0.0.1/tcp/4001'],
  
  // Multiple transports
  multi: [
    '/ip4/0.0.0.0/tcp/4001',
    '/ip4/0.0.0.0/tcp/4002/ws'
  ]
};
```

## Payment Configuration

### ETH Payment Configuration

```typescript
// ETH payment settings
const ETH_CONFIG = {
  MIN_PAYMENT: '0.005',           // 0.005 ETH minimum
  GAS_LIMIT: 500000,              // Gas limit for transactions
  GAS_PRICE_MULTIPLIER: 1.2       // Multiply estimated gas price
};
```

### USDC Payment Configuration

```typescript
// USDC payment settings
const USDC_CONFIG = {
  TOKEN_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  DECIMALS: 6,                    // USDC has 6 decimals
  MIN_PAYMENT: '5',               // 5 USDC minimum
  APPROVAL_AMOUNT: '1000000'      // Large approval to avoid repeat txs
};
```

## Environment Variables

### Complete .env Configuration

```bash
# Network Configuration
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
CHAIN_ID=84532
NETWORK=base-sepolia

# Authentication
PRIVATE_KEY=0x... # Your wallet private key

# Contract Addresses
CONTRACT_JOB_MARKETPLACE=0xD937c594682Fe74E6e3d06239719805C04BE804A
CONTRACT_NODE_REGISTRY=0x87516C13Ea2f99de598665e14cab64E191A0f8c4
CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62

# Storage Configuration
S5_PORTAL_URL=wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p
S5_REGISTRY_PREFIX=fabstir-llm

# P2P Configuration
P2P_BOOTSTRAP_NODES=["/ip4/34.70.224.193/tcp/4001/p2p/..."]
P2P_LISTEN_ADDRESSES=["/ip4/0.0.0.0/tcp/4001"]
P2P_ENABLE_DHT=true
P2P_ENABLE_MDNS=true

# Payment Configuration
MIN_ETH_PAYMENT=0.005
DEFAULT_PRICE_PER_TOKEN=5000
DEFAULT_DURATION=3600
DEFAULT_PROOF_INTERVAL=300

# Debug Configuration
DEBUG=false
LOG_LEVEL=info
```

### Loading Environment Variables

```typescript
import * as dotenv from 'dotenv';

// Load from .env file
dotenv.config();

// Load from specific file
dotenv.config({ path: '.env.production' });

// Use in SDK
const sdk = new FabstirSDK({
  rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
  s5PortalUrl: process.env.S5_PORTAL_URL,
  contractAddresses: {
    jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
    nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
    usdcToken: process.env.CONTRACT_USDC_TOKEN
  }
});
```

## Configuration Examples

### Minimal Configuration

```typescript
// Uses all defaults
const sdk = new FabstirSDK();
await sdk.authenticate(privateKey);
```

### Development Configuration

```typescript
const sdk = new FabstirSDK({
  rpcUrl: 'http://localhost:8545',
  s5PortalUrl: 'ws://localhost:5050/s5/p2p',
  contractAddresses: {
    // Local deployment addresses
    jobMarketplace: '0x5FbDB2315678afecb367f032d93F642f64180aa3'
  },
  debug: true
});
```

### Production Configuration

```typescript
const sdk = new FabstirSDK({
  rpcUrl: process.env.RPC_URL_BASE_MAINNET,
  s5PortalUrl: process.env.S5_PORTAL_URL_PROD,
  contractAddresses: {
    jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE_PROD,
    nodeRegistry: process.env.CONTRACT_NODE_REGISTRY_PROD,
    usdcToken: process.env.CONTRACT_USDC_TOKEN_PROD
  },
  debug: false
});
```

### Multi-Network Configuration

```typescript
function getSDKForNetwork(network: 'testnet' | 'mainnet' | 'local') {
  const configs = {
    testnet: {
      rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/KEY',
      contractAddresses: CONTRACTS_BASE_SEPOLIA
    },
    mainnet: {
      rpcUrl: 'https://base.g.alchemy.com/v2/KEY',
      contractAddresses: CONTRACTS_BASE_MAINNET
    },
    local: {
      rpcUrl: 'http://localhost:8545',
      contractAddresses: CONTRACTS_LOCAL
    }
  };
  
  return new FabstirSDK(configs[network]);
}
```

## Best Practices

### 1. Security

- **Never commit private keys**: Use environment variables
- **Use secure key storage**: Consider hardware wallets for production
- **Validate RPC URLs**: Ensure HTTPS for remote endpoints
- **Rotate keys regularly**: Implement key rotation strategy

### 2. Performance

- **Reuse SDK instances**: Create once, use throughout app lifecycle
- **Cache manager instances**: Managers are singletons within SDK
- **Batch operations**: Group storage operations when possible
- **Use appropriate timeouts**: Set reasonable timeouts for network operations

### 3. Error Handling

```typescript
// Wrap configuration in try-catch
try {
  const sdk = new FabstirSDK(config);
  await sdk.authenticate(privateKey);
} catch (error) {
  if (error.code === 'INVALID_CONFIG') {
    console.error('Configuration error:', error.message);
  }
  // Handle other errors
}
```

### 4. Environment Management

```typescript
// Use different configs per environment
const config = {
  development: { /* dev config */ },
  staging: { /* staging config */ },
  production: { /* prod config */ }
}[process.env.NODE_ENV || 'development'];

const sdk = new FabstirSDK(config);
```

### 5. Debugging

```typescript
// Enable debug mode for development
const sdk = new FabstirSDK({
  debug: process.env.NODE_ENV === 'development'
});

// Use debug logging
if (sdk.config.debug) {
  console.log('SDK initialized with:', sdk.config);
}
```

## Migration Guide

### From Legacy SDK

```typescript
// Old pattern
const sdk = new FabstirSDK(config, signer);

// New pattern
const sdk = new FabstirSDK(config);
await sdk.authenticate(privateKey);
```

### From Headless SDK

```typescript
// Old headless pattern
const sdk = new FabstirSDKHeadless(config);
sdk.setSigner(signer);

// New pattern
const sdk = new FabstirSDK(config);
await sdk.authenticate(privateKey);
```

## See Also

- [SDK API Reference](SDK_API.md)
- [Setup Guide](SETUP_GUIDE.md)
- [Architecture Overview](ARCHITECTURE.md)
- [P2P Configuration](P2P_CONFIGURATION.md)
- [Integration Testing](INTEGRATED_TESTING.md)

---

*Last updated: January 2025 - Manager-Based Architecture v2.0*