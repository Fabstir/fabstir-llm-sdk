# Installation Guide

## Table of Contents
- [System Requirements](#system-requirements)
- [Installation Methods](#installation-methods)
- [Post-Installation Setup](#post-installation-setup)
- [Verification](#verification)
- [Upgrading](#upgrading)
- [Uninstallation](#uninstallation)

## System Requirements

### Minimum Requirements
- **Operating System**: Linux, macOS, or Windows 10/11
- **Node.js**: Version 18.0.0 or higher
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free space
- **Network**: Stable internet connection
- **CPU**: 2+ cores recommended

### Blockchain Requirements
- **Wallet**: Ethereum-compatible wallet
- **ETH Balance**: Minimum 0.01 ETH on Base Sepolia (for gas)
- **FAB Tokens**: Minimum 1000 FAB for staking
- **RPC Access**: Base Sepolia RPC endpoint (free tier available)

### LLM Backend Requirements
One of the following:
- **Ollama**: Local LLM runtime
- **vLLM**: High-performance inference server
- **OpenAI API**: Compatible endpoint
- **Custom**: Any OpenAI-compatible API

## Installation Methods

### Method 1: Global NPM Installation (Recommended)

```bash
# Install globally from npm
npm install -g @fabstir/host-cli

# Verify installation
fabstir-host --version
```

### Method 2: From Source

```bash
# Clone repository
git clone https://github.com/fabstir/fabstir-host-cli.git
cd fabstir-host-cli

# Install dependencies
npm install

# Build from source
npm run build

# Link globally
npm link

# Verify installation
fabstir-host --version
```

### Method 3: Docker Container

```bash
# Pull Docker image
docker pull fabstir/host-cli:latest

# Run container
docker run -it \
  -v ~/.fabstir:/root/.fabstir \
  -p 8080:8080 \
  fabstir/host-cli:latest
```

### Method 4: Using pnpm

```bash
# Install with pnpm
pnpm add -g @fabstir/host-cli

# Verify installation
fabstir-host --version
```

## Post-Installation Setup

### 1. Initialize Configuration

Run the initialization wizard:

```bash
fabstir-host init
```

The wizard will guide you through:

#### Wallet Setup
```
? How would you like to setup your wallet?
  ❯ Create new wallet
    Import existing wallet
    Use environment variable
```

#### Network Selection
```
? Which network would you like to use?
  ❯ Base Sepolia (Testnet)
    Base Mainnet
    Custom RPC
```

#### Host Configuration
```
? Enter your host port: (8080)
? Enter your public URL: (http://localhost:8080)
? Select models to support: (Space to select)
  ◯ gpt-3.5-turbo
  ◯ gpt-4
  ◯ llama-2-70b
  ◯ custom
```

#### Pricing Configuration
```
? Enter price per token (in FAB): (0.0001)
? Enter minimum job deposit: (0.001)
```

### 2. Configure LLM Backend

#### For Ollama
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama2

# Configure endpoint
fabstir-host config set inference.endpoint http://localhost:11434
fabstir-host config set inference.type ollama
```

#### For vLLM
```bash
# Install vLLM
pip install vllm

# Start vLLM server
python -m vllm.entrypoints.openai.api_server \
  --model mistralai/Mistral-7B-v0.1 \
  --port 8000

# Configure endpoint
fabstir-host config set inference.endpoint http://localhost:8000
fabstir-host config set inference.type vllm
```

#### For OpenAI API
```bash
# Set API endpoint
fabstir-host config set inference.endpoint https://api.openai.com/v1
fabstir-host config set inference.type openai
fabstir-host config set inference.apiKey YOUR_API_KEY
```

### 3. Fund Your Wallet

#### Get Testnet ETH
1. Visit [Base Sepolia Faucet](https://faucet.base.org)
2. Enter your wallet address
3. Request test ETH

#### Get FAB Tokens (Testnet)
```bash
# Check current balances
fabstir-host wallet balance

# Request test FAB tokens (if available)
fabstir-host faucet request
```

### 4. Register as Host

```bash
# Register on blockchain
fabstir-host register

# This will:
# - Stake 1000 FAB tokens
# - Register your node address
# - Set your supported models
# - Configure pricing
```

## Verification

### Check Installation
```bash
# Version check
fabstir-host --version

# Configuration check
fabstir-host config list

# Wallet check
fabstir-host wallet address
fabstir-host wallet balance

# Network connectivity
fabstir-host network test

# LLM backend check
fabstir-host inference test
```

### Test Run
```bash
# Start in test mode
fabstir-host start --test

# Check logs
tail -f ~/.fabstir/logs/host.log

# Check status
fabstir-host status
```

## Environment Variables

You can use environment variables instead of config file:

```bash
# Create .env file
cat > .env << EOF
FABSTIR_PRIVATE_KEY=your_private_key_here
FABSTIR_RPC_URL=https://sepolia.base.org
FABSTIR_HOST_PORT=8080
FABSTIR_INFERENCE_ENDPOINT=http://localhost:11434
EOF

# Export variables
export $(cat .env | xargs)

# Run with env vars
fabstir-host start
```

## Systemd Service (Linux)

Create a systemd service for automatic startup:

```bash
# Generate service file
fabstir-host daemon generate-service

# Install service
sudo cp fabstir-host.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fabstir-host
sudo systemctl start fabstir-host

# Check status
sudo systemctl status fabstir-host
```

## Upgrading

### From NPM
```bash
# Update to latest version
npm update -g @fabstir/host-cli

# Check version
fabstir-host --version
```

### From Source
```bash
cd fabstir-host-cli
git pull origin main
npm install
npm run build
```

### Migration
```bash
# Backup configuration
fabstir-host config backup

# Run migration (if needed)
fabstir-host migrate

# Verify configuration
fabstir-host config list
```

## Uninstallation

### Remove NPM Package
```bash
# Uninstall global package
npm uninstall -g @fabstir/host-cli
```

### Remove Configuration
```bash
# Backup first (optional)
cp -r ~/.fabstir ~/.fabstir.backup

# Remove config directory
rm -rf ~/.fabstir
```

### Remove Service (Linux)
```bash
# Stop and disable service
sudo systemctl stop fabstir-host
sudo systemctl disable fabstir-host

# Remove service file
sudo rm /etc/systemd/system/fabstir-host.service
sudo systemctl daemon-reload
```

## Troubleshooting Installation

### Node.js Version Issues
```bash
# Check Node version
node --version

# Install Node 18+ using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

### Permission Errors
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Build Errors
```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Network Issues
```bash
# Test RPC connection
curl https://sepolia.base.org

# Use alternative RPC
fabstir-host config set network.rpcUrl https://base-sepolia.publicnode.com
```

## Next Steps

After successful installation:

1. Read the [Configuration Guide](CONFIGURATION.md)
2. Review [Security Best Practices](SECURITY.md)
3. Start hosting: `fabstir-host start`
4. Monitor earnings: `fabstir-host earnings balance`

For additional help, see [Troubleshooting Guide](TROUBLESHOOTING.md) or join our [Discord](https://discord.gg/fabstir).