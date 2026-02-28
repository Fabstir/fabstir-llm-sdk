# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

# Fabstir Host CLI - Lightweight Management Tool
# For host operators to manage their LLM node (dashboard, pricing, registration, etc.)
# The LLM node itself runs in a separate container.

#######################
# Stage 1: Build
#######################
FROM node:20-slim AS builder

WORKDIR /build

# Install pnpm and TypeScript globally
RUN npm install -g pnpm@8 typescript@5

# Copy only the packages we need (not the full monorepo)
COPY packages/sdk-core ./packages/sdk-core
COPY packages/host-cli ./packages/host-cli

# Copy s5js tarballs (both the dist and the npm package)
COPY s5js-dist.tar.gz /tmp/
COPY s5js-0.3.0.tgz /build/
COPY fabstir-vector-db-native-0.3.0.tgz /build/
RUN mkdir -p ./packages/s5js && \
    tar xzf /tmp/s5js-dist.tar.gz -C ./packages/s5js/ && \
    rm /tmp/s5js-dist.tar.gz

# Create minimal pnpm-workspace.yaml for these packages
RUN echo "packages:" > pnpm-workspace.yaml && \
    echo "  - 'packages/*'" >> pnpm-workspace.yaml

# Remove fabstir-llm-auth dependency from sdk-core (it's outside monorepo)
RUN sed -i '/"@fabstir\/llm-auth":/d' packages/sdk-core/package.json

# Install ALL dependencies with --ignore-scripts (avoid premature builds)
WORKDIR /build/packages/s5js
RUN pnpm install --ignore-scripts

WORKDIR /build/packages/sdk-core
RUN pnpm install --ignore-scripts

WORKDIR /build/packages/host-cli
RUN pnpm install --ignore-scripts

# Build packages in dependency order

# 1. Fix sdk-core build config to mark s5js and events as external
WORKDIR /build/packages/sdk-core
RUN sed -i 's/--external:assert/--external:assert --external:@s5-dev\/s5js --external:events/g' package.json && \
    sed -i 's/--external:@base-org\/account/--external:@base-org\/account --external:@s5-dev\/s5js --external:events/g' package.json

# 2. Build SDK core (dependency of host-cli)
RUN pnpm run build

# 3. Build host-cli
WORKDIR /build/packages/host-cli
RUN npx tsc 2>&1 | tee build.log || true && \
    ls -la dist/ && \
    echo "Build artifacts created successfully" && \
    grep -v "^#!/" dist/index.js > dist/index-clean.js 2>/dev/null || cp dist/index.js dist/index-clean.js && \
    mv dist/index-clean.js dist/index.js

#######################
# Stage 2: Runtime
#######################
FROM node:20-slim

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@8

# Copy built packages as local dependencies
COPY --from=builder /build/packages/sdk-core /tmp/deps/sdk-core
COPY --from=builder /build/packages/s5js /tmp/deps/s5js
COPY --from=builder /build/fabstir-vector-db-native-0.3.0.tgz /tmp/

# Copy host-cli files
COPY --from=builder /build/packages/host-cli/package.json ./package.json
COPY --from=builder /build/packages/host-cli/dist ./dist

# Copy sdk-core ABI files to expected location (for hardcoded ABI paths in info.ts)
RUN mkdir -p /sdk-core/src/contracts/abis
COPY --from=builder /build/packages/sdk-core/src/contracts/abis/*.json /sdk-core/src/contracts/abis/

# Replace workspace dependencies with local file paths
# Downgrade inquirer to v8 (v9 is ESM-only, not compatible with CommonJS compilation)
RUN sed -i 's|"@fabstir/sdk-core": "workspace:\*"|"@fabstir/sdk-core": "file:/tmp/deps/sdk-core"|g' package.json && \
    sed -i 's|"@s5-dev/s5js": "file:.*"|"@s5-dev/s5js": "file:/tmp/deps/s5js"|g' /tmp/deps/sdk-core/package.json && \
    sed -i 's|"inquirer": "\^9\.[0-9]*\.[0-9]*"|"inquirer": "^8.2.6"|g' package.json && \
    sed -i 's|"@types/inquirer": "\^9\.[0-9]*\.[0-9]*"|"@types/inquirer": "^8.2.10"|g' package.json && \
    pnpm install --prod --no-optional --shamefully-hoist

# Create Node.js polyfill script for browser APIs (IndexedDB, WebSocket)
RUN echo "// Browser API polyfills for S5 in Node.js\n\
require('fake-indexeddb/auto');\n\
const WebSocket = require('ws');\n\
global.WebSocket = WebSocket;\n\
" > /app/polyfills.js

# Environment variables (can be overridden at runtime via --env-file)
ENV NODE_ENV=production
ENV SKIP_S5_STORAGE=true
# TUI Dashboard support - ensures box drawing characters render correctly
ENV TERM=xterm-256color

WORKDIR /app

# Entry point - allows running Host CLI commands
# Usage: docker run -it --env-file .env fabstir/host-cli dashboard
#        docker run --env-file .env fabstir/host-cli info
#        docker run --env-file .env fabstir/host-cli set-model-pricing --model "repo:file" --price 5
ENTRYPOINT ["node", "--require", "/app/polyfills.js", "dist/index.js"]

# Default: show help
CMD ["--help"]
