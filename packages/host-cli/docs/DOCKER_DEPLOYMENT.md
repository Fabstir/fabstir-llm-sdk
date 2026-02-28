# Docker Deployment Guide

> Deploy the Fabstir Host CLI as a lightweight Docker container for managing your LLM host node.

## Overview

The Host CLI Docker image is a **management tool only** — it handles registration, pricing, the TUI dashboard, withdrawals, and other host operations. Your LLM node runs in its own separate container (provided by your node developer).

## Prerequisites

1. **Docker** installed
2. **A running LLM node** (separate container, with API accessible)
3. **An `.env` file** with your wallet key and contract addresses (see `.env.example`)

## Quick Start

### 1. Build the image

```bash
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk
docker build -f packages/host-cli/Dockerfile -t fabstir/host-cli .
```

### 2. Set up your `.env`

Copy `packages/host-cli/.env.example` to your working directory and fill in your values:

```env
HOST_PRIVATE_KEY=0x_your_private_key
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org
CONTRACT_JOB_MARKETPLACE=0x...
CONTRACT_NODE_REGISTRY=0x...
CONTRACT_PROOF_SYSTEM=0x...
CONTRACT_HOST_EARNINGS=0x...
CONTRACT_MODEL_REGISTRY=0x...
FAB_TOKEN=0x...
USDC_TOKEN=0x...
```

### 3. Run commands

```bash
# Show help
docker run --env-file .env fabstir/host-cli --help

# Check host info
docker run --env-file .env fabstir/host-cli info

# Interactive TUI dashboard (requires -it for terminal)
docker run -it --env-file .env fabstir/host-cli dashboard

# Register as a host
docker run --env-file .env fabstir/host-cli register \
  --url "http://my-node:8083" \
  --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" \
  --stake "1000"

# Set model pricing (USDC)
docker run --env-file .env fabstir/host-cli set-model-pricing \
  --model "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" \
  --price 5 --price-type usdc

# Set model pricing (ETH)
docker run --env-file .env fabstir/host-cli set-model-pricing \
  --model "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" \
  --price 0.5 --price-type eth

# Withdraw earnings
docker run --env-file .env fabstir/host-cli withdraw
```

## TUI Dashboard

The interactive dashboard requires `-it` flags for proper terminal rendering:

```bash
docker run -it --env-file .env fabstir/host-cli dashboard
```

**Keyboard shortcuts:**
- `R` — Refresh all panels
- `M` — Model pricing (set per-model USDC/ETH prices)
- `P` — Pricing (redirects to model pricing)
- `W` — Withdraw earnings
- `Q` — Quit

## Development / Testing

For testing with `.env.test` from the SDK repo:

```bash
bash start-fabstir-docker-host1.sh dashboard
```

This script maps `CONTRACT_FAB_TOKEN` / `CONTRACT_USDC_TOKEN` from `.env.test` to the `FAB_TOKEN` / `USDC_TOKEN` names the CLI expects.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HOST_PRIVATE_KEY` | Yes | Host wallet private key |
| `RPC_URL_BASE_SEPOLIA` | Yes | Base Sepolia RPC endpoint |
| `CONTRACT_JOB_MARKETPLACE` | Yes | JobMarketplace contract address |
| `CONTRACT_NODE_REGISTRY` | Yes | NodeRegistry contract address |
| `CONTRACT_PROOF_SYSTEM` | Yes | ProofSystem contract address |
| `CONTRACT_HOST_EARNINGS` | Yes | HostEarnings contract address |
| `CONTRACT_MODEL_REGISTRY` | Yes | ModelRegistry contract address |
| `FAB_TOKEN` | Yes | FAB token contract address |
| `USDC_TOKEN` | Yes | USDC token contract address |

## Troubleshooting

### Dashboard shows garbled text
Ensure you're running with `-it` flags:
```bash
docker run -it --env-file .env fabstir/host-cli dashboard
```

### "Missing required environment variables"
Check your `.env` file has all required variables. Compare with `.env.example`.

### "USDC_TOKEN not set" or "FAB_TOKEN not set"
Your `.env` may use the old names (`CONTRACT_USDC_TOKEN`, `CONTRACT_FAB_TOKEN`). Add:
```env
FAB_TOKEN=0x...
USDC_TOKEN=0x...
```

---

Last updated: February 2026
