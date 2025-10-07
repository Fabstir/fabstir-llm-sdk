# Browser-Based Node Management

> Visual control panel for Fabstir host node operations via web browser

## Overview

The Fabstir Host CLI includes a **browser-based management interface** that provides visual control over your host node. Instead of using CLI commands, you can start, stop, register, and monitor your node through a web UI with real-time feedback.

### Key Features

- **Real-time Log Streaming** - Watch node logs live via WebSocket
- **One-Click Controls** - Start/stop node with visual confirmation
- **Status Monitoring** - Live PID, uptime, and connection status
- **Host Discovery** - See all active nodes on the network
- **Registration Management** - Register/unregister through UI forms
- **Multi-Chain Support** - Switch between Base Sepolia and opBNB Testnet

### Use Case

**For Local Development & Testing**:
Browser UI provides immediate visual feedback and is ideal for learning the system, debugging issues, and interactive testing.

**For Production Deployment**:
CLI commands are recommended for production. They're scriptable, more reliable, and don't require exposing an additional port.

---

## Quick Start

### Prerequisites

1. ✅ Docker container running (`./start-fabstir-docker.sh`)
2. ✅ Next.js test harness available (`apps/harness/`)
3. ✅ Port 3001 available on host machine
4. ✅ Modern browser (Chrome 90+, Firefox 88+, Safari 14+)

### 4-Step Workflow

**Step 1: Start Docker Container**
```bash
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk

# Start container (if not already running)
./start-fabstir-docker.sh

# Verify container is up
docker ps | grep fabstir-host-test
```

**Step 2: Start Management Server**
```bash
# Use the convenient startup script
./start-management-server.sh

# Expected output:
# ✅ Management server started successfully
# 📍 Management API: http://localhost:3001
# 🌐 Browser UI:     http://localhost:3000/node-management-enhanced
```

**Step 3: Start Next.js Test Harness** (Separate Terminal)
```bash
cd apps/harness
pnpm dev

# Wait for:
# ✓ Ready in 2.5s
# ✓ Local: http://localhost:3000
```

**Step 4: Open Browser**
```
Navigate to: http://localhost:3000/node-management-enhanced
```

You should see the **Node Management Client** interface with:
- 🎮 **Node Control** panel (Start/Stop/Refresh buttons)
- 🔴 **Live Server Logs** (real-time streaming)
- 📊 **Status Display** (PID, uptime, URL)
- 🔍 **Host Discovery** (active network nodes)

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (http://localhost:3000)                             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Node Management Client (React UI)                      │ │
│  │  - HostApiClient (HTTP requests)                       │ │
│  │  - HostWsClient (WebSocket logs)                       │ │
│  └───────────────┬──────────────┬─────────────────────────┘ │
│                  │              │                            │
└──────────────────┼──────────────┼────────────────────────────┘
                   │              │
         HTTP/REST │              │ WebSocket
         Port 3001 │              │ Port 3001
                   ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│ Docker Container (fabstir-host-test)                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Management Server (Express on :3001)                   │ │
│  │  ├── REST API (10 endpoints)                           │ │
│  │  └── WebSocket Server (/ws/logs)                       │ │
│  └───────────────┬────────────────────────────────────────┘ │
│                  │                                           │
│                  │ delegates to                              │
│                  ▼                                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ CLI Commands (packages/host-cli/src/commands/)         │ │
│  │  ├── start.ts     (startHost)                          │ │
│  │  ├── stop.ts      (stopCommand)                        │ │
│  │  ├── register.ts  (executeRegistration)                │ │
│  │  └── ...                                                │ │
│  └───────────────┬────────────────────────────────────────┘ │
│                  │                                           │
│                  │ spawns/controls                           │
│                  ▼                                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ fabstir-llm-node (Rust binary on :8083)                │ │
│  │  - LLM inference                                        │ │
│  │  - P2P networking                                       │ │
│  │  - Health endpoint                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **No Code Duplication**: Management server delegates to existing CLI commands
2. **Single Source of Truth**: All business logic in CLI commands only
3. **Separation of Concerns**: Management server is just HTTP/WebSocket plumbing
4. **Process Independence**: Management server crash doesn't affect inference node

---

## Features

### 1. Real-Time Log Streaming

**What It Does**:
Displays live stdout/stderr logs from the fabstir-llm-node process in your browser.

**How It Works**:
- WebSocket connection to `ws://localhost:3001/ws/logs`
- Server tails log files at `/root/.fabstir/logs/`
- Historical logs sent on connection (last 50 lines)
- New log lines broadcast in real-time

**UI Features**:
- Auto-scroll toggle
- Log level filter (all/stdout/stderr)
- Clear logs button
- Color-coded stderr (red)
- Connection status indicator

**Example Log Output**:
```
[07:30:15] [stdout] Model loaded
[07:30:16] [stdout] P2P started
[07:30:17] [stdout] API started
[07:30:18] [stderr] Warning: GPU not detected, using CPU
```

### 2. Node Lifecycle Control

**What It Does**:
Start and stop the fabstir-llm-node process with one click.

**Start Node**:
- Button: **▶️ Start Node**
- Action: Calls `POST /api/start` with `daemon: true`
- Result: Node starts in background, displays PID and URL
- Auto-refreshes status every 10 seconds

**Stop Node**:
- Button: **⏹️ Stop Node**
- Action: Calls `POST /api/stop` with `force: false` (graceful)
- Result: Node shuts down cleanly, PID cleared
- Stops auto-refresh polling

**Status Display**:
```
Status: ● Running
PID: 256
Uptime: 5m 32s
URL: http://localhost:8083
```

### 3. Host Discovery

**What It Does**:
Discovers all active host nodes on the Fabstir network.

**Button**: **🔍 Discover Hosts**

**Displays**:
- Node address (0x...)
- API URL
- Supported models
- Active status
- Metadata (hardware, pricing)

**Use Cases**:
- Check if your node is visible on network
- Debug networking issues
- See what other hosts are offering

### 4. Registration Management

**What It Does**:
Register or unregister your host on the blockchain via UI forms.

**Features** (already in existing UI):
- Wallet address input
- Public URL input
- Model selection
- Stake amount
- Transaction confirmation

### 5. Status Monitoring

**What It Does**:
Continuously monitors node status and displays current state.

**Metrics Shown**:
- Node status (running/stopped)
- Process ID (PID)
- Uptime (formatted as "5m 32s" or "2h 15m")
- Public URL
- Start time (ISO 8601)

**Auto-Refresh**:
- Polls `/api/status` every 10 seconds when node running
- Stops polling when node stopped
- Manual refresh button available

---

## Security

### Localhost-Only Design

**Default Configuration**:
- Management server binds to `0.0.0.0:3001` inside container
- Port mapping `3001:3001` restricts access to host machine only
- CORS limited to `http://localhost:3000` (Next.js harness)
- No authentication required by default (localhost is trusted)

**Why This Is Safe**:
- Only accessible from same machine as Docker host
- No remote access possible without SSH tunnel
- Perfect for local development/testing

### Optional API Key Authentication

**Enable Authentication**:
```bash
# Start server with API key
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --port 3001 --api-key mySecretKey123'
```

**Client Configuration**:
```typescript
// In browser client
const client = new HostApiClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'mySecretKey123'  // Sent as X-API-Key header
});
```

**When to Use**:
- Shared development machines
- When paranoid about localhost security
- Testing authentication flows

### Production Deployment

**⚠️ DO NOT expose port 3001 publicly in production!**

**For Remote Management**:

**Option 1: SSH Tunnel (Recommended)**
```bash
# From your local machine
ssh -L 3001:localhost:3001 user@production-server

# Now access http://localhost:3001 (tunneled through SSH)
```

**Option 2: VPN**
- Connect to production network via VPN
- Access management server on private network

**Option 3: Use CLI Only**
```bash
# SSH into server
ssh user@production-server

# Use CLI commands directly
docker exec fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js status'
```

---

## Troubleshooting

### Issue: Port 3001 Not Accessible

**Symptoms**:
- Browser shows "Connection refused"
- `curl http://localhost:3001/health` fails

**Diagnose**:
```bash
# Check if management server is running
docker exec fabstir-host-test ps aux | grep "serve"

# Check if port is mapped
docker port fabstir-host-test 3001
# Should show: 3001/tcp -> 0.0.0.0:3001

# Test from host machine
curl http://localhost:3001/health
```

**Solutions**:
1. Start management server: `./start-management-server.sh`
2. Verify port mapping in Docker run command: `-p 3001:3001`
3. Restart container if port mapping was added: `docker restart fabstir-host-test`

---

### Issue: WebSocket Connection Fails

**Symptoms**:
- Browser console error: `WebSocket connection to 'ws://localhost:3001/ws/logs' failed`
- "Disconnected" status in UI

**Diagnose**:
```bash
# Check browser console (F12)
# Look for WebSocket errors

# Test WebSocket endpoint
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:3001/ws/logs

# Should return: HTTP/1.1 101 Switching Protocols
```

**Solutions**:
1. Verify management server is running
2. Check firewall isn't blocking WebSocket upgrades
3. Try in different browser (some extensions block WebSockets)
4. Check server logs for errors

---

### Issue: UI Shows "Management API Client Not Initialized"

**Symptoms**:
- Gray "API Ready" indicator shows "(Initializing...)"
- Buttons disabled

**Causes**:
- Async initialization still in progress
- Management server not running
- CORS blocking requests

**Solutions**:
1. **Wait 2-3 seconds** - Initialization is asynchronous
2. Check browser console for errors
3. Verify management server: `curl http://localhost:3001/health`
4. Check CORS: Server must allow `http://localhost:3000`

---

### Issue: Start Button Doesn't Work

**Symptoms**:
- Click "Start Node" but nothing happens
- Logs show "Node already running" error

**Diagnose**:
```bash
# Check if node is already running
docker exec fabstir-host-test ps aux | grep fabstir-llm-node

# Check PID file
docker exec fabstir-host-test cat /root/.fabstir/host.pid
```

**Solutions**:
1. Stop existing node first: Click "Stop Node" button
2. Or use CLI: `docker exec fabstir-host-test pkill fabstir-llm-node`
3. Wait 2-3 seconds after stopping before starting again

---

### Issue: Logs Not Updating

**Symptoms**:
- WebSocket shows "Connected" but no new logs appear
- Logs frozen

**Causes**:
- Auto-scroll disabled
- Log filter hiding messages
- Node not producing logs

**Solutions**:
1. Enable auto-scroll toggle
2. Change log filter to "All Logs"
3. Check if node is actually running
4. Restart node to generate startup logs

---

### Issue: Node Status Shows Wrong State

**Symptoms**:
- UI says "Running" but node is stopped
- UI says "Stopped" but node is running

**Causes**:
- Stale PID file
- Manual start/stop bypassed management API
- Race condition during state changes

**Solutions**:
1. Click "Refresh Status" button
2. Check actual node status: `docker exec fabstir-host-test ps aux | grep fabstir-llm-node`
3. Clean stale PID: `docker exec fabstir-host-test rm -f /root/.fabstir/host.pid`
4. Restart management server

---

## Example Workflow

### Complete Registration & Start Flow

**Scenario**: New host wants to register and start serving requests.

**Step 1: Prepare Environment**
```bash
# Start Docker container
./start-fabstir-docker.sh

# Start management server
./start-management-server.sh

# Start Next.js test harness (separate terminal)
cd apps/harness && pnpm dev
```

**Step 2: Open Browser**
```
Navigate to: http://localhost:3000/node-management-enhanced
```

**Step 3: Register Host**
1. Scroll to **"Register New Host"** section
2. Fill in form:
   - Wallet Address: (from .env.test: TEST_HOST_2_ADDRESS)
   - Public URL: `http://localhost:8083`
   - Model: `CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf`
   - Stake Amount: `1000`
3. Click **"Register Host"**
4. Wait for transaction confirmation
5. Check logs for "✅ Registration successful!"

**Step 4: Start Node**
1. Scroll to **"Node Control"** panel
2. Verify status shows "Stopped"
3. Click **"▶️ Start Node"**
4. Watch live logs for startup sequence:
   ```
   ✅ Model loaded
   ✅ P2P started
   ✅ API started
   ```
5. Status panel updates to "Running" with PID and uptime

**Step 5: Monitor Operation**
1. Watch **"Live Server Logs"** for P2P connections
2. Check **"Discover Hosts"** to see your node on network
3. Status auto-refreshes every 10 seconds

**Step 6: Stop Node (When Done)**
1. Click **"⏹️ Stop Node"**
2. Wait for "✅ Node stopped" in logs
3. Status shows "Stopped"

**Step 7: Unregister (Optional)**
1. Use **"Unregister Host"** button
2. Recovers staked FAB tokens
3. Removes node from network

---

## Advanced Usage

### Custom Management Server Port

```bash
# Start on different port
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --port 3002'

# Update client baseUrl in browser code
const client = new HostApiClient({
  baseUrl: 'http://localhost:3002'
});
```

### Custom CORS Origins

```bash
# Allow multiple origins
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --cors "http://localhost:3000,http://localhost:3001"'
```

### Stopping Management Server

```bash
# Find management server process
docker exec fabstir-host-test ps aux | grep "serve"

# Kill by process name
docker exec fabstir-host-test pkill -f "dist/index.js serve"

# Or restart container (stops all processes)
docker restart fabstir-host-test
```

---

## Comparison: CLI vs Browser

| Feature | CLI Commands | Browser UI | Notes |
|---------|-------------|------------|-------|
| **Setup Time** | Instant | +30 seconds | Need to start management server + harness |
| **Visibility** | Terminal logs | Visual panels | Browser shows more at once |
| **Scriptability** | ✅ Excellent | ❌ Not scriptable | CLI wins for automation |
| **Real-time Logs** | tail -f | ✅ Live streaming | WebSocket is more responsive |
| **Multi-tasking** | Multiple terminals | Single browser tab | Personal preference |
| **Learning Curve** | Steeper | Gentle | UI is more discoverable |
| **Production Use** | ✅ Recommended | ⚠️ Localhost only | CLI is more stable |
| **Remote Access** | SSH | SSH tunnel | Both need secure transport |
| **Error Handling** | Exit codes | Visual feedback | UI shows errors inline |

**Recommendation**:
- **Learning/Debugging**: Use browser UI
- **Production/Scripts**: Use CLI commands

---

## FAQ

### Q: Can I use this without Docker?

**A**: Yes, but you'll need to:
1. Build fabstir-llm-node binary separately
2. Run `fabstir-host serve` directly on your host machine
3. Adjust ports and paths accordingly

### Q: Will this work on Windows/macOS?

**A**: Yes, if Docker Desktop is installed. The browser UI works the same on all platforms.

### Q: Can I manage multiple nodes?

**A**: Not in v1.0. This implementation manages a single node. Multi-node support is a future enhancement.

### Q: What if the management server crashes?

**A**: The inference node (fabstir-llm-node) continues running independently. Restart management server with `./start-management-server.sh`.

### Q: Can I access this from another computer?

**A**: Not recommended. Use SSH tunneling instead:
```bash
ssh -L 3001:localhost:3001 user@remote-server
```

### Q: Does this work with production nodes?

**A**: Yes, but **don't expose port 3001 publicly**. Use SSH tunnel or VPN for remote access.

### Q: How do I know if it's working?

**A**: Check these indicators:
- ✅ `curl http://localhost:3001/health` returns `{"status":"ok"}`
- ✅ Browser UI loads at `http://localhost:3000/node-management-enhanced`
- ✅ WebSocket shows "Connected" status
- ✅ Clicking "Refresh Status" updates immediately

---

## Additional Resources

- **API Reference**: [API_REFERENCE.md](./API_REFERENCE.md)
- **Docker Deployment**: [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)
- **Getting Started**: [GETTING_STARTED.md](./GETTING_STARTED.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Implementation Plan**: [../../docs/IMPLEMENTATION-HOST-API.md](../../docs/IMPLEMENTATION-HOST-API.md)

---

**Document Version**: v1.0
**Last Updated**: January 2025
**Status**: Complete
**Maintainer**: Fabstir Development Team
