# Commands Reference

Complete reference for all Fabstir Host CLI commands.

## Table of Contents
- [Global Options](#global-options)
- [Core Commands](#core-commands)
  - [init](#init)
  - [start](#start)
  - [stop](#stop)
  - [status](#status)
- [Registration Commands](#registration-commands)
  - [register](#register)
  - [unregister](#unregister)
- [Wallet Commands](#wallet-commands)
  - [wallet address](#wallet-address)
  - [wallet balance](#wallet-balance)
  - [wallet export](#wallet-export)
  - [wallet import](#wallet-import)
- [Configuration Commands](#configuration-commands)
  - [config list](#config-list)
  - [config get](#config-get)
  - [config set](#config-set)
  - [config reset](#config-reset)
- [Session Commands](#session-commands)
  - [session list](#session-list)
  - [session info](#session-info)
  - [session end](#session-end)
- [Earnings Commands](#earnings-commands)
  - [earnings balance](#earnings-balance)
  - [earnings history](#earnings-history)
- [Withdrawal Commands](#withdrawal-commands)
  - [withdraw](#withdraw)
  - [withdraw history](#withdraw-history)
  - [unstake](#unstake)
- [Daemon Commands](#daemon-commands)
  - [daemon start](#daemon-start)
  - [daemon stop](#daemon-stop)
  - [daemon status](#daemon-status)
- [Utility Commands](#utility-commands)
  - [network test](#network-test)
  - [inference test](#inference-test)
  - [version](#version)
  - [help](#help)

## Global Options

Options available for all commands:

| Option | Short | Description |
|--------|-------|-------------|
| `--config <path>` | `-c` | Custom config file path |
| `--network <name>` | `-n` | Override network (base-sepolia, base-mainnet) |
| `--verbose` | `-v` | Enable verbose output |
| `--quiet` | `-q` | Suppress output |
| `--json` | `-j` | Output in JSON format |
| `--help` | `-h` | Show help |

### Examples
```bash
# Use custom config
fabstir-host --config ~/my-config.json start

# Verbose output
fabstir-host -v status

# JSON output
fabstir-host --json wallet balance
```

---

## Core Commands

### init
Initialize host configuration with interactive wizard.

```bash
fabstir-host init [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing configuration |
| `--minimal` | Skip optional configuration |
| `--import <key>` | Import existing private key |

#### Examples
```bash
# Interactive setup
fabstir-host init

# Force reinitialize
fabstir-host init --force

# Import existing wallet
fabstir-host init --import 0x123...
```

#### Interactive Prompts
- Wallet setup (create/import)
- Network selection
- RPC endpoint
- Host port and URL
- Model selection
- Pricing configuration

---

### start
Start the host node and begin accepting jobs.

```bash
fabstir-host start [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--daemon` | Run in background |
| `--port <port>` | Override port |
| `--test` | Run in test mode |
| `--dry-run` | Validate without starting |

#### Examples
```bash
# Start normally
fabstir-host start

# Start as daemon
fabstir-host start --daemon

# Test mode
fabstir-host start --test

# Custom port
fabstir-host start --port 9090
```

#### Output
```
Starting Fabstir Host...
✓ Configuration loaded
✓ Wallet connected: 0x742d...bEb7
✓ Network: Base Sepolia (84532)
✓ LLM backend connected: Ollama
✓ WebSocket server started on port 8080
✓ Registered with blockchain
Host is running. Press Ctrl+C to stop.
```

---

### stop
Stop the running host node.

```bash
fabstir-host stop [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--force` | Force stop without cleanup |
| `--timeout <ms>` | Shutdown timeout |

#### Examples
```bash
# Graceful stop
fabstir-host stop

# Force stop
fabstir-host stop --force

# Custom timeout
fabstir-host stop --timeout 10000
```

---

### status
Display current host status and statistics.

```bash
fabstir-host status [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--detailed` | Show detailed information |
| `--metrics` | Include performance metrics |

#### Examples
```bash
# Basic status
fabstir-host status

# Detailed view
fabstir-host status --detailed

# With metrics
fabstir-host status --metrics
```

#### Output
```
Host Status: RUNNING
Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7
Network: Base Sepolia
Uptime: 2 hours 15 minutes

Sessions:
  Active: 3
  Completed: 127
  Failed: 2

Earnings:
  Total: 1,234.56 FAB
  Pending: 45.67 FAB
```

---

## Registration Commands

### register
Register as a host on the blockchain.

```bash
fabstir-host register [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--stake <amount>` | Stake amount (default: 1000 FAB) |
| `--models <models>` | Comma-separated model list |
| `--url <url>` | Public URL |

#### Examples
```bash
# Default registration
fabstir-host register

# Custom stake
fabstir-host register --stake 5000

# Specify models
fabstir-host register --models gpt-4,claude-3
```

#### Process
1. Check FAB balance
2. Approve token spending
3. Stake tokens
4. Register node information
5. Emit registration event

---

### unregister
Unregister from the network and unstake tokens.

```bash
fabstir-host unregister [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation |
| `--keep-stake` | Don't unstake tokens |

#### Examples
```bash
# Unregister and unstake
fabstir-host unregister

# Keep stake
fabstir-host unregister --keep-stake
```

---

## Wallet Commands

### wallet address
Display wallet address.

```bash
fabstir-host wallet address [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--qr` | Display as QR code |

#### Examples
```bash
# Show address
fabstir-host wallet address

# With QR code
fabstir-host wallet address --qr
```

---

### wallet balance
Check wallet balances.

```bash
fabstir-host wallet balance [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--token <address>` | Check specific token |
| `--all` | Show all known tokens |

#### Examples
```bash
# Basic balances
fabstir-host wallet balance

# All tokens
fabstir-host wallet balance --all

# Specific token
fabstir-host wallet balance --token 0x123...
```

#### Output
```
Wallet Balances:
  ETH: 0.0234
  FAB: 5,678.90
  USDC: 100.00
  Staked FAB: 1,000.00
```

---

### wallet export
Export encrypted wallet backup.

```bash
fabstir-host wallet export [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--output <file>` | Output file path |
| `--format <type>` | Format: keystore, mnemonic |

#### Examples
```bash
# Export to file
fabstir-host wallet export --output wallet-backup.json

# Export mnemonic
fabstir-host wallet export --format mnemonic
```

---

### wallet import
Import wallet from backup or private key.

```bash
fabstir-host wallet import <source> [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--type <type>` | Import type: key, keystore, mnemonic |
| `--password` | Prompt for password |

#### Examples
```bash
# Import private key
fabstir-host wallet import 0x123...

# Import keystore
fabstir-host wallet import wallet.json --type keystore

# Import mnemonic
fabstir-host wallet import "word1 word2..." --type mnemonic
```

---

## Configuration Commands

### config list
Display all configuration values.

```bash
fabstir-host config list [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--section <name>` | Show specific section |
| `--sensitive` | Include sensitive values |

#### Examples
```bash
# Show all config
fabstir-host config list

# Show host section
fabstir-host config list --section host
```

---

### config get
Get a specific configuration value.

```bash
fabstir-host config get <key> [options]
```

#### Examples
```bash
# Get single value
fabstir-host config get host.port

# Get nested value
fabstir-host config get network.rpcUrl
```

---

### config set
Set a configuration value.

```bash
fabstir-host config set <key> <value> [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--validate` | Validate before setting |

#### Examples
```bash
# Set port
fabstir-host config set host.port 8080

# Set model list
fabstir-host config set host.models '["gpt-4","claude-3"]'

# Set with validation
fabstir-host config set network.chainId 84532 --validate
```

---

### config reset
Reset configuration to defaults.

```bash
fabstir-host config reset [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--section <name>` | Reset specific section |
| `--backup` | Create backup first |

#### Examples
```bash
# Reset all
fabstir-host config reset

# Reset with backup
fabstir-host config reset --backup

# Reset section
fabstir-host config reset --section host
```

---

## Session Commands

### session list
List active and recent sessions.

```bash
fabstir-host session list [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--active` | Show only active sessions |
| `--limit <n>` | Limit results |
| `--since <date>` | Sessions since date |

#### Examples
```bash
# List all sessions
fabstir-host session list

# Active only
fabstir-host session list --active

# Last 10
fabstir-host session list --limit 10
```

#### Output
```
Active Sessions:
ID      User          Model         Tokens    Started
12345   0x123...456   gpt-4         234/1000  5 min ago
12346   0x789...abc   claude-3      567/2000  2 min ago

Recent Completed:
12344   0x456...def   gpt-3.5       890       15 min ago
```

---

### session info
Display detailed session information.

```bash
fabstir-host session info <session-id> [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--checkpoints` | Show checkpoint history |
| `--messages` | Include message count |

#### Examples
```bash
# Basic info
fabstir-host session info 12345

# With checkpoints
fabstir-host session info 12345 --checkpoints
```

---

### session end
End a session (admin only).

```bash
fabstir-host session end <session-id> [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--reason <text>` | End reason |
| `--refund` | Process refund |

#### Examples
```bash
# End session
fabstir-host session end 12345

# With reason
fabstir-host session end 12345 --reason "Maintenance"
```

---

## Earnings Commands

### earnings balance
Check current earnings balance.

```bash
fabstir-host earnings balance [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--breakdown` | Show earnings breakdown |
| `--period <days>` | Earnings for period |

#### Examples
```bash
# Current balance
fabstir-host earnings balance

# With breakdown
fabstir-host earnings balance --breakdown

# Last 7 days
fabstir-host earnings balance --period 7
```

#### Output
```
Earnings Balance:
  Available: 1,234.56 FAB
  Pending: 45.67 FAB
  Total: 1,280.23 FAB

Breakdown:
  Sessions: 1,000.00 FAB
  Proofs: 234.56 FAB
  Bonuses: 45.67 FAB
```

---

### earnings history
View earnings history.

```bash
fabstir-host earnings history [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--limit <n>` | Number of records |
| `--export <file>` | Export to CSV |

#### Examples
```bash
# View history
fabstir-host earnings history

# Export to CSV
fabstir-host earnings history --export earnings.csv
```

---

## Withdrawal Commands

### withdraw
Withdraw available earnings.

```bash
fabstir-host withdraw [amount] [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--all` | Withdraw all available |
| `--to <address>` | Withdrawal address |
| `--gas-price <gwei>` | Gas price override |

#### Examples
```bash
# Withdraw all
fabstir-host withdraw --all

# Withdraw specific amount
fabstir-host withdraw 100

# To different address
fabstir-host withdraw 100 --to 0x123...
```

---

### withdraw history
View withdrawal history.

```bash
fabstir-host withdraw history [options]
```

#### Examples
```bash
# View history
fabstir-host withdraw history

# Last 10
fabstir-host withdraw history --limit 10
```

---

### unstake
Unstake tokens from registry.

```bash
fabstir-host unstake [amount] [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--all` | Unstake all |
| `--force` | Skip cooldown check |

#### Examples
```bash
# Unstake all
fabstir-host unstake --all

# Partial unstake
fabstir-host unstake 500
```

---

## Daemon Commands

### daemon start
Start host as background daemon.

```bash
fabstir-host daemon start [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--pid-file <path>` | PID file location |
| `--log-file <path>` | Log file location |

#### Examples
```bash
# Start daemon
fabstir-host daemon start

# Custom PID file
fabstir-host daemon start --pid-file /var/run/fabstir.pid
```

---

### daemon stop
Stop background daemon.

```bash
fabstir-host daemon stop [options]
```

#### Examples
```bash
# Stop daemon
fabstir-host daemon stop
```

---

### daemon status
Check daemon status.

```bash
fabstir-host daemon status [options]
```

#### Examples
```bash
# Check status
fabstir-host daemon status
```

---

## Utility Commands

### network test
Test network connectivity.

```bash
fabstir-host network test [options]
```

#### Examples
```bash
# Test network
fabstir-host network test
```

#### Output
```
Network Test:
  ✓ RPC connection successful
  ✓ Block number: 12345678
  ✓ Chain ID: 84532
  ✓ Contract connectivity verified
```

---

### inference test
Test LLM backend connection.

```bash
fabstir-host inference test [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--prompt <text>` | Test prompt |
| `--model <name>` | Test specific model |

#### Examples
```bash
# Basic test
fabstir-host inference test

# With prompt
fabstir-host inference test --prompt "Hello, world!"

# Test model
fabstir-host inference test --model gpt-4
```

---

### version
Display version information.

```bash
fabstir-host version [options]
```

#### Options
| Option | Description |
|--------|-------------|
| `--check-update` | Check for updates |

#### Examples
```bash
# Show version
fabstir-host version

# Check updates
fabstir-host version --check-update
```

---

### help
Display help information.

```bash
fabstir-host help [command]
```

#### Examples
```bash
# General help
fabstir-host help

# Command help
fabstir-host help register

# Short form
fabstir-host -h
```