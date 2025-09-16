#!/bin/bash
set -e

# --- Ensure symlink for @s5-dev/s5js ---
TARGET="/workspace/packages/s5js"
LINK="/workspace/node_modules/@s5-dev/s5js"

mkdir -p /workspace/node_modules/@s5-dev

if [ -d "$TARGET" ]; then
  if [ -L "$LINK" ] && [ "$(readlink -f "$LINK")" = "$TARGET" ]; then
    echo "🔗 Symlink already OK: $LINK -> $TARGET"
  else
    ln -sfn "$TARGET" "$LINK"
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
