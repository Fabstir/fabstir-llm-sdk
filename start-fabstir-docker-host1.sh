# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

#!/bin/bash
# Start Fabstir Host 1 Docker Container with mounted binary and GPU support
# This runs TEST_HOST_1_ADDRESS on port 8083

# Load environment variables from .env.test
set -a
source ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test
set +a

docker run -d \
  --name fabstir-host-test \
  --gpus all \
  -p 8083:8083 \
  -p 9000:9000 \
  -p 3001:3001 \
  -v ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-node/models:/models \
  -v ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-node/target/release/fabstir-llm-node:/usr/local/bin/fabstir-llm-node:ro \
  -v ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test:/app/.env.test:ro \
  --env-file ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test \
  -e HOST_PRIVATE_KEY="${TEST_HOST_1_PRIVATE_KEY}" \
  --entrypoint /bin/sh \
  fabstir-host-cli:local \
  -c "while true; do sleep 3600; done"

echo ""
echo "Container started. Verifying binary mount..."
docker exec fabstir-host-test ls -lh /usr/local/bin/fabstir-llm-node
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Host 1 Container: fabstir-host-test"
echo "🔑 Host Address: ${TEST_HOST_1_ADDRESS}"
echo "🌐 Node API: http://localhost:8083"
echo "🔧 P2P Port: 9000"
echo "📡 Management API: http://localhost:3001 (start with start-management-server-host1.sh)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
