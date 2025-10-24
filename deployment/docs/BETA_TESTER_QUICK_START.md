# Fabstir LLM Host - Beta Tester Quick Start Guide

**Welcome to the Fabstir LLM Marketplace Private Beta!**

This guide will help you set up your GPU node in **under 15 minutes** using our pre-built Docker image.

---

## What You'll Build

A production-ready GPU node that:
- ✅ Runs AI inference workloads (LLaMA, GPT, etc.)
- ✅ Earns USDC/FAB tokens for computation
- ✅ Registers on Base Sepolia blockchain
- ✅ Serves requests via encrypted WebSocket connections
- ✅ Generates STARK proofs for verifiable computation

---

## Prerequisites

### Hardware
- **GPU**: NVIDIA A16 or better (2GB+ VRAM)
- **CPU**: 4+ vCPUs
- **RAM**: 8GB+ system memory
- **Storage**: 50GB+ SSD
- **Network**: 100+ Mbps (1+ Gbps recommended)

### Software
- **OS**: Ubuntu 22.04 LTS (recommended)
- **Docker**: 20.10+ with nvidia-docker2
- **NVIDIA Drivers**: CUDA 12.2+ compatible

### Cloud Provider Options
- **Vultr Cloud GPU**: `vgp-a16-8gb-50gb` (~$42.50/month)
- **AWS**: g4dn.xlarge or g5.xlarge
- **GCP**: n1-standard-4 with T4 GPU
- **Azure**: NC4as_T4_v3

### Beta Access
- **GitHub Account**: For GHCR access
- **Beta Invitation**: Repository collaborator access
- **Ethereum Wallet**: For earning tokens (we'll provide test keys)

---

## Quick Start (3 Steps!)

### Step 1: Provision GPU Instance

**Option A: Vultr Cloud GPU (Recommended)**
```bash
# Via Vultr web console
# 1. Go to https://my.vultr.com/deploy/
# 2. Select: Compute → Cloud GPU
# 3. Choose: vgp-a16-8gb-50gb
# 4. Region: Select closest to you
# 5. OS: Ubuntu 22.04 LTS
# 6. Deploy!

# Or via Vultr CLI
vultr-cli instance create \
  --region ewr \
  --plan vgp-a16-8gb-50gb \
  --os "Ubuntu 22.04 LTS" \
  --label "fabstir-beta-node"
```

**Option B: Your Own GPU Server**
- Ensure NVIDIA GPU with CUDA 12.2+ support
- Fresh Ubuntu 22.04 LTS installation
- SSH access with root/sudo privileges

---

### Step 2: Run Automated Deployment

SSH into your instance and run our one-line installer:

```bash
# SSH into your GPU instance
ssh root@<your-gpu-instance-ip>

# Set GitHub credentials (for private beta GHCR access)
export GITHUB_TOKEN=your_github_personal_access_token
export GITHUB_USERNAME=your_github_username

# Run automated deployment script
bash <(curl -s https://raw.githubusercontent.com/fabstir/fabstir-llm-sdk/main/deployment/scripts/deploy-host3-vultr.sh)
```

**What this does**:
1. ✅ Installs Docker + nvidia-docker2
2. ✅ Installs NVIDIA drivers (may require reboot)
3. ✅ Pulls production Docker image from GHCR
4. ✅ Downloads TinyVicuna 1B test model (~690MB)
5. ✅ Runs container with GPU support
6. ✅ Registers node on Base Sepolia blockchain
7. ✅ Starts serving AI inference requests

**Estimated time**: 10-15 minutes (depending on internet speed)

---

### Step 3: Verify Node is Running

After deployment completes, verify your node:

```bash
# Check Docker container status
docker ps | grep fabstir-host

# Check GPU access
docker exec fabstir-host nvidia-smi

# Test health endpoint
PUBLIC_IP=$(curl -s ifconfig.me)
curl "http://${PUBLIC_IP}:8083/health"

# Expected response:
# {
#   "status": "healthy",
#   "gpu_available": true,
#   "model_loaded": true,
#   "active_sessions": 0
# }

# View live logs
docker logs -f fabstir-host
```

---

## Manual Setup (Alternative)

If you prefer manual control or want to customize:

### 1. Install Prerequisites

```bash
# Update system
apt-get update && apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install NVIDIA drivers
ubuntu-drivers autoinstall
reboot  # Required after driver installation

# After reboot, install nvidia-docker2
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  tee /etc/apt/sources.list.d/nvidia-docker.list
apt-get update
apt-get install -y nvidia-docker2
systemctl restart docker

# Verify GPU access
docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi
```

### 2. Login to GHCR

```bash
# Set your GitHub credentials
export GITHUB_TOKEN=your_github_personal_access_token
export GITHUB_USERNAME=your_github_username

# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin
```

### 3. Pull Docker Image

```bash
docker pull ghcr.io/fabstir/llm-host:beta-latest
```

### 4. Download Test Model

```bash
# Download model script
bash <(curl -s https://raw.githubusercontent.com/fabstir/fabstir-llm-sdk/main/deployment/scripts/download-test-model.sh)

# Or manually download
mkdir -p ~/fabstir-models
cd ~/fabstir-models
curl -LO https://huggingface.co/afrideva/Tiny-Vicuna-1B-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf
```

### 5. Create Configuration

```bash
# Get public IP for PUBLIC_URL
PUBLIC_IP=$(curl -s ifconfig.me)

# Create .env file
cat > /tmp/fabstir-host.env << 'EOF'
# Host Identity (TEST_HOST_3 - provided by Fabstir team)
# ⚠️ WARNING: This is a TEST KEY ONLY for Base Sepolia testnet
# NEVER use this key on mainnet or with real funds
HOST_PRIVATE_KEY=0x36c4dbaead98ebd10417c0325da8cf1217e12488185f8c4aec68d5c476f39fa5

# Network
PUBLIC_URL=http://AUTO_DETECT:8083
RPC_URL=https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR
CHAIN_ID=84532

# Contracts (Base Sepolia)
CONTRACT_JOB_MARKETPLACE=0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E
CONTRACT_NODE_REGISTRY=0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6
CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776
CONTRACT_MODEL_REGISTRY=0x92b2De840bB2171203011A6dBA928d855cA8183E
CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Model
MODEL_PATH=/models/tiny-vicuna-1b.q4_k_m.gguf
GPU_LAYERS=35

# Logging
RUST_LOG=info
NODE_ENV=production
EOF
```

### 6. Run Container

```bash
# Configure firewall
ufw allow 22/tcp    # SSH
ufw allow 8083/tcp  # API
ufw allow 9000/tcp  # P2P
ufw allow 3001/tcp  # Management API
ufw --force enable

# Run container
docker run -d \
  --name fabstir-host \
  --gpus all \
  --restart unless-stopped \
  -p 8083:8083 \
  -p 9000:9000 \
  -p 3001:3001 \
  -v ~/fabstir-models:/models \
  --env-file /tmp/fabstir-host.env \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  ghcr.io/fabstir/llm-host:beta-latest \
  start --daemon

# Check logs
docker logs -f fabstir-host
```

### 7. Register on Blockchain

```bash
# Register host
docker exec fabstir-host node --require /app/polyfills.js dist/index.js register \
  --url "http://$(curl -s ifconfig.me):8083" \
  --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" \
  --stake 1000 \
  --price 2000 \
  --force

# Verify registration
docker exec fabstir-host node --require /app/polyfills.js dist/index.js info
```

---

## Testing Your Node

### From SDK Client

Beta testers can test their node using the chat demo:

```bash
# Clone SDK repository
git clone https://github.com/fabstir/fabstir-llm-sdk.git
cd fabstir-llm-sdk

# Install dependencies
pnpm install

# Run chat demo
cd apps/harness
pnpm dev

# Open http://localhost:3000/chat-context-popupfree-demo
# Your node should appear in the host discovery list!
```

### Direct API Test

```bash
# Health check
curl http://YOUR_IP:8083/health

# Check supported chains
curl http://YOUR_IP:8083/chains

# WebSocket test (requires websocket client)
wscat -c "ws://YOUR_IP:8083/ws"
```

---

## Monitoring Your Node

### Real-Time Logs

```bash
# Follow all logs
docker logs -f fabstir-host

# Filter by level
docker logs -f fabstir-host 2>&1 | grep ERROR
docker logs -f fabstir-host 2>&1 | grep WARN

# Show last 100 lines
docker logs --tail 100 fabstir-host
```

### GPU Monitoring

```bash
# Watch GPU usage in real-time
watch -n 1 docker exec fabstir-host nvidia-smi

# Check GPU memory
docker exec fabstir-host nvidia-smi --query-gpu=memory.used,memory.total --format=csv
```

### Container Stats

```bash
# Real-time resource usage
docker stats fabstir-host

# Container health
docker inspect fabstir-host | grep -A 10 Health
```

### Blockchain Status

```bash
# Check registration info
docker exec fabstir-host node --require /app/polyfills.js dist/index.js info

# View accumulated earnings
docker exec fabstir-host node --require /app/polyfills.js dist/index.js wallet balance --all
```

---

## Common Issues & Solutions

### "GPU out of memory"
```bash
# Check VRAM usage
docker exec fabstir-host nvidia-smi

# Solutions:
# 1. Reduce GPU_LAYERS in .env (try 30, 25, 20)
# 2. Restart container: docker restart fabstir-host
# 3. Use smaller model (contact team for alternatives)
```

### "Container won't start"
```bash
# Check logs for errors
docker logs fabstir-host

# Common causes:
# 1. GPU not accessible → verify nvidia-docker2
# 2. Model not found → check volume mount
# 3. Invalid .env → verify all required variables set

# Reset container
docker stop fabstir-host
docker rm fabstir-host
# Re-run docker run command
```

### "Health check failing"
```bash
# Check if fabstir-llm-node is running inside container
docker exec fabstir-host ps aux | grep fabstir

# Check firewall
ufw status

# Check port binding
netstat -tlnp | grep 8083
```

### "Not showing up in SDK discovery"
```bash
# Verify blockchain registration
docker exec fabstir-host node --require /app/polyfills.js dist/index.js info

# Check contract events (Base Sepolia)
# Visit: https://sepolia.basescan.org/address/0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6

# Re-register if needed
docker exec fabstir-host node --require /app/polyfills.js dist/index.js register --force
```

---

## Useful Commands

### Container Management
```bash
# Start container
docker start fabstir-host

# Stop container
docker stop fabstir-host

# Restart container
docker restart fabstir-host

# Remove container (keeps data)
docker stop fabstir-host && docker rm fabstir-host

# Update to latest image
docker pull ghcr.io/fabstir/llm-host:beta-latest
docker stop fabstir-host && docker rm fabstir-host
# Re-run docker run command with new image
```

### Host CLI Commands
```bash
# Show wallet address
docker exec fabstir-host node --require /app/polyfills.js dist/index.js wallet address

# Check balances
docker exec fabstir-host node --require /app/polyfills.js dist/index.js wallet balance --all

# View host info
docker exec fabstir-host node --require /app/polyfills.js dist/index.js info

# Update pricing
docker exec fabstir-host node --require /app/polyfills.js dist/index.js update-pricing --price 3000

# Withdraw earnings
docker exec fabstir-host node --require /app/polyfills.js dist/index.js withdraw
```

### System Maintenance
```bash
# Check disk space
df -h

# Clean up Docker
docker system prune -a

# Update system
apt-get update && apt-get upgrade -y

# Restart Docker daemon
systemctl restart docker
```

---

## Beta Testing Checklist

Please help us test these scenarios:

- [ ] Node starts successfully on fresh Ubuntu 22.04
- [ ] GPU inference works (send test prompts)
- [ ] STARK proofs are generated and submitted
- [ ] Earnings accumulate correctly
- [ ] Withdrawal works (test mode)
- [ ] Node survives container restart
- [ ] Node survives system reboot
- [ ] Concurrent sessions work (2-5 clients)
- [ ] Health endpoint responds correctly
- [ ] Logs are readable and helpful

### Reporting Issues

Please report issues on GitHub with:
- **System Info**: OS version, GPU model, Docker version
- **Logs**: `docker logs fabstir-host > logs.txt`
- **Steps to Reproduce**: What you did before the issue
- **Expected vs Actual**: What should happen vs what happened

**GitHub Issues**: https://github.com/fabstir/fabstir-llm-sdk/issues

**Discord**: #beta-testing channel

---

## Costs & Earnings

### Operating Costs (Vultr A16)
- **Instance**: ~$42.50/month
- **Bandwidth**: Included (1TB)
- **Storage**: Included (50GB)

### Potential Earnings (Testnet)
- Beta uses **test tokens** (no real value yet)
- Earn FAB/USDC for inference workloads
- Track earnings: `docker exec fabstir-host node --require /app/polyfills.js dist/index.js wallet balance --all`

### Mainnet Launch (Future)
- Real USDC/FAB earnings
- Marketplace pricing based on supply/demand
- Reputation system for premium pricing

---

## Next Steps

1. **Join Discord**: Get help from team and other beta testers
2. **Run Inference Tests**: Try different prompts and models
3. **Monitor Earnings**: Track proof submissions and rewards
4. **Share Feedback**: Help us improve before public launch!

---

## Support

- **Documentation**: https://docs.fabstir.com
- **Discord**: https://discord.gg/fabstir (#beta-testing)
- **Email**: beta@fabstir.com
- **GitHub Issues**: https://github.com/fabstir/fabstir-llm-sdk/issues

---

**Thank you for being part of our private beta!** 🚀

Your feedback will help us build the best decentralized AI marketplace.

---

**Last Updated**: 2025-10-21
