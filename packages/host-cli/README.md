# Fabstir Host CLI

> Command-line interface for running a Fabstir P2P LLM host node

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-pre--MVP-orange.svg)](https://github.com/fabstir/fabstir-llm-sdk)

## Overview

Fabstir Host CLI enables you to run a host node in the Fabstir decentralized LLM marketplace. The CLI uses the `@fabstir/sdk-core` for all blockchain interactions, providing a clean SDK-based architecture.

### What You Can Do

- 🚀 **Earn tokens** by providing LLM inference services
- 🔒 **Secure operations** with on-chain registration and proof verification
- 💰 **Manage stake** and earnings through simple commands
- 🌐 **SDK-powered** - all contract interactions through tested SDK methods
- 🛡️ **Type-safe** - full TypeScript implementation with proper error handling

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Host CLI      │────▶│  @fabstir/sdk   │────▶│  Contracts  │
│   (Commands)    │     │   (Managers)     │     │  (Base L2)  │
└─────────────────┘     └──────────────────┘     └─────────────┘
         │                       │
         ▼                       ▼
  ┌─────────────┐         ┌─────────────┐
  │  .env.test  │         │  Blockchain │
  │   Config    │         │  (Testnet)  │
  └─────────────┘         └─────────────┘
```

**SDK Integration**: The CLI delegates all blockchain operations to SDK managers:
- `HostManager` - Registration, unregistration, URL/model updates
- `PaymentManager` - Token approvals, deposits, withdrawals
- `SessionManager` - Proof submissions
- `TreasuryManager` - Fee management

See [SDK-INTEGRATION.md](docs/SDK-INTEGRATION.md) for architecture details.

## Quick Start

### Prerequisites

- **Node.js 18+** and **pnpm** (npm causes dependency hoisting issues)
- **Ethereum wallet** with private key
- **Base Sepolia ETH** for gas (minimum 0.01 ETH)
- **FAB tokens** for staking (minimum 1000 FAB)
- Access to `.env.test` with contract addresses (provided by project owner)

### Installation

This is a **pre-MVP monorepo package**. Install from source:

```bash
# Clone the monorepo
git clone https://github.com/fabstir/fabstir-llm-sdk.git
cd fabstir-llm-sdk

# Install dependencies (IMPORTANT: Use pnpm, not npm)
pnpm install

# Build SDK core (required dependency)
cd packages/sdk-core && pnpm build && cd ../..

# Build host-cli
cd packages/host-cli && pnpm build
```

### Environment Setup

The CLI requires contract addresses and RPC URLs from `.env.test` at the repository root:

```bash
# .env.test (managed by project owner)
CONTRACT_JOB_MARKETPLACE=0x...
CONTRACT_NODE_REGISTRY=0x...
CONTRACT_PROOF_SYSTEM=0x...
CONTRACT_HOST_EARNINGS=0x...
CONTRACT_MODEL_REGISTRY=0x...
CONTRACT_FAB_TOKEN=0x...
CONTRACT_USDC_TOKEN=0x...
RPC_URL_BASE_SEPOLIA=https://...
```

**Important**: Never modify `.env.test` - it's the source of truth for contract addresses.

### Basic Usage

```bash
# Check available commands
pnpm host --help

# Register as a host (requires FAB tokens for stake)
pnpm host register \
  --private-key 0x... \
  --rpc-url https://base-sepolia.g.alchemy.com/v2/YOUR_KEY \
  --stake 1000

# Check host info
pnpm host info \
  --private-key 0x... \
  --rpc-url https://...

# Update host URL
pnpm host update-url http://localhost:8080 \
  --private-key 0x... \
  --rpc-url https://...

# Update supported models
pnpm host update-models llama-3,gpt-4 \
  --private-key 0x... \
  --rpc-url https://...

# Withdraw earnings
pnpm host withdraw \
  --private-key 0x... \
  --rpc-url https://...

# Unregister (unstakes your tokens)
pnpm host unregister \
  --private-key 0x... \
  --rpc-url https://...
```

## Available Commands

The CLI provides 15 commands organized by function:

### Core Setup
- `init` - Initialize host configuration (interactive wizard)
- `config` - Manage configuration settings

### Wallet Operations
- `wallet` - Wallet management (address, balance, import/export)

### Host Lifecycle
- `register` - Register as a host (stake tokens)
- `unregister` - Unregister and unstake tokens
- `info` - Display host information and status
- `status` - Show current host status and statistics

### Host Management
- `update-url` - Update host API URL
- `update-models` - Update supported model list
- `add-stake` - Add additional stake
- `update-metadata` - Update host metadata

### Financial Operations
- `withdraw` - Withdraw accumulated earnings

### Runtime Operations
- `start` - Start the host node
- `stop` - Stop the running host node
- `logs` - View host logs

See [COMMANDS.md](docs/COMMANDS.md) for detailed documentation of each command.

## SDK Integration Benefits

After the recent SDK refactoring (Oct 2024), the Host CLI:

✅ **No direct contract calls** - All operations through SDK managers
✅ **No ABI imports** - SDK handles contract interfaces
✅ **Consistent error handling** - SDK provides typed errors
✅ **Automatic retries** - Built into SDK methods
✅ **Type safety** - Full TypeScript interfaces
✅ **59% less code** - Removed ~118 lines of boilerplate

**Before Refactoring:**
```typescript
// Old: Direct contract instantiation
const wallet = await getWallet(privateKey);
const nodeRegistry = new ethers.Contract(
  nodeRegistryAddress,
  NodeRegistryABI,
  signer
);
const tx = await nodeRegistry.updateApiUrl(url);
await tx.wait(3);
```

**After Refactoring:**
```typescript
// New: SDK method
await initializeSDK('base-sepolia');
await authenticateSDK(privateKey);
const hostManager = getHostManager();
const txHash = await hostManager.updateApiUrl(url);
// SDK waits for confirmations internally
```

See [docs/SDK-INTEGRATION.md](docs/SDK-INTEGRATION.md) for migration details.

## Configuration

Configuration is handled through environment variables (`.env.test`) and SDK initialization, not JSON config files.

The SDK is initialized with:
```typescript
createSDKConfig('base-sepolia')
// Returns: {
//   chainId: 84532,
//   rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
//   contractAddresses: { /* from .env.test */ },
//   mode: 'production'
// }
```

See [CONFIGURATION.md](docs/CONFIGURATION.md) for details.

## Development

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/commands/register.test.ts

# Run with verbose output
npx vitest run --reporter=verbose
```

### Building from Source

```bash
# Build SDK core first (dependency)
cd packages/sdk-core && pnpm build

# Build host-cli
cd packages/host-cli && pnpm build

# Watch mode for development
pnpm dev
```

### Project Structure

```
packages/host-cli/
├── src/
│   ├── commands/          # CLI command implementations
│   ├── sdk/
│   │   ├── client.ts      # SDK wrapper (getHostManager, etc.)
│   │   ├── config.ts      # SDK config from env vars
│   │   └── auth.ts        # Authentication helpers
│   ├── utils/             # Utilities (wallet, formatting)
│   ├── proof/             # Proof submission logic
│   └── index.ts           # CLI entry point
├── tests/
│   ├── commands/          # Command tests
│   └── sdk/               # SDK integration tests
└── docs/                  # Documentation
```

## Common Operations

### First-Time Host Setup

```bash
# 1. Ensure you have FAB tokens and ETH on Base Sepolia
# 2. Register as a host
pnpm host register --private-key 0x... --rpc-url https://... --stake 1000

# 3. Update your public URL
pnpm host update-url http://your-host.example.com:8080 \
  --private-key 0x... --rpc-url https://...

# 4. Set supported models
pnpm host update-models llama-3,mistral-7b \
  --private-key 0x... --rpc-url https://...

# 5. Check registration
pnpm host info --private-key 0x... --rpc-url https://...
```

### Checking Earnings

```bash
# View host info (includes accumulated earnings)
pnpm host info --private-key 0x... --rpc-url https://...

# Withdraw all earnings
pnpm host withdraw --private-key 0x... --rpc-url https://...
```

### Updating Configuration

```bash
# Change API URL
pnpm host update-url http://new-url:8080 \
  --private-key 0x... --rpc-url https://...

# Add new models
pnpm host update-models llama-3,gpt-4,claude-3 \
  --private-key 0x... --rpc-url https://...

# Increase stake
pnpm host add-stake 500 \
  --private-key 0x... --rpc-url https://...
```

## Troubleshooting

### Common Issues

**"SDK not initialized"**
- Ensure SDK initialization happens before manager calls
- Check that environment variables are loaded from `.env.test`

**"Insufficient FAB balance"**
- Check your FAB token balance: `pnpm host wallet --private-key 0x...`
- Minimum 1000 FAB required for registration

**"Contract address not found"**
- Verify `.env.test` is in repository root
- Never hardcode contract addresses - they're in `.env.test` only

**"PaymentManager.depositNative is not a function"**
- This indicates old PaymentManager usage
- Use PaymentManagerMultiChain (SDK handles this automatically)

**"Transaction timeout"**
- SDK methods wait for confirmations internally (3 blocks)
- Increase timeout if on slow network: add `--timeout` flag

See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for more solutions.

## Security

- **Private keys**: Never commit private keys or `.env` files
- **Environment isolation**: Use `.env.test` for testnet only
- **SDK authentication**: All operations require authenticated SDK instance
- **Contract verification**: All contract addresses verified on-chain
- **No mocks in production**: All E2E tests use real contracts on testnet

See [SECURITY.md](docs/SECURITY.md) for best practices.

## Testing Philosophy

The Host CLI follows strict **TDD (Test-Driven Development)**:

1. ✅ Write tests first (they should fail)
2. ✅ Implement to make tests pass
3. ✅ No mocks in E2E tests (real blockchain interactions)
4. ✅ All tests must pass before merge

**Test Coverage**: 40/40 tests passing (100%) after SDK refactoring.

## Pre-MVP Status

⚠️ **This project is pre-MVP**:

- No external users yet
- No npm package published
- Install from source only
- Breaking changes allowed without deprecation
- `.env.test` managed by project owner only
- Documentation reflects current state only (no migration guides)

## Support & Contributing

- 📖 **Documentation**: [docs/](docs/)
- 🐛 **Issues**: [GitHub Issues](https://github.com/fabstir/fabstir-llm-sdk/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/fabstir/fabstir-llm-sdk/discussions)

**Contributing**: Read [CONTRIBUTING.md](../../CONTRIBUTING.md) for development workflow.

## Related Packages

This CLI is part of the Fabstir LLM SDK monorepo:

- **@fabstir/sdk-core** - Core SDK with managers and contracts
- **@fabstir/sdk-node** - Node.js-specific features (planned)
- **apps/harness** - Next.js test harness for UI development

## License

MIT License - see [LICENSE](../../LICENSE) file for details.

---

Built by the Fabstir team | Last updated: October 2024 (Post-SDK Refactoring)
