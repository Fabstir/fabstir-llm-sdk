# Production Host Setup - Simplified Guide
## Using Pre-Built Binaries (No Compilation Required!)

**Target Audience**: Third-party host operators joining Platformless AI P2P network
**Estimated Time**: 45-60 minutes (no compilation needed!)
**Prerequisites**: See `HOST_MINIMUM_REQUIREMENTS.md`

---

## What You Need Before Starting

1. **Ubuntu 22.04 server** with NVIDIA GPU (6GB+ VRAM)
2. **NVIDIA drivers** (525.x+) and **Docker** installed
3. **Pre-built binary** download link (provided by Fabstir team)
4. **Your host's Ethereum private key** (66 characters: 0x + 64 hex)
5. **Static IP address** or dynamic DNS

---

## Phase 1: System Verification (10 minutes)

### Step 1.1: Verify Prerequisites

```bash
# Check OS
lsb_release -a
# Expected: Ubuntu 22.04.x LTS

# Check NVIDIA driver
nvidia-smi
# Expected: Driver 525.x+, CUDA 12.0+, shows your GPU

# Check Docker
docker --version
# Expected: Docker 20.10+

# Check Docker Compose
docker compose version
# Expected: v2.0+

# Check NVIDIA Container Toolkit
dpkg -l | grep nvidia-container-toolkit
# Expected: Shows installed package
```

### Step 1.2: Install Missing Prerequisites

**If NVIDIA Container Toolkit not installed**:
```bash
# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt update
sudo apt install -y nvidia-container-toolkit
```

### Step 1.3: Configure Docker for GPU

```bash
# Configure NVIDIA runtime
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

# Verify Docker restarted
sudo systemctl status docker | head -10
```

### Step 1.4: Test GPU Access

```bash
# Test GPU access in Docker
docker run --rm --runtime=nvidia nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
```

**Expected**: Shows your GPU (same output as host `nvidia-smi`)

**If this fails**, stop here and troubleshoot GPU access before continuing.

### Step 1.5: Check System Resources

```bash
# Check disk space (need 100GB+ free)
df -h /

# Check ports available
sudo ss -tulpn | grep -E ':(8080|9000)'
# Should be empty (no conflicts)

# Get your public IP
curl -4 ifconfig.me
# Save this - you'll need it for registration
```

---

## Phase 2: Download Pre-Built Binary (5-10 minutes)

### Step 2.1: Clone Repository

```bash
# Install git
sudo apt install git -y

# Create directory
mkdir -p ~/fabstir
cd ~/fabstir

# Clone fabstir-llm-node repository
git clone https://github.com/fabstir/fabstir-llm-node.git
cd fabstir-llm-node

# Verify branch
git branch
# Expected: * main
```

### Step 2.2: Download Pre-Built Binary

**Get the download link from Fabstir team** for the latest version (v8.3.6+).

Example using wget (adjust URL as provided):
```bash
# Create target directory
mkdir -p target/release

# Download binary tarball (example - use actual link provided)
wget -O fabstir-llm-node-latest.tar.gz "DOWNLOAD_URL_HERE"

# Verify download size
ls -lh fabstir-llm-node-latest.tar.gz
# Should be ~500MB, NOT 180KB (180KB = HTML error page)
```

**Alternative methods**:
- **SCP from your PC** (if you have the tarball):
  ```bash
  # From Windows/Mac/Linux with the tarball
  scp fabstir-llm-node-v8.3.6.tar.gz user@YOUR_SERVER_IP:~/fabstir/fabstir-llm-node/
  ```

- **curl** instead of wget:
  ```bash
  curl -L -o fabstir-llm-node-latest.tar.gz "DOWNLOAD_URL_HERE"
  ```

### Step 2.3: Extract Binary

```bash
# Extract tarball
tar -xzvf fabstir-llm-node-latest.tar.gz

# Move to expected location
mv fabstir-llm-node target/release/

# Verify binary
ls -lh target/release/fabstir-llm-node
# Should be ~900MB executable

file target/release/fabstir-llm-node
# Should show: ELF 64-bit LSB pie executable

# Make it executable (if not already)
chmod +x target/release/fabstir-llm-node

# Clean up tarball
rm fabstir-llm-node-latest.tar.gz
```

---

## Phase 3: Download Model (10 minutes)

```bash
# Create models directory
mkdir -p models
cd models

# Download tiny-vicuna-1b model from HuggingFace
wget https://huggingface.co/afrideva/Tiny-Vicuna-1B-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf

# Verify download
ls -lh tiny-vicuna-1b.q4_k_m.gguf
# Should be ~637MB

# Return to node directory
cd ..
pwd
# Should be: /home/YOUR_USER/fabstir/fabstir-llm-node
```

**Alternative models** (if you have more VRAM):
- **Llama-3-8B** (~4.5GB file, needs ~6GB VRAM)
- **Larger models** - contact Fabstir team for recommendations

---

## Phase 4: Configure Environment (10 minutes)

### Step 4.1: Create .env File

```bash
# Create .env file
nano .env
```

**Paste this** (replace YOUR_HOST_PRIVATE_KEY with your actual key):

```bash
# ==================================
# FABSTIR LLM NODE CONFIGURATION
# Base Sepolia Testnet
# ==================================

# Network Ports
P2P_PORT=9000
API_PORT=8080

# Encryption (CRITICAL - KEEP SECRET!)
HOST_PRIVATE_KEY=YOUR_HOST_PRIVATE_KEY_HERE

# Session Configuration
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

**Save and exit**: `Ctrl+X`, `Y`, `Enter`

### Step 4.2: Create .env.contracts File

```bash
# Create contracts file
nano .env.contracts
```

**Paste this** (Base Sepolia testnet contracts):

```bash
# ====================================
# CONTRACT ADDRESSES - BASE SEPOLIA
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

**Save and exit**: `Ctrl+X`, `Y`, `Enter`

### Step 4.3: Verify Configuration

```bash
# Check files exist
ls -la .env .env.contracts

# Verify private key format (should be 66 characters)
cat .env | grep HOST_PRIVATE_KEY
# Should show: HOST_PRIVATE_KEY=0x... (66 characters total)

# Verify NOT tracked by git
git status .env .env.contracts
# Should say "untracked" (NOT "to be committed")
```

---

## Phase 5: Create Docker Compose Configuration (5 minutes)

```bash
# Create production docker-compose file
nano docker-compose.prod.yml
```

**Paste this** (uses `runtime: nvidia` method):

```yaml
version: '3.8'

services:
  fabstir-node:
    build:
      context: .
      dockerfile: Dockerfile.production
    container_name: llm-node-prod-1
    restart: unless-stopped

    # GPU access (runtime method - works with all NVIDIA setups)
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

**Save and exit**: `Ctrl+X`, `Y`, `Enter`

**Note**: The Dockerfile (`Dockerfile.production`) already exists in the repository.

---

## Phase 6: Build Docker Image (5 minutes)

```bash
# Build image
docker build -f Dockerfile.production -t fabstir-node:latest .

# Verify image created
docker images | grep fabstir-node
# Should show: fabstir-node   latest   ...
```

**This is fast** (~2-5 minutes) because we're using a pre-built binary!

---

## Phase 7: Start the Node (2 minutes)

```bash
# Start container
docker compose -f docker-compose.prod.yml up -d

# Check container status
docker compose -f docker-compose.prod.yml ps
# Should show: llm-node-prod-1   Up

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

**Watch for**:
- ✅ `ONNX embedding model loaded successfully`
- ✅ `WebSocket server started on 0.0.0.0:8080`
- ✅ `P2P node listening on /ip4/0.0.0.0/tcp/9000`
- ✅ `BUILD VERSION: v8.3.6` or newer

**Press `Ctrl+C`** to stop following logs (container keeps running)

---

## Phase 8: Verify Deployment (10 minutes)

### Local Tests

```bash
# Health check
curl http://localhost:8080/health
# Expected: {"status":"healthy"}

# Version check
curl -s http://localhost:8080/v1/version | jq '.'
# Expected: JSON with version, features, chains

# GPU usage
docker exec llm-node-prod-1 nvidia-smi
# Should show your GPU

# Container resources
docker stats llm-node-prod-1 --no-stream
```

---

## Phase 9: Configure Firewall (5 minutes)

```bash
# Check firewall status
sudo ufw status

# If inactive or needs ports:
sudo ufw allow 22/tcp    # SSH (IMPORTANT!)
sudo ufw allow 8080/tcp  # API
sudo ufw allow 9000/tcp  # P2P

# Enable firewall
sudo ufw enable

# Verify
sudo ufw status numbered
```

---

## Phase 10: External Testing (5 minutes)

From your **local computer** (Windows/Mac/Linux):

```bash
# Replace YOUR_SERVER_IP with your IP from Step 1.5
curl http://YOUR_SERVER_IP:8080/health
# Expected: {"status":"healthy"}

# Test version
curl http://YOUR_SERVER_IP:8080/v1/version
# Expected: JSON with version info
```

**If this fails**:
- Check router port forwarding (if behind NAT)
- Check cloud provider security groups (if cloud VM)
- Verify firewall rules (Phase 9)

---

## Phase 11: Register on Blockchain (15-30 minutes)

**You'll need**:
- Host wallet with ETH for gas (~$1-5 USD)
- Model approval (tiny-vicuna-1b is pre-approved)

**Registration methods**:

1. **Using Host CLI** (if you have fabstir-llm-sdk):
   ```bash
   fabstir-host register \
     --stake "1000" \
     --url "http://YOUR_SERVER_IP:8080" \
     --model "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" \
     --pricing "2000"
   ```

2. **Using SDK client** (see SDK documentation)

3. **Direct contract interaction** (advanced - use Basescan)

---

## Post-Deployment Checklist

- [ ] Container running (`docker ps` shows llm-node-prod-1)
- [ ] Health endpoint responds locally
- [ ] Version shows v8.3.6+
- [ ] GPU detected in container
- [ ] Model loaded (check logs)
- [ ] Firewall configured
- [ ] External access works
- [ ] Registered on blockchain
- [ ] `.env` NOT committed to git

---

## Common Issues

### Binary Download Failed (180KB HTML file)
**Cause**: Wrong download URL (getting HTML preview instead of file)
**Fix**: Contact Fabstir team for correct direct download link, or use SCP transfer

### GPU Not Detected
```bash
# Test GPU access
docker run --rm --runtime=nvidia nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi

# If fails, reconfigure Docker
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Container Won't Start
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs | tail -100

# Check binary exists
ls -lh target/release/fabstir-llm-node

# Check model exists
ls -lh models/tiny-vicuna-1b.q4_k_m.gguf
```

### External Access Fails
```bash
# Test locally first
curl http://localhost:8080/health

# Check firewall
sudo ufw status

# Check port is listening
sudo ss -tulpn | grep 8080
```

---

## Maintenance

### Weekly
```bash
# Check logs for errors
docker logs llm-node-prod-1 --tail 200 | grep -i error

# Check GPU usage
nvidia-smi

# Check disk space
df -h /
```

### Monthly
```bash
# Backup configuration
cp .env ~/.backups/.env.$(date +%Y%m%d)
cp .env.contracts ~/.backups/.env.contracts.$(date +%Y%m%d)

# Check for node updates (contact Fabstir team)

# Review earnings (via SDK or blockchain explorer)
```

---

## Getting Help

**Documentation**:
- Requirements: `docs/node-reference/HOST_MINIMUM_REQUIREMENTS.md`
- Node API: `docs/node-reference/API.md`
- SDK Integration: `docs/node-reference/SDK_INTEGRATION_NOTES.md`

**Community**:
- GitHub Issues: https://github.com/fabstir/fabstir-llm-node/issues
- Discord: [Contact Fabstir team for invite]

**Emergency**:
- Restart node: `docker compose -f docker-compose.prod.yml restart`
- View logs: `docker compose -f docker-compose.prod.yml logs -f`

---

**Last Updated**: 2025-11-08
**Compatible with**: fabstir-llm-node v8.3.6+, SDK v1.3.36+
**Tested on**: Ubuntu 22.04 LTS + NVIDIA RTX 4090
**Total Time**: 45-60 minutes (no compilation!)
