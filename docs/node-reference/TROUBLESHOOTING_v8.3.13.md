# Troubleshooting v8.3.13 Network Access Issues

**Date**: 2025-11-08
**Issue**: Health check and WebSocket connections failing after v8.3.13 deployment

## Symptoms

- ✅ Node running successfully (docker logs show it's up)
- ✅ curl from localhost works: `curl http://localhost:8080/health`
- ✅ Inference works locally: `curl -X POST http://localhost:8080/v1/inference ...`
- ❌ Browser health check fails: `http://81.150.166.91:8080/health` (timeout)
- ❌ WebSocket fails: `ws://81.150.166.91:8080/v1/ws` (error 1006)
- **Previous**: Both were working before v8.3.13 deployment

## Quick Diagnostics

Run these commands on the Ubuntu server:

### 1. Check if node is listening on public interface

```bash
# Check what IP addresses the node is listening on
sudo netstat -tlnp | grep 8080
# or
sudo ss -tlnp | grep 8080

# Expected: Should show 0.0.0.0:8080 (all interfaces)
# Bad: Shows 127.0.0.1:8080 (localhost only)
```

### 2. Check Docker port mapping

```bash
# Check docker-compose configuration
cd ~/fabstir-llm-node/deployment/phase-4.3.1
cat docker-compose.phase-4.3.1-final.yml | grep -A 5 ports

# Should show:
# ports:
#   - "8080:8080"
```

### 3. Check firewall status

```bash
sudo ufw status

# Should show:
# 8080/tcp                   ALLOW       Anywhere
```

### 4. Test external accessibility from server

```bash
# Test if the public IP is reachable from the server itself
curl http://81.150.166.91:8080/health

# If this fails, the node isn't listening on the public interface
# If this works, the problem is elsewhere (browser CORS, etc.)
```

### 5. Check Docker container networking

```bash
# Get container ID
docker ps | grep llm-node

# Inspect network settings
docker inspect <container-id> | grep -A 20 NetworkSettings

# Check if ports are mapped
docker port <container-id>
# Should show: 8080/tcp -> 0.0.0.0:8080
```

## Common Causes

### Issue 1: Docker compose file changed

**Problem**: Different docker-compose file might have different port mappings.

**Check**:
```bash
# Find all compose files
find ~/fabstir-llm-node -name "*.yml" -o -name "*.yaml"

# Check which one is running
docker inspect <container-id> | grep com.docker.compose.project.config_files
```

**Fix**:
```bash
# Ensure using correct compose file
cd ~/fabstir-llm-node/deployment/phase-4.3.1
sudo docker-compose -f docker-compose.phase-4.3.1-final.yml down
sudo docker-compose -f docker-compose.phase-4.3.1-final.yml up -d
```

### Issue 2: Node binding to localhost only

**Problem**: Node configuration might have changed to listen only on 127.0.0.1.

**Check**:
```bash
# Check node logs for bind address
sudo docker logs llm-node-prod-1 | grep -i "listening\|bind\|address"
```

**Fix**: Update docker-compose.yml environment variables:
```yaml
environment:
  - HOST=0.0.0.0  # Listen on all interfaces, not 127.0.0.1
  - PORT=8080
```

### Issue 3: Firewall rules reset

**Problem**: UFW rules might have been reset.

**Fix**:
```bash
sudo ufw allow 8080/tcp
sudo ufw reload
sudo ufw status
```

### Issue 4: Docker network mode changed

**Problem**: Container might be in host network mode vs bridge mode.

**Check**:
```bash
docker inspect <container-id> | grep NetworkMode
```

**Fix**: Ensure docker-compose.yml has correct network settings:
```yaml
# For bridge mode (default, recommended)
ports:
  - "8080:8080"

# NOT this (unless you need host mode):
# network_mode: host
```

### Issue 5: CORS configuration missing

**Problem**: v8.3.13 might have different CORS settings than previous version.

**Check node logs**:
```bash
sudo docker logs llm-node-prod-1 | grep -i cors
```

**Potential fix**: Add environment variable to docker-compose.yml:
```yaml
environment:
  - RUST_LOG=info,fabstir_llm_node=debug
  - CORS_ALLOW_ORIGIN=*  # Or specific domain
```

## Step-by-Step Recovery

### Step 1: Verify node is actually running

```bash
sudo docker ps | grep llm-node
sudo docker logs --tail 50 llm-node-prod-1
```

### Step 2: Test from localhost

```bash
curl http://localhost:8080/health
curl http://localhost:8080/v1/version
```

### Step 3: Test from public IP (on server)

```bash
curl http://81.150.166.91:8080/health
```

- If this **fails**: Node is binding to localhost only → Check Issue 2
- If this **succeeds**: Network is fine, browser issue → Check Issue 5

### Step 4: Test WebSocket from server

```bash
# Install websocat if not present
# sudo apt install websocat

# Test WebSocket connection
websocat ws://localhost:8080/v1/ws

# Should connect and wait for messages
# Press Ctrl+C to exit
```

### Step 5: Check if port is actually open externally

```bash
# From another machine (or Windows host), test if port is reachable
# Windows PowerShell:
Test-NetConnection -ComputerName 81.150.166.91 -Port 8080

# Should show: TcpTestSucceeded : True
```

## Expected Configuration (Working Setup)

**docker-compose.phase-4.3.1-final.yml**:
```yaml
services:
  llm-node-prod:
    image: fabstir-llm-node:v8.3.13
    container_name: llm-node-prod-1
    ports:
      - "8080:8080"  # Map host 8080 to container 8080
    environment:
      - RUST_LOG=info,fabstir_llm_node=debug
      - MODEL_PATH=/models/openai_gpt-oss-20b-MXFP4.gguf
      - MODEL_CHAT_TEMPLATE=default
    restart: unless-stopped
```

**Firewall**:
```bash
sudo ufw status
# Should include:
# 8080/tcp                   ALLOW       Anywhere
```

**Netstat output**:
```bash
sudo netstat -tlnp | grep 8080
# Expected:
# tcp6       0      0 :::8080                 :::*                    LISTEN      12345/docker-proxy
```

## Quick Fix Attempt

If all else fails, try a complete restart:

```bash
# 1. Stop everything
cd ~/fabstir-llm-node/deployment/phase-4.3.1
sudo docker-compose -f docker-compose.phase-4.3.1-final.yml down

# 2. Verify firewall
sudo ufw allow 8080/tcp
sudo ufw reload

# 3. Restart container
sudo docker-compose -f docker-compose.phase-4.3.1-final.yml up -d

# 4. Wait 30 seconds for model to load
sleep 30

# 5. Test locally
curl http://localhost:8080/health

# 6. Test externally (from server)
curl http://81.150.166.91:8080/health

# 7. Check logs
sudo docker logs --tail 100 llm-node-prod-1
```

## If Still Not Working

**Collect diagnostics and share**:

```bash
# Network diagnostic bundle
{
  echo "=== Docker Status ==="
  docker ps
  echo ""
  echo "=== Port Mappings ==="
  docker port llm-node-prod-1
  echo ""
  echo "=== Netstat ==="
  sudo netstat -tlnp | grep 8080
  echo ""
  echo "=== Firewall ==="
  sudo ufw status
  echo ""
  echo "=== Container Logs (last 50 lines) ==="
  sudo docker logs --tail 50 llm-node-prod-1
} > /tmp/network-diagnostics.txt

cat /tmp/network-diagnostics.txt
```

Share this output for further troubleshooting.
