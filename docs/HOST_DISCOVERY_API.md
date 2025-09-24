# Host Discovery API Documentation

## Overview

The Host Discovery system enables automatic discovery of LLM host nodes from the blockchain without hardcoding API URLs. This provides a decentralized, dynamic way to find and connect to available compute providers.

## Core Components

### HostDiscoveryService

The `HostDiscoveryService` class provides methods to discover and interact with registered host nodes through the blockchain.

```typescript
import { HostDiscoveryService } from '@fabstir/sdk-core';
```

### HostManager

The `HostManager` extends host discovery with management capabilities including registration, updates, and health checks.

```typescript
import { HostManager } from '@fabstir/sdk-core';
```

## API Reference

### HostDiscoveryService

#### Constructor

```typescript
constructor(signer: ethers.Signer, config?: SDKConfig)
```

Creates a new HostDiscoveryService instance.

**Parameters:**
- `signer`: Ethereum signer for blockchain interactions
- `config`: Optional SDK configuration

#### Methods

##### discoverAllActiveHosts()

Discovers all active host nodes registered on the blockchain.

```typescript
async discoverAllActiveHosts(): Promise<HostInfo[]>
```

**Returns:** Array of HostInfo objects containing:
- `address`: Ethereum address of the host
- `apiUrl`: HTTP/WebSocket API endpoint
- `isActive`: Whether the host is currently active
- `stakedAmount`: Amount of FAB tokens staked
- `metadata`: Host capabilities and models

**Example:**
```typescript
const hosts = await discoveryService.discoverAllActiveHosts();
console.log(`Found ${hosts.length} active hosts`);

for (const host of hosts) {
  console.log(`Host: ${host.address}`);
  console.log(`API URL: ${host.apiUrl}`);
  console.log(`Models: ${host.metadata}`);
}
```

##### discoverHost(address)

Discovers a specific host by its Ethereum address.

```typescript
async discoverHost(address: string): Promise<string>
```

**Parameters:**
- `address`: Ethereum address of the host

**Returns:** API URL of the host

**Example:**
```typescript
const apiUrl = await discoveryService.discoverHost('0x4594f755...');
console.log(`Host API URL: ${apiUrl}`);
```

### HostManager

#### Methods

##### initialize()

Initializes the HostManager with blockchain contracts.

```typescript
async initialize(): Promise<void>
```

##### registerNodeWithUrl(metadata, stakeAmount, apiUrl)

Registers a new node with its API URL.

```typescript
async registerNodeWithUrl(
  metadata: string,
  stakeAmount: string,
  apiUrl: string
): Promise<string>
```

**Parameters:**
- `metadata`: Comma-separated list of capabilities (e.g., "llama-2-7b,inference")
- `stakeAmount`: Amount of FAB tokens to stake
- `apiUrl`: HTTP/WebSocket API endpoint (e.g., "http://localhost:8080")

**Returns:** Transaction hash

**Example:**
```typescript
const txHash = await hostManager.registerNodeWithUrl(
  'tiny-vicuna-1b,llama-2-7b,inference',
  '1000', // 1000 FAB tokens
  'http://localhost:8080'
);
```

##### updateApiUrl(apiUrl)

Updates the API URL for an already registered node.

```typescript
async updateApiUrl(apiUrl: string): Promise<string>
```

**Parameters:**
- `apiUrl`: New API URL for the node

**Returns:** Transaction hash

**Example:**
```typescript
// Must be called by the registered node owner
const txHash = await hostManager.updateApiUrl('http://localhost:8083');
```

##### getNodeApiUrl(address)

Gets the API URL for a specific node.

```typescript
async getNodeApiUrl(address: string): Promise<string>
```

**Parameters:**
- `address`: Ethereum address of the node

**Returns:** API URL or empty string if not set

##### checkNodeHealth(apiUrl)

Checks the health status of a node.

```typescript
async checkNodeHealth(apiUrl: string): Promise<{
  healthy: boolean;
  latency?: number;
  status?: any;
}>
```

**Parameters:**
- `apiUrl`: API URL of the node

**Returns:** Health status object

**Example:**
```typescript
const health = await hostManager.checkNodeHealth('http://localhost:8080');
if (health.healthy) {
  console.log(`Node is healthy, latency: ${health.latency}ms`);
}
```

## Usage Examples

### Complete Discovery Flow

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';

// Initialize SDK
const sdk = new FabstirSDKCore({
  network: 'base-sepolia',
  rpcUrl: process.env.RPC_URL
});

// Authenticate with wallet
await sdk.authenticate(privateKey);

// Get the host manager
const hostManager = sdk.getHostManager();

// Discover all active hosts
const hosts = await hostManager.discoverAllActiveHosts();

// Find hosts with specific capabilities
const llama2Hosts = hosts.filter(h => 
  h.metadata.includes('llama-2-7b')
);

// Check health of discovered hosts
for (const host of llama2Hosts) {
  const health = await hostManager.checkNodeHealth(host.apiUrl);
  if (health.healthy) {
    console.log(`Host ${host.address} is available`);
    // Connect to this host for inference
    break;
  }
}
```

### Registering a New Host

```typescript
// For host providers
const hostManager = sdk.getHostManager();

// Check if already registered
const info = await hostManager.getHostInfo(walletAddress);

if (!info.isRegistered) {
  // Register with API URL
  await hostManager.registerNodeWithUrl(
    'gpt-4,claude-3,inference,gpu',
    '5000', // Stake 5000 FAB
    'https://my-node.example.com'
  );
} else {
  // Update existing registration
  await hostManager.updateApiUrl('https://my-node-v2.example.com');
}
```

### Dynamic Host Selection

```typescript
// Discover and select best host based on criteria
async function selectBestHost(sdk, requirements) {
  const hostManager = sdk.getHostManager();
  const hosts = await hostManager.discoverAllActiveHosts();
  
  // Filter by requirements
  const eligibleHosts = hosts.filter(h => {
    return h.isActive && 
           h.metadata.includes(requirements.model) &&
           h.stakedAmount >= requirements.minStake;
  });
  
  // Check health and latency
  const healthChecks = await Promise.all(
    eligibleHosts.map(async h => ({
      host: h,
      health: await hostManager.checkNodeHealth(h.apiUrl)
    }))
  );
  
  // Select host with lowest latency
  const bestHost = healthChecks
    .filter(h => h.health.healthy)
    .sort((a, b) => a.health.latency - b.health.latency)[0];
    
  return bestHost?.host;
}

const bestHost = await selectBestHost(sdk, {
  model: 'llama-2-7b',
  minStake: '1000'
});
```

## Contract Integration

The Host Discovery system interacts with the following smart contracts:

### NodeRegistry Contract

- **Address**: `0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218` (Base Sepolia)
- **Key Functions**:
  - `registerNodeWithUrl(metadata, apiUrl)`: Register node with API URL
  - `updateApiUrl(apiUrl)`: Update node's API URL
  - `getNodeApiUrl(address)`: Get API URL for a node
  - `getAllActiveNodes()`: Get all active node addresses
  - `getNodeInfo(address)`: Get complete node information

## Best Practices

1. **Cache Discovery Results**: Cache discovered hosts for a reasonable TTL (e.g., 5 minutes) to reduce blockchain queries
2. **Health Check Before Use**: Always check node health before establishing connections
3. **Implement Failover**: Have fallback logic when preferred hosts are unavailable
4. **Validate URLs**: Ensure API URLs are properly formatted and accessible
5. **Monitor Gas Costs**: Registration and updates require gas fees

## Error Handling

Common errors and solutions:

```typescript
try {
  const hosts = await hostManager.discoverAllActiveHosts();
} catch (error) {
  if (error.code === 'HOST_NOT_INITIALIZED') {
    // Host manager not initialized
    await hostManager.initialize();
  } else if (error.code === 'CONTRACT_ERROR') {
    // Blockchain interaction failed
    console.error('Failed to query blockchain:', error);
  } else if (error.code === 'NETWORK_ERROR') {
    // Network connectivity issue
    console.error('Network error:', error);
  }
}
```

## Security Considerations

1. **API URL Validation**: Always validate discovered URLs before connecting
2. **HTTPS Preferred**: Use HTTPS for production API endpoints
3. **Rate Limiting**: Implement rate limiting for discovery queries
4. **Signature Verification**: Verify host signatures when applicable
5. **Stake Verification**: Check stake amounts as a trust indicator

## Migration Guide

### From Hardcoded URLs

Before:
```typescript
// Old approach with hardcoded URLs
const wsClient = new WebSocketClient('ws://localhost:8080/v1/ws');
```

After:
```typescript
// New approach with discovery
const hostManager = sdk.getHostManager();
const hosts = await hostManager.discoverAllActiveHosts();
const selectedHost = hosts[0];
const wsClient = new WebSocketClient(`${selectedHost.apiUrl}/v1/ws`);
```

## Related Documentation

- [WebSocket Protocol Guide](./WEBSOCKET_PROTOCOL_GUIDE.md)
- [Session Manager Documentation](./SESSION_MANAGER_API.md)
- [SDK Core Documentation](./SDK_API.md)