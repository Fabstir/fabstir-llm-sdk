# Fabstir LLM Host - Production Deployment

**Complete deployment system for GPU providers to join the Fabstir decentralized AI marketplace.**

---

## 📁 What's Inside

```
deployment/
├── Dockerfile.production.comprehensive  # Multi-stage Docker build
├── .env.host3.template                  # Configuration template
├── scripts/
│   ├── build-production-image.sh       # Build & push to GHCR
│   ├── download-test-model.sh          # Download TinyVicuna model
│   └── deploy-host3-vultr.sh           # Automated Vultr deployment
├── docs/
│   ├── BETA_TESTER_QUICK_START.md     # Beta tester guide (15 min setup)
│   └── REGISTRY_MIGRATION_GUIDE.md    # GHCR → Docker Hub transition
└── README.md                           # This file
```

---

## 🚀 Quick Start Paths

### For Project Team (Building the Image)

```bash
# Build production image
./deployment/scripts/build-production-image.sh

# Push to GHCR (private beta)
./deployment/scripts/build-production-image.sh --push

# Or with custom tag
./deployment/scripts/build-production-image.sh --tag v1.0.0 --push
```

**GitHub Actions**: Automatic builds on push to `main` → `.github/workflows/docker-build-beta.yml`

---

### For Beta Testers (Using the Image)

**See**: [`docs/BETA_TESTER_QUICK_START.md`](docs/BETA_TESTER_QUICK_START.md)

**TL;DR** (3 commands):
```bash
# 1. Set GitHub credentials
export GITHUB_TOKEN=your_token
export GITHUB_USERNAME=your_username

# 2. Run deployment script
bash <(curl -s https://raw.githubusercontent.com/fabstir/fabstir-llm-sdk/main/deployment/scripts/deploy-host3-vultr.sh)

# 3. Done! Node is serving AI inference
```

---

### For Vultr TEST_HOST_3 Deployment

```bash
# SSH into Vultr GPU instance
ssh root@<vultr-ip>

# Run deployment script
./deployment/scripts/deploy-host3-vultr.sh

# Or remotely via curl
bash <(curl -s https://raw.githubusercontent.com/.../deploy-host3-vultr.sh)
```

**Configuration**: Uses TEST_HOST_3 credentials from `.env.test`

---

## 📦 What's in the Docker Image

The production image (`ghcr.io/fabstir/llm-host:beta-latest`) contains:

1. **fabstir-llm-node** (Rust binary)
   - LLM inference server with GPU support
   - STARK proof generation (Risc0 zkVM)
   - WebSocket API (port 8083)
   - P2P networking (port 9000)

2. **TypeScript Host CLI** (packages/host-cli)
   - Blockchain registration
   - Host management commands
   - SDK integration

3. **NVIDIA CUDA Runtime** (12.2.0)
   - GPU acceleration
   - No compilation needed on deployment

4. **Node.js 20**
   - TypeScript CLI execution
   - Browser API polyfills (IndexedDB, WebSocket)

**Image Size**: ~3-4GB (no model included)

---

## 🔧 Deployment Scenarios

### Scenario 1: Private Beta Testing (Current)

**Registry**: GitHub Container Registry (GHCR)
**Image**: `ghcr.io/fabstir/llm-host:beta-latest`
**Access**: GitHub authentication required

```bash
# Beta testers login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin

# Pull beta image
docker pull ghcr.io/fabstir/llm-host:beta-latest

# Run with TEST_HOST_3 config
docker run -d --gpus all ghcr.io/fabstir/llm-host:beta-latest start
```

---

### Scenario 2: Public Launch (Future)

**Registry**: Docker Hub
**Image**: `fabstir/llm-host:v1.0`
**Access**: Public (no authentication)

```bash
# No login needed
docker pull fabstir/llm-host:v1.0

# Run with user's own wallet
docker run -d --gpus all fabstir/llm-host:v1.0 start
```

**Migration**: See [`docs/REGISTRY_MIGRATION_GUIDE.md`](docs/REGISTRY_MIGRATION_GUIDE.md)

---

## 🛠️ Build Process

### Local Build (Project Team)

```bash
# Prerequisites
# - fabstir-llm-node tarball (fabstir-llm-node-v8.1.6-websocket-error-logging.tar.gz)
# - s5js tarball (s5js-dist.tar.gz)
# - Docker with BuildKit

# Build image
docker build \
  -f deployment/Dockerfile.production.comprehensive \
  -t ghcr.io/fabstir/llm-host:beta-latest \
  .

# Test image
docker run --rm ghcr.io/fabstir/llm-host:beta-latest --help
```

### GitHub Actions (Automated)

Triggers on:
- Push to `main` branch
- Changes in `packages/host-cli/` or `deployment/Dockerfile.production.comprehensive`
- Manual workflow dispatch

**Workflow**: `.github/workflows/docker-build-beta.yml`

---

## 📝 Configuration

### Environment Variables

**Required**:
- `HOST_PRIVATE_KEY` - Ethereum wallet private key
- `PUBLIC_URL` - Host's public URL (e.g., `http://1.2.3.4:8083`)

**Blockchain** (Base Sepolia):
- `RPC_URL` - Base Sepolia RPC endpoint
- `CHAIN_ID` - `84532`
- `CONTRACT_JOB_MARKETPLACE` - JobMarketplace address
- `CONTRACT_NODE_REGISTRY` - NodeRegistry address
- `CONTRACT_HOST_EARNINGS` - HostEarnings address

**Model**:
- `MODEL_PATH` - Path to GGUF model file (e.g., `/models/tiny-vicuna-1b.q4_k_m.gguf`)
- `GPU_LAYERS` - GPU offload layers (default: `35`)

**See**: [`.env.host3.template`](.env.host3.template) for complete example

---

## 🧪 Testing

### Test Locally

```bash
# Pull image
docker pull ghcr.io/fabstir/llm-host:beta-latest

# Download model
./deployment/scripts/download-test-model.sh

# Run container
docker run -d \
  --name fabstir-host-test \
  --gpus all \
  -p 8083:8083 \
  -v ~/fabstir-models:/models \
  --env-file .env \
  ghcr.io/fabstir/llm-host:beta-latest \
  start --daemon

# Check health
curl http://localhost:8083/health

# View logs
docker logs -f fabstir-host-test
```

### Test on Vultr

```bash
# Deploy to Vultr instance
./deployment/scripts/deploy-host3-vultr.sh

# From local machine, test remote node
curl http://<vultr-ip>:8083/health

# Test from SDK
cd apps/harness
pnpm dev
# Open http://localhost:3000/chat-context-popupfree-demo
# Verify TEST_HOST_3 appears in host list
```

---

## 📚 Documentation

- **[BETA_TESTER_QUICK_START.md](docs/BETA_TESTER_QUICK_START.md)** - Complete beta tester guide
- **[REGISTRY_MIGRATION_GUIDE.md](docs/REGISTRY_MIGRATION_GUIDE.md)** - GHCR to Docker Hub migration
- **[PLATFORMLESS_AI_DEPLOYMENT_GUIDEv2.md](../docs/PLATFORMLESS_AI_DEPLOYMENT_GUIDEv2.md)** - Architecture overview
- **[Host CLI Commands](../packages/host-cli/docs/COMMANDS.md)** - CLI reference

---

## 🔍 Troubleshooting

### "Cannot pull from GHCR"
```bash
# Ensure GitHub token is set
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin

# Verify you have package read permissions
# Ask project team to grant access
```

### "GPU not accessible"
```bash
# Verify nvidia-docker2 is installed
docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi

# If fails, reinstall nvidia-docker2
apt-get install -y nvidia-docker2
systemctl restart docker
```

### "Model not found"
```bash
# Download model
./deployment/scripts/download-test-model.sh

# Verify model exists
ls -lh ~/fabstir-models/tiny-vicuna-1b.q4_k_m.gguf

# Check volume mount in docker run command
docker run -v ~/fabstir-models:/models ...
```

### "Container won't start"
```bash
# Check logs
docker logs fabstir-host

# Verify .env file
cat .env | grep HOST_PRIVATE_KEY
cat .env | grep MODEL_PATH

# Restart with verbose logging
docker run --env RUST_LOG=debug ...
```

---

## 🎯 Deployment Timeline

### Private Beta (Weeks 1-3)
- ✅ GHCR image available
- ✅ Invited beta testers only
- ✅ Testing on Base Sepolia
- ✅ Collect feedback

### Transition (Week 4)
- 📝 Bug fixes and polish
- 📝 Docker Hub setup
- 📝 Documentation finalization
- 📝 Migration scripts

### Public Launch (Week 5+)
- 🚀 Docker Hub release
- 🚀 Public announcement
- 🚀 Open to all GPU providers
- 🚀 Mainnet preparation

---

## 📞 Support

**Beta Testers**:
- Email: beta@fabstir.com
- Discord: #beta-testing
- GitHub Issues: https://github.com/fabstir/fabstir-llm-sdk/issues

**Project Team**:
- Review [`BETA_TESTER_QUICK_START.md`](docs/BETA_TESTER_QUICK_START.md) for beta tester FAQs
- Review [`REGISTRY_MIGRATION_GUIDE.md`](docs/REGISTRY_MIGRATION_GUIDE.md) for migration process

---

## 🔗 Related Links

- **SDK Repository**: https://github.com/fabstir/fabstir-llm-sdk
- **Node Repository**: https://github.com/fabstir/fabstir-llm-node
- **Documentation**: https://docs.fabstir.com
- **Discord**: https://discord.gg/fabstir

---

**License**: BUSL-1.1
**Last Updated**: 2025-01-21
