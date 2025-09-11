# Migration Guide: FabstirSDK to FabstirSDKCore/FabstirSDKNode

## Overview

This guide helps you migrate from the original `FabstirSDK` to the new browser-compatible `FabstirSDKCore` and server-extended `FabstirSDKNode`.

## Key Changes

### 1. Package Structure
- **Old**: Single `@fabstir/llm-sdk` package
- **New**: Two packages:
  - `@fabstir/sdk-core` - Browser-compatible
  - `@fabstir/sdk-node` - Server with P2P/EZKL

### 2. Import Changes

#### Browser Applications (React, Vue, Angular)
```typescript
// Old (didn't work in browser)
import { FabstirSDK } from '@fabstir/llm-sdk';

// New
import { FabstirSDKCore } from '@fabstir/sdk-core';
```

#### Node.js Applications
```typescript
// Old
import { FabstirSDK } from '@fabstir/llm-sdk';

// New (with full P2P/EZKL support)
import { FabstirSDKNode } from '@fabstir/sdk-node';
```

### 3. Initialization Changes

#### Browser
```typescript
// Old (would fail with Node.js errors)
const sdk = new FabstirSDK({
  rpcUrl: 'https://...',
  contractAddresses: { ... }
});

// New
const sdk = new FabstirSDKCore({
  rpcUrl: 'https://...',
  contractAddresses: { ... },
  bridgeConfig: {
    url: 'http://localhost:3000', // Connect to sdk-node server
    autoConnect: true
  }
});
```

#### Node.js
```typescript
// Old
const sdk = new FabstirSDK({
  mode: 'production',
  p2pConfig: { ... }
});

// New
const sdk = new FabstirSDKNode({
  mode: 'production',
  p2pConfig: { 
    enabled: true,
    bootstrapNodes: [...]
  },
  proofConfig: {
    enabled: true,
    cacheDir: './proofs'
  }
});

// Optional: Start bridge server for browser clients
await sdk.startBridgeServer(3000);
```

## API Compatibility

### Compatible APIs (No Changes)

These methods work exactly the same:

```typescript
// Authentication
await sdk.authenticate('metamask');
await sdk.authenticate('privatekey', { privateKey: '0x...' });

// Get managers
const paymentManager = sdk.getPaymentManager();
const sessionManager = sdk.getSessionManager();
const storageManager = sdk.getStorageManager();
const hostManager = sdk.getHostManager();

// Manager operations (unchanged)
await paymentManager.createJob(...);
await sessionManager.startSession(...);
```

### Breaking Changes

#### 1. P2P Operations

**Old**: Direct P2P access
```typescript
const discoveryManager = sdk.getDiscoveryManager();
await discoveryManager.createNode();
const peers = await discoveryManager.discoverPeers();
```

**New Browser**: Via bridge
```typescript
const bridge = sdk.getBridgeClient();
if (bridge) {
  const p2p = bridge.getP2PClient();
  const nodes = await p2p.discoverNodes();
}
```

**New Node.js**: Direct or bridge
```typescript
// Direct
const peerId = await sdk.startP2PNode();

// Or via manager (if you implement it)
const p2pServer = sdk.getP2PServer();
```

#### 2. EZKL Proof Generation

**Old**: Mock proofs only
```typescript
const proof = await inferenceManager.generateProof(sessionId, tokens);
```

**New Browser**: Via bridge
```typescript
const bridge = sdk.getBridgeClient();
if (bridge) {
  const proofClient = bridge.getProofClient();
  const proofId = await proofClient.requestProof({
    sessionId, jobId, tokensUsed
  });
  const result = await proofClient.getProofResult(proofId);
}
```

**New Node.js**: Direct generation
```typescript
const proof = await sdk.generateProof({
  sessionId, jobId, tokensUsed,
  modelHash, inputData, outputData
});
```

#### 3. Environment Variables

**Old**: Used `process.env` directly
```env
CONTRACT_JOB_MARKETPLACE=0x...
S5_PORTAL_URL=wss://...
```

**New Browser**: Use build-time injection
```env
NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE=0x...
NEXT_PUBLIC_S5_PORTAL_URL=wss://...
```

**New Node.js**: Same as old
```env
CONTRACT_JOB_MARKETPLACE=0x...
S5_PORTAL_URL=wss://...
```

## Migration Steps

### Step 1: Update Dependencies

```json
{
  "dependencies": {
    // Remove
    "@fabstir/llm-sdk": "^0.1.0",
    
    // Add for browser
    "@fabstir/sdk-core": "^1.0.0",
    
    // Add for Node.js
    "@fabstir/sdk-node": "^1.0.0"
  }
}
```

### Step 2: Update Imports

```typescript
// Find all imports
// Old
import { FabstirSDK, SDKError, ... } from '@fabstir/llm-sdk';

// New Browser
import { FabstirSDKCore, SDKError, ... } from '@fabstir/sdk-core';

// New Node.js
import { FabstirSDKNode, SDKError, ... } from '@fabstir/sdk-node';
```

### Step 3: Update Initialization

Browser example:
```typescript
// Old
const sdk = new FabstirSDK(config);

// New
const sdk = new FabstirSDKCore({
  ...config,
  bridgeConfig: {
    url: process.env.NEXT_PUBLIC_BRIDGE_URL || 'http://localhost:3000'
  }
});

// Connect to bridge for P2P/Proof features
await sdk.connectToBridge();
```

### Step 4: Update P2P/Proof Code

```typescript
// Check if features are available
if (sdk.isP2PAvailable()) {
  // Use P2P features via bridge
  const bridge = sdk.getBridgeClient();
  // ...
}

if (sdk.isProofAvailable()) {
  // Use proof features via bridge
  const bridge = sdk.getBridgeClient();
  // ...
}
```

### Step 5: Test

1. **Browser Testing**:
   - Verify no Node.js errors in console
   - Test all contract interactions
   - Test S5 storage operations
   - Test bridge connection if using P2P/Proof

2. **Node.js Testing**:
   - Verify backward compatibility
   - Test P2P operations
   - Test proof generation
   - Test bridge server if serving browser clients

## Backward Compatibility

### Using Compatibility Mode

For gradual migration, you can create a compatibility wrapper:

```typescript
// sdk-compat.ts
export class FabstirSDK {
  private impl: FabstirSDKCore | FabstirSDKNode;
  
  constructor(config: any) {
    if (typeof window !== 'undefined') {
      // Browser
      this.impl = new FabstirSDKCore(config);
    } else {
      // Node.js
      const { FabstirSDKNode } = require('@fabstir/sdk-node');
      this.impl = new FabstirSDKNode(config);
    }
  }
  
  // Proxy all methods
  async authenticate(...args: any[]) {
    return this.impl.authenticate(...args);
  }
  
  // ... other methods
}
```

## Common Issues

### Issue: "Module not found: @fabstir/sdk-core"
**Solution**: Install the new package: `pnpm add @fabstir/sdk-core`

### Issue: "P2P features not available"
**Solution**: Ensure bridge server is running and connected:
```typescript
await sdk.connectToBridge('http://localhost:3000');
```

### Issue: "Cannot read property 'ethereum' of undefined"
**Solution**: In Node.js, use private key authentication:
```typescript
await sdk.authenticate('privatekey', { privateKey: '0x...' });
```

### Issue: "Bridge connection failed"
**Solution**: Start the bridge server in Node.js:
```bash
# Run the example server
node packages/sdk-node/dist/examples/bridge-server.js
```

## Feature Comparison

| Feature | Old SDK | sdk-core | sdk-node |
|---------|---------|----------|----------|
| Browser Support | ❌ | ✅ | ❌ |
| Contract Interaction | ✅ | ✅ | ✅ |
| S5 Storage | ✅ | ✅ | ✅ |
| MetaMask | ❌ | ✅ | ❌ |
| Private Key Auth | ✅ | ✅ | ✅ |
| Direct P2P | ✅ | ❌ | ✅ |
| P2P via Bridge | ❌ | ✅ | ✅ |
| EZKL Proofs | ❌ | Via Bridge | ✅ |
| Bundle Size | Large | <500KB | N/A |

## Support

For help with migration:
1. Check the [API Documentation](./API.md)
2. See [Example Applications](../examples/)
3. Open an issue on GitHub

## Timeline

1. **Phase 1** (Now): Both old and new SDKs available
2. **Phase 2** (1 month): Deprecation warnings added to old SDK
3. **Phase 3** (3 months): Old SDK moved to maintenance mode
4. **Phase 4** (6 months): Old SDK deprecated

Start migrating now to take advantage of browser compatibility and improved architecture!