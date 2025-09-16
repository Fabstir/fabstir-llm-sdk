# Configuration Reference

## Table of Contents
- [Configuration File Location](#configuration-file-location)
- [Configuration Schema](#configuration-schema)
- [Wallet Configuration](#wallet-configuration)
- [Network Configuration](#network-configuration)
- [Host Configuration](#host-configuration)
- [Inference Configuration](#inference-configuration)
- [Contract Addresses](#contract-addresses)
- [Advanced Settings](#advanced-settings)
- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)

## Configuration File Location

The configuration file is stored at:
- **Linux/macOS**: `~/.fabstir/config.json`
- **Windows**: `%USERPROFILE%\.fabstir\config.json`
- **Custom**: Set `FABSTIR_CONFIG_PATH` environment variable

## Configuration Schema

```typescript
interface Config {
  wallet: WalletConfig;
  network: NetworkConfig;
  host: HostConfig;
  inference: InferenceConfig;
  contracts: ContractConfig;
  logging: LoggingConfig;
  resilience: ResilienceConfig;
}
```

## Wallet Configuration

### wallet
Configuration for wallet and key management.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `wallet.address` | string | - | Ethereum wallet address |
| `wallet.encryptedKey` | string | - | Encrypted private key (stored securely) |
| `wallet.keystore` | string | keytar | Key storage method: keytar, file, env |

#### Example
```json
{
  "wallet": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
    "keystore": "keytar"
  }
}
```

#### Commands
```bash
# View wallet address
fabstir-host config get wallet.address

# Change keystore method
fabstir-host config set wallet.keystore file
```

## Network Configuration

### network
Blockchain network settings.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `network.name` | string | base-sepolia | Network name: base-sepolia, base-mainnet, custom |
| `network.chainId` | number | 84532 | Chain ID (84532 for Base Sepolia, 8453 for Base Mainnet) |
| `network.rpcUrl` | string | - | JSON-RPC endpoint URL |
| `network.explorerUrl` | string | - | Block explorer URL |
| `network.gasPrice` | string | auto | Gas price strategy: auto, fixed, aggressive |
| `network.maxGasPrice` | string | 100 | Maximum gas price in Gwei |

#### Example
```json
{
  "network": {
    "name": "base-sepolia",
    "chainId": 84532,
    "rpcUrl": "https://sepolia.base.org",
    "explorerUrl": "https://sepolia.basescan.org",
    "gasPrice": "auto",
    "maxGasPrice": "100"
  }
}
```

#### Commands
```bash
# Switch to mainnet
fabstir-host config set network.name base-mainnet
fabstir-host config set network.chainId 8453

# Set custom RPC
fabstir-host config set network.rpcUrl https://base-mainnet.publicnode.com
```

## Host Configuration

### host
Host node settings and capabilities.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `host.port` | number | 8080 | WebSocket server port |
| `host.publicUrl` | string | - | Public URL for node access |
| `host.models` | string[] | [] | Supported model IDs |
| `host.pricePerToken` | string | 0.0001 | Price per token in FAB |
| `host.minJobDeposit` | string | 0.001 | Minimum deposit for jobs |
| `host.maxConcurrent` | number | 5 | Maximum concurrent sessions |
| `host.checkpointInterval` | number | 100 | Tokens between checkpoints |

#### Example
```json
{
  "host": {
    "port": 8080,
    "publicUrl": "https://my-host.example.com",
    "models": ["gpt-3.5-turbo", "gpt-4", "llama-2-70b"],
    "pricePerToken": "0.0001",
    "minJobDeposit": "0.001",
    "maxConcurrent": 5,
    "checkpointInterval": 100
  }
}
```

#### Commands
```bash
# Update pricing
fabstir-host config set host.pricePerToken 0.0002

# Add model support
fabstir-host config add host.models claude-3

# Set public URL
fabstir-host config set host.publicUrl https://my-node.com:8080
```

## Inference Configuration

### inference
LLM backend settings.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `inference.endpoint` | string | - | LLM API endpoint URL |
| `inference.type` | string | ollama | Backend type: ollama, vllm, openai, custom |
| `inference.apiKey` | string | - | API key (if required) |
| `inference.timeout` | number | 30000 | Request timeout in ms |
| `inference.maxRetries` | number | 3 | Maximum retry attempts |
| `inference.temperature` | number | 0.7 | Default temperature |
| `inference.maxTokens` | number | 2048 | Default max tokens |

#### Example
```json
{
  "inference": {
    "endpoint": "http://localhost:11434",
    "type": "ollama",
    "timeout": 30000,
    "maxRetries": 3,
    "temperature": 0.7,
    "maxTokens": 2048
  }
}
```

#### Backend-Specific Configuration

##### Ollama
```json
{
  "inference": {
    "endpoint": "http://localhost:11434",
    "type": "ollama"
  }
}
```

##### vLLM
```json
{
  "inference": {
    "endpoint": "http://localhost:8000",
    "type": "vllm",
    "maxConcurrent": 10
  }
}
```

##### OpenAI
```json
{
  "inference": {
    "endpoint": "https://api.openai.com/v1",
    "type": "openai",
    "apiKey": "sk-..."
  }
}
```

## Contract Addresses

### contracts
Smart contract addresses.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `contracts.jobMarketplace` | string | - | JobMarketplace contract |
| `contracts.nodeRegistry` | string | - | NodeRegistry contract |
| `contracts.proofSystem` | string | - | ProofSystem contract |
| `contracts.hostEarnings` | string | - | HostEarnings contract |
| `contracts.fabToken` | string | - | FAB token contract |
| `contracts.usdcToken` | string | - | USDC token contract |

#### Example (Base Sepolia)
```json
{
  "contracts": {
    "jobMarketplace": "0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0",
    "nodeRegistry": "0x039AB5d5e8D5426f9963140202F506A2Ce6988F9",
    "proofSystem": "0x2ACcc60893872A499700908889B38C5420CBcFD1",
    "hostEarnings": "0x908962e8c6CE72610021586f85ebDE09aAc97776",
    "fabToken": "0xC78949004B4EB6dEf2D66e49Cd81231472612D62",
    "usdcToken": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  }
}
```

## Advanced Settings

### logging
Logging configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `logging.level` | string | info | Log level: debug, info, warn, error |
| `logging.file` | string | ~/.fabstir/logs/host.log | Log file path |
| `logging.maxSize` | string | 10M | Maximum log file size |
| `logging.maxFiles` | number | 5 | Number of log files to keep |
| `logging.console` | boolean | true | Enable console output |

#### Example
```json
{
  "logging": {
    "level": "info",
    "file": "~/.fabstir/logs/host.log",
    "maxSize": "10M",
    "maxFiles": 5,
    "console": true
  }
}
```

### resilience
Circuit breaker and retry settings.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `resilience.circuitBreaker.enabled` | boolean | true | Enable circuit breaker |
| `resilience.circuitBreaker.failureThreshold` | number | 3 | Failures before opening |
| `resilience.circuitBreaker.resetTimeout` | number | 5000 | Reset timeout in ms |
| `resilience.retry.maxAttempts` | number | 3 | Maximum retry attempts |
| `resilience.retry.baseDelay` | number | 1000 | Base retry delay in ms |
| `resilience.retry.maxDelay` | number | 10000 | Maximum retry delay |

#### Example
```json
{
  "resilience": {
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3,
      "resetTimeout": 5000
    },
    "retry": {
      "maxAttempts": 3,
      "baseDelay": 1000,
      "maxDelay": 10000
    }
  }
}
```

## Environment Variables

All configuration options can be overridden using environment variables:

| Variable | Config Path | Description |
|----------|------------|-------------|
| `FABSTIR_PRIVATE_KEY` | wallet.privateKey | Private key (not stored) |
| `FABSTIR_WALLET_ADDRESS` | wallet.address | Wallet address |
| `FABSTIR_RPC_URL` | network.rpcUrl | RPC endpoint |
| `FABSTIR_CHAIN_ID` | network.chainId | Chain ID |
| `FABSTIR_HOST_PORT` | host.port | Host port |
| `FABSTIR_PUBLIC_URL` | host.publicUrl | Public URL |
| `FABSTIR_MODELS` | host.models | Comma-separated models |
| `FABSTIR_PRICE_PER_TOKEN` | host.pricePerToken | Token price |
| `FABSTIR_INFERENCE_ENDPOINT` | inference.endpoint | LLM endpoint |
| `FABSTIR_INFERENCE_TYPE` | inference.type | Backend type |
| `FABSTIR_LOG_LEVEL` | logging.level | Log level |

### Using Environment Variables

```bash
# Create .env file
cat > .env << EOF
FABSTIR_PRIVATE_KEY=0x123...
FABSTIR_RPC_URL=https://sepolia.base.org
FABSTIR_HOST_PORT=8080
FABSTIR_INFERENCE_ENDPOINT=http://localhost:11434
EOF

# Load and run
source .env
fabstir-host start
```

## Configuration Examples

### Minimal Configuration (Testnet)
```json
{
  "wallet": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"
  },
  "network": {
    "name": "base-sepolia",
    "rpcUrl": "https://sepolia.base.org"
  },
  "host": {
    "port": 8080,
    "models": ["gpt-3.5-turbo"],
    "pricePerToken": "0.0001"
  },
  "inference": {
    "endpoint": "http://localhost:11434",
    "type": "ollama"
  }
}
```

### Production Configuration (Mainnet)
```json
{
  "wallet": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
    "keystore": "keytar"
  },
  "network": {
    "name": "base-mainnet",
    "chainId": 8453,
    "rpcUrl": "https://base-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "gasPrice": "aggressive",
    "maxGasPrice": "50"
  },
  "host": {
    "port": 443,
    "publicUrl": "https://my-host.example.com",
    "models": ["gpt-3.5-turbo", "gpt-4", "claude-3"],
    "pricePerToken": "0.00015",
    "minJobDeposit": "0.01",
    "maxConcurrent": 10,
    "checkpointInterval": 50
  },
  "inference": {
    "endpoint": "http://localhost:8000",
    "type": "vllm",
    "timeout": 60000,
    "maxRetries": 5
  },
  "logging": {
    "level": "warn",
    "maxFiles": 10
  },
  "resilience": {
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 5
    }
  }
}
```

### High-Performance Configuration
```json
{
  "host": {
    "maxConcurrent": 20,
    "checkpointInterval": 200
  },
  "inference": {
    "type": "vllm",
    "timeout": 120000,
    "maxConcurrent": 50
  },
  "resilience": {
    "circuitBreaker": {
      "failureThreshold": 10,
      "resetTimeout": 10000
    },
    "retry": {
      "maxAttempts": 5,
      "baseDelay": 500
    }
  }
}
```

## Configuration Management Commands

```bash
# View all configuration
fabstir-host config list

# Get specific value
fabstir-host config get host.port

# Set value
fabstir-host config set host.port 8080

# Add to array
fabstir-host config add host.models gpt-4

# Remove from array
fabstir-host config remove host.models gpt-3.5-turbo

# Reset to defaults
fabstir-host config reset

# Backup configuration
fabstir-host config backup

# Restore configuration
fabstir-host config restore backup-2024-01-15.json

# Validate configuration
fabstir-host config validate
```

## Configuration Validation

The CLI validates configuration on:
- Startup
- After changes
- Before registration

Validation checks:
- Required fields present
- Valid Ethereum addresses
- Valid URLs and ports
- Supported model IDs
- Contract addresses on correct network
- Sufficient balances