#!/bin/bash
# Start Fabstir Host 2 Docker Container with mounted binary and GPU support
# This runs TEST_HOST_2_ADDRESS on port 8084

# Load environment variables from .env.test
set -a
source ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test
set +a

docker run -d \
  --name fabstir-host-test-2 \
  --gpus all \
  -p 8084:8083 \
  -p 9001:9000 \
  -p 3002:3001 \
  -v ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-node/models:/models \
  -v ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-node/target/release/fabstir-llm-node:/usr/local/bin/fabstir-llm-node:ro \
  -v ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test:/app/.env.test:ro \
  --env-file ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk/.env.test \
  -e HOST_PRIVATE_KEY="${TEST_HOST_2_PRIVATE_KEY}" \
  --entrypoint /bin/sh \
  fabstir-host-cli:local \
  -c "while true; do sleep 3600; done"

echo ""
echo "Container started. Verifying binary mount..."
docker exec fabstir-host-test-2 ls -lh /usr/local/bin/fabstir-llm-node
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Host 2 Container: fabstir-host-test-2"
echo "🔑 Host Address: ${TEST_HOST_2_ADDRESS}"
echo "🌐 Node API: http://localhost:8084"
echo "🔧 P2P Port: 9001"
echo "📡 Management API: http://localhost:3002 (start with start-management-server-host2.sh)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
