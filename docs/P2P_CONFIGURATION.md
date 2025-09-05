# P2P Configuration Guide

This guide covers P2P configuration for the Fabstir LLM SDK's DiscoveryManager, including network setup, node discovery, and troubleshooting.

## Table of Contents

- [Overview](#overview)
- [DiscoveryManager Setup](#discoverymanager-setup)
- [Configuration Options](#configuration-options)
- [Bootstrap Nodes](#bootstrap-nodes)
- [Network Requirements](#network-requirements)
- [Discovery Mechanisms](#discovery-mechanisms)
- [Connection Management](#connection-management)
- [Advanced Configuration](#advanced-configuration)
- [Troubleshooting](#troubleshooting)

## Overview

The SDK's DiscoveryManager uses libp2p for peer-to-peer communication, enabling direct connections between compute nodes without central servers. P2P is used for:

- Finding available compute hosts
- Direct node-to-node messaging
- Real-time capability negotiation
- Decentralized node registry

## DiscoveryManager Setup

The DiscoveryManager handles all P2P operations in the SDK:

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';

// Initialize SDK and authenticate
const sdk = new FabstirSDK();
await sdk.authenticate(privateKey);

// Get DiscoveryManager
const discoveryManager = sdk.getDiscoveryManager();

// Create P2P node with configuration
const peerId = await discoveryManager.createNode({
  listen: ['/ip4/0.0.0.0/tcp/4001'],
  bootstrap: [
    '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg'
  ]
});

console.log('P2P Node started:', peerId);
```

## Configuration Options

### DiscoveryOptions Interface

```typescript
interface DiscoveryOptions {
  listen?: string[];     // Listen addresses for incoming connections
  bootstrap?: string[];  // Bootstrap node addresses for network entry
}
```

### Default Configuration

```typescript
// Default listen addresses
const DEFAULT_LISTEN = ['/ip4/127.0.0.1/tcp/0'];

// Connection limits
const MIN_CONNECTIONS = 0;
const MAX_CONNECTIONS = 10;

// Protocol prefix
const PROTOCOL_PREFIX = '/fabstir-llm/1.0.0';
```

### Complete Configuration Example

```typescript
const discoveryManager = sdk.getDiscoveryManager();

const peerId = await discoveryManager.createNode({
  // Listen on multiple addresses
  listen: [
    '/ip4/0.0.0.0/tcp/4001',        // TCP on all interfaces
    '/ip4/127.0.0.1/tcp/4002',      // TCP on localhost
    '/ip4/0.0.0.0/tcp/4003/ws'      // WebSocket
  ],
  
  // Connect to bootstrap nodes
  bootstrap: [
    // Production bootstrap nodes
    '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg',
    '/ip4/35.185.215.242/tcp/4001/p2p/12D3KooWQH5gJ9YjDfRpLnBKY7vtkbPQkxQ5XbVJHmENw5YjLs2V',
    
    // Backup bootstrap nodes
    '/ip4/104.199.116.132/tcp/4001/p2p/12D3KooWSoLzkmBQFXBJmkR7Fh2UpwVcZkr1kNx6SH8Y9VqKdEeU'
  ]
});
```

## Bootstrap Nodes

Bootstrap nodes are essential for joining the P2P network. They provide:

- Initial peer discovery
- Network topology information
- DHT routing data

### Production Bootstrap Nodes

```typescript
const PRODUCTION_BOOTSTRAP_NODES = [
  // Primary nodes (US West)
  '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg',
  '/ip4/35.185.215.242/tcp/4001/p2p/12D3KooWQH5gJ9YjDfRpLnBKY7vtkbPQkxQ5XbVJHmENw5YjLs2V',
  
  // Secondary nodes (US East)
  '/ip4/104.199.116.132/tcp/4001/p2p/12D3KooWSoLzkmBQFXBJmkR7Fh2UpwVcZkr1kNx6SH8Y9VqKdEeU',
  '/ip4/35.237.93.141/tcp/4001/p2p/12D3KooWQQjPvN8JVDiSZPGPELSqPvPRqBYzPrFNJHqFBFgRxDTu'
];
```

### Development Bootstrap Nodes

For local development and testing:

```typescript
const DEV_BOOTSTRAP_NODES = [
  // Local node
  '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWLocalPeerIdHere',
  
  // Docker network
  '/ip4/172.17.0.2/tcp/4001/p2p/12D3KooWDockerPeerIdHere'
];
```

### Running Your Own Bootstrap Node

```bash
# Install libp2p CLI
npm install -g libp2p

# Start bootstrap node
libp2p daemon \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --announce /ip4/YOUR_PUBLIC_IP/tcp/4001
```

## Network Requirements

### Port Requirements

| Port | Protocol | Purpose | Direction |
|------|----------|---------|-----------|
| 4001 | TCP | P2P communication | Inbound/Outbound |
| 4002 | TCP | Alternative P2P | Inbound/Outbound |
| 4003 | WebSocket | Browser connections | Inbound |
| 9090 | WebSocket | WebRTC signaling | Inbound |

### Firewall Configuration

```bash
# Allow P2P ports (Linux/iptables)
sudo iptables -A INPUT -p tcp --dport 4001 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 4002 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 4003 -j ACCEPT

# Allow P2P ports (macOS)
sudo pfctl -e
echo "pass in proto tcp from any to any port 4001" | sudo pfctl -f -
```

### NAT Traversal

The SDK automatically handles NAT traversal using:

- **UPnP**: Automatic port forwarding
- **NAT-PMP**: Apple router support
- **STUN**: WebRTC for browsers
- **Relay**: Fallback through bootstrap nodes

## Discovery Mechanisms

### 1. DHT (Distributed Hash Table)

Used for global peer discovery:

```typescript
// DHT is enabled by default in libp2p
// Peers are discovered via content routing
const hostAddress = await discoveryManager.findHost({
  minReputation: 100,
  requiredModels: ['llama-3.2-1b-instruct']
});
```

### 2. mDNS (Local Network Discovery)

Discovers peers on the same network:

```typescript
// mDNS is enabled by default
// Automatically discovers local peers
// Useful for development and private networks
```

### 3. Direct Peer Connection

Connect to a known peer:

```typescript
await discoveryManager.connectToPeer(
  '/ip4/192.168.1.100/tcp/4001/p2p/12D3KooWPeerIdHere'
);
```

## Connection Management

### Get Connected Peers

```typescript
const peers = discoveryManager.getConnectedPeers();
console.log('Connected to', peers.length, 'peers');
peers.forEach(peerId => {
  console.log(' -', peerId);
});
```

### Send Messages

```typescript
// Register message handler
discoveryManager.onMessage((message) => {
  console.log('Received:', message);
});

// Send message to peer
await discoveryManager.sendMessage(peerId, {
  type: 'job_request',
  data: { model: 'llama-3.2-1b-instruct', prompt: 'Hello' }
});
```

### Connection Lifecycle

```typescript
// Check if node is running
if (discoveryManager.isRunning()) {
  console.log('P2P node is active');
}

// Stop P2P node
await discoveryManager.stop();
console.log('P2P node stopped');
```

## Advanced Configuration

### Custom libp2p Configuration

For advanced users who need fine-grained control:

```typescript
// Internal libp2p configuration (simplified)
const libp2pConfig = {
  addresses: {
    listen: options.listen || DEFAULT_LISTEN
  },
  connectionManager: {
    minConnections: MIN_CONNECTIONS,
    maxConnections: MAX_CONNECTIONS
  },
  streamMuxers: [yamux()],
  connectionEncryption: [noise()],
  transports: [tcp(), webSockets()],
  peerDiscovery: [
    bootstrap({ list: options.bootstrap || [] }),
    mdns()
  ],
  services: {
    dht: kadDHT(),
    identify: identify()
  }
};
```

### Protocol Handlers

The DiscoveryManager uses custom protocols:

```typescript
// Protocol for job negotiation
const JOB_PROTOCOL = '/fabstir-llm/job/1.0.0';

// Protocol for status updates  
const STATUS_PROTOCOL = '/fabstir-llm/status/1.0.0';

// Protocol for model discovery
const DISCOVERY_PROTOCOL = '/fabstir-llm/discovery/1.0.0';
```

### Peer Filtering

Filter peers based on capabilities:

```typescript
const hostCriteria = {
  minReputation: 100,
  maxLatency: 500, // milliseconds
  requiredModels: ['llama-3.2-1b-instruct', 'gpt-4'],
  minUptime: 3600, // seconds
  location: 'US' // optional geo-filtering
};

const suitableHost = await discoveryManager.findHost(hostCriteria);
```

## Troubleshooting

### Common Issues and Solutions

#### "Failed to start P2P node"

**Causes**:
- Port already in use
- Firewall blocking
- Invalid multiaddress format

**Solutions**:
```bash
# Check if port is in use
lsof -i :4001

# Kill process using port
kill -9 $(lsof -t -i:4001)

# Use different port
listen: ['/ip4/0.0.0.0/tcp/4002']
```

#### "Cannot connect to bootstrap nodes"

**Causes**:
- Network connectivity issues
- Bootstrap nodes offline
- Firewall/proxy blocking

**Solutions**:
```typescript
// Test connectivity
const testConnection = async () => {
  try {
    await discoveryManager.connectToPeer(bootstrapAddress);
    console.log('✅ Connected to bootstrap');
  } catch (error) {
    console.error('❌ Bootstrap connection failed:', error);
  }
};

// Use alternative bootstrap nodes
const alternativeBootstrap = [
  '/ip4/YOUR_BACKUP_NODE/tcp/4001/p2p/...'
];
```

#### "No peers discovered"

**Causes**:
- DHT not synchronized
- No peers with matching criteria
- Network partition

**Solutions**:
```typescript
// Wait for DHT to populate
await new Promise(resolve => setTimeout(resolve, 5000));

// Relax discovery criteria
const criteria = {
  minReputation: 50, // Lower threshold
  requiredModels: [] // Any model
};
```

#### "Message delivery failed"

**Causes**:
- Peer disconnected
- Protocol mismatch
- Message too large

**Solutions**:
```typescript
// Check peer connection before sending
const peers = discoveryManager.getConnectedPeers();
if (peers.includes(targetPeerId)) {
  await discoveryManager.sendMessage(targetPeerId, message);
}

// Implement retry logic
const sendWithRetry = async (peerId, message, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      await discoveryManager.sendMessage(peerId, message);
      return;
    } catch (error) {
      console.log(`Retry ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('Message delivery failed after retries');
};
```

### Debug Logging

Enable detailed P2P logging:

```typescript
// Set environment variable
process.env.DEBUG = 'libp2p:*';

// Or configure in code
import debug from 'debug';
debug.enable('libp2p:*');
```

### Network Diagnostics

```typescript
async function diagnostics() {
  const discoveryManager = sdk.getDiscoveryManager();
  
  console.log('P2P Diagnostics');
  console.log('===============');
  
  // Node status
  console.log('Running:', discoveryManager.isRunning());
  
  // Peer connections
  const peers = discoveryManager.getConnectedPeers();
  console.log('Connected peers:', peers.length);
  
  // Test bootstrap connectivity
  for (const bootstrap of PRODUCTION_BOOTSTRAP_NODES) {
    try {
      await discoveryManager.connectToPeer(bootstrap);
      console.log('✅', bootstrap.split('/').pop());
    } catch (error) {
      console.log('❌', bootstrap.split('/').pop());
    }
  }
}
```

## Best Practices

1. **Use Multiple Bootstrap Nodes**: Ensures network connectivity even if some nodes fail
2. **Implement Connection Monitoring**: Track peer connections and reconnect as needed
3. **Handle Network Changes**: Detect and adapt to network interface changes
4. **Rate Limit Discovery**: Avoid overwhelming the network with discovery requests
5. **Cache Peer Information**: Store successful peer connections for faster reconnection
6. **Use Appropriate Timeouts**: Set reasonable timeouts for connection attempts
7. **Implement Graceful Shutdown**: Properly close connections when stopping

## Environment Variables

```bash
# P2P Configuration
P2P_LISTEN_ADDRESSES=["/ip4/0.0.0.0/tcp/4001"]
P2P_BOOTSTRAP_NODES=["/ip4/34.70.224.193/tcp/4001/p2p/..."]
P2P_ENABLE_DHT=true
P2P_ENABLE_MDNS=true
P2P_MAX_CONNECTIONS=10
P2P_CONNECTION_TIMEOUT=30000
```

## See Also

- [DiscoveryManager API](SDK_API.md#discoverymanager)
- [Integration Testing](INTEGRATED_TESTING.md)
- [Architecture Overview](ARCHITECTURE.md)
- [libp2p Documentation](https://docs.libp2p.io/)

---

*Last updated: January 2025 - DiscoveryManager with libp2p v2.x*