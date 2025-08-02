# Fabstir LLM SDK

A TypeScript SDK for interacting with the Fabstir P2P LLM Marketplace, enabling decentralized AI model access without central servers.

## Features

- 🌐 **Decentralized P2P Network** - Direct node-to-node communication without intermediaries
- 🚀 **Mock Mode** - Development mode with instant responses for rapid prototyping
- 🔄 **Real-time Streaming** - Stream LLM responses token-by-token
- 💰 **Automated Payments** - Built-in escrow and payment handling via smart contracts
- 🔍 **Node Discovery** - Automatic discovery of available nodes and models
- 📊 **Performance Tracking** - Monitor latency, throughput, and system health
- 🛡️ **Error Recovery** - Automatic retries and failover to ensure reliability
- 🔌 **Event-Driven Architecture** - Rich event system for monitoring operations

## Quick Start

### Mock Mode (Development)

Perfect for development and testing without needing a full P2P network:

```typescript
import { FabstirSDK } from "@fabstir/llm-sdk";
import { ethers } from "ethers";

// Initialize SDK in mock mode
const sdk = new FabstirSDK({
  mode: "mock", // Uses local mock responses
});

// Connect wallet (required even in mock mode)
const provider = new ethers.providers.Web3Provider(window.ethereum);
await sdk.connect(provider);

// Submit a job - returns instantly
const jobId = await sdk.submitJob({
  prompt: "Hello, world!",
  modelId: "llama-3.2-1b-instruct",
  maxTokens: 50,
});

console.log(`Job ${jobId} submitted!`);
```

### Production Mode (Real P2P)

For production use with real P2P network and blockchain integration:

```typescript
import { FabstirSDK } from "@fabstir/llm-sdk";
import { ethers } from "ethers";

// Initialize SDK with P2P configuration
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [
      "/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg"
    ],
  },
});

// Connect wallet
const provider = new ethers.providers.Web3Provider(window.ethereum);
await sdk.connect(provider);

// Discover available nodes
const nodes = await sdk.discoverNodes({
  modelId: "llama-3.2-1b-instruct",
});
console.log(`Found ${nodes.length} nodes`);

// Submit job with negotiation
const result = await sdk.submitJobWithNegotiation({
  prompt: "Explain quantum computing",
  modelId: "llama-3.2-1b-instruct",
  maxTokens: 200,
  stream: true,
});

// Stream the response
if (result.stream) {
  result.stream.on("token", (token) => {
    process.stdout.write(token.content);
  });
  
  result.stream.on("end", (summary) => {
    console.log(`\nCompleted: ${summary.totalTokens} tokens`);
  });
}
```

## Installation

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

- [Setup Guide](docs/SETUP_GUIDE.md) - Detailed setup instructions
- [API Reference](docs/API.md) - Complete API documentation
- [P2P Configuration](docs/P2P_CONFIGURATION.md) - P2P network configuration
- [Architecture](docs/ARCHITECTURE.md) - System architecture overview
- [Configuration](docs/CONFIGURATION.md) - All configuration options

## Examples

Check out the [examples](examples/) directory for complete working examples:

- [`basic-mock.ts`](examples/basic-mock.ts) - Simple mock mode example
- [`basic-production.ts`](examples/basic-production.ts) - Basic production usage
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

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Clone your fork
3. Install dependencies: `pnpm install`
4. Create a feature branch: `git checkout -b feature/amazing-feature`
5. Make your changes
6. Run tests: `pnpm test`
7. Commit your changes: `git commit -m 'Add amazing feature'`
8. Push to your fork: `git push origin feature/amazing-feature`
9. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://docs.fabstir.com)
- 💬 [Discord Community](https://discord.gg/fabstir)
- 🐛 [Issue Tracker](https://github.com/fabstir/llm-sdk/issues)
- 📧 Email: support@fabstir.com

## Acknowledgments

Built with:
- [ethers.js](https://docs.ethers.io/) - Ethereum library
- [libp2p](https://libp2p.io/) - P2P networking stack
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vitest](https://vitest.dev/) - Testing framework