# Deployment Guide - v8.3.5

## Quick Summary

**What's Fixed**: RAG responses now include `type` field for proper SDK message routing.

**Version**: v8.3.5-rag-response-type-field-2025-11-05

**Binary Location**: `/workspace/target/release/fabstir-llm-node`

## Deployment Steps

### 1. Copy Binary to Docker Container

```bash
# Navigate to the project directory
cd /workspace

# Copy the updated binary into the running Docker container
docker cp ./target/release/fabstir-llm-node llm-node-prod-1:/usr/local/bin/fabstir-llm-node

# Verify copy succeeded
docker exec llm-node-prod-1 ls -lh /usr/local/bin/fabstir-llm-node
```

### 2. Restart the Node

```bash
# Restart the Docker container
docker restart llm-node-prod-1

# Wait a few seconds for it to start
sleep 5
```

### 3. Verify Version (Multiple Methods)

#### Method 1: Check Logs (OLD WAY - requires grep)
```bash
docker logs llm-node-prod-1 2>&1 | grep "BUILD VERSION" | tail -1
```

**Expected Output**:
```
🔖 BUILD VERSION: v8.3.5-rag-response-type-field-2025-11-05
```

#### Method 2: Use Version Endpoint (NEW WAY - much easier!)
```bash
# Simple version check
curl -s http://localhost:8080/v1/version | jq -r '.build'

# Full version info
curl -s http://localhost:8080/v1/version | jq '.'
```

**Expected Output**:
```json
{
  "version": "8.3.5",
  "build": "v8.3.5-rag-response-type-field-2025-11-05",
  "date": "2025-11-05",
  "features": [
    "multi-chain",
    "base-sepolia",
    "opbnb-testnet",
    "chain-aware-sessions",
    "auto-settlement",
    "websocket-compression",
    "rate-limiting",
    "job-auth",
    "dual-pricing",
    "native-stable-pricing",
    "end-to-end-encryption",
    "ecdh-key-exchange",
    "xchacha20-poly1305",
    "encrypted-sessions",
    "session-key-management",
    "ecdsa-authentication",
    "perfect-forward-secrecy",
    "replay-protection",
    "gpu-stark-proofs",
    "risc0-zkvm",
    "cuda-acceleration",
    "zero-knowledge-proofs",
    "s5-proof-storage",
    "off-chain-proofs",
    "proof-hash-cid",
    "host-side-rag",
    "session-vector-storage",
    "384d-embeddings",
    "cosine-similarity-search"
  ],
  "chains": [
    84532,
    5611
  ],
  "breaking_changes": [
    "Patch version bump (v8.3.4 -> v8.3.5) - RAG Response Type Field",
    "FIXED: Added missing 'type' field to uploadVectorsResponse and searchVectorsResponse",
    "uploadVectorsResponse now includes type: 'uploadVectorsResponse'",
    "searchVectorsResponse now includes type: 'searchVectorsResponse'",
    "Enables proper SDK message routing and correlation",
    "Fixes SDK error: 'handleMessage called for type: undefined'",
    "All v8.3.x features intact (Host-Side RAG + Session Persistence)",
    "No contract changes - fully compatible with v8.2.0+"
  ]
}
```

#### Method 3: From Browser (easiest for SDK developers!)

Open in browser:
```
http://localhost:8080/v1/version
```

### 4. Verify ONNX Model Loaded

```bash
docker logs llm-node-prod-1 2>&1 | grep -E "(Embedding model|all-MiniLM)" | tail -5
```

**Expected Output**:
```
✅ ONNX embedding model loaded successfully
✓ Successfully loaded model: all-MiniLM-L6-v2 (384 dimensions)
✅ Embedding model manager initialized
   Available embedding models:
     - all-MiniLM-L6-v2 (384D)
```

### 5. Test RAG Functionality

#### Monitor Logs in Real-Time
```bash
# In one terminal, watch logs
docker logs -f llm-node-prod-1 | grep -E "(uploadVectors|searchVectors|session|✅|🔍)"
```

#### Have SDK Developer Test

1. **Upload Vectors** (session "102" or any ID):
   - SDK should see response with `type: "uploadVectorsResponse"`
   - Server logs should show: `✅ Session ready with RAG enabled: 102`

2. **Search Vectors** (same session ID):
   - SDK should see response with `type: "searchVectorsResponse"`
   - Server logs should show: `✅ searchVectors response: X results in Y.YYms`

## Troubleshooting

### Issue: Version endpoint returns 404

**Check if node is running**:
```bash
docker ps | grep llm-node-prod-1
```

**Check if port 8080 is accessible**:
```bash
curl -s http://localhost:8080/health
```

**If health returns 404**, the node isn't running properly. Check logs:
```bash
docker logs llm-node-prod-1 2>&1 | tail -50
```

### Issue: Old version still showing

**Possible causes**:
1. Docker cached the old binary
2. Wrong container name
3. Binary wasn't copied correctly

**Solutions**:

```bash
# 1. Verify binary inside container has new version
docker exec llm-node-prod-1 strings /usr/local/bin/fabstir-llm-node | grep "v8.3.5"

# 2. If not found, re-copy
docker cp ./target/release/fabstir-llm-node llm-node-prod-1:/usr/local/bin/fabstir-llm-node

# 3. Force restart
docker restart llm-node-prod-1

# 4. Check version via API (not logs)
curl -s http://localhost:8080/v1/version | jq -r '.build'
```

### Issue: ONNX model not loaded

```bash
# Check if model files exist
docker exec llm-node-prod-1 ls -la /app/models/all-MiniLM-L6-v2-onnx/

# If missing, copy from host
docker cp ./models/all-MiniLM-L6-v2-onnx llm-node-prod-1:/app/models/

# Restart
docker restart llm-node-prod-1
```

### Issue: RAG still not working

**Debug checklist**:

```bash
# 1. Check version (must be v8.3.5)
curl -s http://localhost:8080/v1/version | jq -r '.version'

# 2. Check ONNX model loaded
docker logs llm-node-prod-1 2>&1 | grep "Embedding model manager initialized"

# 3. Check if uploadVectors was called
docker logs llm-node-prod-1 2>&1 | grep "uploadVectors" | tail -5

# 4. Check if session was created with RAG
docker logs llm-node-prod-1 2>&1 | grep "Session ready with RAG"

# 5. Check for any errors
docker logs --since 10m llm-node-prod-1 2>&1 | grep ERROR
```

## Version Endpoint Usage

### Quick Version Check
```bash
# Just get version number
curl -s http://localhost:8080/v1/version | jq -r '.version'
# Output: 8.3.5

# Get full build string
curl -s http://localhost:8080/v1/version | jq -r '.build'
# Output: v8.3.5-rag-response-type-field-2025-11-05

# Get build date
curl -s http://localhost:8080/v1/version | jq -r '.date'
# Output: 2025-11-05
```

### Check Specific Features
```bash
# Check if RAG is supported
curl -s http://localhost:8080/v1/version | jq '.features | contains(["host-side-rag"])'
# Output: true

# List all features
curl -s http://localhost:8080/v1/version | jq -r '.features[]'
```

### Check Breaking Changes
```bash
# See what changed in this version
curl -s http://localhost:8080/v1/version | jq -r '.breaking_changes[]'
```

## Success Criteria

✅ **Version endpoint returns 8.3.5**:
```bash
curl -s http://localhost:8080/v1/version | jq -r '.version'
# Should output: 8.3.5
```

✅ **ONNX model loaded**:
```bash
docker logs llm-node-prod-1 2>&1 | grep "Embedding model manager initialized"
# Should see: ✅ Embedding model manager initialized
```

✅ **uploadVectors works** (check SDK response):
```json
{
  "type": "uploadVectorsResponse",  // ← Must have this!
  "uploaded": 4,
  "rejected": 0,
  "errors": []
}
```

✅ **searchVectors works** (check SDK response):
```json
{
  "type": "searchVectorsResponse",  // ← Must have this!
  "results": [...],
  "totalVectors": 4,
  "searchTimeMs": 1.23
}
```

## Post-Deployment

1. **Have SDK developer refresh their browser page** (to get fresh WebSocket connection)
2. **Test complete RAG flow**: upload document → search query → get results
3. **Monitor logs** for any unexpected errors
4. **Check version via API** (not logs) to confirm deployment

## Emergency Rollback

If v8.3.5 causes issues (unlikely), rollback to v8.3.4:

```bash
# If you have v8.3.4 binary saved
docker cp ./target/release/fabstir-llm-node.v8.3.4 llm-node-prod-1:/usr/local/bin/fabstir-llm-node
docker restart llm-node-prod-1

# Verify rollback
curl -s http://localhost:8080/v1/version | jq -r '.version'
# Should show: 8.3.4
```

## Notes

- **No database migrations needed** - pure code change
- **No contract deployments needed** - no blockchain changes
- **No configuration changes needed** - same .env files work
- **Docker restart is required** - binary runs as process 1 in container
- **Version endpoint is instant** - no need to grep through logs anymore! 🎉

