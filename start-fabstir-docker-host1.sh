# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

#!/bin/bash
# Start Fabstir Host CLI for TEST_HOST_1
# This is for development/testing — uses .env.test for config

# Load environment variables from .env.test
set -a
source ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test
set +a

# Map CONTRACT_*_TOKEN vars to host-cli's expected names
export FAB_TOKEN="${CONTRACT_FAB_TOKEN}"
export USDC_TOKEN="${CONTRACT_USDC_TOKEN}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Host CLI for: ${TEST_HOST_1_ADDRESS}"
echo "🌐 RPC: ${RPC_URL_BASE_SEPOLIA}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Usage examples:"
echo "  docker run -it --env-file .env fabstir/host-cli dashboard"
echo "  docker run --env-file .env fabstir/host-cli info"
echo "  docker run --env-file .env fabstir/host-cli set-model-pricing --model 'repo:file' --price 5 --price-type usdc"
echo ""

# Run the command passed as arguments, default to --help
docker run -it \
  --env-file ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test \
  -e HOST_PRIVATE_KEY="${TEST_HOST_1_PRIVATE_KEY}" \
  -e FAB_TOKEN="${CONTRACT_FAB_TOKEN}" \
  -e USDC_TOKEN="${CONTRACT_USDC_TOKEN}" \
  fabstir/host-cli "${@:---help}"
