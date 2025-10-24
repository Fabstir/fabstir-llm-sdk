#!/bin/bash
# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

# ============================================================================
# Deploy TEST_HOST_3 to Vultr Cloud GPU Instance
# ============================================================================
#
# This script automates the complete deployment of Fabstir LLM Host to a
# Vultr Cloud GPU instance with NVIDIA A16.
#
# What it does:
#   1. Installs Docker + nvidia-docker2
#   2. Installs NVIDIA drivers
#   3. Pulls production Docker image from GHCR
#   4. Downloads test model
#   5. Runs Docker container with TEST_HOST_3 configuration
#   6. Registers host on Base Sepolia blockchain
#   7. Starts serving AI inference requests
#
# Prerequisites:
#   - Vultr Cloud GPU instance (vgp-a16-8gb-50gb) provisioned
#   - SSH access to instance
#   - GitHub token for GHCR (if using private beta image)
#
# Usage:
#   # Run on Vultr instance via SSH
#   ssh root@<vultr-ip>
#   bash <(curl -s https://raw.githubusercontent.com/fabstir/fabstir-llm-sdk/main/deployment/scripts/deploy-host3-vultr.sh)
#
#   # Or run locally and SSH
#   ./deployment/scripts/deploy-host3-vultr.sh <vultr-ip>
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_IMAGE="ghcr.io/fabstir/llm-host:beta-latest"
CONTAINER_NAME="fabstir-host"
MODEL_DIR="${HOME}/fabstir-models"
MODEL_NAME="tiny-vicuna-1b.q4_k_m.gguf"
HOST_NAME="Cloud Test Host 3"

# TEST_HOST_3 Configuration (from .env.test)
# ⚠️ SECURITY: Set these via environment variables before running
# NEVER commit private keys to git repositories
if [ -z "$HOST_PRIVATE_KEY" ]; then
  echo "ERROR: HOST_PRIVATE_KEY environment variable not set"
  echo "Usage: HOST_PRIVATE_KEY=0x... bash deploy-host3-vultr.sh"
  exit 1
fi

HOST_ADDRESS="${HOST_ADDRESS:-0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71}"
MODEL_HASH="0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced"
MODEL_STRING="CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}  Fabstir LLM Host - Vultr Deployment (TEST_HOST_3)${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${GREEN}Host:${NC}         ${HOST_NAME}"
echo -e "${GREEN}Address:${NC}      ${HOST_ADDRESS}"
echo -e "${GREEN}Image:${NC}        ${DOCKER_IMAGE}"
echo -e "${GREEN}Container:${NC}    ${CONTAINER_NAME}"
echo ""

# Step 1: Check prerequisites
echo -e "${YELLOW}Step 1/7: Checking prerequisites...${NC}"

# Check if running on Ubuntu
if ! grep -q "Ubuntu" /etc/os-release 2>/dev/null; then
  echo -e "${RED}WARNING: This script is designed for Ubuntu 22.04${NC}"
  echo "Current OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2)"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check internet connectivity
if ! ping -c 1 google.com &> /dev/null; then
  echo -e "${RED}ERROR: No internet connectivity${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Step 2: Install Docker
echo -e "${YELLOW}Step 2/7: Installing Docker...${NC}"

if command -v docker &> /dev/null; then
  echo -e "${GREEN}Docker already installed ($(docker --version))${NC}"
else
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo -e "${GREEN}✅ Docker installed${NC}"
fi

# Verify Docker is running
if ! docker info &> /dev/null; then
  echo -e "${RED}ERROR: Docker is not running${NC}"
  echo "Try: systemctl start docker"
  exit 1
fi

echo ""

# Step 3: Install NVIDIA drivers and nvidia-docker2
echo -e "${YELLOW}Step 3/7: Installing NVIDIA drivers...${NC}"

if command -v nvidia-smi &> /dev/null; then
  echo -e "${GREEN}NVIDIA drivers already installed${NC}"
  nvidia-smi --query-gpu=gpu_name,driver_version --format=csv,noheader
else
  echo "Installing NVIDIA drivers (this may take a few minutes)..."
  apt-get update
  ubuntu-drivers autoinstall
  echo -e "${YELLOW}⚠️  NVIDIA drivers installed. System reboot required.${NC}"
  echo ""
  echo "Please run this script again after rebooting:"
  echo "  sudo reboot"
  echo "  # After reboot:"
  echo "  bash <(curl -s https://raw.githubusercontent.com/fabstir/fabstir-llm-sdk/main/deployment/scripts/deploy-host3-vultr.sh)"
  exit 0
fi

# Install nvidia-docker2
if ! dpkg -l | grep -q nvidia-docker2; then
  echo "Installing nvidia-docker2..."
  distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
  curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | apt-key add -
  curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
    tee /etc/apt/sources.list.d/nvidia-docker.list
  apt-get update
  apt-get install -y nvidia-docker2
  systemctl restart docker
  echo -e "${GREEN}✅ nvidia-docker2 installed${NC}"
else
  echo -e "${GREEN}nvidia-docker2 already installed${NC}"
fi

# Verify GPU access from Docker
echo "Verifying GPU access..."
if docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
  echo -e "${GREEN}✅ GPU access verified${NC}"
else
  echo -e "${RED}ERROR: Cannot access GPU from Docker${NC}"
  exit 1
fi

echo ""

# Step 4: Pull Docker image
echo -e "${YELLOW}Step 4/7: Pulling Docker image...${NC}"

# Check if GITHUB_TOKEN is set for private beta
if [[ "$DOCKER_IMAGE" == ghcr.io/* ]]; then
  if [ -z "$GITHUB_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  GITHUB_TOKEN not set. Assuming public image or already logged in.${NC}"
  else
    echo "Logging in to GHCR..."
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USERNAME" --password-stdin
  fi
fi

echo "Pulling ${DOCKER_IMAGE}..."
docker pull "$DOCKER_IMAGE"
echo -e "${GREEN}✅ Image pulled${NC}"
echo ""

# Step 5: Download model
echo -e "${YELLOW}Step 5/7: Downloading test model...${NC}"

MODEL_PATH="${MODEL_DIR}/${MODEL_NAME}"

if [ -f "$MODEL_PATH" ]; then
  FILE_SIZE=$(du -m "$MODEL_PATH" | cut -f1)
  echo -e "${GREEN}Model already exists (${FILE_SIZE}MB)${NC}"
else
  echo "Downloading TinyVicuna 1B model (~690MB)..."
  mkdir -p "$MODEL_DIR"
  curl -L \
    --progress-bar \
    --output "$MODEL_PATH" \
    "https://huggingface.co/afrideva/Tiny-Vicuna-1B-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf"
  echo -e "${GREEN}✅ Model downloaded${NC}"
fi

echo ""

# Step 6: Create .env file and run container
echo -e "${YELLOW}Step 6/7: Starting Docker container...${NC}"

# Stop existing container if running
if docker ps -a | grep -q "$CONTAINER_NAME"; then
  echo "Stopping existing container..."
  docker stop "$CONTAINER_NAME" &> /dev/null || true
  docker rm "$CONTAINER_NAME" &> /dev/null || true
fi

# Get public IP for PUBLIC_URL
PUBLIC_IP=$(curl -s ifconfig.me)
PUBLIC_URL="http://${PUBLIC_IP}:8083"

echo "Creating .env configuration..."
cat > /tmp/fabstir-host.env << EOF
# TEST_HOST_3 Configuration
HOST_PRIVATE_KEY=${HOST_PRIVATE_KEY}
PUBLIC_URL=${PUBLIC_URL}

# Blockchain - Get free API key from https://www.alchemy.com/
RPC_URL=${RPC_URL:-https://base-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY}
CHAIN_ID=84532

# Contracts
CONTRACT_JOB_MARKETPLACE=0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E
CONTRACT_NODE_REGISTRY=0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6
CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776
CONTRACT_MODEL_REGISTRY=0x92b2De840bB2171203011A6dBA928d855cA8183E
CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Model
MODEL_PATH=/models/${MODEL_NAME}
GPU_LAYERS=35

# Ports
API_PORT=8083
P2P_PORT=9000

# Logging
RUST_LOG=info
NODE_ENV=production
EOF

# Configure firewall
echo "Configuring firewall..."
if command -v ufw &> /dev/null; then
  ufw allow 22/tcp    # SSH
  ufw allow 8083/tcp  # API
  ufw allow 9000/tcp  # P2P
  ufw allow 3001/tcp  # Management API
  ufw --force enable
  echo -e "${GREEN}✅ Firewall configured${NC}"
fi

# Run container
echo "Starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --gpus all \
  --restart unless-stopped \
  -p 8083:8083 \
  -p 9000:9000 \
  -p 3001:3001 \
  -v "${MODEL_DIR}:/models" \
  --env-file /tmp/fabstir-host.env \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  "$DOCKER_IMAGE" \
  start --daemon

# Wait for container to start
echo "Waiting for container to initialize..."
sleep 10

# Check container status
if ! docker ps | grep -q "$CONTAINER_NAME"; then
  echo -e "${RED}ERROR: Container failed to start${NC}"
  echo "Logs:"
  docker logs "$CONTAINER_NAME"
  exit 1
fi

echo -e "${GREEN}✅ Container running${NC}"
echo ""

# Step 7: Register on blockchain
echo -e "${YELLOW}Step 7/7: Registering on blockchain...${NC}"

echo "Registering ${HOST_NAME} at ${PUBLIC_URL}..."
docker exec "$CONTAINER_NAME" node --require /app/polyfills.js dist/index.js register \
  --url "$PUBLIC_URL" \
  --models "$MODEL_STRING" \
  --stake 1000 \
  --price 2000 \
  --force

echo -e "${GREEN}✅ Host registered${NC}"
echo ""

# Verify registration
echo "Verifying registration..."
docker exec "$CONTAINER_NAME" node --require /app/polyfills.js dist/index.js info

echo ""

# Final summary
echo -e "${BLUE}============================================================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${GREEN}Host Information:${NC}"
echo "  Name:       ${HOST_NAME}"
echo "  Address:    ${HOST_ADDRESS}"
echo "  Public URL: ${PUBLIC_URL}"
echo ""
echo -e "${GREEN}Endpoints:${NC}"
echo "  API:        ${PUBLIC_URL}"
echo "  Health:     ${PUBLIC_URL}/health"
echo "  WebSocket:  ws://${PUBLIC_IP}:8083/ws"
echo ""
echo -e "${GREEN}Blockchain:${NC}"
echo "  Network:    Base Sepolia (84532)"
echo "  Registry:   0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6"
echo "  Stake:      1000 FAB"
echo "  Price:      2000 (0.002 USDC/token)"
echo ""
echo -e "${GREEN}Docker Container:${NC}"
echo "  Name:       ${CONTAINER_NAME}"
echo "  Status:     $(docker ps --filter name=${CONTAINER_NAME} --format "{{.Status}}")"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:       docker logs -f ${CONTAINER_NAME}"
echo "  Restart:         docker restart ${CONTAINER_NAME}"
echo "  Stop:            docker stop ${CONTAINER_NAME}"
echo "  GPU status:      docker exec ${CONTAINER_NAME} nvidia-smi"
echo "  Health check:    curl ${PUBLIC_URL}/health"
echo ""
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${GREEN}Host is now serving AI inference requests!${NC}"
echo ""
