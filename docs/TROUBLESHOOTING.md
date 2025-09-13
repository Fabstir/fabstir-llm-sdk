# Troubleshooting Guide

## Common Issues and Solutions

This guide helps diagnose and resolve common issues when using the Fabstir LLM SDK with WebSocket streaming and host discovery features.

## Connection Issues

### WebSocket Connection Fails

**Symptoms:**
- Error code 1006 when connecting
- "Connection refused" errors
- WebSocket immediately closes after opening

**Diagnosis:**
```javascript
// Test WebSocket connectivity
const testConnection = async (url) => {
  try {
    const ws = new WebSocket(url);
    
    ws.on('open', () => console.log('✅ Connected'));
    ws.on('error', (e) => console.error('❌ Error:', e.message));
    ws.on('close', (code) => console.log('Connection closed:', code));
    
    // Wait for connection
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    ws.close();
    return true;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
};

// Test both HTTP and WebSocket
await testConnection('ws://localhost:8080/v1/ws');
```

**Solutions:**

1. **Check if node is running:**
```bash
curl http://localhost:8080/health
```

2. **Verify WebSocket endpoint:**
- Correct path is `/v1/ws` (not `/ws` or root path)
- Ensure node has WebSocket support enabled

3. **Docker networking issues:**
```bash
# If SDK is in Docker and nodes on host
# Use host.docker.internal instead of localhost
ws://host.docker.internal:8080/v1/ws

# Or use socat forwarding
socat TCP-LISTEN:18080,fork,reuseaddr TCP:localhost:8080
```

4. **CORS/Origin issues (browser):**
```javascript
// Node should allow all origins or specific origin
Access-Control-Allow-Origin: *
```

### Host Discovery Returns Empty

**Symptoms:**
- `discoverAllActiveHosts()` returns empty array
- Nodes registered but not discoverable
- API URLs missing

**Diagnosis:**
```javascript
const hostManager = sdk.getHostManager();

// Check if nodes are registered
const nodeRegistry = await hostManager.getNodeRegistry();
const allNodes = await nodeRegistry.getAllActiveNodes();
console.log('Active nodes:', allNodes);

// Check individual node
const nodeInfo = await nodeRegistry.getNodeInfo(nodeAddress);
console.log('Node info:', nodeInfo);

// Check API URL
const apiUrl = await nodeRegistry.getNodeApiUrl(nodeAddress);
console.log('API URL:', apiUrl || 'NOT SET');
```

**Solutions:**

1. **Update node API URL:**
```javascript
// Node owner must update API URL
await hostManager.updateApiUrl('http://localhost:8080');
```

2. **Check contract address:**
```javascript
// Verify correct NodeRegistry contract
console.log('Registry address:', process.env.CONTRACT_NODE_REGISTRY);
```

3. **Verify node is active:**
```javascript
const info = await hostManager.getHostInfo(nodeAddress);
if (!info.isActive) {
  console.log('Node is not active');
}
```

## Authentication Issues

### Wallet Connection Fails

**Symptoms:**
- MetaMask doesn't pop up
- "User rejected request" errors
- Wrong network errors

**Solutions:**

1. **Check network:**
```javascript
// Ensure correct network
const chainId = await signer.getChainId();
if (chainId !== 84532) { // Base Sepolia
  console.error('Wrong network! Please switch to Base Sepolia');
}
```

2. **Handle pending requests:**
```javascript
// Clear any pending MetaMask requests
if (window.ethereum) {
  window.ethereum._metamask.isUnlocked().then(unlocked => {
    if (!unlocked) {
      console.log('Please unlock MetaMask');
    }
  });
}
```

3. **Private key authentication:**
```javascript
// For backend/testing
const wallet = new ethers.Wallet(privateKey, provider);
await sdk.authenticate(wallet);
```

### S5 Seed Generation Fails

**Symptoms:**
- "Failed to generate S5 seed" errors
- Session storage not working
- Can't recover conversations

**Solutions:**

1. **Check seed phrase format:**
```javascript
// S5 uses 15-word custom format (not BIP39)
// 13 seed words + 2 checksum words
const validSeed = seedPhrase.split(' ').length === 15;
```

2. **Provide fallback seed:**
```javascript
const config = {
  s5Config: {
    seedPhrase: process.env.S5_SEED_PHRASE // Fallback seed
  }
};
```

3. **Check IndexedDB (browser):**
```javascript
// Ensure IndexedDB is available
if (!window.indexedDB) {
  console.error('IndexedDB not supported');
}
```

## Streaming Issues

### Tokens Not Streaming

**Symptoms:**
- No tokens received after sending prompt
- `AsyncGenerator` never yields
- Streaming stops unexpectedly

**Diagnosis:**
```javascript
// Debug streaming
let tokenCount = 0;
const startTime = Date.now();

for await (const token of inferenceManager.streamInference(prompt)) {
  tokenCount++;
  console.log(`Token ${tokenCount}: "${token}"`);
}

console.log(`Received ${tokenCount} tokens in ${Date.now() - startTime}ms`);
```

**Solutions:**

1. **Check WebSocket message format:**
```javascript
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('Message type:', msg.type);
  
  if (msg.type === 'stream_chunk') {
    console.log('Token:', msg.content);
  }
});
```

2. **Enable streaming in request:**
```javascript
const request = {
  type: 'inference',
  request: {
    prompt: 'Hello',
    stream: true,  // Must be true
    model: 'tiny-vicuna-1b'
  }
};
```

3. **Check for errors:**
```javascript
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'error') {
    console.error('Stream error:', msg.error);
  }
});
```

### Slow Streaming Performance

**Solutions:**

1. **Enable compression:**
```javascript
const ws = new WebSocket(url, {
  perMessageDeflate: true
});
```

2. **Buffer tokens:**
```javascript
const buffer = [];
for await (const token of stream) {
  buffer.push(token);
  if (buffer.length >= 10) {
    updateUI(buffer.join(''));
    buffer.length = 0;
  }
}
```

3. **Check network latency:**
```javascript
const health = await hostManager.checkNodeHealth(apiUrl);
console.log('Latency:', health.latency, 'ms');
```

## Contract Issues

### Transaction Fails

**Symptoms:**
- "Transaction reverted" errors
- Gas estimation fails
- "Insufficient funds" errors

**Solutions:**

1. **Check gas balance:**
```javascript
const balance = await signer.getBalance();
console.log('Balance:', ethers.formatEther(balance), 'ETH');
```

2. **Increase gas limit:**
```javascript
const tx = await contract.method(args, {
  gasLimit: 500000n
});
```

3. **Check contract state:**
```javascript
// Verify requirements before transaction
const canRegister = await nodeRegistry.canRegister(address);
if (!canRegister) {
  console.error('Cannot register: check requirements');
}
```

### Wrong Contract Address

**Symptoms:**
- "Contract not found" errors
- Old ABI errors
- Function not found errors

**Solutions:**

1. **Update contract addresses:**
```env
# .env.local
CONTRACT_NODE_REGISTRY=0xb212F4e62a2F3BA36048054Fe75e3d0b0d61EB44
CONTRACT_JOB_MARKETPLACE=0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0
```

2. **Clear ABI cache:**
```javascript
// Force reload ABIs
delete require.cache[require.resolve('./abis/NodeRegistry.json')];
```

## Session Issues

### Session Recovery Fails

**Symptoms:**
- Can't resume conversation
- Lost conversation history
- Session not found errors

**Solutions:**

1. **Store session ID:**
```javascript
// Save session ID for recovery
localStorage.setItem('sessionId', session.id);
localStorage.setItem('conversationId', session.conversationId);
```

2. **Load from S5:**
```javascript
const history = await sessionManager.getConversationHistory(sessionId);
if (!history) {
  // Load from S5 directly
  const cid = localStorage.getItem('conversationId');
  const data = await s5Client.load(cid);
}
```

3. **Recover with context:**
```javascript
try {
  session = await sessionManager.resumeSession(sessionId);
} catch (error) {
  // Create new session with old context
  session = await sessionManager.createSession({
    initialContext: savedHistory
  });
}
```

## Browser-Specific Issues

### CORS Errors

**Solutions:**

1. **Configure node CORS:**
```rust
// Node should set headers
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

2. **Use proxy in development:**
```javascript
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/node/:path*',
        destination: 'http://localhost:8080/:path*'
      }
    ];
  }
};
```

### WebSocket in Production

**Solutions:**

1. **Use WSS for HTTPS sites:**
```javascript
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${host}/v1/ws`);
```

2. **Handle mixed content:**
```html
<!-- Allow WebSocket in meta -->
<meta http-equiv="Content-Security-Policy" 
      content="connect-src 'self' ws: wss:">
```

## Debugging Tools

### WebSocket Inspector

```javascript
class WebSocketInspector {
  constructor(ws) {
    const originalSend = ws.send.bind(ws);
    
    ws.send = (data) => {
      console.log('➡️ Sending:', data);
      originalSend(data);
    };
    
    ws.on('message', (data) => {
      console.log('⬅️ Received:', data.toString());
    });
    
    ws.on('error', (error) => {
      console.error('❌ Error:', error);
    });
    
    ws.on('close', (code, reason) => {
      console.log('🔌 Closed:', code, reason.toString());
    });
  }
}

// Use inspector
const ws = new WebSocket(url);
new WebSocketInspector(ws);
```

### Network Diagnostics

```javascript
async function diagnoseNetwork() {
  const tests = {
    httpHealth: false,
    wsConnection: false,
    blockchain: false,
    s5Storage: false
  };
  
  // Test HTTP
  try {
    const res = await fetch('http://localhost:8080/health');
    tests.httpHealth = res.ok;
  } catch (e) {}
  
  // Test WebSocket
  try {
    const ws = new WebSocket('ws://localhost:8080/v1/ws');
    await new Promise((r, j) => {
      ws.on('open', r);
      ws.on('error', j);
    });
    ws.close();
    tests.wsConnection = true;
  } catch (e) {}
  
  // Test blockchain
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    await provider.getBlockNumber();
    tests.blockchain = true;
  } catch (e) {}
  
  // Test S5
  try {
    const s5 = await S5.connect(S5_NODE);
    tests.s5Storage = true;
  } catch (e) {}
  
  console.table(tests);
  return tests;
}
```

### Performance Profiling

```javascript
class PerformanceProfiler {
  private metrics = {
    connectionTime: 0,
    firstTokenTime: 0,
    totalTokens: 0,
    totalTime: 0
  };
  
  async profile(inferenceFunc: Function, prompt: string) {
    const start = Date.now();
    let firstToken = true;
    
    for await (const token of inferenceFunc(prompt)) {
      if (firstToken) {
        this.metrics.firstTokenTime = Date.now() - start;
        firstToken = false;
      }
      this.metrics.totalTokens++;
    }
    
    this.metrics.totalTime = Date.now() - start;
    this.metrics.tokensPerSecond = 
      (this.metrics.totalTokens / this.metrics.totalTime) * 1000;
    
    console.table(this.metrics);
    return this.metrics;
  }
}
```

## Getting Help

### Collect Diagnostic Information

```javascript
async function collectDiagnostics() {
  const info = {
    sdk: {
      version: SDK_VERSION,
      network: await sdk.getNetwork(),
      authenticated: sdk.isAuthenticated()
    },
    environment: {
      browser: typeof window !== 'undefined',
      node: typeof process !== 'undefined',
      userAgent: navigator?.userAgent
    },
    contracts: {
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE
    },
    network: await diagnoseNetwork()
  };
  
  console.log('Diagnostic Info:', JSON.stringify(info, null, 2));
  return info;
}
```

### Report Issues

When reporting issues, include:

1. **Error messages and stack traces**
2. **Diagnostic information** from above
3. **Steps to reproduce**
4. **Expected vs actual behavior**
5. **SDK version and environment**

Report issues at: https://github.com/fabstir/fabstir-llm-sdk/issues

## Related Documentation

- [Host Discovery API](./HOST_DISCOVERY_API.md)
- [WebSocket Protocol Guide](./WEBSOCKET_PROTOCOL_GUIDE.md)
- [Session Manager API](./SESSION_MANAGER_ENHANCED.md)
- [SDK API Documentation](./SDK_API.md)