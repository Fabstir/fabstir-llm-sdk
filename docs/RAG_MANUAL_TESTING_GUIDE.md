# RAG Manual Testing Guide

## Testing RAG Embedding Endpoint

This guide explains how to test the RAG embedding functionality using the Node Management UI.

### Prerequisites

1. **Production node running** (v8.3.0 with host-side RAG)
2. **Host registered** on the blockchain
3. **Node Management UI** accessible at http://localhost:3000/node-management-enhanced

### Test Steps

#### 1. Navigate to Node Management

```
http://localhost:3000/node-management-enhanced
```

#### 2. Register/Start Node

If not already registered:
- Select chain (Base Sepolia recommended)
- Choose wallet type (Private Key for testing)
- Click "Register Host"
- Click "Start Node"

#### 3. Test RAG Embedding

Once node is registered and running:

1. Scroll to **"🧪 Node Testing"** section
2. Click **"Test RAG"** button
3. Observe the logs

### Expected Results

**✅ SUCCESS:**
```
🧪 Testing /v1/embed endpoint...
✅ RAG embedding test passed!
   📊 Received 2 embeddings
   📏 Dimension: 384 (expected: 384)
   💰 Cost: $0
   ⛓️  Chain: Base Sepolia
   ✅ Embedding dimension correct!
```

**❌ FAILURE (Endpoint not available):**
```
🧪 Testing /v1/embed endpoint...
❌ RAG test timeout - endpoint may not be available
   This means /v1/embed is not responding
```

**❌ FAILURE (Node not running):**
```
🧪 Testing /v1/embed endpoint...
❌ RAG test failed: fetch failed
```

### What the Test Does

The RAG test sends a POST request to `/v1/embed` with:

```json
{
  "texts": ["Hello world", "Test embedding"],
  "model": "all-MiniLM-L6-v2",
  "chain_id": 84532
}
```

And expects a response with:
- **2 embeddings** (one per input text)
- **384 dimensions** per embedding (all-MiniLM-L6-v2 standard)
- **$0 cost** (host-side is free)
- **Chain info** (Base Sepolia)

### Troubleshooting

#### Test times out
- **Cause:** `/v1/embed` endpoint not implemented yet
- **Solution:** Node developer needs to implement the endpoint (see `docs/node-reference/HOST_EMBEDDING_IMPLEMENTATION.md`)

#### "No API URL discovered"
- **Cause:** Host not registered or metadata incomplete
- **Solution:** Complete host registration first

#### HTTP 404
- **Cause:** Endpoint route not registered in node
- **Solution:** Verify node binary version with `fabstir-llm-node --version`

#### HTTP 503
- **Cause:** Embedding model not loaded
- **Solution:** Check node logs for model loading errors

### Additional Tests

Once RAG test passes, you can test full RAG workflow:

1. **Upload Document** - Go to `/chat-context-rag-demo`
2. **Choose file** - Select a .txt or .md file
3. **Upload** - Document should embed successfully
4. **Ask question** - Query about the document content
5. **Verify context** - Response should reference document

### Node Developer Verification

If you're the node developer, you can test directly with curl:

```bash
# Inside container:
docker exec fabstir-host-test curl -X POST http://localhost:8083/v1/embed \
  -H "Content-Type: application/json" \
  -d '{
    "texts": ["Hello world", "Test embedding"],
    "model": "all-MiniLM-L6-v2",
    "chain_id": 84532
  }'
```

**Expected output:**
```json
{
  "embeddings": [
    {
      "embedding": [0.123, 0.456, ..., 0.789],  // 384 floats
      "text": "Hello world",
      "tokenCount": 2
    },
    {
      "embedding": [0.234, 0.567, ..., 0.890],  // 384 floats
      "text": "Test embedding",
      "tokenCount": 2
    }
  ],
  "model": "all-MiniLM-L6-v2",
  "provider": "host",
  "totalTokens": 4,
  "cost": 0.0,
  "chain_id": 84532,
  "chain_name": "Base Sepolia",
  "native_token": "ETH"
}
```

### References

- **Node API Docs:** `docs/node-reference/API.md`
- **Embedding Implementation Guide:** `docs/node-reference/HOST_EMBEDDING_IMPLEMENTATION.md`
- **RAG Architecture:** `docs/IMPLEMENTATION_CHAT_RAG.md`
- **Release Notes:** `docs/node-reference/RELEASE_NOTES_v8.3.0.md`
