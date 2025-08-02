# P2P Configuration Guide

This guide covers the complete P2P configuration options for the Fabstir LLM SDK, including network setup, discovery mechanisms, and troubleshooting.

## Table of Contents

- [Overview](#overview)
- [Configuration Options](#configuration-options)
- [Bootstrap Nodes](#bootstrap-nodes)
- [Network Requirements](#network-requirements)
- [Discovery Configuration](#discovery-configuration)
- [Connection Settings](#connection-settings)
- [Advanced Configuration](#advanced-configuration)
- [Troubleshooting](#troubleshooting)

## Overview

The Fabstir SDK uses libp2p for peer-to-peer communication, enabling direct connections between nodes without central servers. Proper P2P configuration is essential for:

- Node discovery and connectivity
- Network performance and reliability
- Security and access control
- Optimal routing and latency

## Configuration Options

### Basic P2P Configuration

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    // Required: Bootstrap nodes for initial network connection
    bootstrapNodes: [
      "/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg",
      "/ip4/35.185.215.242/tcp/4001/p2p/12D3KooWQH5gJ9YjDfRpLnBKY7vtkbPQkxQ5XbVJHmENw5YjLs2V"
    ],
    
    // Optional: Enable DHT for distributed discovery
    enableDHT: true, // Default: true
    
    // Optional: Enable mDNS for local network discovery
    enableMDNS: true, // Default: true
    
    // Optional: Custom listen addresses
    listenAddresses: [
      "/ip4/0.0.0.0/tcp/4002",
      "/ip4/0.0.0.0/tcp/4003/ws"
    ],
    
    // Optional: Connection timeouts
    dialTimeout: 30000, // Default: 30 seconds
    requestTimeout: 60000, // Default: 60 seconds
    
    // Optional: Retry configuration
    maxRetries: 3, // Default: 3
    retryDelay: 1000, // Default: 1 second
  }
});
```

### Complete Configuration Interface

```typescript
interface P2PConfig {
  bootstrapNodes: string[];        // Required, must have at least one
  enableDHT?: boolean;            // Optional, defaults to true
  enableMDNS?: boolean;           // Optional, defaults to true  
  listenAddresses?: string[];     // Optional, for specifying listen addresses
  dialTimeout?: number;           // Optional, defaults to 30000 (30s)
  requestTimeout?: number;        // Optional, defaults to 60000 (60s)
  maxRetries?: number;            // Optional, defaults to 3
  retryDelay?: number;            // Optional, defaults to 1000 (1s)
}
```

## Bootstrap Nodes

Bootstrap nodes are essential for joining the P2P network. They serve as initial connection points.

### Format

Bootstrap node addresses follow the multiaddr format:
```
/ip4/<IP_ADDRESS>/tcp/<PORT>/p2p/<PEER_ID>
```

Example:
```
/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg
```

### Setting Up Your Own Bootstrap Node

1. **Install the Fabstir node software:**
   ```bash
   npm install -g @fabstir/node
   ```

2. **Generate a node identity:**
   ```bash
   fabstir-node init
   ```

3. **Configure the node:**
   ```yaml
   # config.yaml
   listen:
     - /ip4/0.0.0.0/tcp/4001
     - /ip4/0.0.0.0/tcp/4002/ws
   
   bootstrap: true
   dht: true
   mdns: false  # Disable for public nodes
   ```

4. **Start the bootstrap node:**
   ```bash
   fabstir-node start --config config.yaml
   ```

5. **Get your node's multiaddr:**
   ```bash
   fabstir-node info
   ```

### Choosing Bootstrap Nodes

- Use at least 2-3 bootstrap nodes for redundancy
- Select geographically distributed nodes for better performance
- Consider network latency when choosing nodes
- For private networks, run your own bootstrap nodes

## Network Requirements

### Ports

The SDK requires the following ports:

| Port | Protocol | Purpose | Direction |
|------|----------|---------|-----------|
| 4001 | TCP | P2P communication | Inbound/Outbound |
| 4002 | TCP | WebSocket connections | Inbound/Outbound |
| 4003 | UDP | mDNS discovery | Outbound |

### Firewall Configuration

Allow the following:

```bash
# TCP ports for P2P
sudo ufw allow 4001/tcp
sudo ufw allow 4002/tcp

# UDP for mDNS (optional)
sudo ufw allow 5353/udp
```

### NAT Traversal

The SDK supports automatic NAT traversal using:
- STUN for address discovery
- Circuit relay for restrictive NATs
- Direct connection upgrade when possible

No manual configuration needed in most cases.

## Discovery Configuration

### DHT (Distributed Hash Table)

The DHT enables decentralized peer discovery:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    enableDHT: true,
    
    // Advanced DHT options
    dhtOptions: {
      clientMode: false,      // Run as full DHT node
      kBucketSize: 20,       // Routing table bucket size
      refreshInterval: 900000 // 15 minutes
    }
  }
});
```

### mDNS (Multicast DNS)

For local network discovery:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    enableMDNS: true,
    
    // mDNS options
    mdnsOptions: {
      interval: 10000,     // Discovery interval
      serviceTag: "fabstir" // Service identifier
    }
  }
});
```

### Custom Discovery

Implement custom discovery mechanisms:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    
    // Custom peer discovery
    peerDiscovery: [
      {
        tag: "custom-discovery",
        enabled: true,
        options: {
          endpoint: "https://peers.fabstir.com/api/v1/peers",
          interval: 30000
        }
      }
    ]
  }
});
```

## Connection Settings

### Connection Limits

Control the number of connections:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    
    connectionManager: {
      maxConnections: 100,      // Maximum total connections
      minConnections: 10,       // Minimum to maintain
      maxData: 1000000000,      // 1GB data limit
      maxSentData: 500000000,   // 500MB upload limit
      maxReceivedData: 500000000, // 500MB download limit
      maxEventLoopDelay: 150,   // 150ms max delay
      pollInterval: 2000        // Check every 2s
    }
  }
});
```

### Transport Configuration

Configure specific transports:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    
    transports: {
      tcp: {
        enabled: true,
        maxConnections: 50
      },
      websocket: {
        enabled: true,
        maxConnections: 30
      },
      webrtc: {
        enabled: false  // Disable WebRTC
      }
    }
  }
});
```

## Advanced Configuration

### Custom Protocols

Register custom protocols:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    
    protocols: [
      {
        id: "/fabstir/custom/1.0.0",
        handler: async (stream) => {
          // Custom protocol handler
        }
      }
    ]
  }
});
```

### Metrics and Monitoring

Enable P2P metrics:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    
    metrics: {
      enabled: true,
      computeThrottleMaxQueueSize: 1000,
      computeThrottleTimeout: 2000,
      movingAverageInterval: 60000,
      maxOldPeersRetention: 50
    }
  }
});

// Access metrics
const metrics = await sdk.getP2PMetrics();
console.log("Connected peers:", metrics.peers);
console.log("Protocol stats:", metrics.protocols);
```

### Security Configuration

Configure P2P security:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    
    security: {
      // Peer ID allowlist
      allowlist: [
        "12D3KooWTrustedPeer1...",
        "12D3KooWTrustedPeer2..."
      ],
      
      // Peer ID blocklist
      blocklist: [
        "12D3KooWBadPeer1..."
      ],
      
      // Enable connection encryption
      enableEncryption: true,
      
      // Custom authentication
      authenticate: async (peerId, connection) => {
        // Return true to allow, false to reject
        return true;
      }
    }
  }
});
```

## Troubleshooting

### Common Issues

#### 1. Cannot Connect to Bootstrap Nodes

**Symptoms:**
- "Failed to connect to any bootstrap node" error
- Timeout errors during connection

**Solutions:**
```typescript
// Increase timeouts
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    dialTimeout: 60000,  // Increase to 60s
    requestTimeout: 120000 // Increase to 120s
  }
});

// Try alternative bootstrap nodes
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [
      // Primary nodes
      "/ip4/34.70.224.193/tcp/4001/p2p/12D3KooW...",
      // Backup nodes
      "/ip4/35.185.215.242/tcp/4001/p2p/12D3KooW...",
      "/ip4/104.197.140.89/tcp/4001/p2p/12D3KooW..."
    ]
  }
});
```

#### 2. Poor Discovery Performance

**Symptoms:**
- Few or no nodes discovered
- Slow node discovery

**Solutions:**
```typescript
// Enable multiple discovery mechanisms
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    enableDHT: true,
    enableMDNS: true,
    
    // Aggressive discovery settings
    discoveryOptions: {
      interval: 5000,      // Check every 5s
      timeout: 30000,      // 30s timeout
      maxPeers: 100,       // Find more peers
      forceRefresh: true   // Always query fresh
    }
  }
});
```

#### 3. Connection Drops

**Symptoms:**
- Frequent disconnections
- "Connection reset" errors

**Solutions:**
```typescript
// Configure keep-alive and stability
const sdk = new FabstirSDK({
  mode: "production",
  p2pConfig: {
    bootstrapNodes: [...],
    
    // Keep connections alive
    keepAlive: {
      interval: 30000,     // Ping every 30s
      timeout: 10000       // 10s timeout
    },
    
    // Increase connection resilience
    connectionManager: {
      maxConnections: 50,  // Reduce load
      minConnections: 5,   // Maintain minimum
      autoDial: true,      // Auto-reconnect
      autoDialInterval: 5000 // Try every 5s
    }
  }
});
```

### Debug Mode

Enable debug logging:

```typescript
const sdk = new FabstirSDK({
  mode: "production",
  debug: true,  // Enable SDK debug logs
  p2pConfig: {
    bootstrapNodes: [...],
    
    // P2P debug options
    debug: {
      enabled: true,
      verbose: true,
      logLevel: "debug",
      subsystems: [
        "dht",
        "discovery", 
        "connection",
        "transport"
      ]
    }
  }
});

// Listen to debug events
sdk.on("p2p:debug", (log) => {
  console.log(`[P2P ${log.subsystem}]`, log.message);
});
```

### Network Diagnostics

Run network diagnostics:

```typescript
// Check P2P health
const health = await sdk.getSystemHealthReport();
console.log("P2P Status:", health.p2p);

// Test connectivity
const connectivityTest = await sdk.testP2PConnectivity();
console.log("Can reach bootstrap nodes:", connectivityTest.bootstrap);
console.log("Can discover peers:", connectivityTest.discovery);
console.log("NAT type:", connectivityTest.natType);

// Analyze network performance
const perfTest = await sdk.testNetworkPerformance();
console.log("Average latency:", perfTest.avgLatency);
console.log("Bandwidth:", perfTest.bandwidth);
```

### Getting Help

If you're still experiencing issues:

1. Check the [FAQ](https://docs.fabstir.com/faq)
2. Search [existing issues](https://github.com/fabstir/llm-sdk/issues)
3. Join our [Discord](https://discord.gg/fabstir) for community support
4. Open a [new issue](https://github.com/fabstir/llm-sdk/issues/new) with:
   - Your P2P configuration
   - Error messages
   - Network environment details
   - Debug logs