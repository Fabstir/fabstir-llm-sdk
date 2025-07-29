# Fabstir LLM SDK

TypeScript SDK for interacting with the Fabstir P2P LLM Marketplace.

## Installation

```bash
npm install @fabstir/llm-sdk
# or
pnpm add @fabstir/llm-sdk
```

## Quick Start

```typescript
import { FabstirSDK } from "@fabstir/llm-sdk";
import { ethers } from "ethers";

// Initialize SDK
const sdk = new FabstirSDK({
  network: "base-sepolia",
  debug: true,
});

// Connect wallet
const provider = new ethers.providers.Web3Provider(window.ethereum);
await sdk.connect(provider);

// Submit a job
const jobId = await sdk.submitJob({
  prompt: "Explain blockchain in one paragraph",
  modelId: "llama2-7b",
  maxTokens: 150,
  temperature: 0.7,
});

// Stream the response
const stream = sdk.createResponseStream(jobId);
for await (const token of stream) {
  console.log(token.content);
}
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Watch mode
pnpm dev
```

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

## Architecture

The SDK provides a simple interface to:

- Discover available AI models
- Submit inference jobs to the marketplace
- Monitor job progress in real-time
- Stream responses as they're generated
- Handle payments automatically

All communication happens directly peer-to-peer without any central servers.
