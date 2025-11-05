# Fabstir LLM SDK

A TypeScript SDK for interacting with the Fabstir P2P LLM Marketplace, enabling decentralized AI model access without central servers.

## Features

- 🌐 **Decentralized P2P Network** - Direct node-to-node communication without intermediaries
- 🚀 **WebSocket Streaming** - Real-time token streaming via WebSocket connections
- 🔍 **Automatic Host Discovery** - Discover LLM hosts from blockchain without hardcoded URLs
- 💰 **Automated Payments** - Built-in escrow and payment handling via smart contracts
- 🔄 **Session Management** - Stateful conversations with checkpoint proofs
- 📦 **S5 Storage Integration** - Decentralized conversation persistence
- 🧠 **RAG (Retrieval-Augmented Generation)** - Upload documents and enhance LLM responses with semantic search
- 🗂️ **Vector Databases** - Client-side vector management with folder hierarchies and permissions
- 🛡️ **Error Recovery** - Automatic retries and failover to ensure reliability
- 🔌 **Browser Compatible** - Works in both Node.js and browser environments

## Quick Start

### WebSocket Streaming with Host Discovery

Stream LLM responses in real-time with automatic host discovery:

```typescript
import { FabstirSDKCore } from "@fabstir/sdk-core";

async function streamingExample() {
  // Initialize SDK
  const sdk = new FabstirSDKCore({
    network: 'base-sepolia',
    rpcUrl: process.env.RPC_URL
  });

  // Authenticate with wallet
  await sdk.authenticate(privateKey);

  // Discover available hosts automatically
  const hostManager = sdk.getHostManager();
  const hosts = await hostManager.discoverAllActiveHosts();
  console.log(`Found ${hosts.length} active hosts`);

  // Create session with best available host
  const sessionManager = sdk.getSessionManager();
  const session = await sessionManager.createSession({
    model: 'llama-2-13b-chat',
    temperature: 0.7
  });

  // Stream tokens as they arrive
  for await (const token of sessionManager.streamPrompt(
    session.id,
    "Explain quantum computing in simple terms"
  )) {
    process.stdout.write(token);
  }

  // End session
  await sessionManager.endSession(session.id);
}

streamingExample().catch(console.error);
```

### Host Registration and Discovery

Register your node and discover other hosts:

```typescript
import { FabstirSDKCore } from "@fabstir/sdk-core";

async function hostManagement() {
  const sdk = new FabstirSDKCore({ network: 'base-sepolia' });
  await sdk.authenticate(privateKey);
  
  const hostManager = sdk.getHostManager();
  
  // Register as a host provider
  await hostManager.registerNodeWithUrl(
    'llama-2-7b,gpt-4,inference,gpu',  // Capabilities
    '1000',                              // Stake amount (FAB tokens)
    'https://my-node.example.com'       // Your API endpoint
  );
  
  // Discover other hosts
  const hosts = await hostManager.discoverAllActiveHosts();
  
  for (const host of hosts) {
    console.log(`Host: ${host.address}`);
    console.log(`API: ${host.apiUrl}`);
    console.log(`Models: ${host.metadata}`);
    
    // Check health
    const health = await hostManager.checkNodeHealth(host.apiUrl);
    console.log(`Health: ${health.healthy ? '✅' : '❌'} (${health.latency}ms)`);
  }
}
```

### Direct Inference Without Blockchain

Stream inference directly without blockchain transactions:

```typescript
async function directInference() {
  const sdk = new FabstirSDKCore({ network: 'base-sepolia' });
  await sdk.authenticate(privateKey);

  const inferenceManager = sdk.getInferenceManager();

  // Stream tokens with automatic host selection
  for await (const token of inferenceManager.streamInference(
    "Write a haiku about coding",
    {
      model: 'llama-2-7b',
      temperature: 0.9,
      maxTokens: 100
    }
  )) {
    process.stdout.write(token);
  }
}
```

### RAG-Enhanced Chat with Document Upload (Host-Side)

Upload documents and enhance LLM responses with semantic search using host-side vector storage:

```typescript
import { FabstirSDKCore } from "@fabstir/sdk-core";
import { HostAdapter } from "@fabstir/sdk-core/embeddings";
import { DocumentManager } from "@fabstir/sdk-core/documents";

async function ragExample() {
  // Initialize SDK
  const sdk = new FabstirSDKCore({ network: 'base-sepolia' });
  await sdk.authenticate(privateKey);

  // Setup RAG with zero-cost host embeddings
  const hostUrl = process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8083';
  const embeddingService = new HostAdapter({ hostUrl, dimensions: 384 });
  const documentManager = new DocumentManager({ embeddingService });

  // Start session with host node
  const sessionManager = await sdk.getSessionManager();
  const { sessionId } = await sessionManager.startSession({
    hostUrl,
    jobId: 123n,
    modelName: 'llama-3',
    chainId: 84532
  });

  // Process document: extract → chunk → embed
  const chunks = await documentManager.processDocument(file, {
    chunkSize: 500,
    overlap: 50,
    onProgress: (p) => console.log(`${p.stage}: ${p.progress}%`)
  });

  // Upload vectors to host via WebSocket
  const vectors = chunks.map((chunk, i) => ({
    id: `chunk-${i}`,
    vector: chunk.embedding,
    metadata: { text: chunk.text, index: i }
  }));

  await sessionManager.uploadVectors(sessionId, vectors);
  console.log(`Uploaded ${vectors.length} vectors to host`);

  // Ask questions - context automatically injected
  const enhanced = await sessionManager.askWithContext(
    sessionId,
    "What are the key points in the uploaded document?",
    3  // topK: retrieve top 3 similar chunks
  );

  await sessionManager.sendPromptStreaming(sessionId, enhanced, (chunk) => {
    process.stdout.write(chunk.content);
  });

  // Or search manually with production-tested threshold
  const query = "key points";
  const queryEmbedding = await embeddingService.embed(query);
  const results = await sessionManager.searchVectors(
    sessionId,
    queryEmbedding,
    5,      // topK: return top 5 results
    0.2     // threshold: 0.2 works best with all-MiniLM-L6-v2 (not 0.7!)
  );

  results.forEach(r => {
    console.log(`Score: ${r.score.toFixed(3)}, Text: ${r.metadata?.text}`);
  });
}
```

**Key Features:**
- **Host-Side Storage**: Vectors stored in session memory on host node (Rust)
- **Zero-Cost Embeddings**: Use HostAdapter for free 384-d embeddings
- **Production-Tested**: Threshold 0.2 (not 0.7) works best with all-MiniLM-L6-v2
- **Auto-Cleanup**: Vectors automatically deleted when session ends
- **WebSocket Protocol**: `uploadVectors` and `searchVectors` messages over persistent connection

See [docs/IMPLEMENTATION_CHAT_RAG.md](docs/IMPLEMENTATION_CHAT_RAG.md) for complete architecture and production configuration.

## Installation

### Development Setup (npm link)

For local development when working on both `fabstir-llm-sdk` and `fabstir-llm-ui`:

```bash
# In fabstir-llm-sdk directory
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk
npm link

# In fabstir-llm-ui directory  
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-ui
npm link @fabstir/llm-sdk
```

This creates a symbolic link allowing the UI to use your local SDK development version.

### Production Setup

Install from GitHub repository:

```bash
npm install git+https://github.com/yourusername/fabstir-llm-sdk.git
# or
yarn add git+https://github.com/yourusername/fabstir-llm-sdk.git
# or
pnpm add git+https://github.com/yourusername/fabstir-llm-sdk.git
```

Or from npm registry (when published):

```bash
npm install @fabstir/llm-sdk
# or
yarn add @fabstir/llm-sdk
# or
pnpm add @fabstir/llm-sdk
```

### Prerequisites

- Node.js 16.0 or higher
- TypeScript 4.5 or higher (for TypeScript projects)
- An Ethereum wallet provider (MetaMask, WalletConnect, etc.)

## Configuration

Basic configuration options:

```typescript
const sdk = new FabstirSDK({
  mode: "production",        // "mock" | "production"
  network: "base-sepolia",   // Target blockchain network
  p2pConfig: {
    bootstrapNodes: [...],   // P2P bootstrap nodes
    enableDHT: true,         // Enable distributed hash table
    enableMDNS: true,        // Enable local discovery
  },
  retryOptions: {
    maxRetries: 3,          // Maximum retry attempts
    initialDelay: 1000,     // Initial retry delay (ms)
  },
  enablePerformanceTracking: true,
});
```

## Documentation

- [**SDK API Reference**](docs/SDK_API.md) - Complete API documentation for all managers
- [Setup Guide](docs/SETUP_GUIDE.md) - Detailed setup instructions
- [P2P Configuration](docs/P2P_CONFIGURATION.md) - P2P network configuration
- [Architecture](docs/ARCHITECTURE.md) - System architecture overview
- [Configuration](docs/CONFIGURATION.md) - All configuration options

### RAG Documentation

- [**RAG API Reference**](docs/RAG_API_REFERENCE.md) - Complete RAG API documentation
- [**RAG Implementation Plan**](docs/IMPLEMENTATION_CHAT_RAG.md) - Implementation progress and architecture
- [**RAG Manual Testing Guide**](docs/RAG_MANUAL_TESTING_GUIDE.md) - Testing host embedding endpoints
- [**RAG Node Integration**](docs/node-reference/RAG_SDK_INTEGRATION.md) - Host-side integration guide

## Examples

Check out the [examples](examples/) directory for complete working examples:

- [**`basic-usage.ts`**](examples/basic-usage.ts) - Simple example with manager-based SDK
- [**`advanced-usage.ts`**](examples/advanced-usage.ts) - Advanced features using all managers
- [**`ui-integration.ts`**](examples/ui-integration.ts) - React/Next.js integration patterns
- [`basic-mock.ts`](examples/basic-mock.ts) - Simple mock mode example (legacy)
- [`basic-production.ts`](examples/basic-production.ts) - Basic production usage (legacy)
- [`streaming.ts`](examples/streaming.ts) - Response streaming
- [`error-handling.ts`](examples/error-handling.ts) - Proper error handling
- [`advanced-negotiation.ts`](examples/advanced-negotiation.ts) - Complex job negotiation
- [`system-monitoring.ts`](examples/system-monitoring.ts) - Health monitoring

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Build the SDK
pnpm build

# Watch mode for development
pnpm dev
```

## Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/p2p/streaming.test.ts

# Generate coverage report
pnpm test:coverage
```

## License & Usage

This project is source-available under the **Business Source License 1.1** (BUSL-1.1).

### You MAY:
- ✅ View, audit, and review the code (trustless verification)
- ✅ Use in production on the Official Platformless AI Network with FAB token
- ✅ Run nodes on the Official Platformless AI Network
- ✅ Fork for development, testing, research, and security audits

### You MAY NOT (before 2029-01-01):
- ❌ Launch competing networks with different staking tokens
- ❌ Operate nodes on competing networks
- ❌ Offer as commercial hosting service (SaaS/PaaS)

**After 2029-01-01**: Automatically converts to AGPL-3.0-or-later.

See [LICENSE](LICENSE) for full terms.

### Interested in Contributing?

During the BUSL-1.1 period (until 2029-01-01), we're focusing on core development. If you're interested in contributing or have questions, please reach out via:
- 💬 [Discord Community](https://discord.gg/fabstir)
- 📧 Email: support@fabstir.com

After 2029-01-01, the project converts to AGPL-3.0-or-later and will follow standard open-source contribution practices.

## Documentation

- 📚 [Host Discovery API](./docs/HOST_DISCOVERY_API.md) - Automatic host discovery from blockchain
- 🔌 [WebSocket Protocol Guide](./docs/WEBSOCKET_PROTOCOL_GUIDE.md) - Real-time streaming protocol
- 💬 [Session Manager API](./docs/SESSION_MANAGER_ENHANCED.md) - Conversation management
- 🚀 [Inference Manager API](./docs/INFERENCE_MANAGER_API.md) - Direct inference without blockchain
- 🔧 [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) - Common issues and solutions
- 📖 [Full SDK Documentation](./docs/SDK_API.md) - Complete API reference

## Support

- 💬 [Discord Community](https://discord.gg/fabstir)
- 🐛 [Issue Tracker](https://github.com/fabstir/fabstir-llm-sdk/issues)
- 📧 Email: support@fabstir.com

## Acknowledgments

Built with:
- [ethers.js](https://docs.ethers.io/) - Ethereum library
- [libp2p](https://libp2p.io/) - P2P networking stack
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vitest](https://vitest.dev/) - Testing framework