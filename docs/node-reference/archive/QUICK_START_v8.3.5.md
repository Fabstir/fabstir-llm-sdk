# Quick Start - Deploy v8.3.5

## TL;DR - 3 Commands

```bash
# 1. Copy new binary
docker cp ./target/release/fabstir-llm-node llm-node-prod-1:/usr/local/bin/fabstir-llm-node

# 2. Restart node
docker restart llm-node-prod-1

# 3. Check version (NEW FEATURE!)
curl -s http://localhost:8080/v1/version | jq -r '.build'
```

**Expected Output**: `v8.3.5-rag-response-type-field-2025-11-05`

## What's New in v8.3.5

1. ✅ **Fixed RAG responses** - now include `type` field for SDK routing
2. ✅ **Added `/v1/version` endpoint** - no more grep-ing through Docker logs!

## Version Endpoint Examples

```bash
# Quick version check
curl http://localhost:8080/v1/version | jq -r '.version'
# Output: 8.3.5

# Full version info
curl http://localhost:8080/v1/version | jq '.'
# Output: { version, build, date, features, chains, breaking_changes }

# Check if RAG is supported
curl http://localhost:8080/v1/version | jq '.features | contains(["host-side-rag"])'
# Output: true
```

## Test RAG

After deployment, have your SDK developer test:

1. **Upload document** → should see `type: "uploadVectorsResponse"`
2. **Search vectors** → should see `type: "searchVectorsResponse"` with results

## Monitor in Real-Time

```bash
docker logs -f llm-node-prod-1 | grep -E "(uploadVectors|searchVectors|✅)"
```

## Troubleshooting

**Version still shows 8.3.4?**
```bash
# Force restart
docker restart llm-node-prod-1
sleep 5

# Check again (use API, not logs!)
curl -s http://localhost:8080/v1/version | jq -r '.version'
```

**RAG not working?**
```bash
# Check ONNX model loaded
docker logs llm-node-prod-1 2>&1 | grep "Embedding model manager initialized"

# Expected: ✅ Embedding model manager initialized
```

## Success Checklist

- [ ] Binary copied to container
- [ ] Container restarted
- [ ] Version endpoint returns `8.3.5`
- [ ] ONNX model loaded successfully
- [ ] uploadVectors returns `type: "uploadVectorsResponse"`
- [ ] searchVectors returns `type: "searchVectorsResponse"`

## Files

- 📄 `RELEASE_NOTES_v8.3.5.md` - Detailed technical changes
- 📄 `DEPLOYMENT_v8.3.5.md` - Complete deployment guide
- 📄 `RAG_TROUBLESHOOTING_GUIDE.md` - Debug RAG issues

