# Docker Deployment Guide

> Complete guide for deploying Fabstir Host CLI in Docker for local testing

## Overview

This guide documents the **validated** Docker deployment workflow for running a Fabstir host node locally. This setup has been tested and confirmed working.

## Prerequisites

1. **Docker** with GPU support (optional, for CUDA acceleration)
2. **fabstir-llm-node binary** (Rust binary, ~800MB)
3. **Model files** (GGUF format, e.g., TinyVicuna-1B)
4. **Environment variables** from `.env.test` (project root)

## Directory Structure

```
~/dev/Fabstir/fabstir-llm-marketplace/
├── fabstir-llm-sdk/                    # This repo
│   ├── .env.test                       # Contract addresses & config (READ-ONLY)
│   ├── start-fabstir-docker.sh         # Container startup script
│   ├── register-host.sh                # Registration script
│   └── packages/host-cli/
│       ├── Dockerfile                  # Production Dockerfile
│       └── dist/                       # Compiled TypeScript
└── fabstir-llm-node/                   # Rust node binary
    ├── target/release/fabstir-llm-node # Binary (~800MB)
    └── models/                         # GGUF model files
        └── tiny-vicuna-1b.q4_k_m.gguf
```

## Step-by-Step Setup

### Step 1: Build Docker Image

```bash
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk

# Build image with all fixes (includes INTERNAL_PORT, setsid daemon mode)
docker build --no-cache -f packages/host-cli/Dockerfile -t fabstir-host-cli:local .
```

**Build time**: ~60 seconds

**What this includes**:
- ✅ Node.js 20 on NVIDIA CUDA 12.2 base (GPU support)
- ✅ S5 storage polyfills (IndexedDB, WebSocket)
- ✅ INTERNAL_PORT=8083 environment variable
- ✅ Direct port mapping (8083:8083, no translation)
- ✅ Daemon mode with parent-stays-alive fix for Docker

### Step 2: Start Container

```bash
# Clean slate - remove old container if exists
docker stop fabstir-host-test 2>/dev/null && docker rm fabstir-host-test 2>/dev/null

# Start fresh container
bash start-fabstir-docker.sh
```

**What `start-fabstir-docker.sh` does**:
- Sources `.env.test` for all environment variables
- Mounts fabstir-llm-node binary at `/usr/local/bin/fabstir-llm-node`
- Mounts model directory at `/models`
- Maps ports: `8083:8083` (API), `9000:9000` (P2P), `3001:3001` (Management)
- Sets `HOST_PRIVATE_KEY` from `TEST_HOST_2_PRIVATE_KEY`
- Runs container in background with `while true; do sleep 3600; done`

### Step 3: Register Host

```bash
bash register-host.sh
```

**What happens**:
1. Initializes SDK with Base Sepolia contracts
2. Checks FAB/ETH balance (min: 1000 FAB, 0.001 ETH)
3. Starts temporary node for verification (on port 8083)
4. Verifies API is accessible at `http://localhost:8083`
5. Approves 1000 FAB for NodeRegistry contract
6. Registers host with model: `CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf`
7. Saves config to `/root/.fabstir/config.json` with `inferencePort: 8083`
8. Stops temporary node

**Expected output**:
```
✅ Model loaded
✅ P2P started
✅ API started
Verifying internal API at http://localhost:8083...
✅ API is accessible
✅ Node started (PID: 33)
✅ Registration successful!
Transaction: 0x...
Host Address: 0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c
Staked Amount: 1000.0 FAB
```

### Step 4: Start Node (Foreground Mode)

```bash
docker exec -it fabstir-host-test sh -c 'node --require /app/polyfills.js dist/index.js start'
```

**Expected output**:
```
🚀 Starting Fabstir host node...
  Internal Port: 8083
  Public URL: http://localhost:8083
  Models: CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
  Waiting for node to start (monitoring logs)...
   ✅ Model loaded
   ✅ P2P started
   ✅ API started
  Verifying internal API at http://localhost:8083...
   ✅ API is accessible

✅ Node started successfully (PID: 256)
Monitor logs: fabstir-host logs
Stop node: fabstir-host stop

🔄 Running in foreground mode (Ctrl+C to stop)
```

**Node is now running!** You'll see live P2P connection events.

### Step 5: Verify Node Health

In a **separate terminal**:

```bash
# Test from host machine (mapped port)
curl http://localhost:8083/health

# Test from inside container
docker exec fabstir-host-test curl -s http://localhost:8083/health
```

**Expected response**:
```json
{
  "status": "healthy",
  "model": "TinyVicuna-1B",
  "uptime": 123
}
```

## Port Mapping

| Service | Port | Description |
|---------|------|-------------|
| **fabstir-llm-node** | 8083 | Inference API (internal & external) |
| **P2P networking** | 9000 | LibP2P communication |
| **Management API** | 3001 | Browser-based control (HTTP + WebSocket) |

**Port Configuration**:
- All ports use **direct mapping** (no translation): `8083:8083`, `9000:9000`, `3001:3001`
- `API_PORT=8083` - fabstir-llm-node binds to port 8083
- `INTERNAL_PORT=8083` - CLI uses port 8083
- `publicUrl=http://localhost:8083` - Registered URL (change to public IP for production)

## Daemon Mode (Background)

To run the node in background mode, use the `--daemon` flag:

```bash
# Start daemon mode
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js start --daemon'

# Verify it's running (wait a few seconds for startup)
sleep 5
docker exec fabstir-host-test ps aux | grep fabstir-llm-node

# Check PID file
docker exec fabstir-host-test cat /root/.fabstir/host.pid

# View logs
docker exec fabstir-host-test sh -c 'tail -f /root/.fabstir/logs/*.out.log'

# Stop daemon
docker exec fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js stop'
```

**How daemon mode works in Docker**:
- Child process spawned with `detached: true` (creates new process group)
- stdio redirected to log files at `/root/.fabstir/logs/` (required for P2P initialization)
- **Parent process stays alive** - In Docker containers, even detached children die when parent exits
- Parent waits indefinitely but remains idle, keeping child alive
- PID tracked in `/root/.fabstir/host.pid` for stop command

## Browser-Based Management

### Overview

In addition to CLI commands, you can control your Fabstir host node through a web browser interface. This provides:

- **Real-time log streaming** via WebSocket
- **One-click start/stop** node controls
- **Visual status monitoring** with uptime and PID
- **Live host discovery** to see active network nodes
- **Registration management** through UI forms

**Use Case**: Local development and testing with visual feedback. Production deployments should continue using CLI commands for reliability and scriptability.

### Starting the Management Server

**Step 1: Ensure container is running**
```bash
# Start container (if not already running)
bash start-fabstir-docker.sh

# Verify container is up
docker ps | grep fabstir-host-test
```

**Step 2: Start management server inside container**
```bash
# Start on default port 3001
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --port 3001'

# Wait for server to start
sleep 2

# Verify server is running
curl http://localhost:3001/health
# Expected: {"status":"ok","uptime":...}
```

**Step 3: Access browser UI**
```bash
# Navigate to the test harness at:
# http://localhost:3000/node-management-enhanced

# The management UI will automatically connect to http://localhost:3001
```

### Management Server Features

**REST API Endpoints** (Port 3001):
- `GET /health` - Server health check
- `GET /api/status` - Node status (running/stopped, PID, uptime)
- `GET /api/discover-nodes` - Discover all active hosts on network
- `POST /api/start` - Start inference node
- `POST /api/stop` - Stop inference node
- `POST /api/register` - Register host on blockchain
- `POST /api/unregister` - Unregister host from blockchain
- `POST /api/add-stake` - Add more FAB tokens to stake
- `POST /api/withdraw-earnings` - Withdraw accumulated earnings
- `POST /api/update-models` - Update supported models list
- `POST /api/update-metadata` - Update host metadata

**WebSocket API** (Port 3001):
- `WS /ws/logs` - Real-time log streaming (stdout/stderr)
- Historical logs sent on connection (last 50 lines)
- Auto-reconnection on network issues

### Browser Workflow Example

```bash
# 1. Start Docker container
bash start-fabstir-docker.sh

# 2. Start management server
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --port 3001'

# 3. Start Next.js test harness (in separate terminal)
cd apps/harness
pnpm dev
# Access at http://localhost:3000

# 4. Open browser to:
# http://localhost:3000/node-management-enhanced

# 5. Use UI to:
#    - View node status
#    - Start/stop node with one click
#    - Monitor live logs
#    - Register/unregister host
#    - Discover active network nodes
```

### Security Considerations

**For Localhost Development Only**:
- Management server binds to `0.0.0.0:3001` inside container
- Port mapping restricts access to host machine only (`localhost:3001`)
- CORS limited to `http://localhost:3000` (Next.js harness)
- Optional API key authentication via `--api-key` flag

**Production Deployment**:
For production servers, **DO NOT** expose port 3001 publicly:
- Remove `-p 3001:3001` from Docker run command
- Use CLI commands via SSH for remote management
- Or use SSH tunneling: `ssh -L 3001:localhost:3001 user@server`

### Management Server Options

```bash
# Default options
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve'

# Custom port
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --port 3002'

# With API key authentication
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --api-key mySecretKey123'

# Custom CORS origins
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --cors "http://localhost:3000,http://localhost:3001"'
```

### Stopping the Management Server

```bash
# Find management server process
docker exec fabstir-host-test ps aux | grep "serve"

# Kill by process name
docker exec fabstir-host-test pkill -f "dist/index.js serve"

# Or restart container (stops all processes)
docker restart fabstir-host-test
```

### Troubleshooting Browser Management

**Port 3001 not accessible**:
```bash
# Check if management server is running
docker exec fabstir-host-test ps aux | grep "serve"

# Check if port is mapped
docker port fabstir-host-test 3001
# Should show: 3001/tcp -> 0.0.0.0:3001

# Test from host machine
curl http://localhost:3001/health
```

**WebSocket connection fails**:
```bash
# Check browser console (F12) for errors
# Verify WebSocket URL: ws://localhost:3001/ws/logs

# Test WebSocket endpoint exists
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:3001/ws/logs
# Should return: HTTP/1.1 101 Switching Protocols
```

**UI shows "Management API client not initialized"**:
- Wait 2-3 seconds for async initialization
- Check browser console for errors
- Verify management server is running (curl health endpoint)
- Ensure CORS allows `http://localhost:3000`

## Common Commands

```bash
# Check running processes
docker exec fabstir-host-test ps aux | grep fabstir-llm-node

# Check listening ports
docker exec fabstir-host-test netstat -tlnp | grep LISTEN

# View config
docker exec fabstir-host-test cat /root/.fabstir/config.json

# Kill node
docker exec fabstir-host-test pkill -f fabstir-llm-node

# Check environment variables
docker exec fabstir-host-test env | grep -E 'INTERNAL_PORT|API_PORT|HOST_PRIVATE_KEY'

# Restart container
docker restart fabstir-host-test
```

## Troubleshooting

### Node won't start - "Port already in use"

**Cause**: Previous node still running from registration

**Fix**:
```bash
docker exec fabstir-host-test pkill -f fabstir-llm-node
sleep 2
# Try start command again
```

### API not accessible - "Connection refused"

**Cause**: Node bound to wrong port or port mapping incorrect

**Fix**:
```bash
# Check what port the process is using
docker exec fabstir-host-test cat /proc/$(docker exec fabstir-host-test pgrep fabstir-llm-node)/environ | tr '\0' '\n' | grep API_PORT

# Should show: API_PORT=8083
# If it shows a different port, rebuild Docker image with correct configuration
```

### Registration fails - "Node not accessible at public URL"

**Cause**: Registration trying to verify `http://localhost:8083` inside container

**Fix**: Should be fixed in latest build (uses `INTERNAL_PORT`). If still failing:
```bash
# Verify INTERNAL_PORT is set
docker exec fabstir-host-test env | grep INTERNAL_PORT
# Should show: INTERNAL_PORT=8083
```

### Daemon mode - Process dies immediately

**Cause**: Parent process exited, killing detached child

**Fix**: Ensure you're using the latest code with parent-stays-alive fix. Rebuild if needed:
```bash
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk
docker build --no-cache -f packages/host-cli/Dockerfile -t fabstir-host-cli:local .
```

Verify the fix is present:
```bash
docker exec fabstir-host-test grep -n "Parent process will stay alive" /app/dist/commands/start.js
# Should show line with this message
```

## Files Reference

### start-fabstir-docker.sh

```bash
#!/bin/bash
# Start Fabstir Host Docker Container with mounted binary and GPU support

# Load environment variables from .env.test
set -a
source ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test
set +a

docker run -d \
  --name fabstir-host-test \
  --gpus all \
  -p 8083:8083 \
  -p 9000:9000 \
  -p 3001:3001 \
  -v ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-node/models:/models \
  -v ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-node/target/release/fabstir-llm-node:/usr/local/bin/fabstir-llm-node:ro \
  -v ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test:/app/.env.test:ro \
  --env-file ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test \
  -e HOST_PRIVATE_KEY="${TEST_HOST_2_PRIVATE_KEY}" \
  --entrypoint /bin/sh \
  fabstir-host-cli:local \
  -c "while true; do sleep 3600; done"
```

### register-host.sh

```bash
#!/bin/bash
# Register Fabstir Host

# Use TEST_HOST_2_PRIVATE_KEY from .env.test inside container
docker exec -it fabstir-host-test sh -c 'node --require /app/polyfills.js dist/index.js register --url http://localhost:8083 --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" --stake 1000 --private-key $TEST_HOST_2_PRIVATE_KEY'
```

## Environment Variables

The following environment variables are set in the container:

| Variable | Value | Source |
|----------|-------|--------|
| `INTERNAL_PORT` | 8083 | Dockerfile |
| `API_PORT` | 8083 | Dockerfile |
| `P2P_PORT` | 9000 | Dockerfile |
| `SKIP_S5_STORAGE` | true | Dockerfile |
| `HOST_PRIVATE_KEY` | `$TEST_HOST_2_PRIVATE_KEY` | start-fabstir-docker.sh |
| `CONTRACT_*` | Various | .env.test (auto-loaded) |
| `RPC_URL_BASE_SEPOLIA` | Alchemy URL | .env.test |
| `CHAIN_ID` | 84532 | .env.test |

## Complete Workflow Summary

```bash
# 1. Build image (one time)
docker build --no-cache -f packages/host-cli/Dockerfile -t fabstir-host-cli:local .

# 2. Start container
docker stop fabstir-host-test 2>/dev/null && docker rm fabstir-host-test 2>/dev/null
bash start-fabstir-docker.sh

# 3. Register host
bash register-host.sh

# 4. Start node
docker exec -it fabstir-host-test sh -c 'node --require /app/polyfills.js dist/index.js start'

# 5. Test health (in separate terminal)
curl http://localhost:8083/health
```

**Total time**: ~5 minutes (including model load)

## Production Considerations

**For actual production deployment** (not localhost testing):

1. **Use real public IP**: Replace `http://localhost:8083` with `http://<your-ip>:8083`
2. **Configure firewall**: Allow ports 8083 (API) and 9000 (P2P)
3. **Use environment-specific keys**: Don't use `TEST_HOST_2_PRIVATE_KEY` in production
4. **Enable HTTPS**: Use reverse proxy (nginx/caddy) for SSL
5. **Monitor process**: Use systemd/PM2 instead of Docker for better control
6. **Backup config**: Save `/root/.fabstir/config.json` regularly

## Support

- **Issues**: Check fabstir-llm-node logs for Rust errors
- **Docker logs**: `docker logs fabstir-host-test`
- **Process logs**: Inside container at `/root/.fabstir/logs/`
- **Config**: `/root/.fabstir/config.json`

---

Last updated: October 2025
Status: ✅ Validated working setup
