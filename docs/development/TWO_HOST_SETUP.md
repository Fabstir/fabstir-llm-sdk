# Two Host Testing Setup

This guide explains how to run two test hosts simultaneously for testing host competition, discovery, and pricing differences.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Host Machine (Your Computer)                                 │
│                                                               │
│  ┌──────────────────────┐      ┌──────────────────────┐    │
│  │ Container 1          │      │ Container 2          │    │
│  │ fabstir-host-test    │      │ fabstir-host-test-2  │    │
│  │                      │      │                      │    │
│  │ TEST_HOST_1          │      │ TEST_HOST_2          │    │
│  │ 0x4594F755...        │      │ 0x20f2A5FC...        │    │
│  │                      │      │                      │    │
│  │ Node:     8083       │      │ Node:     8084       │    │
│  │ P2P:      9000       │      │ P2P:      9001       │    │
│  │ Mgmt API: 3001       │      │ Mgmt API: 3002       │    │
│  └──────────────────────┘      └──────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Next.js Dev Server (apps/harness)                     │  │
│  │ localhost:3006 (mapped from container port 3000)      │  │
│  │ UI: http://localhost:3006/node-management-enhanced    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start Host 1 (if not already running)

```bash
./start-fabstir-docker-host1.sh
./start-management-server-host1.sh
```

### 2. Start Host 2

```bash
./start-fabstir-docker-host2.sh
./start-management-server-host2.sh
```

### 3. Verify Both Containers

```bash
docker ps | grep fabstir-host
```

You should see:
- `fabstir-host-test` (ports 8083, 9000, 3001)
- `fabstir-host-test-2` (ports 8084, 9001, 3002)

## Registering Hosts

### Register Host 1

1. Open browser: `http://localhost:3006/node-management-enhanced`
2. Management API should be: `http://localhost:3001` (default)
3. Fill in registration form:
   - **Host Address**: TEST_HOST_1_ADDRESS from .env.test
   - **API URL**: `http://localhost:8083`
   - **Model**: `CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf`
   - **Native Pricing**: `11363636363636` wei (~$0.00005 @ $4400 ETH)
   - **Stable Pricing**: `316` (0.000316 USDC per token)
4. Click "Register Host"

### Register Host 2

1. **Switch Management API endpoint** in the UI to: `http://localhost:3002`
2. Fill in registration form:
   - **Host Address**: TEST_HOST_2_ADDRESS from .env.test
   - **API URL**: `http://localhost:8084`
   - **Model**: Same as Host 1
   - **Native Pricing**: Different from Host 1 (e.g., `20000000000000` for testing)
   - **Stable Pricing**: Different from Host 1 (e.g., `500` for testing)
3. Click "Register Host"

## Starting Node Processes

### Start Host 1 Node

```bash
docker exec -d fabstir-host-test sh -c \
  'fabstir-llm-node --port 8083 \
   --model-path /models/tiny-vicuna-1b.q4_k_m.gguf \
   --host-private-key $HOST_PRIVATE_KEY \
   > /root/.fabstir/logs/node.log 2>&1'
```

### Start Host 2 Node

```bash
docker exec -d fabstir-host-test-2 sh -c \
  'fabstir-llm-node --port 8083 \
   --model-path /models/tiny-vicuna-1b.q4_k_m.gguf \
   --host-private-key $HOST_PRIVATE_KEY \
   > /root/.fabstir/logs/node.log 2>&1'
```

## Verifying Setup

### Check Health Endpoints

```bash
# Host 1
curl http://localhost:8083/health

# Host 2
curl http://localhost:8084/health
```

### Check Management APIs

```bash
# Host 1
curl http://localhost:3001/health

# Host 2
curl http://localhost:3002/health
```

### Check Registration Status

```bash
# Host 1 - From within container
docker exec fabstir-host-test fabstir-host info --address $TEST_HOST_1_ADDRESS

# Host 2 - From within container
docker exec fabstir-host-test-2 fabstir-host info --address $TEST_HOST_2_ADDRESS
```

## Testing Multi-Host Discovery

Once both hosts are registered and running, test pages should discover both:

1. Open: `http://localhost:3006/eth-mvp-flow-sdk.test`
2. Click "Step 3: Discover Hosts"
3. You should see both TEST_HOST_1 and TEST_HOST_2 with different pricing

## Port Reference

| Service | Host 1 | Host 2 |
|---------|--------|--------|
| Node API | 8083 | 8084 |
| P2P | 9000 | 9001 |
| Management API | 3001 | 3002 |

## Troubleshooting

### Container won't start - port already in use

```bash
# Check what's using the port
lsof -i :8083  # Host 1
lsof -i :8084  # Host 2
lsof -i :3001  # Host 1 Management API
lsof -i :3002  # Host 2 Management API

# Stop and remove containers
docker stop fabstir-host-test && docker rm fabstir-host-test
docker stop fabstir-host-test-2 && docker rm fabstir-host-test-2
```

### Node process not starting

```bash
# Check logs
docker exec fabstir-host-test-2 cat /root/.fabstir/logs/node.log

# Check if binary is mounted
docker exec fabstir-host-test-2 ls -lh /usr/local/bin/fabstir-llm-node

# Check if models are mounted
docker exec fabstir-host-test-2 ls -lh /models
```

### Management server not responding

```bash
# Check if server process is running
docker exec fabstir-host-test-2 ps aux | grep serve

# Restart management server
docker exec fabstir-host-test-2 pkill -f 'dist/index.js serve'
./start-management-server-host2.sh
```

### Wrong host address in registration

Make sure to use:
- Host 1: `0x4594F755F593B517Bb3194F4DeC20C48a3f04504` (TEST_HOST_1_ADDRESS)
- Host 2: `0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c` (TEST_HOST_2_ADDRESS)

Both addresses and private keys are in `.env.test`.

## Stopping Everything

```bash
# Stop Host 2
docker exec fabstir-host-test-2 pkill -f fabstir-llm-node
docker exec fabstir-host-test-2 pkill -f 'dist/index.js serve'
docker stop fabstir-host-test-2
docker rm fabstir-host-test-2

# Stop Host 1
docker exec fabstir-host-test pkill -f fabstir-llm-node
docker exec fabstir-host-test pkill -f 'dist/index.js serve'
docker stop fabstir-host-test
docker rm fabstir-host-test
```

## Testing Scenarios

### Test Host Competition

1. Register both hosts with different prices
2. Host 1: 316 (cheap) | Host 2: 500 (expensive)
3. Run session creation - should prefer Host 1
4. Verify client pays Host 1's price

### Test Host Discovery Filters

1. Set different model support
2. Query hosts by model - verify filtering works
3. Sort by price - verify ordering

### Test Simultaneous Sessions

1. Create session with Host 1
2. Create another session with Host 2
3. Both should run concurrently
4. Verify separate earnings tracking

## Notes

- Both hosts share the same GPU and model files (mounted from host machine)
- Each host has independent blockchain identity (address + private key)
- Management APIs are separate - switch between them in the UI
- Node processes run on different ports but same protocol
- Both hosts connect to the same Base Sepolia testnet contracts
