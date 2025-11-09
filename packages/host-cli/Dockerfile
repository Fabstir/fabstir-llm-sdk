# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

# Fabstir Host CLI - Production Docker Image
# Multi-stage build for optimized image size

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
# We'll handle this differently for production
RUN sed -i '/"@fabstir\/llm-auth":/d' packages/sdk-core/package.json

# Install ALL dependencies with --ignore-scripts (avoid premature builds)
WORKDIR /build/packages/s5js
RUN pnpm install --ignore-scripts

WORKDIR /build/packages/sdk-core
RUN pnpm install --ignore-scripts

WORKDIR /build/packages/host-cli
RUN pnpm install --ignore-scripts

# Build packages in dependency order
# (s5js already built and copied from host)

# 1. Fix sdk-core build config to mark s5js and events as external
# (s5js is read-only dependency, don't bundle it)
WORKDIR /build/packages/sdk-core
RUN sed -i 's/--external:assert/--external:assert --external:@s5-dev\/s5js --external:events/g' package.json && \
    sed -i 's/--external:@base-org\/account/--external:@base-org\/account --external:@s5-dev\/s5js --external:events/g' package.json

# 2. Build SDK core (dependency of host-cli)
RUN pnpm run build

# 3. Build host-cli (allow type errors for local testing)
WORKDIR /build/packages/host-cli
# Compile TypeScript, ignore type errors for local testing
RUN npx tsc 2>&1 | tee build.log || true && \
    ls -la dist/ && \
    echo "Build artifacts created successfully" && \
    # Remove any corrupted shebang lines from dist/index.js
    grep -v "^#!/" dist/index.js > dist/index-clean.js 2>/dev/null || cp dist/index.js dist/index-clean.js && \
    mv dist/index-clean.js dist/index.js

#######################
# Stage 3: Runtime
#######################
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# Install Node.js 20 and dependencies for fabstir-llm-node
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    wget \
    gnupg \
    libgomp1 \
    libssl-dev \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
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

# Copy sdk-core ABI files to expected location (for hardcoded paths in info.ts)
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

# Install fabstir-llm-node binary
# NOTE: Replace this with actual binary installation when available
# Option 1: Download pre-built binary
# RUN wget -O /usr/local/bin/fabstir-llm-node \
#     https://github.com/fabstir/fabstir-llm-node/releases/latest/download/fabstir-llm-node-linux-x64 \
#     && chmod +x /usr/local/bin/fabstir-llm-node

# Option 2: Copy from local build (for development)
# COPY fabstir-llm-node /usr/local/bin/fabstir-llm-node
# RUN chmod +x /usr/local/bin/fabstir-llm-node

# Option 3: Build from source (heavy, not recommended for production image)
# RUN apt-get update && apt-get install -y cargo git \
#     && git clone https://github.com/fabstir/fabstir-llm-node \
#     && cd fabstir-llm-node \
#     && cargo build --release \
#     && cp target/release/fabstir-llm-node /usr/local/bin/ \
#     && cd .. && rm -rf fabstir-llm-node \
#     && apt-get remove -y cargo git && apt-get autoremove -y

# Extract fabstir-llm-node binary and models from tarball
COPY fabstir-llm-node-v8.3.5-rag-response-type-field.tar.gz /tmp/
RUN mkdir -p /models /root/.fabstir/logs && \
    tar xzf /tmp/fabstir-llm-node-v8.3.5-rag-response-type-field.tar.gz -C /tmp/ && \
    mv /tmp/fabstir-llm-node /usr/local/bin/ && \
    chmod +x /usr/local/bin/fabstir-llm-node && \
    if [ -d /tmp/models ]; then mv /tmp/models/* /models/; fi && \
    rm -rf /tmp/fabstir-llm-node-v8.3.5-rag-response-type-field.tar.gz /tmp/models

# Create symlink for model access from app directory
RUN ln -s /models /app/models

# Expose ports
EXPOSE 8083 9000 3001

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV API_PORT=8083
ENV INTERNAL_PORT=8083
ENV P2P_PORT=9000
ENV SKIP_S5_STORAGE=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8083/health || exit 1

# Set working directory
WORKDIR /app

# Entry point - allows running Host CLI commands
# Preload browser API polyfills (IndexedDB, WebSocket) for S5 in Node.js
ENTRYPOINT ["node", "--require", "/app/polyfills.js", "dist/index.js"]

# Default command - keep container running
CMD ["start", "--daemon"]
