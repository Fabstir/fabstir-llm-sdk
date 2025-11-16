# Release Notes - v8.3.5-rag-response-type-field

## Release Date
2025-11-05

## Summary
Critical bug fix for RAG WebSocket responses - adds missing `type` field to enable proper SDK message routing.

## Problem Fixed

### Issue
SDK developer reported that `uploadVectors` appeared to succeed (4 vectors uploaded), but `searchVectors` immediately failed with "RAG not enabled for this session" error.

### Root Cause
Browser console logs revealed:
```javascript
WebSocket received raw message: {uploaded: 4, rejected: 0, errors: []}
[WebSocketClient] handleMessage called for type: undefined  // ← Missing type field!
```

The `UploadVectorsResponse` and `SearchVectorsResponse` structs were missing the `type` field, causing SDK clients to receive responses without proper message type identification.

### Impact
- SDK couldn't correlate responses to handlers
- Client thought uploadVectors failed (even though it succeeded server-side)
- Session WAS created with RAG enabled, but client didn't know
- Subsequent searchVectors failed because client thought upload didn't work

## Changes Made

### 1. Updated Response Structures

**File**: `/workspace/src/api/websocket/message_types.rs`

Added `msg_type` field to response structs:

```rust
pub struct UploadVectorsResponse {
    #[serde(rename = "type")]
    pub msg_type: String,  // ← NEW
    // ... existing fields
}

pub struct SearchVectorsResponse {
    #[serde(rename = "type")]
    pub msg_type: String,  // ← NEW
    // ... existing fields
}
```

### 2. Updated Response Creation

**File**: `/workspace/src/api/websocket/handlers/rag.rs`

Now sets type field when creating responses:

```rust
// uploadVectors handler
Ok(UploadVectorsResponse {
    msg_type: "uploadVectorsResponse".to_string(),
    request_id: request.request_id,
    uploaded,
    rejected,
    errors,
})

// searchVectors handler
Ok(SearchVectorsResponse {
    msg_type: "searchVectorsResponse".to_string(),
    request_id: request.request_id,
    results,
    total_vectors,
    search_time_ms,
})
```

### 3. Version Updates

- `/workspace/VERSION`: `8.3.5-rag-response-type-field`
- `/workspace/src/version.rs`: Updated all version constants and tests

## Expected Behavior After Fix

### uploadVectors Response
```json
{
  "type": "uploadVectorsResponse",
  "requestId": "...",
  "uploaded": 4,
  "rejected": 0,
  "errors": []
}
```

### searchVectors Response
```json
{
  "type": "searchVectorsResponse",
  "requestId": "...",
  "results": [
    {
      "id": "chunk-1",
      "score": 0.95,
      "metadata": {"text": "..."}
    }
  ],
  "totalVectors": 4,
  "searchTimeMs": 1.23
}
```

## Testing

### Build & Verify
```bash
cargo build --release --features real-ezkl -j 4
strings target/release/fabstir-llm-node | grep "v8.3.5"
# Should see: v8.3.5-rag-response-type-field-2025-11-05
```

### Deployment to Docker
```bash
# Copy updated binary into container
docker cp ./target/release/fabstir-llm-node llm-node-prod-1:/usr/local/bin/fabstir-llm-node

# Restart node
docker restart llm-node-prod-1

# Verify version
docker logs llm-node-prod-1 2>&1 | grep "BUILD VERSION" | tail -1
# Should see: 🔖 BUILD VERSION: v8.3.5-rag-response-type-field-2025-11-05
```

### Expected Client Behavior
1. **uploadVectors** sends 4 vectors with session_id "102"
2. **SDK receives** `{type: "uploadVectorsResponse", uploaded: 4, ...}`
3. **SDK handler** properly routes message based on `type` field
4. **searchVectors** executes with session_id "102"
5. **SDK receives** `{type: "searchVectorsResponse", results: [...], ...}`
6. **Search succeeds** with proper results

## Compatibility

- ✅ **Backward Compatible**: No breaking changes to request formats
- ✅ **Contract Compatible**: No smart contract changes
- ✅ **SDK Compatible**: Adds expected field that SDKs were already looking for
- ✅ **All v8.3.x Features**: Session persistence, embeddings, RAG all intact

## Files Modified

1. `/workspace/VERSION`
2. `/workspace/src/version.rs`
3. `/workspace/src/api/websocket/message_types.rs`
4. `/workspace/src/api/websocket/handlers/rag.rs`

## Breaking Changes from v8.3.4

None - this is a pure bug fix that adds a field SDK clients were expecting but server wasn't providing.

## Next Steps for SDK Developer

1. **Wait for v8.3.5 deployment** to production Docker container
2. **Refresh browser page** to get new WebSocket connection
3. **Test RAG flow again**:
   - Upload document (should see `type: "uploadVectorsResponse"`)
   - Search vectors (should see `type: "searchVectorsResponse"` with results)

## Debugging Confirmation

If RAG still doesn't work after v8.3.5 deployment, check:

```bash
# 1. Verify ONNX model loaded
docker logs llm-node-prod-1 2>&1 | grep "Embedding model manager initialized"
# Should see: ✅ Embedding model manager initialized

# 2. Check uploadVectors was called
docker logs llm-node-prod-1 2>&1 | grep "uploadVectors.*102"
# Should see: 📤 uploadVectors message received
#            ✅ Session ready with RAG enabled: 102

# 3. Check searchVectors was called
docker logs llm-node-prod-1 2>&1 | grep "searchVectors.*102"
# Should see: 🔍 searchVectors message received
#            ✅ searchVectors response: X results in Y.YYms
```

## Credits

Discovered through excellent debugging by SDK developer who shared browser console logs showing the missing `type` field issue.

