#!/bin/bash
# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

#!/bin/bash
set -e

# --- Fix Docker socket permissions ---
if [ -S /var/run/docker.sock ]; then
    sudo chmod 666 /var/run/docker.sock 2>/dev/null || echo "⚠️  Warning: Could not fix docker socket permissions"
    echo "✅ Docker socket permissions fixed"
fi

# --- Ensure node_modules has correct permissions ---
if [ -d "/workspace/node_modules" ]; then
    sudo chown -R developer:developer /workspace/node_modules 2>/dev/null || true
fi

# --- Ensure symlink for @s5-dev/s5js ---
TARGET="/workspace/packages/s5js"
LINK="/workspace/node_modules/@s5-dev/s5js"

# Create directory with sudo if needed
if ! mkdir -p /workspace/node_modules/@s5-dev 2>/dev/null; then
    sudo mkdir -p /workspace/node_modules/@s5-dev
    sudo chown -R developer:developer /workspace/node_modules/@s5-dev
fi

if [ -d "$TARGET" ]; then
  if [ -L "$LINK" ] && [ "$(readlink -f "$LINK")" = "$TARGET" ]; then
    echo "🔗 Symlink already OK: $LINK -> $TARGET"
  else
    # Remove old symlink if exists
    rm -f "$LINK" 2>/dev/null || sudo rm -f "$LINK"
    # Create new symlink
    if ! ln -sfn "$TARGET" "$LINK" 2>/dev/null; then
        sudo ln -sfn "$TARGET" "$LINK"
        sudo chown -h developer:developer "$LINK"
    fi
    echo "✅ Symlink created: $LINK -> $TARGET"
  fi
else
  echo "⚠️  Warning: $TARGET not found, symlink skipped"
fi

# --- Start Xvfb for Playwright/Chrome ---
Xvfb :99 -screen 0 1280x1024x24 &
export DISPLAY=:99

# --- Hand off to container CMD ---
exec "$@"