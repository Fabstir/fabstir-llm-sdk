# Ubuntu GPU Host Setup Guide

**For: Ubuntu 22.04 LTS + NVIDIA GTX 4090**
**Target: Production host node on Fabstir LLM Network**
**Network: Base Sepolia Testnet**
**Model: tiny-vicuna-1b.q4_k_m.gguf (already registered)**

---

## Prerequisites ✅

You mentioned you have:
- ✅ Ubuntu 22.04 LTS installed
- ✅ RAID 1 volume healthy and syncing
- ✅ NVIDIA 580.95.05 driver + CUDA 13.0
- ✅ Docker and GPU stack ready
- ✅ Static IP address (accessible on internet)
- ✅ SSH access from Windows 11 PC

---

## What You're Deploying

**Repository**: `fabstir-llm-node` (Rust server software)
- NOT `fabstir-llm-sdk` (TypeScript client library)

**Branch**: Main/default branch (includes v8.3.5)
- Includes: Multi-chain, encryption, host-side RAG, ONNX embeddings

**SDK Compatibility**:

**PRIMARY**: Your **UI3 production app** uses:
- ✅ **fabstir-sdk-core-1.3.36.tgz** (tarball)
- ✅ This node (v8.3.5) is compatible with SDK v1.3.36
- ✅ Protocol: WebSocket with encryption, multi-chain, basic RAG

**FUTURE**: Your **UI4 app** (not yet deployed) will use:
- SDK `feature/rag-integration` branch with SessionGroupManager
- Same node, adds client-side organization (projects, chat sessions)

**Key Point**:
- Your **deployed UI3** (SDK v1.3.36) will connect to this node ✅
- RAG features (uploadVectors, searchVectors) available in both SDK v1.3.36 and node v8.3.5
- No node changes needed when you deploy UI4 later

---

## Phase 1: System Verification (5 minutes)

Run these commands on your Ubuntu server to verify the system is ready:

```bash
# 1. Check Ubuntu version
lsb_release -a
# Expected: Ubuntu 22.04.x LTS

# 2. Verify NVIDIA driver
nvidia-smi
# Expected: Driver Version: 580.95.05, CUDA Version: 13.0

# 3. Verify Docker GPU access
docker run --rm --gpus all nvidia/cuda:12.0-base-ubuntu22.04 nvidia-smi
# Should show your GTX 4090

# 4. Check Docker Compose
docker compose version
# If missing: sudo apt install docker-compose-plugin

# 5. Check disk space
df -h /
# Ensure at least 100GB free for models

# 6. Check open ports (should be available)
sudo ss -tulpn | grep -E ':(8080|9000)'
# Should return empty (ports not in use)

# 7. Get your server's public IP
curl -4 ifconfig.me
# This is the IP you'll use for the node URL
```

---

## Phase 2: Clone fabstir-llm-node Repository (5 minutes)

**IMPORTANT**: You're deploying the **node** (fabstir-llm-node), not the SDK. The node is the Rust server software that runs on your Ubuntu machine. The SDK (fabstir-llm-sdk) is what clients use to connect to your node.

**Branch**: Use the **main/default branch** of fabstir-llm-node, which includes v8.3.5 with:
- ✅ Multi-chain support (Base Sepolia + opBNB)
- ✅ End-to-end encryption
- ✅ Host-side RAG (uploadVectors, searchVectors, askWithContext)
- ✅ ONNX embedding model for vector search

**SDK Compatibility**: This node works with:
- ✅ SDK `main` branch (UI3 - currently deployed in production)
- ✅ SDK `feature/rag-integration` branch (UI4 - future, with SessionGroupManager)

```bash
# 1. Install git if not already installed
sudo apt install git -y

# 2. Create directory for the node
mkdir -p ~/fabstir
cd ~/fabstir

# 3. Clone the fabstir-llm-node repository (NOT the SDK!)
git clone https://github.com/fabstir/fabstir-llm-node.git
cd fabstir-llm-node

# 4. Verify you're on the correct branch (should be main or master)
git branch
# Expected: * main (or * master)

# 5. Check the current commit and version
git log --oneline -1
# Should show recent commit

# 6. Verify you're in the right directory
pwd
# Should output: /home/YOUR_USER/fabstir/fabstir-llm-node

# 7. List directory contents
ls -la
# Should see: Dockerfile, Cargo.toml, src/, .env.example, etc.
# Should NOT see: package.json, packages/, apps/ (those are SDK files)
```

---

## Phase 3: Download Model File (10 minutes)

Since you're already registered with tiny-vicuna-1b, we need to download that specific model:

```bash
# 1. Create models directory
mkdir -p models
cd models

# 2. Download tiny-vicuna-1b model
# Model: CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
wget https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf

# 3. Verify download
ls -lh tiny-vicuna-1b.q4_k_m.gguf
# Expected: ~600MB file size

# 4. Calculate checksum (for verification)
sha256sum tiny-vicuna-1b.q4_k_m.gguf

# 5. Return to node directory
cd ..
pwd
# Should be back in /home/YOUR_USER/fabstir/fabstir-llm-node
```

**Note**: If you want to upgrade to OpenAI OSS 20B later, just download that model and update the configuration - no code changes needed!

---

## Phase 4: Environment Configuration (10 minutes)

### Step 1: Create Base Environment File

```bash
# Copy example environment file
cp .env.example .env

# Edit with nano (or vim if you prefer)
nano .env
```

**Paste this configuration** (replace YOUR_HOST_PRIVATE_KEY with your registered host's private key):

```bash
# ==================================
# FABSTIR LLM NODE CONFIGURATION
# Base Sepolia Testnet
# ==================================

# Node Network Configuration
P2P_PORT=9000
API_PORT=8080

# Encryption Configuration (CRITICAL)
# Use your registered host's private key (0x + 64 hex characters = 66 total)
HOST_PRIVATE_KEY=YOUR_HOST_PRIVATE_KEY_HERE

# Session key TTL (1 hour = 3600 seconds)
SESSION_KEY_TTL_SECONDS=3600

# Chain Configuration
DEFAULT_CHAIN_ID=84532

# RPC URLs
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR

# Logging
RUST_LOG=info,fabstir_llm_node=debug

# Model Configuration
MODEL_PATH=/app/models/tiny-vicuna-1b.q4_k_m.gguf
MODEL_NAME=tiny-vicuna-1b

# GPU Configuration
CUDA_VISIBLE_DEVICES=0
```

**Save and exit**: `Ctrl+X`, then `Y`, then `Enter`

### Step 2: Create Contracts Environment File

```bash
# Copy example contracts file
cp .env.contracts.example .env.contracts

# Edit contracts configuration
nano .env.contracts
```

**Paste this configuration** (uses Base Sepolia testnet contracts):

```bash
# ====================================
# CONTRACT ADDRESSES - BASE SEPOLIA
# Source: fabstir-llm-sdk/.env.test
# Last Updated: 2025-01-28
# ====================================

# Core Contracts
CONTRACT_JOB_MARKETPLACE=0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E
CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
CONTRACT_NODE_REGISTRY=0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6
CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776
CONTRACT_MODEL_REGISTRY=0x92b2De840bB2171203011A6dBA928d855cA8183E

# Token Contracts
CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Network
CHAIN_ID=84532
DEFAULT_CHAIN=baseSepolia
```

**Save and exit**: `Ctrl+X`, then `Y`, then `Enter`

### Step 3: Verify Configuration

```bash
# Check that .env exists and has correct format
cat .env | grep -E "HOST_PRIVATE_KEY|P2P_PORT|API_PORT|DEFAULT_CHAIN_ID"

# Check that .env.contracts exists
cat .env.contracts | grep CONTRACT_JOB_MARKETPLACE

# SECURITY CHECK: Never commit these files!
# They should already be in .gitignore, but verify:
git status .env .env.contracts
# Should say: "nothing to commit" or "untracked files" (not staged)
```

---

## Phase 5: Create Docker Compose Configuration (5 minutes)

The repository might have a docker-compose.yml, but we'll create our production version:

```bash
# Create production docker-compose file
nano docker-compose.prod.yml
```

**Paste this configuration**:

```yaml
version: '3.8'

services:
  fabstir-node:
    build:
      context: .
      dockerfile: Dockerfile.cuda
    container_name: llm-node-prod-1
    restart: unless-stopped

    # GPU access
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

    # Port mappings
    ports:
      - "8080:8080"  # API port
      - "9000:9000"  # P2P port

    # Volume mounts
    volumes:
      - ./models:/app/models:ro  # Models directory (read-only)
      - node-data:/app/data       # Persistent data

    # Environment files
    env_file:
      - .env
      - .env.contracts

    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  node-data:
    driver: local
```

**Save and exit**: `Ctrl+X`, then `Y`, then `Enter`

---

## Phase 6: Build Docker Image (15 minutes)

```bash
# This will take 10-15 minutes depending on your internet speed and CPU

# Build the Docker image with CUDA support
docker build -f Dockerfile.cuda -t fabstir-node:latest .

# Monitor the build progress
# You should see:
# - Rust dependencies downloading
# - CUDA libraries configuring
# - Binary compilation
# - Final image creation

# Verify image was created
docker images | grep fabstir-node
# Expected: fabstir-node   latest   ...   X GB   ...
```

**Troubleshooting**:
- If build fails with "out of memory": Increase Docker memory limit or add swap space
- If build fails with CUDA errors: Check Dockerfile.cuda for CUDA version compatibility
- If build is too slow: Consider using pre-built binary instead

---

## Phase 7: Start the Node (2 minutes)

```bash
# Start the node using docker-compose
docker compose -f docker-compose.prod.yml up -d

# Verify container is running
docker compose -f docker-compose.prod.yml ps

# Expected output:
# NAME              COMMAND                  SERVICE         STATUS
# llm-node-prod-1   "/usr/local/bin/fabs…"   fabstir-node    Up X seconds (healthy)

# Check logs in real-time
docker compose -f docker-compose.prod.yml logs -f

# You should see:
# ✅ ONNX embedding model loaded successfully
# ✅ WebSocket server started on 0.0.0.0:8080
# ✅ P2P node listening on /ip4/0.0.0.0/tcp/9000
# 🔖 BUILD VERSION: v8.3.5-rag-response-type-field-2025-11-05
```

**Press `Ctrl+C` to stop following logs** (container keeps running)

---

## Phase 8: Verify Deployment (10 minutes)

### Local Health Checks

```bash
# 1. Check health endpoint
curl http://localhost:8080/health
# Expected: {"status":"healthy"}

# 2. Check version endpoint (v8.3.5+)
curl -s http://localhost:8080/v1/version | jq '.'
# Expected: Full version info with features, chains, etc.

# 3. Verify GPU is accessible
docker exec llm-node-prod-1 nvidia-smi
# Should show your GTX 4090 with CUDA processes

# 4. Check model loaded
docker logs llm-node-prod-1 2>&1 | grep -E "(Model loaded|tiny-vicuna)"
# Expected: Model loaded successfully

# 5. Check ONNX embedding model (for RAG)
docker logs llm-node-prod-1 2>&1 | grep "Embedding model manager initialized"
# Expected: ✅ Embedding model manager initialized

# 6. Verify WebSocket is listening
curl -i http://localhost:8080/ws
# Expected: HTTP 426 Upgrade Required (this is correct - WebSocket needs upgrade)
```

### Container Resource Check

```bash
# Check container resource usage
docker stats llm-node-prod-1 --no-stream

# Expected output:
# CONTAINER         CPU %     MEM USAGE / LIMIT     MEM %     NET I/O
# llm-node-prod-1   5-15%     2-4GB / 16GB         15-25%    ...

# Check GPU utilization
watch -n 1 nvidia-smi
# Should show fabstir-llm-node process using GPU memory
# Press Ctrl+C to exit watch
```

---

## Phase 9: Firewall Configuration (5 minutes)

```bash
# Check current firewall status
sudo ufw status

# If inactive, configure and enable:
# 1. Allow SSH (IMPORTANT - don't lock yourself out!)
sudo ufw allow 22/tcp

# 2. Allow API port (for client connections)
sudo ufw allow 8080/tcp

# 3. Allow P2P port (for node network)
sudo ufw allow 9000/tcp

# 4. Enable firewall
sudo ufw enable

# 5. Verify configuration
sudo ufw status numbered

# Expected output:
# Status: active
#
# [1] 22/tcp         ALLOW IN    Anywhere
# [2] 8080/tcp       ALLOW IN    Anywhere
# [3] 9000/tcp       ALLOW IN    Anywhere
```

---

## Phase 10: External Testing (5 minutes)

From your **Windows 11 PC** (not the Ubuntu server), test external access:

### From PowerShell on Windows:

```powershell
# Replace YOUR_SERVER_IP with your actual static IP

# 1. Test health endpoint
curl http://YOUR_SERVER_IP:8080/health

# 2. Test version endpoint
curl http://YOUR_SERVER_IP:8080/v1/version

# 3. Test WebSocket endpoint (should get upgrade required)
curl -i http://YOUR_SERVER_IP:8080/ws
```

**If these work, your node is publicly accessible!** ✅

### Test with SDK Client

Back on your **Ubuntu server**, you can run a quick SDK test:

```bash
# This assumes you have the fabstir-llm-sdk on your Windows PC
# From Windows PowerShell, navigate to the SDK directory and run:

# cd C:\path\to\fabstir-llm-sdk
# pnpm test packages/sdk-core/tests/integration/production-flow.test.ts
```

Or create a simple test script on the Ubuntu server:

```bash
# Create a simple WebSocket test script
cat > test-websocket.sh << 'EOF'
#!/bin/bash
echo "Testing WebSocket connection to localhost:8080/ws"
wscat -c ws://localhost:8080/ws
EOF

# Make executable
chmod +x test-websocket.sh

# Install wscat if not available
sudo npm install -g wscat

# Run test
./test-websocket.sh
```

---

## Phase 11: Monitoring Setup (Optional, 10 minutes)

### Setup Log Rotation

```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/fabstir-node
```

**Paste**:

```
/var/log/fabstir-node/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
}
```

### Create Monitoring Script

```bash
# Create monitoring script
cat > ~/monitor-node.sh << 'EOF'
#!/bin/bash
echo "=== Fabstir Node Status ==="
echo "Container Status:"
docker compose -f ~/fabstir/fabstir-llm-node/docker-compose.prod.yml ps

echo -e "\nHealth Check:"
curl -s http://localhost:8080/health | jq '.'

echo -e "\nVersion:"
curl -s http://localhost:8080/v1/version | jq -r '.build'

echo -e "\nGPU Status:"
nvidia-smi --query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total --format=csv

echo -e "\nContainer Resources:"
docker stats llm-node-prod-1 --no-stream
EOF

chmod +x ~/monitor-node.sh

# Run monitoring script
~/monitor-node.sh
```

### Setup Cron Job for Health Monitoring

```bash
# Edit crontab
crontab -e

# Add this line (checks health every 5 minutes and logs to file):
*/5 * * * * curl -sf http://localhost:8080/health > /dev/null || echo "$(date): Health check failed" >> /var/log/fabstir-node-health.log
```

---

## Post-Deployment Checklist

Mark these off as you verify:

- [ ] Container running (`docker ps` shows llm-node-prod-1 as "Up")
- [ ] Health endpoint responds (`curl localhost:8080/health` returns healthy)
- [ ] Version endpoint returns v8.3.5+ (`curl localhost:8080/v1/version`)
- [ ] GPU detected in container (`docker exec llm-node-prod-1 nvidia-smi`)
- [ ] Model loaded (check logs for "Model loaded successfully")
- [ ] ONNX embedding model loaded (check logs for "Embedding model manager")
- [ ] Firewall configured (ports 22, 8080, 9000 allowed)
- [ ] External access works (test from Windows PC)
- [ ] WebSocket accepts connections (wscat test)
- [ ] Monitoring script works (`~/monitor-node.sh`)

---

## Next Steps

### 1. Test with SDK Client

From your Windows PC with the SDK installed:

```typescript
// Test connection to your new node
const sdk = new FabstirSDKCore({
  mode: 'production',
  chainId: ChainId.BASE_SEPOLIA,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
  contractAddresses: { /* ... */ }
});

await sdk.authenticate(privateKey);

const sessionManager = await sdk.getSessionManager();
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://YOUR_SERVER_IP:8080',  // ← Your Ubuntu server
  jobId: 123n,
  modelName: 'tiny-vicuna-1b',
  chainId: ChainId.BASE_SEPOLIA
});

// Send a test prompt
const response = await sessionManager.sendPrompt(sessionId, 'Hello, world!');
console.log('Response:', response);
```

### 2. Monitor Performance

```bash
# Watch real-time logs
docker compose -f ~/fabstir/fabstir-llm-node/docker-compose.prod.yml logs -f

# Watch GPU utilization
watch -n 1 nvidia-smi

# Check session activity
docker logs llm-node-prod-1 2>&1 | grep -E "(session_init|prompt|response)"
```

### 3. Upgrade to Larger Model (Future)

When you're ready to deploy OpenAI OSS 20B:

```bash
# 1. Download new model
cd ~/fabstir/fabstir-llm-node/models
wget [URL_TO_OPENAI_OSS_20B_GGUF]

# 2. Update .env configuration
nano ~/fabstir/fabstir-llm-node/.env
# Change: MODEL_PATH=/app/models/openai-oss-20b.q4_k_m.gguf
# Change: MODEL_NAME=openai-oss-20b

# 3. Restart container
cd ~/fabstir/fabstir-llm-node
docker compose -f docker-compose.prod.yml restart

# 4. Verify new model loaded
docker logs llm-node-prod-1 2>&1 | grep "Model loaded"
```

### 4. Setup SSL/TLS (Recommended for Production)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (requires domain name)
sudo certbot --nginx -d your-domain.com

# Configure nginx reverse proxy (see DEPLOYMENT.md for full config)
```

### 5. Backup Configuration

```bash
# Create backup script
cat > ~/backup-fabstir-node.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=~/fabstir-backups
mkdir -p $BACKUP_DIR

# Backup configuration files
cp ~/fabstir/fabstir-llm-node/.env $BACKUP_DIR/.env.$(date +%Y%m%d)
cp ~/fabstir/fabstir-llm-node/.env.contracts $BACKUP_DIR/.env.contracts.$(date +%Y%m%d)
cp ~/fabstir/fabstir-llm-node/docker-compose.prod.yml $BACKUP_DIR/docker-compose.prod.yml.$(date +%Y%m%d)

echo "Backup completed: $BACKUP_DIR"
ls -lh $BACKUP_DIR
EOF

chmod +x ~/backup-fabstir-node.sh

# Run backup
~/backup-fabstir-node.sh

# Add to crontab (weekly backup every Sunday at 2 AM)
# crontab -e
# Add: 0 2 * * 0 ~/backup-fabstir-node.sh
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker compose -f docker-compose.prod.yml logs

# Common issues:
# 1. Port already in use
sudo ss -tulpn | grep -E ':(8080|9000)'
# If ports are in use, stop conflicting services

# 2. GPU not accessible
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
# If this fails, check nvidia-container-toolkit installation

# 3. Missing environment variables
docker compose -f docker-compose.prod.yml config
# Verify all variables are correctly set
```

### Model Not Loading

```bash
# Check if model file exists
docker exec llm-node-prod-1 ls -lh /app/models/

# Check model permissions
ls -lh ~/fabstir/fabstir-llm-node/models/

# Check model path in configuration
docker exec llm-node-prod-1 env | grep MODEL_PATH

# Re-download model if corrupted
cd ~/fabstir/fabstir-llm-node/models
rm tiny-vicuna-1b.q4_k_m.gguf
wget https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf
```

### WebSocket Connection Fails

```bash
# Check if WebSocket server is running
docker logs llm-node-prod-1 2>&1 | grep "WebSocket server"

# Test locally first
wscat -c ws://localhost:8080/ws

# If local works but external doesn't, check firewall:
sudo ufw status
sudo ufw allow 8080/tcp

# Check nginx reverse proxy (if applicable)
sudo nginx -t
```

### GPU Not Detected

```bash
# Verify NVIDIA runtime
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# If this fails:
# 1. Check nvidia-container-toolkit
dpkg -l | grep nvidia-container-toolkit

# 2. Restart Docker daemon
sudo systemctl restart docker

# 3. Rebuild container
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

### High Memory Usage

```bash
# Check container memory limits
docker stats llm-node-prod-1

# Adjust memory limits in docker-compose.prod.yml
# Add under deploy.resources.limits:
#   memory: 8G

# Restart with new limits
docker compose -f docker-compose.prod.yml up -d
```

---

## Useful Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart node
docker compose -f docker-compose.prod.yml restart

# Stop node
docker compose -f docker-compose.prod.yml down

# Start node
docker compose -f docker-compose.prod.yml up -d

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Check node status
~/monitor-node.sh

# Check GPU utilization
nvidia-smi

# Check container resources
docker stats llm-node-prod-1 --no-stream

# Execute command in container
docker exec llm-node-prod-1 [command]

# Open shell in container
docker exec -it llm-node-prod-1 bash
```

---

## Support

If you encounter issues:

1. **Check logs first**: `docker compose -f docker-compose.prod.yml logs`
2. **Run health check**: `curl localhost:8080/health`
3. **Check documentation**: `docs/node-reference/TROUBLESHOOTING.md`
4. **GitHub Issues**: https://github.com/fabstir/fabstir-llm-node/issues

---

## Security Reminders

- ✅ **Keep HOST_PRIVATE_KEY secret** - never commit to git
- ✅ **Use firewall** - only expose necessary ports (22, 8080, 9000)
- ✅ **Regular updates** - keep Ubuntu, Docker, NVIDIA drivers updated
- ✅ **Backup configuration** - run weekly backups
- ✅ **Monitor logs** - watch for unusual activity
- ✅ **Rotate keys** - quarterly key rotation recommended
- ✅ **Use SSL/TLS** - configure HTTPS for production

---

**Estimated total setup time**: 60-70 minutes

**Success criteria**: All checkboxes in Post-Deployment Checklist marked ✅

Good luck with your deployment! 🚀
