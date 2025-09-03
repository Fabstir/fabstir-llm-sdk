# Test Host Node Runner

Real integration test host for Base Sepolia blockchain and P2P network.

## Setup

```bash
# Set environment variables in .env.test
TEST_HOST_1_PRIVATE_KEY=<host_private_key>
TEST_HOST_1_ADDRESS=<host_address>
RPC_URL_BASE_SEPOLIA=<rpc_url>
CONTRACT_NODE_REGISTRY=<registry_address>
CONTRACT_JOB_MARKETPLACE=<marketplace_address>
```

## Run Host

```bash
# Start host node
npx ts-node scripts/test-host/run-host.ts

# Run tests
npm test tests/scripts/test-host.test.ts
```

## Configuration

Edit `host-config.json`:
- `models`: Supported AI models
- `pricePerToken`: Price in ETH per token
- `autoClaim`: Auto-claim matching jobs
- `p2p.listenAddresses`: P2P listen addresses
- `p2p.bootstrapNodes`: Bootstrap peers

## Architecture

1. Registers on NodeRegistry contract
2. Starts P2P listener on port 4002
3. Monitors JobMarketplace events
4. Claims and processes jobs
5. Submits results on-chain

## Verification

Transactions visible on Base Sepolia:
https://base-sepolia.blockscout.com/address/<TEST_HOST_1_ADDRESS>