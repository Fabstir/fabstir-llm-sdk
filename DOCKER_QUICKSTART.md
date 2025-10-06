# Docker Quick Start - Fabstir Host Node

> **5-minute setup** for running a Fabstir host node locally

## Prerequisites Checklist

- [ ] Docker installed with GPU support (optional)
- [ ] fabstir-llm-node binary built (`~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-node/target/release/`)
- [ ] Model file downloaded (e.g., `tiny-vicuna-1b.q4_k_m.gguf`)
- [ ] `.env.test` file at repo root (provided by project owner)
- [ ] Test account has 1000+ FAB and 0.001+ ETH on Base Sepolia

## Quick Setup (4 Commands)

```bash
# 1. Build Docker image (~60 seconds)
docker build --no-cache -f packages/host-cli/Dockerfile -t fabstir-host-cli:local .

# 2. Start container
docker stop fabstir-host-test 2>/dev/null && docker rm fabstir-host-test 2>/dev/null
bash start-fabstir-docker.sh

# 3. Register host (~2 minutes - includes model loading)
bash register-host.sh

# 4. Start node
docker exec -it fabstir-host-test sh -c 'node --require /app/polyfills.js dist/index.js start'
```

## Verify It's Working

In a **separate terminal**:

```bash
# Test health endpoint
curl http://localhost:8083/health

# Expected response:
# {"status":"healthy","model":"TinyVicuna-1B","uptime":123}
```

You should also see in the node terminal:
```
✅ Model loaded
✅ P2P started
✅ API started
✅ API is accessible
🔄 Running in foreground mode
📌 New peer connected: 12D3Koo...
```

## Troubleshooting

### "Port already in use"
```bash
docker exec fabstir-host-test pkill -f fabstir-llm-node
# Wait 2 seconds, then retry start command
```

### "Connection refused" on health check
```bash
# Check if node is actually running
docker exec fabstir-host-test ps aux | grep fabstir-llm-node

# Check what port it's using (should be 8080)
docker exec fabstir-host-test netstat -tlnp | grep LISTEN
```

### "No configuration found"
```bash
# Re-run registration
bash register-host.sh
```

## Common Commands

```bash
# Check node status
docker exec fabstir-host-test ps aux | grep fabstir-llm-node

# View config
docker exec fabstir-host-test cat /root/.fabstir/config.json

# Stop node
docker exec fabstir-host-test pkill -f fabstir-llm-node

# Restart container
docker restart fabstir-host-test
```

## Next Steps

- 📖 Full guide: [packages/host-cli/docs/DOCKER_DEPLOYMENT.md](packages/host-cli/docs/DOCKER_DEPLOYMENT.md)
- 🔧 Test with UI: `cd apps/harness && pnpm dev` → http://localhost:3000
- 🛠️ Daemon mode: See full deployment guide
- 🚀 Production: Update public URL and configure firewall

## Success Criteria

✅ Registration transaction confirmed on Base Sepolia
✅ Health endpoint returns `{"status":"healthy"}`
✅ P2P peers connecting/disconnecting (visible in logs)
✅ WebSocket connections working

**Time to MVP**: ~5 minutes from clone to running node! 🎉

---

**Tested**: October 2025
**Status**: ✅ Validated working
**Support**: See [packages/host-cli/docs/DOCKER_DEPLOYMENT.md](packages/host-cli/docs/DOCKER_DEPLOYMENT.md)
