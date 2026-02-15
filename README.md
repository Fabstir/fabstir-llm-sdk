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
- 🗂️ **Vector Databases** - Host-side vector storage and cosine similarity search via WebSocket
- 🎨 **Image Generation** - Text-to-image via FLUX.2 diffusion models over E2E encrypted WebSocket
- 🔐 **End-to-End Encryption** - XChaCha20-Poly1305 encryption enabled by default with forward secrecy
- 🛡️ **Error Recovery** - Automatic retries and failover to ensure reliability
- 🔌 **Browser Compatible** - Works in both Node.js and browser environments

## Quick Start

### Streaming LLM Session

Stream LLM responses in real-time with end-to-end encryption (enabled by default):

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ChainRegistry, ChainId } from '@fabstir/sdk-core/config';

async function streamingExample() {
  // Initialize SDK with chain configuration
  const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
  const sdk = new FabstirSDKCore({
    mode: 'production' as const,
    chainId: ChainId.BASE_SEPOLIA,
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!,
    contractAddresses: {
      jobMarketplace: chain.contracts.jobMarketplace,
      nodeRegistry: chain.contracts.nodeRegistry,
      proofSystem: chain.contracts.proofSystem,
      hostEarnings: chain.contracts.hostEarnings,
      modelRegistry: chain.contracts.modelRegistry,
      usdcToken: chain.contracts.usdcToken,
      fabToken: chain.contracts.fabToken,
    }
  });

  // Authenticate with wallet
  await sdk.authenticate(privateKey);

  // Start encrypted session with host
  const sessionManager = await sdk.getSessionManager();
  const { sessionId } = await sessionManager.startSession({
    hostUrl: 'http://host-node:8080',
    jobId: 123n,
    modelName: 'llama-3',
    chainId: ChainId.BASE_SEPOLIA
    // encryption: true is the default
  });

  // Stream tokens as they arrive
  await sessionManager.sendPromptStreaming(
    sessionId,
    "Explain quantum computing in simple terms",
    (chunk) => process.stdout.write(chunk.content)
  );
}

streamingExample().catch(console.error);
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

### Development Setup

```bash
# Clone and install (IMPORTANT: Use pnpm, not npm)
git clone https://github.com/fabstir/fabstir-llm-sdk.git
cd fabstir-llm-sdk
pnpm install

# Build SDK core
cd packages/sdk-core && pnpm build
```

### Package Installation

```bash
pnpm add @fabstir/sdk-core
```

### Prerequisites

- Node.js 18.0 or higher
- pnpm (not npm — npm causes dependency hoisting issues)
- TypeScript 5.0 or higher (for TypeScript projects)
- An Ethereum wallet provider (MetaMask, WalletConnect, etc.)

## Configuration

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ChainRegistry, ChainId } from '@fabstir/sdk-core/config';

const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
const sdk = new FabstirSDKCore({
  mode: 'production' as const,
  chainId: ChainId.BASE_SEPOLIA,
  rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!,
  contractAddresses: {
    jobMarketplace: chain.contracts.jobMarketplace,
    nodeRegistry: chain.contracts.nodeRegistry,
    // ... other contracts from chain.contracts
  }
});

await sdk.authenticate(privateKey);
```

**Contract addresses**: Always read from `.env.test` (source of truth). Never hardcode.

## Documentation

- [**SDK API Reference**](docs/SDK_API.md) - Complete API documentation for all managers
- [Architecture](docs/ARCHITECTURE.md) - System architecture overview
- [Encryption Guide](docs/ENCRYPTION_GUIDE.md) - End-to-end encryption details
- [Encryption FAQ](docs/ENCRYPTION_FAQ.md) - Common encryption questions
- [Multi-Chain Developer Guide](docs/MULTI_CHAIN_DEVELOPER_GUIDE.md) - Multi-chain support
- [Host Operator Guide](docs/HOST_OPERATOR_GUIDE.md) - Running a host node
- [Executive Summary](docs/EXECUTIVE_SUMMARY.md) - Project overview

### Reference Documentation

- [Contract Reference](docs/compute-contracts-reference/) - Smart contract documentation
- [Node Reference](docs/node-reference/API.md) - Host node API
- [Host CLI Reference](packages/host-cli/docs/API_REFERENCE.md) - Host CLI commands

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

## Additional Documentation

- 🔌 [WebSocket Protocol Guide](./docs/WEBSOCKET_PROTOCOL_GUIDE.md) - Real-time streaming protocol
- 📖 [Full SDK Documentation](./docs/SDK_API.md) - Complete API reference
- 🔐 [Encryption Guide](./docs/ENCRYPTION_GUIDE.md) - End-to-end encryption architecture

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