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

### Basic Usage

Simple example to get started with the SDK:

```typescript
import { FabstirSDK } from "@fabstir/llm-sdk";

async function main() {
  // Initialize SDK
  const sdk = new FabstirSDK({
    rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/your-key',
    s5PortalUrl: 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p'
  });

  // Authenticate with private key
  await sdk.authenticate('0x1234567890abcdef...');

  // Create a compute session
  const sessionManager = await sdk.getSessionManager();
  const session = await sessionManager.createSession({
    paymentType: 'ETH',
    amount: '0.005',
    hostAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7'
  });

  console.log('Session created:', session.sessionId);
}

main().catch(console.error);
```

### Advanced Usage with All Managers

Using the full power of the SDK with all manager components:

```typescript
import { FabstirSDK } from "@fabstir/llm-sdk";

async function advancedExample() {
  // Initialize and authenticate
  const sdk = new FabstirSDK();
  await sdk.authenticate(process.env.PRIVATE_KEY!);

  // Use different managers
  const authManager = sdk.getAuthManager();
  const paymentManager = sdk.getPaymentManager();
  const storageManager = await sdk.getStorageManager();
  const discoveryManager = sdk.getDiscoveryManager();
  const sessionManager = await sdk.getSessionManager();

  // Create P2P node for discovery
  await discoveryManager.createNode();
  
  // Find suitable host
  const hostAddress = await discoveryManager.findHost({
    minReputation: 100
  });

  // Create session with discovered host
  const session = await sessionManager.createSession({
    paymentType: 'ETH',
    amount: '0.005',
    hostAddress
  });

  // Store conversation data
  await storageManager.storeData(
    `session-${session.sessionId}`,
    { prompt: 'Hello AI!', timestamp: Date.now() }
  );

  // Complete session
  const completion = await sessionManager.completeSession(session.sessionId);
  console.log('Payment distributed:', completion.paymentDistribution);
}
```

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