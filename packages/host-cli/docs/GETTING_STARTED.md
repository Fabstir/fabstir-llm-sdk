# Getting Started with Fabstir Host CLI

Complete guide to becoming a Fabstir marketplace host node from scratch.

## Table of Contents
- [Quick Start (For Docker Users)](#quick-start-for-docker-users)
- [Prerequisites](#prerequisites)
- [Step 1: Install Docker](#step-1-install-docker)
- [Step 2: Download AI Model](#step-2-download-ai-model)
- [Step 3: Prepare Environment](#step-3-prepare-environment)
- [Step 4: Run Docker Container](#step-4-run-docker-container)
- [Step 5: Register as Host](#step-5-register-as-host)
- [Step 6: Verify Registration](#step-6-verify-registration)
- [Next Steps](#next-steps)
- [Quick Reference](#quick-reference)

---

## Quick Start (For Docker Users)

**If you already have Docker installed and know your way around**, here's the 4-command setup:

```bash
# 1. Download approved model (~700MB)
mkdir -p ~/fabstir-models && cd ~/fabstir-models
wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# 2. Pull pre-built Docker image
docker pull fabstir/host-cli:latest

# 3. Run container (replace YOUR_* placeholders)
docker run -d \
  --name fabstir-host \
  -p 8083:8083 -p 9000:9000 \
  -v ~/fabstir-models:/models \
  -e MODEL_PATH=/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  -e HOST_PRIVATE_KEY=0xYOUR_PRIVATE_KEY \
  -e CHAIN_ID=84532 \
  -e RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY \
  -e CONTRACT_JOB_MARKETPLACE=0xdEa1B47872C27458Bb7331Ade99099761C4944Dc \
  -e CONTRACT_NODE_REGISTRY=0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218 \
  -e CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1 \
  -e CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776 \
  fabstir/host-cli:latest

# 4. Register as host
docker exec -it fabstir-host fabstir-host register \
  --url http://YOUR_PUBLIC_IP:8083 \
  --models "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" \
  --stake 1000
```

**What's in the image?** Host CLI + fabstir-llm-node binary + Node.js runtime
**What's NOT in the image?** AI models (you download separately), private keys (passed as env vars)

**Need help?** See detailed sections below for step-by-step instructions.

---

## Prerequisites

Before starting, ensure you have:

### Required
- **Public IP address or domain** (not localhost)
- **Private key** with FAB tokens for staking
- **Open firewall** for ports 8083 (API) and 9000 (P2P)
- **Docker installed** (see Step 1)
- **Minimum hardware**:
  - 4 CPU cores
  - 8GB RAM (16GB recommended)
  - 50GB free disk space
  - Stable internet connection

### Optional but Recommended
- **GPU** for faster inference (CUDA-compatible)
- **Domain name** instead of raw IP
- **Reverse proxy** (Nginx/Caddy) for HTTPS

## Step 1: Install Docker

### Linux (Ubuntu/Debian)
```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Set up stable repository
echo \
  "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Add your user to docker group (avoid sudo)
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
```

### macOS
```bash
# Install via Homebrew
brew install --cask docker

# Or download Docker Desktop from:
# https://www.docker.com/products/docker-desktop
```

### Windows
```powershell
# Download Docker Desktop from:
# https://www.docker.com/products/docker-desktop

# Follow installation wizard
# Requires WSL2 backend
```

### Verify Installation
```bash
docker --version
# Expected: Docker version 20.10.x or higher

docker run hello-world
# Should download and run test container successfully
```

## Step 2: Download AI Model

### Create Models Directory
```bash
# Create directory for AI models
mkdir -p ~/fabstir-models
cd ~/fabstir-models
```

### Download Approved Model

**TinyLlama Model** (Recommended for testing, ~700MB):
```bash
# Download from Hugging Face
wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# Verify file downloaded
ls -lh tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
# Expected: ~700MB file
```

**Alternative: TinyVicuna Model** (~600MB):
```bash
wget https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf

ls -lh tiny-vicuna-1b.q4_k_m.gguf
# Expected: ~600MB file
```

### Verify Model Hash (Important!)

See [MODEL_DOWNLOAD_GUIDE.md](./MODEL_DOWNLOAD_GUIDE.md) for complete model verification instructions.

```bash
# Check model ID matches approved models
# (Optional but recommended for production)
```

## Step 3: Prepare Environment

### Get Your Private Key

**⚠️ SECURITY WARNING**: Never commit or share your private key!

```bash
# Export your private key (replace with your actual key)
export HOST_PRIVATE_KEY="0xYOUR_PRIVATE_KEY_HERE"

# Verify it's set
echo $HOST_PRIVATE_KEY
```

### Get Contract Addresses

For **Base Sepolia testnet** (use these values):
```bash
export CHAIN_ID=84532
export RPC_URL_BASE_SEPOLIA="https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY"

# Contract addresses (current testnet deployment)
export CONTRACT_JOB_MARKETPLACE="0xdEa1B47872C27458Bb7331Ade99099761C4944Dc"
export CONTRACT_NODE_REGISTRY="0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218"
export CONTRACT_PROOF_SYSTEM="0x2ACcc60893872A499700908889B38C5420CBcFD1"
export CONTRACT_HOST_EARNINGS="0x908962e8c6CE72610021586f85ebDE09aAc97776"
export CONTRACT_MODEL_REGISTRY="0x92b2De840bB2171203011A6dBA928d855cA8183E"
export CONTRACT_FAB_TOKEN="0xC78949004B4EB6dEf2D66e49Cd81231472612D62"
export CONTRACT_USDC_TOKEN="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
```

### Configure Firewall

**Linux (UFW)**:
```bash
sudo ufw allow 8083/tcp
sudo ufw allow 9000/tcp
sudo ufw reload
```

**Linux (iptables)**:
```bash
sudo iptables -A INPUT -p tcp --dport 8083 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 9000 -j ACCEPT
sudo iptables-save > /etc/iptables/rules.v4
```

**macOS**:
```bash
# Temporarily disable for testing
sudo pfctl -d

# Or configure permanent rules (advanced)
```

**Windows**:
```powershell
netsh advfirewall firewall add rule name="Fabstir API" dir=in action=allow protocol=TCP localport=8083
netsh advfirewall firewall add rule name="Fabstir P2P" dir=in action=allow protocol=TCP localport=9000
```

## Step 4: Run Docker Container

### Pull Docker Image
```bash
# Pull the latest Fabstir Host CLI image
docker pull fabstir/host-cli:latest
```

### Run Container
```bash
# For TinyLlama model:
docker run -d \
  --name fabstir-host \
  -p 8083:8083 \
  -p 9000:9000 \
  -v ~/fabstir-models:/models \
  -e MODEL_PATH=/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  -e HOST_PRIVATE_KEY=$HOST_PRIVATE_KEY \
  -e CHAIN_ID=$CHAIN_ID \
  -e RPC_URL_BASE_SEPOLIA=$RPC_URL_BASE_SEPOLIA \
  -e CONTRACT_JOB_MARKETPLACE=$CONTRACT_JOB_MARKETPLACE \
  -e CONTRACT_NODE_REGISTRY=$CONTRACT_NODE_REGISTRY \
  -e CONTRACT_PROOF_SYSTEM=$CONTRACT_PROOF_SYSTEM \
  -e CONTRACT_HOST_EARNINGS=$CONTRACT_HOST_EARNINGS \
  fabstir/host-cli:latest

# Verify container is running
docker ps | grep fabstir-host
```

### Check Logs
```bash
# Follow container logs
docker logs -f fabstir-host

# Look for:
# "Container started successfully"
# "Fabstir Host CLI ready"
```

## Step 5: Register as Host

### Interactive Registration
```bash
# Enter the container
docker exec -it fabstir-host bash

# Inside container, register as host
fabstir-host register \
  --url http://YOUR_PUBLIC_IP:8083 \
  --models "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" \
  --stake 1000
```

**Expected output**:
```
🚀 Starting inference node...
   Waiting for node to start (monitoring logs)...
   ✅ Model loaded
   ✅ P2P started
   ✅ API started
   🎉 Fabstir LLM Node is running
  Verifying public access at http://YOUR_PUBLIC_IP:8083...
   ✅ Public URL is accessible

💰 Approving FAB tokens...
   Transaction: 0x...

📝 Registering on blockchain...
   Transaction: 0x...

✅ Registration complete!
Node: http://YOUR_PUBLIC_IP:8083
PID: 123
Transaction: 0x...
```

### Non-Interactive Registration
```bash
# Run directly without entering container
docker exec fabstir-host fabstir-host register \
  --url http://YOUR_PUBLIC_IP:8083 \
  --models "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" \
  --stake 1000 \
  --private-key $HOST_PRIVATE_KEY
```

## Step 6: Verify Registration

### Check Node Status
```bash
# Test local health endpoint
curl http://localhost:8083/health

# Expected response:
# {"status":"healthy"}
```

### Test from External Machine
```bash
# From another computer or online tool
curl http://YOUR_PUBLIC_IP:8083/health

# Should return same response
# If it fails, check firewall and NAT configuration
```

### Check Blockchain Registration
```bash
# Inside container
docker exec -it fabstir-host bash

# Check status
fabstir-host status

# Expected output:
# ✅ Host is registered
# Address: 0xYourAddress
# Stake: 1000 FAB
# Models: 1
# Uptime: 5m 23s
```

## Next Steps

### Monitor Your Node
```bash
# View logs
docker logs -f fabstir-host

# Check status periodically
docker exec fabstir-host fabstir-host status
```

### Update Configuration
```bash
# Add more models (if you have them)
docker exec fabstir-host fabstir-host update-models \
  --add "model2,model3"

# Update pricing
docker exec fabstir-host fabstir-host set-price \
  --per-token 0.0001
```

### Maintenance

**Stop Node**:
```bash
docker exec fabstir-host fabstir-host stop
```

**Restart Node**:
```bash
docker exec fabstir-host fabstir-host start --daemon
```

**Unregister and Recover Stake**:
```bash
docker exec fabstir-host fabstir-host unregister
# This will:
# 1. Unregister from blockchain
# 2. Recover your staked FAB tokens
# 3. Stop the inference node
```

**Container Management**:
```bash
# Stop container
docker stop fabstir-host

# Start container
docker start fabstir-host

# Restart container
docker restart fabstir-host

# Remove container (data preserved in ~/.fabstir)
docker rm -f fabstir-host
```

## Quick Reference

### Essential Commands

```bash
# Check status
docker exec fabstir-host fabstir-host status

# View logs
docker logs -f fabstir-host

# Stop node
docker exec fabstir-host fabstir-host stop

# Start node
docker exec fabstir-host fabstir-host start --daemon

# Unregister
docker exec fabstir-host fabstir-host unregister

# Check health
curl http://localhost:8083/health
```

### Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MODEL_PATH` | Yes | Path to GGUF model file | `/models/tinyllama-1.1b.Q4_K_M.gguf` |
| `HOST_PRIVATE_KEY` | Yes | Your wallet private key | `0x...` |
| `CHAIN_ID` | Yes | Blockchain chain ID | `84532` (Base Sepolia) |
| `RPC_URL_BASE_SEPOLIA` | Yes | RPC endpoint URL | `https://base-sepolia...` |
| `CONTRACT_JOB_MARKETPLACE` | Yes | JobMarketplace address | `0xdEa1B...` |
| `CONTRACT_NODE_REGISTRY` | Yes | NodeRegistry address | `0x2AA37...` |
| `CONTRACT_PROOF_SYSTEM` | Yes | ProofSystem address | `0x2ACcc...` |
| `CONTRACT_HOST_EARNINGS` | Yes | HostEarnings address | `0x908962...` |
| `API_PORT` | No | API port (default: 8083) | `8083` |
| `P2P_PORT` | No | P2P port (default: 9000) | `9000` |
| `GPU_LAYERS` | No | GPU layers (default: 35) | `35` |

### Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed troubleshooting guides.

**Quick checks**:
- Port already in use: `lsof -i :8083`
- Firewall blocking: `sudo ufw status`
- Model not found: Check volume mount `-v ~/fabstir-models:/models`
- Registration fails: Verify you have FAB tokens in wallet
- Public URL not accessible: Check firewall and NAT forwarding

### Support

- Documentation: `packages/host-cli/docs/`
- Issues: https://github.com/fabstir/fabstir-llm-sdk/issues
- Contract reference: `docs/compute-contracts-reference/`
