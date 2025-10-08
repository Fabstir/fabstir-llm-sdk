# Commands Reference

Complete reference for all Fabstir Host CLI commands. All commands use the `@fabstir/sdk-core` for blockchain interactions.

## Table of Contents
- [Global Options](#global-options)
- [Core Setup Commands](#core-setup-commands)
  - [init](#init)
  - [config](#config)
- [Wallet Commands](#wallet-commands)
  - [wallet](#wallet)
- [Host Lifecycle Commands](#host-lifecycle-commands)
  - [register](#register)
  - [unregister](#unregister)
  - [info](#info)
  - [status](#status)
- [Host Management Commands](#host-management-commands)
  - [update-url](#update-url)
  - [update-models](#update-models)
  - [add-stake](#add-stake)
  - [update-metadata](#update-metadata)
- [Financial Commands](#financial-commands)
  - [withdraw](#withdraw)
- [Runtime Commands](#runtime-commands)
  - [start](#start)
  - [stop](#stop)
  - [logs](#logs)

## Global Options

Common options available for most commands:

| Option | Short | Description |
|--------|-------|-------------|
| `--private-key <key>` | `-k` | Private key for wallet authentication |
| `--rpc-url <url>` | `-r` | RPC endpoint URL (Base Sepolia) |
| `--help` | `-h` | Show command help |

### Environment Variables

Commands read contract addresses from `.env.test` at repository root:
- `CONTRACT_JOB_MARKETPLACE`
- `CONTRACT_NODE_REGISTRY`
- `CONTRACT_PROOF_SYSTEM`
- `CONTRACT_HOST_EARNINGS`
- `CONTRACT_MODEL_REGISTRY`
- `CONTRACT_FAB_TOKEN`
- `CONTRACT_USDC_TOKEN`
- `RPC_URL_BASE_SEPOLIA`

---

## Core Setup Commands

### init

Initialize host configuration with interactive wizard.

```bash
pnpm host init [options]
```

#### Description
Interactive setup wizard that guides you through initial configuration. This command helps you set up wallet credentials, network settings, and basic host configuration.

#### Options
| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing configuration |

#### Examples
```bash
# Interactive setup
pnpm host init

# Force reinitialize
pnpm host init --force
```

#### Implementation Note
Uses SDK configuration via `createSDKConfig()` to set up environment-based config (not JSON files).

---

### config

Manage configuration settings.

```bash
pnpm host config <subcommand> [options]
```

#### Subcommands
- `list` - Display all configuration values
- `get <key>` - Get a specific configuration value
- `set <key> <value>` - Set a configuration value
- `reset` - Reset configuration to defaults

#### Examples
```bash
# List all config
pnpm host config list

# Get single value
pnpm host config get host.port

# Set value
pnpm host config set host.port 8083

# Reset config
pnpm host config reset
```

#### Implementation Note
Configuration is managed through environment variables in `.env.test`, not traditional config files.

---

## Wallet Commands

### wallet

Wallet management and information.

```bash
pnpm host wallet [subcommand] [options]
```

#### Subcommands
- `address` - Display wallet address
- `balance` - Check wallet balances (ETH, FAB, USDC)
- `export` - Export encrypted wallet backup
- `import <source>` - Import wallet from private key or backup

#### Options
| Option | Description |
|--------|-------------|
| `--private-key <key>` | Private key for wallet operations |
| `--rpc-url <url>` | RPC endpoint URL |
| `--token <address>` | Check specific token balance |
| `--all` | Show all known tokens |

#### Examples
```bash
# Show address
pnpm host wallet address --private-key 0x...

# Check balances
pnpm host wallet balance --private-key 0x... --rpc-url https://...

# Check all tokens
pnpm host wallet balance --all --private-key 0x... --rpc-url https://...

# Export wallet
pnpm host wallet export --output wallet-backup.json

# Import wallet
pnpm host wallet import 0x123... --rpc-url https://...
```

#### SDK Integration
Uses `PaymentManagerMultiChain` for token balance queries:
```typescript
const paymentManager = sdk.getPaymentManager();
const balance = await paymentManager.getBalance(address, tokenAddress);
```

---

## Host Lifecycle Commands

### register

Register as a host on the blockchain network.

```bash
pnpm host register [options]
```

#### Description
Registers your node as a host in the Fabstir marketplace. This involves:
1. Checking FAB token balance
2. Approving token spending
3. Staking FAB tokens
4. Registering node information on-chain

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--private-key <key>` | Private key for registration | - |
| `--rpc-url <url>` | RPC endpoint URL | - |
| `--stake <amount>` | Stake amount in FAB | 1000 |
| `--url <url>` | Public URL for host | - |
| `--models <models>` | Comma-separated model list | - |
| `--price <amount>` | Minimum price per token (100-100,000) | 2000 |

#### Examples
```bash
# Basic registration
pnpm host register \
  --private-key 0x... \
  --rpc-url https://base-sepolia.g.alchemy.com/v2/YOUR_KEY \
  --stake 1000

# Registration with details
pnpm host register \
  --private-key 0x... \
  --rpc-url https://... \
  --stake 5000 \
  --url http://my-host.example.com:8083 \
  --models llama-3,gpt-4

# Registration with custom pricing (premium)
pnpm host register \
  --stake 1000 \
  --url http://premium-host.com:8083 \
  --models llama-3 \
  --price 3000

# Registration with budget pricing (competitive)
pnpm host register \
  --stake 1000 \
  --url http://budget-host.com:8083 \
  --models llama-3 \
  --price 1000
```

#### SDK Integration
Uses `HostManager.registerHost()`:
```typescript
await initializeSDK('base-sepolia');
await authenticateSDK(privateKey);
const hostManager = getHostManager();
const txHash = await hostManager.registerHost(stakeAmount, url, models);
```

#### Output
```
✓ SDK initialized
✓ Wallet authenticated: 0x742d...bEb7
✓ Checking FAB balance...
  Balance: 10,000 FAB
✓ Approving token spending...
  Transaction: 0xabc123...
✓ Registering host...
  Transaction: 0xdef456...
✓ Host registered successfully!
  Stake: 1000 FAB
  Min Price: 2000 (0.002000 USDC/token)
  Status: Active
```

---

### unregister

Unregister from the network and unstake tokens.

```bash
pnpm host unregister [options]
```

#### Description
Unregisters your host from the marketplace and returns staked FAB tokens. This operation:
1. Checks current registration status
2. Displays staked amount
3. Unregisters the node
4. Returns stake to your wallet

#### Options
| Option | Description |
|--------|-------------|
| `--private-key <key>` | Private key for authentication |
| `--rpc-url <url>` | RPC endpoint URL |

#### Examples
```bash
# Unregister and unstake
pnpm host unregister \
  --private-key 0x... \
  --rpc-url https://...
```

#### SDK Integration
Uses `HostManager.unregisterHost()`:
```typescript
await initializeSDK('base-sepolia');
await authenticateSDK(privateKey);
const hostManager = getHostManager();

// Check status first
const status = await hostManager.getHostStatus(address);
console.log(`Staked amount: ${ethers.formatUnits(status.stake, 18)} FAB`);

// Unregister
const txHash = await hostManager.unregisterHost();

// Verify
const updatedStatus = await hostManager.getHostStatus(address);
console.log(`Status: ${updatedStatus.isActive ? 'Active' : 'Inactive'}`);
```

#### Output
```
Current staked amount: 1000.00 FAB

Unregistering host...
✓ Transaction confirmed: 0x789abc...
✓ Node status: Inactive
✓ Stake returned to wallet
```

---

### info

Display host information and status.

```bash
pnpm host info [options]
```

#### Description
Shows comprehensive information about your host registration including:
- Registration status
- Staked amount
- Supported models
- API URL
- Accumulated earnings

#### Options
| Option | Description |
|--------|-------------|
| `--private-key <key>` | Private key for authentication |
| `--rpc-url <url>` | RPC endpoint URL |

#### Examples
```bash
# View host info
pnpm host info \
  --private-key 0x... \
  --rpc-url https://...
```

#### SDK Integration
Uses `HostManager.getHostStatus()`:
```typescript
const hostManager = getHostManager();
const status = await hostManager.getHostStatus(address);
// Returns: {
//   isRegistered: boolean,
//   isActive: boolean,
//   stake: bigint,
//   apiUrl: string,
//   supportedModels: string[]
// }
```

#### Output
```
Host Information:
  Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7
  Status: Active
  Registered: Yes

Stake:
  Amount: 1000.00 FAB

Models:
  - llama-3
  - gpt-4
  - mistral-7b

API:
  URL: http://localhost:8083

Earnings:
  Accumulated: 45.67 FAB
  Available to withdraw: 45.67 FAB
```

---

### status

Show current host status and statistics.

```bash
pnpm host status [options]
```

#### Description
Displays runtime status and performance metrics for the running host node.

#### Options
| Option | Description |
|--------|-------------|
| `--detailed` | Show detailed information |
| `--metrics` | Include performance metrics |

#### Examples
```bash
# Basic status
pnpm host status

# Detailed view
pnpm host status --detailed

# With metrics
pnpm host status --metrics
```

#### Output
```
Host Status: RUNNING
Uptime: 2 hours 15 minutes
Active Sessions: 3
```

---

## Host Management Commands

### update-url

Update host API URL.

```bash
pnpm host update-url <url> [options]
```

#### Description
Updates the public URL where your host accepts WebSocket connections. The URL must be accessible from the internet for clients to connect.

#### Options
| Option | Description |
|--------|-------------|
| `--private-key <key>` | Private key for authentication |
| `--rpc-url <url>` | RPC endpoint URL |

#### Examples
```bash
# Update URL
pnpm host update-url http://my-host.example.com:8083 \
  --private-key 0x... \
  --rpc-url https://...

# Update to localhost (testing)
pnpm host update-url http://localhost:8083 \
  --private-key 0x... \
  --rpc-url https://...
```

#### SDK Integration
Uses `HostManager.updateApiUrl()`:
```typescript
await initializeSDK('base-sepolia');
await authenticateSDK(privateKey);
const hostManager = getHostManager();

// Validate URL format
if (!url.startsWith('http://') && !url.startsWith('https://')) {
  throw new Error('Invalid URL format');
}

// Update URL
const txHash = await hostManager.updateApiUrl(url);

// Verify update
const status = await hostManager.getHostStatus(address);
console.log(`New URL: ${status.apiUrl}`);
```

#### Output
```
Current URL: http://old-host.example.com:8083
New URL: http://new-host.example.com:8083

Updating API URL...
✓ Transaction confirmed: 0x123abc...
✓ URL updated successfully!
```

#### Implementation Details
After SDK refactoring (Oct 2024):
- **Lines reduced**: 101 → 72 (29 lines removed)
- **Removed**: ABI imports, manual wallet/provider setup
- **Added**: SDK initialization and manager methods

---

### update-models

Update supported model list.

```bash
pnpm host update-models <models> [options]
```

#### Description
Updates the list of LLM models your host supports. Models should be comma-separated (no spaces).

#### Options
| Option | Description |
|--------|-------------|
| `--private-key <key>` | Private key for authentication |
| `--rpc-url <url>` | RPC endpoint URL |

#### Examples
```bash
# Update models
pnpm host update-models llama-3,gpt-4,mistral-7b \
  --private-key 0x... \
  --rpc-url https://...

# Single model
pnpm host update-models claude-3 \
  --private-key 0x... \
  --rpc-url https://...
```

#### SDK Integration
Uses `HostManager.updateSupportedModels()`:
```typescript
await initializeSDK('base-sepolia');
await authenticateSDK(privateKey);
const hostManager = getHostManager();

// Parse models
const modelArray = models.split(',').map(m => m.trim());

// Update models
const txHash = await hostManager.updateSupportedModels(modelArray);

// Verify update
const status = await hostManager.getHostStatus(address);
console.log(`Updated models: ${status.supportedModels.join(', ')}`);
```

#### Output
```
Current models: llama-3, gpt-4
New models: llama-3, gpt-4, mistral-7b, claude-3

Updating supported models...
✓ Transaction confirmed: 0x456def...
✓ Models updated successfully!
```

#### Implementation Details
After SDK refactoring (Oct 2024):
- **Lines reduced**: 98 → 70 (28 lines removed)
- **Removed**: Direct NodeRegistry contract calls
- **Added**: SDK HostManager integration

---

### add-stake

Add additional stake to your host registration.

```bash
pnpm host add-stake <amount> [options]
```

#### Description
Increases the amount of FAB tokens staked with your host registration. This may improve your host's reputation in the marketplace.

#### Options
| Option | Description |
|--------|-------------|
| `--private-key <key>` | Private key for authentication |
| `--rpc-url <url>` | RPC endpoint URL |

#### Examples
```bash
# Add 500 FAB to stake
pnpm host add-stake 500 \
  --private-key 0x... \
  --rpc-url https://...
```

#### SDK Integration
Uses `HostManager.addStake()`:
```typescript
const hostManager = getHostManager();
const stakeAmount = ethers.parseUnits(amount, 18);
const txHash = await hostManager.addStake(stakeAmount);
```

#### Output
```
Current stake: 1000.00 FAB
Adding: 500.00 FAB
New total: 1500.00 FAB

Adding stake...
✓ Transaction confirmed: 0x789ghi...
✓ Stake increased successfully!
```

---

### update-metadata

Update host metadata.

```bash
pnpm host update-metadata [options]
```

#### Description
Updates additional metadata associated with your host registration, such as description, contact info, or custom properties.

#### Options
| Option | Description |
|--------|-------------|
| `--private-key <key>` | Private key for authentication |
| `--rpc-url <url>` | RPC endpoint URL |
| `--key <key>` | Metadata key to update |
| `--value <value>` | Metadata value |

#### Examples
```bash
# Update metadata
pnpm host update-metadata \
  --key description \
  --value "High-performance LLM host" \
  --private-key 0x... \
  --rpc-url https://...
```

---

### update-pricing

Update the minimum price per token for your host.

```bash
pnpm host update-pricing --price <amount> [options]
```

#### Description
Updates your host's minimum price per token. This is the minimum price clients must pay for inference tokens from your host. The price is validated on-chain and takes effect immediately.

#### Options
| Option | Description |
|--------|-------------|
| `--price <amount>` | New minimum price per token (100-100,000) |
| `--private-key <key>` | Private key for authentication |
| `--rpc-url <url>` | RPC endpoint URL |

#### Examples
```bash
# Increase to premium pricing (0.005 USDC/token)
pnpm host update-pricing \
  --price 5000 \
  --private-key 0x... \
  --rpc-url https://...

# Lower to competitive pricing (0.0015 USDC/token)
pnpm host update-pricing \
  --price 1500 \
  --private-key 0x...

# Budget pricing (0.001 USDC/token)
pnpm host update-pricing \
  --price 1000
```

#### SDK Integration
Uses `HostManager.updatePricing()`:
```typescript
const hostManager = getHostManager();

// Get current pricing
const hostInfo = await hostManager.getHostInfo(address);
console.log(`Current: ${hostInfo.minPricePerToken}`);

// Update pricing
const txHash = await hostManager.updatePricing('5000');
```

#### Output
```
💰 Updating Host Pricing...

📍 Address: 0x4594F755...
🌐 Network: Base Sepolia

Current price: 2000 (0.002000 USDC/token)
New price:     5000 (0.005000 USDC/token)

📝 Submitting transaction...
📋 Transaction hash: 0xabc123...

✅ Successfully updated pricing!
🔗 Transaction: 0xabc123...
✓ New price: 5000 (0.005000 USDC/token)
```

**Notes**:
- Price must be between 100 (0.0001 USDC/token) and 100,000 (0.1 USDC/token)
- Change takes effect immediately on-chain
- Clients creating new sessions will see the updated price
- Existing sessions continue at their original price

---

## Financial Commands

### withdraw

Withdraw accumulated earnings.

```bash
pnpm host withdraw [options]
```

#### Description
Withdraws accumulated earnings from completed sessions. Earnings are held in the HostEarnings contract until withdrawn.

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--private-key <key>` | Private key for authentication | - |
| `--rpc-url <url>` | RPC endpoint URL | - |
| `--token <address>` | Token to withdraw (FAB/USDC) | FAB |
| `--all` | Withdraw all available earnings | true |

#### Examples
```bash
# Withdraw all FAB earnings
pnpm host withdraw \
  --private-key 0x... \
  --rpc-url https://...

# Withdraw USDC earnings
pnpm host withdraw \
  --token 0x... \
  --private-key 0x... \
  --rpc-url https://...
```

#### SDK Integration
Uses `HostManager.withdrawEarnings()`:
```typescript
const hostManager = getHostManager();

// Check balance first
const balance = await hostManager.getAccumulatedEarnings(
  address,
  tokenAddress
);
console.log(`Available: ${ethers.formatUnits(balance, 18)} FAB`);

// Withdraw
const txHash = await hostManager.withdrawEarnings(tokenAddress);
```

#### Output
```
Current earnings: 45.67 FAB
Available to withdraw: 45.67 FAB

Withdrawing earnings...
✓ Transaction confirmed: 0xjkl012...
✓ Earnings withdrawn successfully!
  Amount: 45.67 FAB
  New balance: 0.00 FAB
```

---

## Runtime Commands

### start

Start the host node.

```bash
pnpm host start [options]
```

#### Description
Starts the host node and begins accepting jobs from the marketplace. This starts:
- WebSocket server for client connections
- LLM backend connection
- Session management
- Proof submission

#### Options
| Option | Description |
|--------|-------------|
| `--daemon` | Run in background |
| `--port <port>` | Override WebSocket port |

#### Examples
```bash
# Start normally
pnpm host start

# Start as daemon
pnpm host start --daemon

# Custom port
pnpm host start --port 9090
```

#### Output
```
Starting Fabstir Host...
✓ Configuration loaded
✓ SDK initialized (Base Sepolia)
✓ Wallet connected: 0x742d...bEb7
✓ Network: Base Sepolia (84532)
✓ WebSocket server started on port 8083
✓ Host registered and active

Host is running. Press Ctrl+C to stop.
```

---

### stop

Stop the running host node.

```bash
pnpm host stop [options]
```

#### Description
Gracefully stops the running host node, completing active sessions before shutdown.

#### Options
| Option | Description |
|--------|-------------|
| `--force` | Force stop without cleanup |
| `--timeout <ms>` | Shutdown timeout |

#### Examples
```bash
# Graceful stop
pnpm host stop

# Force stop
pnpm host stop --force
```

---

### logs

View host logs.

```bash
pnpm host logs [options]
```

#### Description
Displays logs from the running or stopped host node.

#### Options
| Option | Description |
|--------|-------------|
| `--follow` | Follow log output (like tail -f) |
| `--lines <n>` | Number of lines to show |
| `--level <level>` | Filter by log level (error, warn, info, debug) |

#### Examples
```bash
# View logs
pnpm host logs

# Follow logs
pnpm host logs --follow

# Last 50 lines
pnpm host logs --lines 50

# Error logs only
pnpm host logs --level error
```

---

## SDK Architecture

All commands use the `@fabstir/sdk-core` SDK for blockchain interactions. The typical flow is:

```typescript
// 1. Initialize SDK with environment-based config
await initializeSDK('base-sepolia');

// 2. Authenticate with private key
await authenticateSDK(privateKey);

// 3. Get appropriate manager
const hostManager = getHostManager();
const paymentManager = getPaymentManager();
const sessionManager = getSessionManager();

// 4. Call SDK methods (not direct contract calls)
const txHash = await hostManager.updateApiUrl(url);

// 5. SDK handles:
//    - Transaction submission
//    - Waiting for confirmations (3 blocks)
//    - Error handling
//    - Event parsing
```

### Benefits of SDK Integration

✅ **No ABI imports** - SDK provides contract interfaces
✅ **Consistent errors** - Typed SDK errors
✅ **Automatic retries** - Built-in resilience
✅ **Type safety** - Full TypeScript support
✅ **Less code** - 59% reduction in boilerplate

See [SDK-INTEGRATION.md](SDK-INTEGRATION.md) for detailed architecture documentation.

---

## Getting Help

```bash
# General help
pnpm host --help

# Command-specific help
pnpm host register --help
pnpm host update-url --help

# View this reference
cat packages/host-cli/docs/COMMANDS.md
```

## See Also

- [README.md](../README.md) - Quick start and overview
- [SDK-INTEGRATION.md](SDK-INTEGRATION.md) - SDK architecture details
- [CONFIGURATION.md](CONFIGURATION.md) - Environment variable configuration
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
