# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

#!/bin/bash
# fabstir-llm-sdk/.devcontainer/yolo-runner.sh

echo "🚀 Fabstir SDK YOLO Mode"
echo "========================"

# Initialize if needed
if [ ! -f "package.json" ]; then
    pnpm init
    pnpm add -D typescript @types/node vitest @vitest/ui
fi

# Start test watcher
exec /usr/local/bin/test-watcher.sh