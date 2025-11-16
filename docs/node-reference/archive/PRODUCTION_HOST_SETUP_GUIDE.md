# Production Host Setup Guide
## Repeatable Deployment Instructions for Third-Party Host Operators

**⚠️ IMPORTANT**: If you have access to **pre-built binaries** (provided by Fabstir team), use the **SIMPLIFIED GUIDE** instead:
- 📄 `PRODUCTION_HOST_SETUP_SIMPLIFIED.md` - **45-60 minutes** (no compilation!)

This guide is for users who need to build from source or don't have pre-built binaries.

---

**Target Audience**: Anyone wanting to provide their computer as a host on the Platformless AI P2P network

**Estimated Time**: 90-120 minutes (with source compilation) OR 45-60 minutes (with pre-built binary)

**Prerequisites**: See `HOST_MINIMUM_REQUIREMENTS.md` for hardware/software requirements

---

## Before You Begin

### Step 0: Read Requirements Document

**REQUIRED**: Read `HOST_MINIMUM_REQUIREMENTS.md` first to verify you meet:
- ✅ Hardware requirements (NVIDIA GPU with 6GB+ VRAM minimum)
- ✅ Network requirements (static IP or DDNS, ports 8080/9000 accessible)
- ✅ Software requirements (Ubuntu 22.04+, Docker, NVIDIA drivers)
- ✅ Economic requirements (wallet, staking tokens, gas fees)

**If you don't meet the requirements**, do not proceed - the deployment will fail.

---

## Phase 1: System Verification (10 minutes)

### Step 1.1: Check OS Version

```bash
lsb_release -a
```

**Expected**:
```
Description: Ubuntu 22.04.x LTS
Release: 22.04
```

**If different**:
- Ubuntu 20.04: Should work, but 22.04 recommended
- Ubuntu 24.04+: Might work, not officially tested
- Other OS: Check compatibility in requirements doc

### Step 1.2: Verify NVIDIA Driver

```bash
nvidia-smi
```

**Expected**: Output showing:
- Driver Version: 525.x or newer (550.x+ recommended)
- CUDA Version: 12.0 or newer
- Your GPU name and VRAM

**If command not found**:
```bash
# Install NVIDIA driver
sudo apt update
sudo apt install nvidia-driver-550
sudo reboot

# After reboot, verify
nvidia-smi
```

**If VRAM in use**:
- Check what's using it: `nvidia-smi` shows processes at bottom
- Decide if you can stop it or have enough free VRAM
- Minimum free: 6GB for small models, 24GB for large models

### Step 1.3: Install Docker (if not installed)

```bash
# Check if Docker is installed
docker --version
```

**If not installed**:
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Log out and back in (or reboot)
# Verify
docker --version
```

**Expected**: Docker version 20.10+ (24.0+ recommended)

### Step 1.4: Install Docker Compose (if not installed)

```bash
# Check if Docker Compose is installed
docker compose version
```

**If not installed**:
```bash
# Install Docker Compose plugin
sudo apt update
sudo apt install docker-compose-plugin

# Verify
docker compose version
```

**Expected**: Docker Compose version v2.0+ (v2.20+ recommended)

### Step 1.5: Install NVIDIA Container Toolkit

```bash
# Check if installed
dpkg -l | grep nvidia-container-toolkit
```

**If not installed or shows nothing**:
```bash
# Add NVIDIA repository
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install
sudo apt update
sudo apt install -y nvidia-container-toolkit

# Verify
nvidia-ctk --version
```

### Step 1.6: Configure Docker for NVIDIA Runtime

**CRITICAL**: This step addresses the common GPU configuration issue.

```bash
# Configure nvidia-container-toolkit
sudo nvidia-ctk config --set nvidia-container-cli.no-cgroups --in-place

# Update Docker daemon.json
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
    "runtimes": {
        "nvidia": {
            "path": "nvidia-container-runtime",
            "runtimeArgs": []
        }
    },
    "default-runtime": "nvidia"
}
EOF

# Restart Docker
sudo systemctl restart docker

# Verify Docker restarted successfully
sudo systemctl status docker | head -10
```

### Step 1.7: Test GPU Access in Docker

**TEST 1 (Preferred Method)**:
```bash
docker run --rm --runtime=nvidia nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
```

**Expected**: Should show your GPU (same output as host `nvidia-smi`)

**TEST 2 (Alternative Method)**:
```bash
docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
```

**Expected**: Should also show your GPU

**IMPORTANT**:
- ✅ If TEST 1 works: You're good! Proceed to Phase 2.
- ✅ If TEST 2 works: Even better! Both methods supported.
- ⚠️ If TEST 1 works but TEST 2 fails: That's OK, we'll use `runtime: nvidia` in docker-compose.
- ❌ If BOTH fail: See Troubleshooting section below before proceeding.

### Step 1.8: Check Disk Space

```bash
df -h /
```

**Expected**: At least 100GB free (250GB+ recommended)

**If not enough space**:
- Delete unnecessary files
- Expand disk partition
- Add additional storage

### Step 1.9: Check Ports Available

```bash
sudo ss -tulpn | grep -E ':(8080|9000)'
```

**Expected**: Empty output (no processes using these ports)

**If ports are in use**:
- Identify what's using them: `sudo lsof -i :8080` and `sudo lsof -i :9000`
- Stop the conflicting service or choose different ports (requires modifying node config)

### Step 1.10: Get Your Public IP

```bash
curl -4 ifconfig.me
```

**Expected**: Your public IP address (e.g., 203.0.113.50)

**Save this IP** - you'll need it for:
- Node URL configuration
- Testing external access
- Registering with blockchain

---

## Phase 2: Clone and Prepare Repository (5 minutes)

### Step 2.1: Install Git

```bash
sudo apt install git -y
```

### Step 2.2: Create Directory Structure

```bash
mkdir -p ~/fabstir
cd ~/fabstir
```

### Step 2.3: Clone fabstir-llm-node Repository

**IMPORTANT**: This is the **NODE** repository (Rust), NOT the SDK (TypeScript).

```bash
git clone https://github.com/fabstir/fabstir-llm-node.git
cd fabstir-llm-node
```

### Step 2.4: Verify Repository

```bash
# Check branch (should be main or master)
git branch

# Check you're in the right repo
ls -la

# Should see:
# - Dockerfile, Dockerfile.cuda
# - Cargo.toml (Rust project file)
# - src/ (Rust source code)
# - .env.example
# - docker-compose.yml (or similar)

# Should NOT see:
# - package.json, packages/, apps/ (those are SDK files)
```

**If you see package.json**, you cloned the wrong repo! Delete and clone `fabstir-llm-node` instead.

---

## Phase 3: Download Model File (10-30 minutes depending on internet speed)

### Step 3.1: Choose Your Model

**For testing / low VRAM** (6-12GB VRAM):
- Model: `tiny-vicuna-1b.q4_k_m.gguf` (~600MB)
- VRAM: ~1-2GB
- Speed: Very fast
- Quality: Basic but functional

**For production / medium VRAM** (12-16GB VRAM):
- Model: `llama-3-8b-instruct.Q4_K_M.gguf` (~4.5GB)
- VRAM: ~5-6GB
- Speed: Fast
- Quality: Good

**For advanced / high VRAM** (24GB+ VRAM):
- Model: `llama-3-70b-instruct.Q4_K_M.gguf` (~40GB)
- VRAM: ~45GB
- Speed: Slower
- Quality: Excellent

### Step 3.2: Create Models Directory

```bash
mkdir -p ~/fabstir/fabstir-llm-node/models
cd ~/fabstir/fabstir-llm-node/models
```

### Step 3.3: Download Model from HuggingFace

**For tiny-vicuna-1b** (recommended for first-time setup):
```bash
wget https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf
```

**For Llama-3-8B**:
```bash
wget https://huggingface.co/QuantFactory/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf
```

**Alternative: Use huggingface-cli** (faster for large files):
```bash
# Install huggingface-cli
pip3 install huggingface_hub

# Download model
huggingface-cli download CohereForAI/TinyVicuna-1B-32k-GGUF tiny-vicuna-1b.q4_k_m.gguf --local-dir ./
```

### Step 3.4: Verify Model Downloaded

```bash
ls -lh ~/fabstir/fabstir-llm-node/models/

# Check file size
# tiny-vicuna-1b: ~600MB
# llama-3-8b: ~4.5GB

# Optional: Verify checksum (if provided by model creator)
sha256sum tiny-vicuna-1b.q4_k_m.gguf
```

### Step 3.5: Return to Node Directory

```bash
cd ~/fabstir/fabstir-llm-node
pwd
# Should show: /home/YOUR_USER/fabstir/fabstir-llm-node
```

---

## Phase 4: Configure Environment (15 minutes)

### Step 4.1: Prepare Your Information

Before creating config files, have these ready:

1. **Your host's Ethereum private key** (66 characters: 0x + 64 hex)
   - This is the wallet you'll use for staking and earnings
   - **KEEP THIS SECRET** - never share or commit to git
   - Example format: `0x1234567890abcdef...`

2. **Your server's public IP** (from Step 1.10)
   - Example: `203.0.113.50`

3. **Model information**:
   - Model file name (e.g., `tiny-vicuna-1b.q4_k_m.gguf`)
   - Model identifier for blockchain registration

### Step 4.2: Create Main Environment File

```bash
# Copy example file
cp .env.example .env

# Edit with your preferred editor (nano is easiest for beginners)
nano .env
```

**Paste this configuration** (replace YOUR_HOST_PRIVATE_KEY):

```bash
# ==================================
# FABSTIR LLM NODE CONFIGURATION
# Base Sepolia Testnet
# ==================================

# Node Network Configuration
P2P_PORT=9000
API_PORT=8080

# Encryption Configuration (CRITICAL - KEEP SECRET!)
# Replace with your host wallet's private key
HOST_PRIVATE_KEY=YOUR_HOST_PRIVATE_KEY_HERE

# Session key TTL (1 hour = 3600 seconds)
SESSION_KEY_TTL_SECONDS=3600

# Chain Configuration
DEFAULT_CHAIN_ID=84532

# RPC URLs (Base Sepolia testnet)
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR

# Logging
RUST_LOG=info,fabstir_llm_node=debug

# Model Configuration
# Update MODEL_PATH if you downloaded a different model
MODEL_PATH=/app/models/tiny-vicuna-1b.q4_k_m.gguf
MODEL_NAME=tiny-vicuna-1b

# GPU Configuration
CUDA_VISIBLE_DEVICES=0
```

**Save and exit**:
- Nano: `Ctrl+X`, then `Y`, then `Enter`
- Vim: `Esc`, then `:wq`, then `Enter`

### Step 4.3: Create Contracts Environment File

```bash
# Copy example file
cp .env.contracts.example .env.contracts

# Edit
nano .env.contracts
```

**Paste this configuration** (Base Sepolia testnet contracts):

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

**Save and exit**

### Step 4.4: Verify Configuration Files

```bash
# Check .env exists and has your private key
cat .env | grep HOST_PRIVATE_KEY
# Should show: HOST_PRIVATE_KEY=0x...

# Check .env.contracts exists
cat .env.contracts | grep CONTRACT_JOB_MARKETPLACE
# Should show: CONTRACT_JOB_MARKETPLACE=0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E

# SECURITY CHECK: Ensure .env is not tracked by git
git status .env .env.contracts
# Should say "not staged" or "untracked" (NOT "to be committed")
```

---

## Phase 5: Create Docker Compose Configuration (10 minutes)

### Step 5.1: Determine GPU Configuration Method

Based on your test in Step 1.7:

**If TEST 2 worked** (`--gpus all`): Use GPU Method (easier)
**If only TEST 1 worked** (`--runtime=nvidia`): Use Runtime Method

### Step 5.2a: Create docker-compose.yml (GPU Method)

**Use this if `--gpus all` worked in Step 1.7**:

```bash
nano docker-compose.prod.yml
```

**Paste**:

```yaml
version: '3.8'

services:
  fabstir-node:
    build:
      context: .
      dockerfile: Dockerfile.cuda
    container_name: llm-node-prod-1
    restart: unless-stopped

    # GPU access (GPU method)
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

### Step 5.2b: Create docker-compose.yml (Runtime Method)

**Use this if only `--runtime=nvidia` worked in Step 1.7**:

```bash
nano docker-compose.prod.yml
```

**Paste**:

```yaml
version: '3.8'

services:
  fabstir-node:
    build:
      context: .
      dockerfile: Dockerfile.cuda
    container_name: llm-node-prod-1
    restart: unless-stopped

    # GPU access (Runtime method)
    runtime: nvidia

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

**Save and exit**

**Note**: The only difference is `runtime: nvidia` vs `deploy.resources.reservations.devices`. Both work equally well.

---

## Phase 6: Build Docker Image (15-30 minutes)

### Step 6.1: Verify You're in Node Directory

```bash
pwd
# Should show: /home/YOUR_USER/fabstir/fabstir-llm-node

ls Dockerfile.cuda
# Should show: Dockerfile.cuda exists
```

### Step 6.2: Build Image

```bash
docker build -f Dockerfile.cuda -t fabstir-node:latest .
```

**What to expect**:
- Download of base images (~2-5 minutes)
- Rust dependency compilation (~10-15 minutes)
- Final image creation (~1-2 minutes)
- Total: 15-30 minutes depending on CPU speed

**Watch for errors**:
- If build fails with "out of memory": Close other applications or add swap
- If build fails with CUDA errors: Check Dockerfile.cuda CUDA version matches your driver

### Step 6.3: Verify Image Created

```bash
docker images | grep fabstir-node

# Expected output:
# fabstir-node   latest   <IMAGE_ID>   <SIZE>   <TIME_AGO>
```

---

## Phase 7: Start the Node (2 minutes)

### Step 7.1: Start Container

```bash
docker compose -f docker-compose.prod.yml up -d
```

**Expected**: Container starts successfully

### Step 7.2: Check Container Status

```bash
docker compose -f docker-compose.prod.yml ps

# Expected:
# NAME              STATUS
# llm-node-prod-1   Up X seconds (healthy) or (health: starting)
```

### Step 7.3: View Logs

```bash
docker compose -f docker-compose.prod.yml logs -f
```

**Watch for**:
- ✅ `ONNX embedding model loaded successfully`
- ✅ `WebSocket server started on 0.0.0.0:8080`
- ✅ `P2P node listening on /ip4/0.0.0.0/tcp/9000`
- ✅ `BUILD VERSION: v8.3.5` or newer
- ✅ `Embedding model manager initialized`

**Press `Ctrl+C`** to stop following logs (container keeps running)

---

## Phase 8: Verify Deployment (10 minutes)

### Step 8.1: Local Health Check

```bash
curl http://localhost:8080/health
```

**Expected**: `{"status":"healthy"}` or similar

### Step 8.2: Local Version Check

```bash
curl -s http://localhost:8080/v1/version | jq '.'
```

**Expected**: JSON with version info, features list, chains

**If `jq` not installed**:
```bash
sudo apt install jq -y
```

### Step 8.3: GPU Usage Check

```bash
docker exec llm-node-prod-1 nvidia-smi
```

**Expected**: Shows your GPU with node process visible (or no processes yet if no requests)

### Step 8.4: Container Resource Usage

```bash
docker stats llm-node-prod-1 --no-stream
```

**Expected**:
- CPU: 5-15% (idle)
- Memory: 2-6GB (depending on model size)
- Network: minimal (idle)

### Step 8.5: Check Logs for Errors

```bash
docker logs llm-node-prod-1 --tail 50 | grep -i error
```

**Expected**: No critical errors (warnings OK)

---

## Phase 9: Configure Firewall (5 minutes)

### Step 9.1: Check Firewall Status

```bash
sudo ufw status
```

**If inactive**, configure it:

```bash
# CRITICAL: Allow SSH first (don't lock yourself out!)
sudo ufw allow 22/tcp

# Allow node ports
sudo ufw allow 8080/tcp
sudo ufw allow 9000/tcp

# Enable firewall
sudo ufw enable

# Verify
sudo ufw status numbered
```

**Expected**:
```
Status: active

[1] 22/tcp         ALLOW IN    Anywhere
[2] 8080/tcp       ALLOW IN    Anywhere
[3] 9000/tcp       ALLOW IN    Anywhere
```

### Step 9.2: Test Firewall Doesn't Block Local Access

```bash
curl http://localhost:8080/health
```

**Expected**: Still works (firewall allows localhost)

---

## Phase 10: External Testing (5-10 minutes)

### Step 10.1: Test from Another Machine

From your **home computer** (Windows/Mac/Linux):

```bash
# Replace YOUR_SERVER_IP with your IP from Step 1.10
curl http://YOUR_SERVER_IP:8080/health

# Expected: {"status":"healthy"}
```

**If fails**:
- Check router port forwarding (if behind NAT)
- Check cloud provider security groups (if cloud VM)
- Verify firewall rules (Step 9)
- Check if ISP blocks incoming connections (CGNAT)

### Step 10.2: Test Version Endpoint Externally

```bash
curl http://YOUR_SERVER_IP:8080/v1/version
```

**Expected**: Same JSON as local test

### Step 10.3: Test WebSocket Endpoint

```bash
curl -i http://YOUR_SERVER_IP:8080/ws
```

**Expected**: HTTP 426 Upgrade Required (this is correct - WebSocket needs upgrade header)

---

## Phase 11: Register Host on Blockchain (15-30 minutes)

**Prerequisites**:
- Wallet with private key
- Sufficient ETH for gas fees (~$1-5 USD)
- Model approval (check ModelRegistry for approved models)

**Method 1: Using Host CLI** (if available in repository):

```bash
# Navigate to host CLI (if exists in repo)
cd ~/fabstir/fabstir-llm-node/cli

# Register host
./fabstir-host register \
  --stake "1000" \
  --url "http://YOUR_SERVER_IP:8080" \
  --model "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" \
  --pricing "2000"
```

**Method 2: Using SDK Client** (from another machine with fabstir-llm-sdk):

See `packages/host-cli/docs/API_REFERENCE.md` in the SDK repository for detailed instructions.

**Method 3: Direct Contract Interaction** (advanced):

Use Etherscan write contract interface on Base Sepolia.

---

## Post-Deployment Checklist

Mark these off as you complete them:

### Functionality
- [ ] Container running (`docker ps` shows llm-node-prod-1 as "Up")
- [ ] Health endpoint responds locally
- [ ] Version endpoint shows correct version
- [ ] GPU detected in container
- [ ] Model loaded (check logs)
- [ ] ONNX embedding model loaded
- [ ] Health endpoint responds externally
- [ ] WebSocket endpoint accessible externally

### Security
- [ ] Firewall configured (ports 22, 8080, 9000 only)
- [ ] .env file NOT committed to git
- [ ] Private key stored securely
- [ ] Automatic security updates enabled

### Blockchain
- [ ] Host registered on NodeRegistry
- [ ] Stake deposited
- [ ] Model approved in ModelRegistry
- [ ] Pricing configured

### Monitoring
- [ ] Can view logs (`docker logs llm-node-prod-1`)
- [ ] Can check GPU usage (`nvidia-smi`)
- [ ] Can restart node (`docker compose restart`)
- [ ] Backup of configuration files created

---

## Monitoring and Maintenance

### Daily (Automated)

Set up a cron job to check health:

```bash
crontab -e

# Add this line:
*/15 * * * * curl -sf http://localhost:8080/health > /dev/null || echo "$(date): Health check failed" >> /var/log/fabstir-node-health.log
```

### Weekly (Manual)

```bash
# Check logs for errors
docker logs llm-node-prod-1 --tail 200 | grep -i error

# Check GPU usage
nvidia-smi

# Check disk space
df -h /

# Check for Docker updates
sudo apt update && sudo apt upgrade docker-ce docker-compose-plugin

# Check earnings (using SDK or blockchain explorer)
```

### Monthly (Manual)

```bash
# Backup configuration
cp ~/fabstir/fabstir-llm-node/.env ~/backups/.env.$(date +%Y%m%d)
cp ~/fabstir/fabstir-llm-node/.env.contracts ~/backups/.env.contracts.$(date +%Y%m%d)

# Check for node software updates
cd ~/fabstir/fabstir-llm-node
git fetch
git log HEAD..origin/main --oneline

# Review reputation score (via SDK or dashboard)
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker compose -f docker-compose.prod.yml logs | tail -100

# Common issues:
# 1. Port already in use
sudo ss -tulpn | grep -E ':(8080|9000)'

# 2. GPU not accessible
docker run --rm --runtime=nvidia nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi

# 3. Invalid environment variables
docker compose -f docker-compose.prod.yml config
```

### Model Not Loading

```bash
# Check if model file exists
docker exec llm-node-prod-1 ls -lh /app/models/

# Check model path in config
docker exec llm-node-prod-1 env | grep MODEL_PATH

# Re-download model if corrupted
cd ~/fabstir/fabstir-llm-node/models
rm tiny-vicuna-1b.q4_k_m.gguf
wget https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf
docker compose -f ~/fabstir/fabstir-llm-node/docker-compose.prod.yml restart
```

### External Access Fails

```bash
# Test from outside
curl http://YOUR_SERVER_IP:8080/health

# If fails:
# 1. Check firewall
sudo ufw status

# 2. Check if port is listening
sudo ss -tulpn | grep 8080

# 3. Test locally first
curl http://localhost:8080/health

# 4. Check router port forwarding (if behind NAT)

# 5. Check cloud security groups (if cloud VM)
```

### GPU Not Detected

```bash
# Verify GPU works on host
nvidia-smi

# Test Docker GPU access
docker run --rm --runtime=nvidia nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi

# If fails, reconfigure
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Rebuild container
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

### High Memory Usage

```bash
# Check container memory
docker stats llm-node-prod-1 --no-stream

# Check GPU memory
nvidia-smi

# If too high:
# 1. Check for memory leaks in logs
docker logs llm-node-prod-1 | grep -i "out of memory"

# 2. Restart container
docker compose -f docker-compose.prod.yml restart

# 3. Consider smaller model or more RAM
```

---

## Getting Help

**Documentation**:
- Requirements: `docs/node-reference/HOST_MINIMUM_REQUIREMENTS.md`
- Quick Reference: `docs/node-reference/UBUNTU_GPU_HOST_QUICK_REFERENCE.md`
- Node API: `docs/node-reference/API.md`
- Troubleshooting: `docs/node-reference/TROUBLESHOOTING.md`

**Community**:
- GitHub Issues: https://github.com/fabstir/fabstir-llm-node/issues
- Discord: [If available]

**Emergency**:
- Node down: `docker compose -f docker-compose.prod.yml restart`
- Complete reset: `docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d --build`

---

**Congratulations!** If you've completed all phases and the checklist, you now have a production-ready LLM host node on the Fabstir network!

**Next Steps**:
1. Test with an SDK client
2. Monitor earnings and performance
3. Consider upgrading to a larger model
4. Join the community and share your experience

---

**Last Updated**: 2025-11-08
**Compatible with**: fabstir-llm-node v8.3.5+, SDK v1.3.36+
**Tested on**: Ubuntu 22.04 LTS with NVIDIA RTX 4090
