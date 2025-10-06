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
- ✅ INTERNAL_PORT=8080 environment variable
- ✅ Port 8080 → 8083 mapping support
- ✅ Daemon mode with `setsid` for process survival

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
- Maps ports: `8083:8080` (host → container)
- Sets `HOST_PRIVATE_KEY` from `TEST_HOST_2_PRIVATE_KEY`
- Runs container in background with `while true; do sleep 3600; done`

### Step 3: Register Host

```bash
bash register-host.sh
```

**What happens**:
1. Initializes SDK with Base Sepolia contracts
2. Checks FAB/ETH balance (min: 1000 FAB, 0.001 ETH)
3. Starts temporary node for verification (on port 8080 inside container)
4. Verifies API is accessible at `http://localhost:8080` (internal)
5. Approves 1000 FAB for NodeRegistry contract
6. Registers host with model: `CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf`
7. Saves config to `/root/.fabstir/config.json` with `inferencePort: 8080`
8. Stops temporary node

**Expected output**:
```
✅ Model loaded
✅ P2P started
✅ API started
Verifying internal API at http://localhost:8080...
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
  Internal Port: 8080
  Public URL: http://localhost:8083
  Models: CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
  Waiting for node to start (monitoring logs)...
   ✅ Model loaded
   ✅ P2P started
   ✅ API started
  Verifying internal API at http://localhost:8080...
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

# Test from inside container (internal port)
docker exec fabstir-host-test curl -s http://localhost:8080/health
```

**Expected response**:
```json
{
  "status": "healthy",
  "model": "TinyVicuna-1B",
  "uptime": 123
}
```

## Port Mapping Explained

| Location | Port | Description |
|----------|------|-------------|
| Host machine | 8083 | Public-facing port (you access via `localhost:8083`) |
| Docker container | 8080 | Internal port (fabstir-llm-node binds here) |
| `INTERNAL_PORT` env var | 8080 | Tells CLI to use port 8080 inside container |
| `publicUrl` in config | `http://localhost:8083` | External URL for registration |
| `inferencePort` in config | 8080 | Internal port stored in config |

**Why this matters**:
- Docker maps `host:8083` → `container:8080`
- fabstir-llm-node must bind to **8080** inside container
- CLI uses `INTERNAL_PORT` to determine which port to use
- Without `INTERNAL_PORT`, CLI would try to bind to **8083** (from publicUrl) and fail

## Daemon Mode (Background)

### Option 1: Docker Detached Exec (Recommended)

```bash
# Start in Docker's background
docker exec -d fabstir-host-test sh -c 'node --require /app/polyfills.js dist/index.js start > /var/log/fabstir.log 2>&1'

# Check if running
docker exec fabstir-host-test ps aux | grep fabstir-llm-node

# View logs
docker exec fabstir-host-test tail -f /var/log/fabstir.log
```

### Option 2: CLI Daemon Flag (Uses setsid)

```bash
# Start with --daemon flag
docker exec fabstir-host-test sh -c 'node --require /app/polyfills.js dist/index.js start --daemon'

# Process runs in new session (survives parent exit via setsid)
```

**How it works**:
- `setsid` wraps fabstir-llm-node in a new session
- Process becomes session leader, detached from parent
- Parent Node.js process can safely exit
- fabstir-llm-node continues running

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

**Cause**: Node bound to wrong port (8083 instead of 8080)

**Fix**:
```bash
# Check what port the process is using
docker exec fabstir-host-test cat /proc/$(docker exec fabstir-host-test pgrep fabstir-llm-node)/environ | tr '\0' '\n' | grep API_PORT

# Should show: API_PORT=8080
# If it shows 8083, config is wrong - rebuild Docker image
```

### Registration fails - "Node not accessible at public URL"

**Cause**: Registration trying to verify `http://localhost:8083` inside container

**Fix**: Should be fixed in latest build (uses `INTERNAL_PORT`). If still failing:
```bash
# Verify INTERNAL_PORT is set
docker exec fabstir-host-test env | grep INTERNAL_PORT
# Should show: INTERNAL_PORT=8080
```

### Daemon mode - Process dies immediately

**Cause**: Old daemon implementation without `setsid`

**Fix**: Rebuild Docker image (includes setsid fix):
```bash
docker build --no-cache -f packages/host-cli/Dockerfile -t fabstir-host-cli:local .
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
  -p 8083:8080 \
  -p 9000:9000 \
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
| `INTERNAL_PORT` | 8080 | Dockerfile |
| `API_PORT` | 8080 | Dockerfile |
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
