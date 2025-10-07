# Management API Reference

> Complete HTTP + WebSocket API reference for Fabstir Host Management Server

## Overview

The Management API provides HTTP REST endpoints and WebSocket connections for controlling a Fabstir host node. This API is designed for browser-based UIs but can be accessed programmatically via curl, Postman, or HTTP clients.

**Base URL**: `http://localhost:3001`

**Transport**: HTTP/1.1 with WebSocket upgrade support

**Authentication**: Optional via `X-API-Key` header

**CORS**: Enabled for `http://localhost:3000` by default

---

## Table of Contents

- [REST Endpoints](#rest-endpoints)
  - [GET /health](#get-health)
  - [GET /api/status](#get-apistatus)
  - [GET /api/discover-nodes](#get-apidiscover-nodes)
  - [POST /api/start](#post-apistart)
  - [POST /api/stop](#post-apistop)
  - [POST /api/register](#post-apiregister)
  - [POST /api/unregister](#post-apiunregister)
  - [POST /api/add-stake](#post-apiadd-stake)
  - [POST /api/withdraw-earnings](#post-apiwithdraw-earnings)
  - [POST /api/update-models](#post-apiupdate-models)
  - [POST /api/update-metadata](#post-apiupdate-metadata)
- [WebSocket](#websocket)
  - [WS /ws/logs](#ws-wslogs)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## REST Endpoints

### GET /health

Health check endpoint for the management server.

**Purpose**: Verify management server is running and responsive.

**Request**:
```http
GET /health HTTP/1.1
Host: localhost:3001
```

**Response**:
```json
{
  "status": "ok",
  "uptime": 3600
}
```

**Response Fields**:
- `status` (string): Always "ok" if server is running
- `uptime` (number): Server uptime in seconds

**Status Codes**:
- `200 OK`: Server is healthy

**Example (curl)**:
```bash
curl http://localhost:3001/health
```

**Example (JavaScript)**:
```javascript
const response = await fetch('http://localhost:3001/health');
const data = await response.json();
console.log(data.status); // "ok"
```

**Use Cases**:
- Health monitoring
- Container readiness probes
- Load balancer health checks

---

### GET /api/status

Get current status of the fabstir-llm-node process.

**Purpose**: Check if node is running, get PID, uptime, and public URL.

**Request**:
```http
GET /api/status HTTP/1.1
Host: localhost:3001
Content-Type: application/json
```

**Response (Node Running)**:
```json
{
  "status": "running",
  "pid": 256,
  "uptime": 3600,
  "publicUrl": "http://localhost:8083",
  "startTime": "2025-01-07T12:00:00.000Z"
}
```

**Response (Node Stopped)**:
```json
{
  "status": "stopped"
}
```

**Response Fields**:
- `status` (string): "running" or "stopped"
- `pid` (number, optional): Process ID when running
- `uptime` (number, optional): Seconds since node started
- `publicUrl` (string, optional): Public URL for API access
- `startTime` (string, optional): ISO 8601 timestamp of start time

**Status Codes**:
- `200 OK`: Status retrieved successfully

**Example (curl)**:
```bash
curl http://localhost:3001/api/status
```

**Example (JavaScript)**:
```javascript
const response = await fetch('http://localhost:3001/api/status');
const status = await response.json();

if (status.status === 'running') {
  console.log(`Node running with PID ${status.pid}`);
  console.log(`Uptime: ${status.uptime} seconds`);
} else {
  console.log('Node is stopped');
}
```

**Use Cases**:
- Monitor node state
- Display status in UI
- Auto-refresh polling

---

### GET /api/discover-nodes

Discover all active host nodes on the Fabstir network.

**Purpose**: Query the blockchain to find all registered and active hosts.

**Request**:
```http
GET /api/discover-nodes HTTP/1.1
Host: localhost:3001
Content-Type: application/json
```

**Response**:
```json
{
  "nodes": [
    {
      "nodeAddress": "0x4594F755F593B517Bb3194F4DeC20C48a3f04504",
      "apiUrl": "http://localhost:8083",
      "supportedModels": [
        "0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced"
      ],
      "isActive": true,
      "metadata": {
        "hardware": {
          "gpu": "NVIDIA RTX 3090",
          "vram": 24,
          "ram": 64
        },
        "pricing": {
          "costPerToken": 0.0001
        }
      }
    }
  ]
}
```

**Response Fields**:
- `nodes` (array): List of discovered host nodes
  - `nodeAddress` (string): Ethereum address of host
  - `apiUrl` (string): Public API URL
  - `supportedModels` (array): Model IDs (keccak256 hashes)
  - `isActive` (boolean): Whether host is currently accepting jobs
  - `metadata` (object, optional): Additional host information

**Status Codes**:
- `200 OK`: Discovery completed (even if empty)
- `500 Internal Server Error`: Blockchain query failed

**Example (curl)**:
```bash
curl http://localhost:3001/api/discover-nodes
```

**Example (JavaScript)**:
```javascript
const response = await fetch('http://localhost:3001/api/discover-nodes');
const data = await response.json();

console.log(`Found ${data.nodes.length} active hosts`);
data.nodes.forEach(node => {
  console.log(`- ${node.apiUrl} (${node.supportedModels.length} models)`);
});
```

**Use Cases**:
- Network debugging
- Host discovery
- Check if your node is visible

---

### POST /api/start

Start the fabstir-llm-node process.

**Purpose**: Launch inference node in foreground or daemon mode.

**Request**:
```http
POST /api/start HTTP/1.1
Host: localhost:3001
Content-Type: application/json

{
  "daemon": true
}
```

**Request Body**:
- `daemon` (boolean, optional): Run in background (default: true)

**Response**:
```json
{
  "status": "running",
  "pid": 256,
  "publicUrl": "http://localhost:8083"
}
```

**Response Fields**:
- `status` (string): Always "running" on success
- `pid` (number): Process ID of started node
- `publicUrl` (string): Public URL for API access

**Status Codes**:
- `200 OK`: Node started successfully
- `400 Bad Request`: Invalid request body
- `500 Internal Server Error`: Start failed (see error.error field)

**Error Response**:
```json
{
  "error": "Node already running with PID 256"
}
```

**Example (curl)**:
```bash
# Start in daemon mode
curl -X POST http://localhost:3001/api/start \
  -H "Content-Type: application/json" \
  -d '{"daemon": true}'

# Start in foreground mode
curl -X POST http://localhost:3001/api/start \
  -H "Content-Type: application/json" \
  -d '{"daemon": false}'
```

**Example (JavaScript)**:
```javascript
const response = await fetch('http://localhost:3001/api/start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ daemon: true })
});

if (response.ok) {
  const data = await response.json();
  console.log(`Node started with PID ${data.pid}`);
} else {
  const error = await response.json();
  console.error(`Start failed: ${error.error}`);
}
```

**Use Cases**:
- Start node after registration
- Restart node after stop
- Start node in daemon mode for background operation

---

### POST /api/stop

Stop the fabstir-llm-node process.

**Purpose**: Gracefully or forcefully stop the inference node.

**Request**:
```http
POST /api/stop HTTP/1.1
Host: localhost:3001
Content-Type: application/json

{
  "force": false
}
```

**Request Body**:
- `force` (boolean, optional): Force kill instead of graceful shutdown (default: false)

**Response**:
```json
{
  "success": true
}
```

**Response Fields**:
- `success` (boolean): Always true on success

**Status Codes**:
- `200 OK`: Node stopped successfully (or was already stopped)
- `400 Bad Request`: Invalid request body
- `500 Internal Server Error`: Stop failed

**Error Response**:
```json
{
  "error": "Failed to stop node: timeout waiting for process to exit"
}
```

**Example (curl)**:
```bash
# Graceful stop
curl -X POST http://localhost:3001/api/stop \
  -H "Content-Type: application/json" \
  -d '{"force": false}'

# Force stop
curl -X POST http://localhost:3001/api/stop \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

**Example (JavaScript)**:
```javascript
const response = await fetch('http://localhost:3001/api/stop', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ force: false })
});

const data = await response.json();
console.log('Node stopped:', data.success);
```

**Use Cases**:
- Graceful shutdown before maintenance
- Force kill if node is unresponsive
- Prepare for unregistration

---

### POST /api/register

Register host on the blockchain and start node.

**Purpose**: Execute full registration workflow (approve tokens, register, start node).

**Request**:
```http
POST /api/register HTTP/1.1
Host: localhost:3001
Content-Type: application/json

{
  "walletAddress": "0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c",
  "publicUrl": "http://localhost:8083",
  "models": ["CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"],
  "stakeAmount": "1000",
  "metadata": {
    "hardware": {
      "gpu": "NVIDIA RTX 3090",
      "vram": 24,
      "ram": 64
    }
  }
}
```

**Request Body**:
- `walletAddress` (string, required): Ethereum address
- `publicUrl` (string, required): Public API URL
- `models` (array, required): Model strings (repo:file format)
- `stakeAmount` (string, required): FAB tokens to stake
- `metadata` (object, optional): Additional host info

**Response**:
```json
{
  "transactionHash": "0x1234567890abcdef...",
  "hostAddress": "0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c",
  "pid": 256
}
```

**Response Fields**:
- `transactionHash` (string): Blockchain transaction hash
- `hostAddress` (string): Registered host address
- `pid` (number): Process ID of started node

**Status Codes**:
- `200 OK`: Registration successful
- `400 Bad Request`: Invalid parameters (missing fields, invalid model, etc.)
- `500 Internal Server Error`: Registration failed (blockchain error)

**Error Response**:
```json
{
  "error": "Insufficient FAB balance for stake"
}
```

**Example (curl)**:
```bash
curl -X POST http://localhost:3001/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c",
    "publicUrl": "http://localhost:8083",
    "models": ["CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"],
    "stakeAmount": "1000"
  }'
```

**Use Cases**:
- Initial host registration
- Complete onboarding workflow
- Automated deployment scripts

---

### POST /api/unregister

Unregister host from blockchain and stop node.

**Purpose**: Remove host from network and recover staked tokens.

**Request**:
```http
POST /api/unregister HTTP/1.1
Host: localhost:3001
Content-Type: application/json
```

**Request Body**: None required

**Response**:
```json
{
  "transactionHash": "0xabcdef1234567890..."
}
```

**Response Fields**:
- `transactionHash` (string): Blockchain transaction hash

**Status Codes**:
- `200 OK`: Unregistration successful
- `501 Not Implemented`: Feature not yet implemented (returns this in current version)
- `500 Internal Server Error`: Unregistration failed

**Example (curl)**:
```bash
curl -X POST http://localhost:3001/api/unregister \
  -H "Content-Type: application/json"
```

**Use Cases**:
- Decommission host
- Recover staked tokens
- Network exit

**Note**: This endpoint is planned but not fully implemented in the current version. It returns 501 Not Implemented.

---

### POST /api/add-stake

Add more FAB tokens to existing stake.

**Purpose**: Increase stake without unregistering.

**Request**:
```http
POST /api/add-stake HTTP/1.1
Host: localhost:3001
Content-Type: application/json

{
  "amount": "500"
}
```

**Request Body**:
- `amount` (string, required): Additional FAB tokens to stake

**Response**:
```json
{
  "transactionHash": "0x...",
  "newStake": "1500"
}
```

**Response Fields**:
- `transactionHash` (string): Blockchain transaction hash
- `newStake` (string): Total stake after increase

**Status Codes**:
- `200 OK`: Stake added successfully
- `501 Not Implemented`: Feature not yet implemented (current version)
- `500 Internal Server Error`: Transaction failed

**Example (curl)**:
```bash
curl -X POST http://localhost:3001/api/add-stake \
  -H "Content-Type: application/json" \
  -d '{"amount": "500"}'
```

**Use Cases**:
- Increase reputation
- Meet higher stake requirements
- Adjust to market conditions

**Note**: Planned feature, returns 501 in current version.

---

### POST /api/withdraw-earnings

Withdraw accumulated host earnings.

**Purpose**: Transfer earnings from HostEarnings contract to host wallet.

**Request**:
```http
POST /api/withdraw-earnings HTTP/1.1
Host: localhost:3001
Content-Type: application/json

{
  "tokenAddress": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}
```

**Request Body**:
- `tokenAddress` (string, optional): Token to withdraw (defaults to native token if not specified)
  - Use `0x0000000000000000000000000000000000000000` for ETH/BNB
  - Use USDC contract address for USDC earnings

**Response**:
```json
{
  "transactionHash": "0x...",
  "amount": "123.456789"
}
```

**Response Fields**:
- `transactionHash` (string): Blockchain transaction hash
- `amount` (string): Amount withdrawn (in token decimals)

**Status Codes**:
- `200 OK`: Withdrawal successful
- `400 Bad Request`: Invalid token address
- `500 Internal Server Error`: Withdrawal failed

**Example (curl)**:
```bash
# Withdraw USDC earnings
curl -X POST http://localhost:3001/api/withdraw-earnings \
  -H "Content-Type: application/json" \
  -d '{"tokenAddress": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"}'

# Withdraw native token (ETH/BNB)
curl -X POST http://localhost:3001/api/withdraw-earnings \
  -H "Content-Type: application/json" \
  -d '{"tokenAddress": "0x0000000000000000000000000000000000000000"}'
```

**Use Cases**:
- Claim earnings periodically
- Cash out rewards
- Transfer to cold storage

---

### POST /api/update-models

Update list of supported models.

**Purpose**: Add or remove models without unregistering.

**Request**:
```http
POST /api/update-models HTTP/1.1
Host: localhost:3001
Content-Type: application/json

{
  "modelIds": [
    "0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced",
    "0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca"
  ]
}
```

**Request Body**:
- `modelIds` (array, required): Model IDs (keccak256 hashes)

**Response**:
```json
{
  "transactionHash": "0x...",
  "models": [
    "0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced",
    "0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca"
  ]
}
```

**Response Fields**:
- `transactionHash` (string): Blockchain transaction hash
- `models` (array): Updated model list

**Status Codes**:
- `200 OK`: Models updated successfully
- `501 Not Implemented`: Feature not yet implemented (current version)
- `500 Internal Server Error`: Update failed

**Example (curl)**:
```bash
curl -X POST http://localhost:3001/api/update-models \
  -H "Content-Type: application/json" \
  -d '{
    "modelIds": [
      "0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced"
    ]
  }'
```

**Use Cases**:
- Add newly approved models
- Remove deprecated models
- Adjust to demand

**Note**: Planned feature, returns 501 in current version.

---

### POST /api/update-metadata

Update host metadata (hardware, pricing, etc.).

**Purpose**: Modify host information without re-registering.

**Request**:
```http
POST /api/update-metadata HTTP/1.1
Host: localhost:3001
Content-Type: application/json

{
  "metadata": {
    "hardware": {
      "gpu": "NVIDIA RTX 4090",
      "vram": 24,
      "ram": 128
    },
    "pricing": {
      "costPerToken": 0.00015
    },
    "location": "us-west-2",
    "maxConcurrent": 10
  }
}
```

**Request Body**:
- `metadata` (object, required): Updated metadata
  - `hardware` (object, optional): Hardware specs
  - `pricing` (object, optional): Pricing info
  - `location` (string, optional): Geographic location
  - `maxConcurrent` (number, optional): Max concurrent sessions

**Response**:
```json
{
  "transactionHash": "0x..."
}
```

**Response Fields**:
- `transactionHash` (string): Blockchain transaction hash

**Status Codes**:
- `200 OK`: Metadata updated successfully
- `501 Not Implemented`: Feature not yet implemented (current version)
- `500 Internal Server Error`: Update failed

**Example (curl)**:
```bash
curl -X POST http://localhost:3001/api/update-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "hardware": {"gpu": "RTX 4090", "vram": 24},
      "pricing": {"costPerToken": 0.00015}
    }
  }'
```

**Use Cases**:
- Update hardware after upgrades
- Adjust pricing
- Set capacity limits

**Note**: Planned feature, returns 501 in current version.

---

## WebSocket

### WS /ws/logs

Real-time log streaming via WebSocket.

**Purpose**: Stream fabstir-llm-node logs (stdout/stderr) to browser in real-time.

**Connection URL**: `ws://localhost:3001/ws/logs`

**Authentication**: Optional via query parameter `?apiKey=YOUR_KEY`

**Protocol**:
1. Client connects to WebSocket
2. Server sends historical logs (last 50 lines)
3. Server broadcasts new log lines as they occur
4. Client can disconnect at any time

**Message Types**:

**1. Historical Logs** (sent on connection):
```json
{
  "type": "history",
  "lines": [
    "[2025-01-07T12:00:00.000Z] [stdout] Model loaded",
    "[2025-01-07T12:00:01.000Z] [stdout] P2P started",
    "[2025-01-07T12:00:02.000Z] [stdout] API started"
  ]
}
```

**2. Live Log** (broadcast for each new line):
```json
{
  "type": "log",
  "timestamp": "2025-01-07T12:00:03.000Z",
  "level": "stdout",
  "message": "Received P2P connection from 0x1234..."
}
```

**Message Fields**:
- `type` (string): "history" or "log"
- `timestamp` (string): ISO 8601 timestamp
- `level` (string): "stdout" or "stderr"
- `message` (string): Log message text
- `lines` (array, history only): Historical log lines

**Example (JavaScript)**:
```javascript
const ws = new WebSocket('ws://localhost:3001/ws/logs');

ws.onopen = () => {
  console.log('WebSocket connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'history') {
    console.log('Historical logs:', message.lines);
  } else if (message.type === 'log') {
    console.log(`[${message.level}] ${message.message}`);
  }
};

ws.onclose = () => {
  console.log('WebSocket disconnected');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// Disconnect
ws.close();
```

**Example (Using HostWsClient)**:
```javascript
import { HostWsClient } from '../lib/hostWsClient';

const client = new HostWsClient('ws://localhost:3001/ws/logs');

client.onLog((log) => {
  console.log(`[${log.timestamp}] ${log.message}`);
});

client.onHistory((lines) => {
  console.log('Got historical logs:', lines.length);
});

await client.connect();
```

**Reconnection**:
The WebSocket client automatically reconnects on connection loss:
- Exponential backoff (1s, 2s, 3s)
- Max 3 retries
- Manual reconnect available

**Use Cases**:
- Live log monitoring in browser
- Debugging node startup
- Real-time problem detection
- Automated log analysis

---

## Authentication

### API Key Authentication

**Configuration**:
```bash
# Start server with API key
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --api-key mySecretKey123'
```

**HTTP Requests**:
```http
GET /api/status HTTP/1.1
Host: localhost:3001
X-API-Key: mySecretKey123
```

**WebSocket Connections**:
```
ws://localhost:3001/ws/logs?apiKey=mySecretKey123
```

**Client Configuration**:
```javascript
// HTTP Client
const client = new HostApiClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'mySecretKey123'
});

// WebSocket Client
const wsClient = new HostWsClient(
  'ws://localhost:3001/ws/logs',
  'mySecretKey123'
);
```

**Authentication Failure**:
```json
{
  "error": "Invalid API key"
}
```

**Status Codes**:
- `401 Unauthorized`: Invalid or missing API key

**When to Use**:
- Shared development environments
- Extra security layer
- Testing authentication flows

**When NOT to Use**:
- Single-user localhost (adds complexity)
- Production (use SSH tunnel instead)

---

## Error Handling

### Standard Error Format

All endpoints return errors in this format:
```json
{
  "error": "Human-readable error message"
}
```

### Common Error Responses

**400 Bad Request**:
```json
{
  "error": "Missing required field: walletAddress"
}
```

**401 Unauthorized**:
```json
{
  "error": "Invalid API key"
}
```

**404 Not Found**:
```json
{
  "error": "Endpoint not found"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Node failed to start: binary not found"
}
```

**501 Not Implemented**:
```json
{
  "error": "Endpoint not yet implemented. TODO: Refactor unregister command to support API calls"
}
```

### Error Handling Best Practices

**Check HTTP Status First**:
```javascript
const response = await fetch('http://localhost:3001/api/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ daemon: true })
});

if (!response.ok) {
  const error = await response.json();
  console.error(`Request failed: ${error.error}`);
  return;
}

const data = await response.json();
// Success handling
```

**Handle Network Errors**:
```javascript
try {
  const response = await fetch('http://localhost:3001/api/status');
  // ...
} catch (error) {
  console.error('Network error:', error);
  // Management server not running or network issue
}
```

---

## Rate Limiting

**Current Status**: Not implemented in v1.0

**Future Implementation**:
- Rate limiting will be added in future versions
- Likely limits: 100 requests/minute per client
- WebSocket: 1 connection per client

**For Now**:
- No rate limiting enforced
- Suitable for localhost development only
- Don't expose publicly without additional protection

---

## Examples

### Complete Registration Workflow

```javascript
const client = new HostApiClient({ baseUrl: 'http://localhost:3001' });

// 1. Check initial status
const initialStatus = await client.getStatus();
console.log('Initial status:', initialStatus.status);

// 2. Register host (if not registered)
const registration = await client.register({
  walletAddress: '0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c',
  publicUrl: 'http://localhost:8083',
  models: ['CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf'],
  stakeAmount: '1000'
});
console.log('Registered:', registration.transactionHash);

// 3. Wait for node to start (registration auto-starts)
await sleep(5000);

// 4. Check status again
const runningStatus = await client.getStatus();
console.log('Running status:', runningStatus);
```

### Monitor Logs in Real-Time

```javascript
const wsClient = new HostWsClient('ws://localhost:3001/ws/logs');

// Set up log handler
wsClient.onLog((log) => {
  const timestamp = new Date(log.timestamp).toLocaleTimeString();
  const color = log.level === 'stderr' ? '\x1b[31m' : '\x1b[0m';
  console.log(`${color}[${timestamp}] ${log.message}\x1b[0m`);
});

// Set up history handler
wsClient.onHistory((lines) => {
  console.log('=== Historical Logs ===');
  lines.forEach(line => console.log(line));
  console.log('=== End History ===');
});

// Connect
await wsClient.connect();

// Keep connection open
// Call wsClient.disconnect() when done
```

---

## Additional Resources

- **Browser Management Guide**: [BROWSER_MANAGEMENT.md](./BROWSER_MANAGEMENT.md)
- **Docker Deployment**: [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Implementation Details**: [../../docs/IMPLEMENTATION-HOST-API.md](../../docs/IMPLEMENTATION-HOST-API.md)

---

**Document Version**: v1.0
**Last Updated**: January 2025
**API Version**: 1.0.0
**Maintainer**: Fabstir Development Team
