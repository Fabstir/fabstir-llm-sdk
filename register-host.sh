# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

#!/bin/bash
# Register TEST_HOST_1 via CLI to create local config

echo "🔧 Registering host via CLI to create local configuration..."

docker exec fabstir-host-test fabstir-host register \
  --url "http://localhost:8083" \
  --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" \
  --stake "1000" \
  --price "100" \
  --force

echo ""
echo "✅ Host configuration created. You can now start the node via the management UI!"
