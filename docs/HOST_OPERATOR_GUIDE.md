# Host Operator Guide

**Audience:** New users who want to run a Fabstir host node and earn by providing AI inference.

**Time Required:** ~10 minutes with setup wizard, ~30 minutes manual setup

---

## Overview

To become a Fabstir host operator, you need to:

1. **Prerequisites** - Ubuntu server with NVIDIA GPU, Docker installed
2. **Run Setup Wizard** - Guided setup (recommended) OR manual setup
3. **Monitor with dashboard** - TUI dashboard for status, earnings, and withdrawals

**Fastest Path:** Run `fabstir-host setup` after prerequisites are met.

---

## Step 1: Prerequisites

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | NVIDIA GTX 1080 (8GB VRAM) | NVIDIA RTX 3090+ (24GB VRAM) |
| RAM | 16GB | 32GB+ |
| Storage | 50GB SSD | 100GB+ NVMe |
| Network | 100 Mbps | 1 Gbps |

### Software Requirements

**Ubuntu 22.04 LTS** (recommended)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group changes

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt update
sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker

# Verify GPU access in Docker
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### Wallet Requirements

- **Ethereum wallet** with private key (MetaMask export or generated)
- **Base Sepolia testnet ETH** for gas (~0.1 ETH)
- **FAB tokens** for staking (minimum 1000 FAB)
- **USDC** (optional, for receiving payments)

Get testnet tokens:
- Base Sepolia ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
- FAB tokens: Contact Fabstir team or use testnet faucet

---

## Step 2: Setup Wizard (Recommended)

The easiest way to get started is using the interactive setup wizard:

```bash
docker run -it --rm \
  --gpus all \
  -v fabstir-models:/root/fabstir-node/models \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  julesl23/fabstir-host-cli:latest setup
```

> **Note:** Contract addresses are bundled in the Docker image. If you provide `HOST_PRIVATE_KEY` via environment variable, the wizard will use it automatically and skip the private key prompt.

The wizard guides you through:
1. **Check Prerequisites** - Verifies Docker, GPU, disk space
2. **Select Model** - Choose from blockchain-approved models (with GPU recommendations)
3. **Download Model** - Downloads with progress bar and SHA256 verification
4. **Configure Node** - Set URL, pricing, stake amount
5. **Register on Blockchain** - Stakes tokens and registers your node

After completion, it generates `docker-compose.yml` and `.env` files in `~/fabstir-node/`.

---

## Step 2b: Discover Models

Before registering, you can explore approved models:

```bash
# List all approved models from blockchain
docker run --rm -it julesl123/fabstir-host-cli:latest models list

# Get details on a specific model
docker run --rm -it julesl123/fabstir-host-cli:latest models info 1

# Download a model (with verification)
docker run --rm -it \
  -v ~/fabstir-node/models:/root/fabstir-node/models \
  julesl123/fabstir-host-cli:latest models download 1
```

If a model requires HuggingFace authentication:
```bash
docker run --rm -it \
  -e HF_TOKEN=your_huggingface_token \
  -v ~/fabstir-node/models:/root/fabstir-node/models \
  julesl123/fabstir-host-cli:latest models download 1
```

---

## Step 3: Manual Setup (Alternative)

If you prefer manual setup instead of the wizard:

### Run fabstir-llm-node

### Option A: Docker Compose (Recommended)

Create a directory for your node:

```bash
mkdir ~/fabstir-node && cd ~/fabstir-node
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  fabstir-llm-node:
    image: fabstir/llm-node:latest
    container_name: fabstir-llm-node
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./models:/app/models
      - ./data:/app/data
    environment:
      - HOST_PRIVATE_KEY=${HOST_PRIVATE_KEY}
      - RPC_URL=https://sepolia.base.org
      - CHAIN_ID=84532
      - MODEL_PATH=/app/models/tiny-vicuna-1b.q4_k_m.gguf
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

Create `.env` file:

```bash
# Your host wallet private key (without 0x prefix)
HOST_PRIVATE_KEY=your_private_key_here
```

Download a model:

```bash
mkdir -p models
# Download TinyVicuna (small, good for testing)
wget -O models/tiny-vicuna-1b.q4_k_m.gguf \
  https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf
```

Start the node:

```bash
docker-compose up -d
```

Verify it's running:

```bash
# Check health
curl http://localhost:8080/health

# Expected: {"status":"healthy","issues":null}
```

### Option B: Docker Run (Simple)

```bash
docker run -d \
  --name fabstir-llm-node \
  --gpus all \
  -p 8080:8080 \
  -v ~/fabstir-node/models:/app/models \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  -e RPC_URL=https://sepolia.base.org \
  -e CHAIN_ID=84532 \
  fabstir/llm-node:latest
```

---

## Step 4: Register as a Host

### Option A: Interactive Registration (Recommended)

When you omit `--model`, you get an interactive model selector:

```bash
docker run --rm -it \
  --network host \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  julesl123/fabstir-host-cli:latest register \
    --stake 1000 \
    --url "http://YOUR_SERVER_IP:8080" \
    --pricing 2000
```

This shows a list of approved models to choose from, validates your selection, and proceeds with registration.

### Option B: Explicit Model Registration

```bash
docker run --rm -it \
  --network host \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  julesl123/fabstir-host-cli:latest register \
    --stake 1000 \
    --url "http://YOUR_SERVER_IP:8080" \
    --model "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" \
    --pricing 2000
```

The model string is validated against the blockchain before the transaction is submitted. If invalid, you'll see suggestions for approved models.

**Parameters:**
- `--stake`: Amount of FAB tokens to stake (minimum 1000)
- `--url`: Public URL where your node is accessible
- `--model`: Model in format `{HuggingFace_Repo}:{filename}` (optional - interactive if omitted)
- `--pricing`: Price per million tokens in micro-USDC (2000 = $2.00 per million tokens, or $0.000002/token)

### Option C: Using Web Interface

1. Go to https://host.fabstir.com (when available)
2. Connect your wallet
3. Fill in registration form
4. Approve FAB token staking
5. Submit registration transaction

### Verify Registration

```bash
# Check your host status
docker run --rm -it \
  --network host \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  julesl123/fabstir-host-cli:latest status
```

---

## Step 5: Monitor with Dashboard

Run the TUI dashboard to monitor your node:

```bash
docker run --rm -it \
  --network host \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  -v /var/run/docker.sock:/var/run/docker.sock \
  julesl123/fabstir-host-cli:latest dashboard
```

**Dashboard Features:**
- **Node Status**: Health, uptime, active sessions
- **Live Logs**: Real-time Docker container logs
- **Earnings**: View accumulated USDC and ETH earnings
- **Pricing**: Update your token pricing
- **Withdrawals**: Withdraw earnings to your wallet

**Keyboard Shortcuts:**
- `R` - Refresh status
- `E` - View earnings breakdown
- `P` - Update pricing
- `W` - Withdraw earnings
- `Q` - Quit

---

## Step 6: Maintain Your Node

### Check Node Health

```bash
# Health endpoint
curl http://localhost:8080/health

# View logs
docker logs -f fabstir-llm-node --tail 100
```

### Update Node Software

```bash
cd ~/fabstir-node
docker-compose pull
docker-compose up -d
```

### Update Pricing

```bash
docker run --rm -it \
  --network host \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  julesl123/fabstir-host-cli:latest update-pricing --price 3000
```

> **Pricing Format:** Price is per million tokens. 3000 = $3.00 per million tokens ($0.000003/token).

### Withdraw Earnings

```bash
docker run --rm -it \
  --network host \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  julesl123/fabstir-host-cli:latest withdraw --amount 100 --token usdc
```

---

## Approved Models

To see the current list of approved models, run:

```bash
docker run --rm -it julesl123/fabstir-host-cli:latest models list
```

Example approved models for the testnet:

| Model | Format String | Size |
|-------|--------------|------|
| TinyVicuna 1B | `CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf` | 0.6GB |
| TinyLlama 1.1B | `TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` | 0.7GB |

Models are approved on-chain in the ModelRegistry contract. Use `models list` to always see the current approved models.

---

## Network Information

### Base Sepolia Testnet (Current)

| Contract | Address |
|----------|---------|
| NodeRegistry | See `.env.test` in SDK repo |
| ModelRegistry | See `.env.test` in SDK repo |
| JobMarketplace | See `.env.test` in SDK repo |
| HostEarnings | See `.env.test` in SDK repo |

### RPC Endpoints

- **Base Sepolia**: `https://sepolia.base.org`
- **Chain ID**: `84532`

---

## Troubleshooting

### "No P2P node available"

This warning means the P2P discovery network has no peers yet. Your node will still work for direct connections.

### "GPU not detected"

```bash
# Verify NVIDIA driver
nvidia-smi

# Verify Docker GPU access
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# Restart Docker if needed
sudo systemctl restart docker
```

### "Registration failed"

1. Check you have enough FAB tokens for staking
2. Check you have ETH for gas
3. Verify your private key is correct
4. Check the model string format is exact

### "Connection refused on port 8080"

```bash
# Check if node is running
docker ps | grep fabstir

# Check node logs
docker logs fabstir-llm-node

# Check firewall
sudo ufw status
sudo ufw allow 8080/tcp
```

---

## Quick Reference

### Fastest Setup (Wizard)

```bash
# Run the interactive setup wizard - handles everything!
docker run --rm -it \
  --network host --gpus all \
  -v ~/fabstir-node:/root/fabstir-node \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  julesl123/fabstir-host-cli:latest setup
```

> **Note:** Contract addresses are bundled in the Docker image. The wizard will use `HOST_PRIVATE_KEY` automatically and skip the private key prompt.

### Manual One-Command Setup (After Prerequisites)

```bash
# 1. Discover and download a model
docker run --rm -it \
  -v ~/fabstir-node/models:/root/fabstir-node/models \
  julesl123/fabstir-host-cli:latest models download 1

# 2. Start node (replace YOUR_PRIVATE_KEY)
docker run -d --name fabstir-llm-node --gpus all -p 8080:8080 \
  -v ~/fabstir-node/models:/app/models \
  -e HOST_PRIVATE_KEY=YOUR_PRIVATE_KEY \
  fabstir/llm-node:latest

# 3. Register with interactive model selection (replace YOUR_PRIVATE_KEY and YOUR_SERVER_IP)
docker run --rm -it --network host \
  -e HOST_PRIVATE_KEY=YOUR_PRIVATE_KEY \
  julesl123/fabstir-host-cli:latest register \
  --stake 1000 --url "http://YOUR_SERVER_IP:8080" --pricing 2000

# 4. Monitor with dashboard
docker run --rm -it --network host \
  -e HOST_PRIVATE_KEY=YOUR_PRIVATE_KEY \
  -v /var/run/docker.sock:/var/run/docker.sock \
  julesl123/fabstir-host-cli:latest dashboard
```

---

## Support

- **Documentation**: https://docs.fabstir.com
- **Discord**: https://discord.gg/fabstir
- **GitHub Issues**: https://github.com/fabstir/fabstir-llm-sdk/issues
