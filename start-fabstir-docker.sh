#!/bin/bash
# Start Fabstir Host Docker Container with mounted binary and GPU support

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
  -e HOST_PRIVATE_KEY="${TEST_HOST_2_PRIVATE_KEY}" \
  --entrypoint /bin/sh \
  fabstir-host-cli:local \
  -c "while true; do sleep 3600; done"

echo ""
echo "Container started. Verifying binary mount..."
docker exec fabstir-host-test ls -lh /usr/local/bin/fabstir-llm-node
