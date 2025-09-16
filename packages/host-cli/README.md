# Fabstir Host CLI

> Command-line interface for running a Fabstir P2P LLM host node

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/fabstir/fabstir-host-cli)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)

## Overview

Fabstir Host CLI enables you to run a host node in the Fabstir decentralized LLM marketplace. As a host, you can:

- 🚀 **Earn FAB tokens** by providing LLM inference services
- 🔒 **Secure operations** with on-chain proof verification
- 💰 **Flexible earnings** through session-based jobs
- 🌐 **P2P networking** with automatic peer discovery
- 🛡️ **Built-in resilience** with circuit breakers and retry logic

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Ethereum wallet with private key
- Base Sepolia ETH for gas (minimum 0.01 ETH)
- FAB tokens for staking (minimum 1000 FAB)
- LLM inference endpoint (e.g., Ollama, vLLM, or OpenAI-compatible)

### Installation

```bash
# Install globally
npm install -g @fabstir/host-cli

# Or use locally
git clone https://github.com/fabstir/fabstir-host-cli
cd fabstir-host-cli
npm install
npm link
```

### Initial Setup

1. **Initialize configuration:**
```bash
fabstir-host init
```

This interactive wizard will guide you through:
- Creating or importing a wallet
- Selecting network (Base Mainnet/Sepolia)
- Configuring your LLM endpoint
- Setting pricing and models

2. **Register as a host:**
```bash
fabstir-host register
```

This will:
- Stake your FAB tokens
- Register your node on-chain
- Configure your host capabilities

3. **Start hosting:**
```bash
fabstir-host start
```

Your node is now live and accepting jobs!

## Core Commands

### Configuration Management

```bash
# View current configuration
fabstir-host config list

# Get specific setting
fabstir-host config get network.name

# Update setting
fabstir-host config set host.port 8080

# Reset to defaults
fabstir-host config reset
```

### Host Operations

```bash
# Start host node
fabstir-host start

# Start in daemon mode
fabstir-host daemon start

# Stop daemon
fabstir-host stop

# Check status
fabstir-host status
```

### Wallet Management

```bash
# Show wallet address
fabstir-host wallet address

# Check balances
fabstir-host wallet balance

# Export wallet (encrypted)
fabstir-host wallet export

# Import wallet
fabstir-host wallet import <private-key>
```

### Earnings & Withdrawals

```bash
# Check earnings
fabstir-host earnings balance

# Withdraw earnings
fabstir-host withdraw

# View withdrawal history
fabstir-host withdraw history
```

### Session Management

```bash
# List active sessions
fabstir-host session list

# View session details
fabstir-host session info <session-id>

# End session (if authorized)
fabstir-host session end <session-id>
```

## Configuration

Configuration is stored in `~/.fabstir/config.json`. See [CONFIGURATION.md](docs/CONFIGURATION.md) for detailed reference.

### Example Configuration

```json
{
  "wallet": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"
  },
  "network": {
    "name": "base-sepolia",
    "chainId": 84532,
    "rpcUrl": "https://sepolia.base.org"
  },
  "host": {
    "port": 8080,
    "publicUrl": "https://my-host.example.com",
    "models": ["gpt-3.5-turbo", "gpt-4"],
    "pricePerToken": "0.0001"
  },
  "inference": {
    "endpoint": "http://localhost:11434",
    "type": "ollama",
    "maxConcurrent": 5
  }
}
```

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client SDK    │────▶│  Blockchain  │────▶│  Host CLI   │
└─────────────────┘     └──────────────┘     └─────────────┘
                               │                      │
                               ▼                      ▼
                        ┌──────────────┐      ┌─────────────┐
                        │   Contracts  │      │  LLM Engine │
                        └──────────────┘      └─────────────┘
```

### Key Components

- **WebSocket Server**: Handles real-time session communication
- **Proof System**: Generates and submits computation proofs
- **Circuit Breaker**: Protects against cascading failures
- **Session Manager**: Orchestrates job execution
- **Withdrawal Manager**: Handles earnings and stake management

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- registration

# Run with coverage
npm run test:coverage
```

### Building from Source

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run locally
npm run dev
```

## Troubleshooting

See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues and solutions.

### Common Issues

- **"Insufficient FAB balance"**: Ensure you have at least 1000 FAB for staking
- **"Connection refused"**: Check your LLM endpoint is running
- **"Gas estimation failed"**: Ensure sufficient ETH for transactions
- **"WebSocket timeout"**: Check firewall/NAT settings

## Security

- Private keys are encrypted using OS keychain (via keytar)
- All contract interactions are signed locally
- WebSocket connections use JWT authentication
- See [SECURITY.md](docs/SECURITY.md) for best practices

## Support

- 📖 [Documentation](docs/)
- 💬 [Discord Community](https://discord.gg/fabstir)
- 🐛 [Issue Tracker](https://github.com/fabstir/fabstir-host-cli/issues)
- 📧 [Email Support](mailto:support@fabstir.com)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting PRs.

---

Built with ❤️ by the Fabstir team