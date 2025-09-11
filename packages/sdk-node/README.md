# @fabstir/sdk-node

Server-side extensions for Fabstir SDK with P2P networking and proof generation.

## Features

- 🌐 **P2P Networking**: Full libp2p stack for decentralized communication
- 🔐 **EZKL Proofs**: Cryptographic proof generation for inference verification
- 🚀 **WebSocket Server**: Real-time bidirectional communication
- 📦 **Extends SDK Core**: All browser features plus Node.js capabilities
- 🔄 **Bridge Mode**: Connect browser clients to P2P network

## Installation

```bash
npm install @fabstir/sdk-node @fabstir/sdk-core
# or
pnpm add @fabstir/sdk-node @fabstir/sdk-core
# or
yarn add @fabstir/sdk-node @fabstir/sdk-core
```

## Usage

### Basic Setup

```typescript
import { FabstirSDKNode } from '@fabstir/sdk-node';

const sdk = new FabstirSDKNode({
  contractAddresses: {
    jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
    nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
    fabToken: process.env.CONTRACT_FAB_TOKEN,
    usdcToken: process.env.CONTRACT_USDC_TOKEN
  },
  rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
  p2p: {
    enabled: true,
    bootstrapNodes: [
      '/ip4/147.75.86.255/tcp/4001/p2p/QmXFW...'
    ]
  }
});

// Authenticate with private key
await sdk.authenticate(process.env.PRIVATE_KEY);

// Start P2P node
await sdk.startP2P();

// Use P2P discovery
const discoveryManager = sdk.getDiscoveryManager();
const nodes = await discoveryManager.discoverNodes('llama-2-7b');
```

### WebSocket Bridge for Browser Clients

```typescript
import { WebSocketServer, P2PBridge } from '@fabstir/sdk-node';

// Create WebSocket server for browser clients
const wsServer = new WebSocketServer({
  port: 8080,
  cors: {
    origin: 'http://localhost:3000'
  }
});

// Create P2P bridge
const bridge = new P2PBridge(sdk, wsServer);
await bridge.start();

// Browser clients can now connect to ws://localhost:8080
// and access P2P features through the bridge
```

### EZKL Proof Generation

```typescript
import { EZKLProofGenerator } from '@fabstir/sdk-node';

const proofGenerator = new EZKLProofGenerator();

// Generate proof for inference
const proof = await proofGenerator.generateProof({
  model: 'llama-2-7b',
  input: 'Hello, world!',
  output: 'Hi there! How can I help you today?',
  checkpoint: 1000
});

// Submit proof to contract
await sdk.submitProof(jobId, proof);
```

### Express.js Integration

```typescript
import express from 'express';
import { FabstirSDKNode } from '@fabstir/sdk-node';

const app = express();
const sdk = new FabstirSDKNode({ /* config */ });

// API endpoint for browser clients
app.post('/api/discover-nodes', async (req, res) => {
  const { model } = req.body;
  
  // Use server-side P2P discovery
  const nodes = await sdk.getDiscoveryManager().discoverNodes(model);
  
  res.json({ nodes });
});

app.listen(3001);
```

## Node.js Specific Features

### P2P Capabilities
- DHT-based node discovery
- Direct peer-to-peer messaging
- Gossipsub protocol support
- mDNS for local discovery
- Bootstrap node connectivity

### Cryptographic Operations
- EZKL proof generation
- Ed25519 signatures
- SHA-256/512 hashing
- AES encryption

### System Integration
- File system access for caching
- Native compression (zlib)
- Process management
- Environment variables

## Requirements

- Node.js 18.0.0 or higher
- Linux, macOS, or Windows
- 2GB RAM minimum (4GB recommended for proof generation)

## Environment Variables

```bash
# Required
CONTRACT_JOB_MARKETPLACE=0x...
CONTRACT_NODE_REGISTRY=0x...
CONTRACT_FAB_TOKEN=0x...
CONTRACT_USDC_TOKEN=0x...
RPC_URL_BASE_SEPOLIA=https://...
PRIVATE_KEY=0x...

# Optional P2P
P2P_PORT=4001
P2P_BOOTSTRAP_NODES=/ip4/...
P2P_ENABLE_DHT=true
P2P_ENABLE_MDNS=true

# Optional WebSocket
WS_PORT=8080
WS_CORS_ORIGIN=http://localhost:3000
```

## Migration from Original SDK

```typescript
// Before (original SDK)
import { FabstirSDK } from 'fabstir-sdk';

// After (refactored)
import { FabstirSDKNode } from '@fabstir/sdk-node';
// FabstirSDKNode is a drop-in replacement with all original features
```

## License

MIT