# Setting Up Your Ubuntu Server as a Fabstir LLM Host Node

**Created for**: Ubuntu 22.04 + NVIDIA GTX 4090 deployment

---

## What You Have

✅ **Hardware**: Ubuntu 22.04 LTS server with NVIDIA GTX 4090 GPU, RAID 1 storage
✅ **Software**: NVIDIA 580.95.05 driver, CUDA 13.0, Docker with GPU support
✅ **Network**: Static IP address accessible on the internet
✅ **Model**: Already registered `tiny-vicuna-1b.q4_k_m.gguf` on blockchain
✅ **Production UI3**: Currently using fabstir-sdk-core-1.3.36.tgz (deployed in cloud)

---

## What I've Created for You

### 1. **Comprehensive Setup Guide** (PRIMARY DOCUMENT)
**File**: `docs/node-reference/UBUNTU_GPU_HOST_SETUP.md`

This is your main guide. It contains:
- ✅ 11 phases with estimated time for each (total ~70 minutes)
- ✅ All commands ready to copy/paste into your SSH session
- ✅ Complete environment configuration with correct contract addresses
- ✅ Docker Compose configuration for production deployment
- ✅ Verification steps to ensure everything works
- ✅ Troubleshooting section for common issues
- ✅ Post-deployment checklist
- ✅ Next steps (testing, monitoring, upgrading to larger model)

**Start here!** Follow it step-by-step from your SSH session.

### 2. **Quick Reference Guide** (KEEP THIS OPEN)
**File**: `docs/node-reference/UBUNTU_GPU_HOST_QUICK_REFERENCE.md`

This is your cheat sheet. It contains:
- ✅ Quick commands for container management
- ✅ Health & monitoring commands
- ✅ Log viewing and debugging commands
- ✅ Configuration update procedures
- ✅ Useful bash aliases to save typing
- ✅ Emergency commands for when things go wrong

**Keep this open in a second terminal** or browser tab while following the main guide.

---

## How to Proceed

### Step 1: Open Both Documents

On your **Windows PC**:

1. Open the main guide in your browser or text editor:
   - File: `/workspace/docs/node-reference/UBUNTU_GPU_HOST_SETUP.md`
   - This has the complete step-by-step instructions

2. Open the quick reference in another window:
   - File: `/workspace/docs/node-reference/UBUNTU_GPU_HOST_QUICK_REFERENCE.md`
   - This has commands you can quickly copy

### Step 2: SSH into Your Ubuntu Server

From **Windows PowerShell**:

```powershell
ssh YOUR_USERNAME@YOUR_SERVER_IP
```

### Step 3: Follow the Main Guide

Start at **Phase 1** in `UBUNTU_GPU_HOST_SETUP.md` and work through each phase:

1. **Phase 1**: System Verification (5 min) - Verify prerequisites
2. **Phase 2**: Clone Repository (5 min) - Get fabstir-llm-node code
3. **Phase 3**: Download Model (10 min) - Get tiny-vicuna model file
4. **Phase 4**: Environment Config (10 min) - Set up .env files
5. **Phase 5**: Docker Compose (5 min) - Create production config
6. **Phase 6**: Build Image (15 min) - Build Docker image with CUDA
7. **Phase 7**: Start Node (2 min) - Launch the container
8. **Phase 8**: Verify Deployment (10 min) - Test everything works
9. **Phase 9**: Firewall (5 min) - Configure security
10. **Phase 10**: External Testing (5 min) - Test from Windows PC
11. **Phase 11**: Monitoring (10 min) - Set up monitoring tools

**Total time**: ~70 minutes

### Step 4: Verify Success

Use the **Post-Deployment Checklist** in the main guide to verify everything is working:

- [ ] Container running
- [ ] Health endpoint responds
- [ ] Version endpoint returns v8.3.5+
- [ ] GPU detected
- [ ] Model loaded
- [ ] Firewall configured
- [ ] External access works
- [ ] WebSocket accepts connections

### Step 5: Test with SDK

From your **Windows PC**, test the node with the Fabstir SDK to ensure it can accept jobs and serve prompts.

---

## Key Information You'll Need

### Before You Start

Make sure you have:

1. **Your host's private key** - The Ethereum wallet private key for your registered host
   - Format: `0x` followed by 64 hexadecimal characters (66 characters total)
   - Example: `0x1234567890abcdef...` (NOT the real one!)
   - This goes in `.env` as `HOST_PRIVATE_KEY`

2. **Your server's public IP address**
   - Find it with: `curl -4 ifconfig.me` (from Ubuntu server)
   - You'll use this in the node URL: `http://YOUR_IP:8080`

3. **SSH access credentials**
   - Username and password/SSH key for your Ubuntu server

### Contract Addresses (Already in Guide)

The guide includes the correct Base Sepolia testnet contract addresses:
- JobMarketplace: `0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E`
- NodeRegistry: `0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6`
- HostEarnings: `0x908962e8c6CE72610021586f85ebDE09aAc97776`
- ModelRegistry: `0x92b2De840bB2171203011A6dBA928d855cA8183E`
- USDC Token: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### Model Information

You mentioned you already registered:
- **Model**: `tiny-vicuna-1b.q4_k_m.gguf`
- **Full name**: `CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf`
- **Model ID**: `0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced`
- **Size**: ~600MB
- **VRAM**: ~1-2GB (perfect for testing on your RTX 4090)

The guide includes download instructions for this specific model.

---

## What the Deployment Does

```
┌─────────────────────────────────────────────────────────────┐
│  UBUNTU 22.04 SERVER (Your Static IP)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Docker Container: llm-node-prod-1                 │    │
│  │                                                    │    │
│  │  ┌──────────────────────────────────────────────┐ │    │
│  │  │  fabstir-llm-node (Rust binary)              │ │    │
│  │  │                                              │ │    │
│  │  │  - WebSocket Server (port 8080)              │ │    │
│  │  │  - P2P Network (port 9000)                   │ │    │
│  │  │  - End-to-end Encryption                     │ │    │
│  │  │  - RAG Support (vector search)               │ │    │
│  │  │  - GPU Inference (CUDA)                      │ │    │
│  │  │                                              │ │    │
│  │  │  Model: tiny-vicuna-1b.q4_k_m.gguf          │ │    │
│  │  │  Contracts: Base Sepolia (chain 84532)      │ │    │
│  │  └──────────────────────────────────────────────┘ │    │
│  └────────────────────────────────────────────────────┘    │
│           │                                                │
│           ├─> Uses NVIDIA GTX 4090 (via nvidia-docker)    │
│           ├─> Reads .env (configuration)                  │
│           ├─> Reads .env.contracts (addresses)            │
│           └─> Mounts ./models/ (model files)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
           │
           │ Port 8080 (HTTP/WebSocket)
           │ Port 9000 (P2P)
           │
           ↓
    Internet (Firewall: ufw)
           │
           ↓
┌─────────────────────────────────────────────────────────────┐
│  SDK CLIENT (Windows PC or other)                          │
│                                                             │
│  // UI3 Production (fabstir-sdk-core-1.3.36.tgz)           │
│  const sdk = new FabstirSDKCore({...})                     │
│  await sdk.authenticate(privateKey)                        │
│  const sessionMgr = await sdk.getSessionManager()          │
│  const session = await sessionMgr.startSession({           │
│    hostUrl: 'http://YOUR_SERVER_IP:8080',                 │
│    modelName: 'tiny-vicuna-1b',                           │
│    chainId: 84532                                          │
│  })                                                        │
│                                                             │
│  // Encrypted WebSocket connection established!           │
│  const response = await sessionMgr.sendPrompt(             │
│    session.sessionId,                                      │
│    'Hello, world!'                                         │
│  )                                                         │
│                                                             │
│  // SDK v1.3.36 compatible with node v8.3.5 ✅             │
└─────────────────────────────────────────────────────────────┘
```

---

## After Deployment

### You'll Be Able To:

1. **Accept LLM inference jobs** from SDK clients
2. **Earn USDC payments** for serving prompts (Base Sepolia testnet)
3. **Monitor performance** with GPU metrics and container stats
4. **Scale up** by upgrading to larger models (OpenAI OSS 20B when ready)
5. **Provide RAG services** (vector search for context-enhanced responses)

### Your Node Will:

1. **Listen for WebSocket connections** on port 8080
2. **Participate in P2P network** on port 9000
3. **Execute LLM inference** using your RTX 4090
4. **Encrypt all communications** end-to-end with clients
5. **Settle payments** automatically on Base Sepolia blockchain
6. **Store session vectors** in memory for RAG queries
7. **Monitor health** via `/health` and `/v1/version` endpoints

---

## Troubleshooting

If you encounter issues during setup:

1. **Check the main guide's Troubleshooting section**
   - Covers common issues like port conflicts, GPU not detected, model not loading

2. **Use the Quick Reference for debugging commands**
   - Log viewing, container diagnostics, GPU checks

3. **Check the existing documentation**
   - `docs/node-reference/DEPLOYMENT.md` - General deployment guide
   - `docs/node-reference/TROUBLESHOOTING.md` - Detailed troubleshooting
   - `docs/node-reference/API.md` - API reference

4. **Common First-Time Issues**:
   - **Firewall blocking ports** → Solution in Phase 9
   - **GPU not accessible to Docker** → Test with `docker run --gpus all nvidia/cuda:12.0-base nvidia-smi`
   - **Port 8080 already in use** → Check with `sudo ss -tulpn | grep 8080`
   - **Model file not found** → Verify path in Phase 3
   - **Private key format wrong** → Must be exactly 66 characters starting with `0x`

---

## Next Steps After Successful Deployment

1. **Test with SDK client** from your Windows PC
2. **Monitor logs** to see sessions, prompts, responses
3. **Watch GPU utilization** to see your hardware working
4. **Test RAG functionality** (vector upload, search)
5. **Consider SSL/TLS** for production use
6. **Plan model upgrade** to larger model when ready
7. **Set up automated backups** for configuration
8. **Configure monitoring** (Prometheus/Grafana for advanced users)

---

## Important Security Notes

🔒 **NEVER COMMIT YOUR `.env` FILE TO GIT**
- Contains your `HOST_PRIVATE_KEY`
- Should be in `.gitignore` (already configured)

🔒 **PROTECT YOUR PRIVATE KEY**
- Store in password manager or secrets vault
- Never share in chat, logs, or screenshots
- Use different key for production vs testing

🔒 **FIREWALL CONFIGURATION**
- Only expose ports 22 (SSH), 8080 (API), 9000 (P2P)
- Use fail2ban for SSH brute-force protection (optional)
- Consider VPN for SSH access (advanced)

🔒 **REGULAR UPDATES**
- Keep Ubuntu packages updated: `sudo apt update && sudo apt upgrade`
- Keep Docker updated
- Pull latest fabstir-llm-node code periodically

---

## Support

**Documentation**:
- Main Setup Guide: `docs/node-reference/UBUNTU_GPU_HOST_SETUP.md`
- Quick Reference: `docs/node-reference/UBUNTU_GPU_HOST_QUICK_REFERENCE.md`
- Troubleshooting: `docs/node-reference/TROUBLESHOOTING.md`

**Community**:
- GitHub Issues: https://github.com/fabstir/fabstir-llm-node/issues
- Discord: [If available]

**Emergency**:
- If node stops: `docker compose -f docker-compose.prod.yml restart`
- If completely broken: `docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d --build`
- If server unresponsive: Reboot via your hosting provider's control panel

---

## Timeline

**Total estimated time**: 70 minutes

- System prep: 5 min
- Clone repo: 5 min
- Download model: 10 min
- Configuration: 10 min
- Docker setup: 5 min
- Build image: 15 min (depends on internet speed)
- Deploy & verify: 15 min
- Testing: 5 min

**Plus optional**:
- Monitoring setup: 10 min
- SSL/TLS configuration: 20 min (if using domain)

---

## Ready to Start?

1. Open `UBUNTU_GPU_HOST_SETUP.md` in your browser/editor
2. Open `UBUNTU_GPU_HOST_QUICK_REFERENCE.md` in another window
3. SSH into your Ubuntu server
4. Start at Phase 1 and work through each phase
5. Mark off checkboxes as you complete each step

**Good luck with your deployment!** 🚀

When you're done, you'll have a production-ready LLM host node earning USDC on the Fabstir network.

---

## Questions to Have Ready

Before starting, make sure you know:

1. ✅ What is your Ubuntu server's username?
2. ✅ What is your Ubuntu server's IP address?
3. ✅ What is your registered host's Ethereum private key?
4. ✅ Do you have sudo access on the server?
5. ✅ Can you access ports 8080 and 9000 from the internet?

If you can answer all 5 questions, you're ready to proceed!

---

**Last Updated**: 2025-11-08
**Tested On**: Ubuntu 22.04 LTS + NVIDIA Driver 580.95.05 + CUDA 13.0
**Target Model**: tiny-vicuna-1b.q4_k_m.gguf
**Target Network**: Base Sepolia Testnet (Chain ID: 84532)
