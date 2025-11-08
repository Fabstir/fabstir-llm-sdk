# Fabstir LLM Host - Minimum Requirements

**For third-party host operators joining the Platformless AI P2P network**

---

## Hardware Requirements

### GPU (REQUIRED)

**Minimum**:
- NVIDIA GPU with CUDA support (Compute Capability 7.0+)
- **6GB VRAM** (for small models like tiny-vicuna-1b)
- Examples: GTX 1660 Ti, RTX 3060, RTX 4060

**Recommended**:
- NVIDIA GPU with **8GB+ VRAM** (for 7B parameter models)
- **24GB+ VRAM** (for 13B-20B parameter models)
- Examples: RTX 3090, RTX 4090, A5000, A6000

**Professional/High-Performance**:
- **48GB+ VRAM** (for 70B+ parameter models)
- Examples: A100, H100, L40S

**NOT Supported**:
- ❌ AMD GPUs (no CUDA support)
- ❌ Intel GPUs (no CUDA support)
- ❌ CPU-only systems (too slow for real-time inference)
- ❌ Apple Silicon (M1/M2/M3) - different architecture

### VRAM Requirements by Model Size

| Model Size | VRAM Needed | Example Models | Min GPU |
|------------|-------------|----------------|---------|
| 1B params (Q4) | 1-2GB | tiny-vicuna-1b, TinyLlama | GTX 1660 (6GB) |
| 3B params (Q4) | 3-4GB | Phi-3-mini, StableLM-3B | RTX 3060 (12GB) |
| 7B params (Q4) | 5-6GB | Llama-3-8B, Mistral-7B | RTX 3060 (12GB) |
| 13B params (Q4) | 10-12GB | Llama-2-13B, Vicuna-13B | RTX 3090 (24GB) |
| 20B params (Q4) | 16-18GB | OpenAI OSS 20B | RTX 4090 (24GB) |
| 30B params (Q4) | 22-24GB | Llama-3-30B | RTX 4090 (24GB) |
| 70B params (Q4) | 40-45GB | Llama-3-70B | A100 (48GB) or multi-GPU |

**Note**: Q4 = 4-bit quantization (standard for consumer GPUs)

### System RAM (CPU Memory)

**Minimum**: 16GB RAM
- Enough for OS, Docker, and model loading

**Recommended**: 32GB+ RAM
- Better for larger models and multiple concurrent sessions
- Prevents OOM errors during model loading

**Professional**: 64GB+ RAM
- For 70B+ models or high concurrent session load

### Storage (Disk Space)

**Minimum**: 100GB free SSD
- ~50GB for Docker images, system files
- ~50GB for models (1-2 small models)

**Recommended**: 250GB+ free SSD
- ~50GB for Docker/system
- ~200GB for multiple models (can host 5-10 models)

**Professional**: 500GB+ NVMe SSD
- ~50GB for Docker/system
- ~450GB for large model library (10-20 models)
- NVMe for faster model loading

**Storage Type**:
- ✅ **SSD required** (fast model loading)
- ⚠️ HDD will cause slow startup and poor performance
- ✅ NVMe preferred for large models (70B+)

### CPU

**Minimum**: 4 cores / 8 threads
- Modern x86_64 processor (Intel/AMD)
- 2.5GHz+ base clock

**Recommended**: 8+ cores / 16+ threads
- Better for concurrent sessions and preprocessing
- 3.0GHz+ base clock

**Examples**:
- ✅ Intel i5-10400, i7-12700K, Xeon E-2288G
- ✅ AMD Ryzen 5 5600X, Ryzen 9 5950X, EPYC 7502

### Network

**Minimum**:
- 100 Mbps upload/download
- Static IP address OR dynamic DNS
- 99% uptime

**Recommended**:
- 1 Gbps+ upload/download
- Static IP address (better for reliability)
- 99.9% uptime
- Unlimited or high data cap (100TB+/month)

**Bandwidth Usage Estimates**:
- Typical prompt: 1-2KB upload, 5-50KB download
- Heavy usage: ~10-100GB/month
- RAG with large documents: +20-50GB/month

**Ports Required**:
- **8080/tcp** - HTTP/WebSocket API (client connections)
- **9000/tcp** - P2P network (node-to-node communication)
- **22/tcp** - SSH (for management, optional but recommended)

---

## Software Requirements

### Operating System

**Supported (Production Hosting)**:
- ✅ Ubuntu 22.04 LTS (recommended for production)
- ✅ Ubuntu 20.04 LTS
- ✅ Debian 11+ (Bullseye or newer)
- ✅ CentOS 8+ / RHEL 8+
- ✅ Fedora 36+

**Supported (Development/Testing)**:
- ✅ **Windows 11 with WSL2 + Ubuntu 22.04** (tested and confirmed working)
  - GPU passthrough works with NVIDIA drivers on Windows host
  - Docker with NVIDIA Container Toolkit works
  - WebSocket and network connectivity works
  - Localhost and external access both functional
  - ⚠️ **Not recommended for 24/7 production hosting** due to:
    - Windows updates/reboots interrupt service
    - Uptime challenges (host OS reboots affect WSL2)
    - Static IP configuration more complex
    - Resource overhead (Windows + WSL2 + Docker)
  - **Best Use**: Development, testing, SDK integration testing, learning

**Not Recommended**:
- ⚠️ Ubuntu 18.04 (EOL, old Docker/CUDA versions)
- ⚠️ WSL2 for 24/7 production (use for dev/test only)
- ❌ macOS (no CUDA support)

**Recommendations**:
- **Development/Testing**: WSL2 on Windows 11 with Ubuntu 22.04 ✅
- **Production Hosting (24/7)**: Native Ubuntu 22.04 LTS on dedicated server ✅
- **Hybrid Approach**: Develop/test on WSL2, deploy to Ubuntu server ✅

### NVIDIA Driver

**Minimum**: NVIDIA Driver **525.x or newer**
- CUDA 12.0+ support required

**Recommended**: NVIDIA Driver **550.x or newer**
- Better performance and stability
- Latest CUDA features

**How to Check**:
```bash
nvidia-smi
# Look for "Driver Version: XXX.XX"
```

**How to Update** (Ubuntu):
```bash
sudo apt update
sudo apt install nvidia-driver-550
sudo reboot
```

### CUDA Toolkit

**Minimum**: CUDA **12.0**
- Required for modern PyTorch/ONNX support

**Recommended**: CUDA **12.2+**
- Better compatibility with newer models

**Note**: CUDA version shown in `nvidia-smi` is the **maximum** supported by the driver. The actual CUDA used by the node is bundled in the Docker image.

### Docker

**Minimum**: Docker **20.10+**
- Docker Engine (not Docker Desktop on Linux)

**Recommended**: Docker **24.0+**
- Latest security and performance fixes

**How to Check**:
```bash
docker --version
# Should show: Docker version 24.0.0 or newer
```

**How to Install** (Ubuntu):
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in
```

### Docker Compose

**Minimum**: Docker Compose **v2.0+**
- Note: v2 (plugin) not v1 (standalone)

**Recommended**: Docker Compose **v2.20+**

**How to Check**:
```bash
docker compose version
# Should show: Docker Compose version v2.20.0 or newer
```

### NVIDIA Container Toolkit

**Required**: nvidia-container-toolkit **1.14.0+**

**How to Install** (Ubuntu):
```bash
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt update
sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

**How to Verify**:
```bash
docker run --rm --runtime=nvidia nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
# Should show your GPU
```

---

## Economic Requirements

### Staking (Blockchain Requirement)

**Minimum Stake**: As defined by smart contract
- Base Sepolia Testnet: Variable (check NodeRegistry contract)
- Base Mainnet: TBD (production deployment)

**Token**: Native token (ETH for Base) or FAB token

### Wallet Requirements

**Required**:
- Ethereum-compatible wallet with private key
- Sufficient native token for:
  - Initial stake deposit
  - Gas fees for registration (~$1-5 USD in ETH)
  - Gas fees for periodic settlement (~$0.50 per settlement)

**Recommended**:
- Separate wallet for host operations (not your main wallet)
- Hardware wallet or secure key management for production

### Pricing Strategy

**Recommended Pricing** (as of Jan 2025):
- Minimum: **100 units** (0.0001 USDC per token)
- Typical: **2000 units** (0.002 USDC per token)
- Maximum: **100,000 units** (0.1 USDC per token)

**Competitive Pricing**:
- Small models (1B-3B): 0.001-0.002 USDC per token
- Medium models (7B-13B): 0.002-0.005 USDC per token
- Large models (20B-30B): 0.005-0.01 USDC per token
- XL models (70B+): 0.01-0.02 USDC per token

**Break-Even Analysis**:
- Electricity cost: ~$0.10-0.50 per hour (depends on GPU)
- Need: ~50-250 inference requests/hour to break even
- Profit: Depends on pricing, model size, and demand

---

## Network & Connectivity Requirements

### Internet Connection

**Minimum**:
- 100 Mbps down / 100 Mbps up
- <50ms latency to major internet hubs
- <1% packet loss

**Recommended**:
- 1 Gbps down / 1 Gbps up (fiber preferred)
- <20ms latency
- <0.1% packet loss
- Static IP address

### IP Address

**Option A: Static IP** (Recommended)
- ✅ Better reliability
- ✅ Easier client connection
- ✅ No DNS propagation delays
- Required for professional hosting

**Option B: Dynamic DNS**
- ⚠️ Works but less reliable
- ⚠️ DNS propagation delays (1-60 minutes)
- ⚠️ Some DDNS providers have rate limits
- Acceptable for testing/hobby hosting

**NOT Acceptable**:
- ❌ CGNAT (Carrier-Grade NAT) - prevents inbound connections
- ❌ Residential NAT without port forwarding

### Firewall & Router Configuration

**Required**:
- Port forwarding configured on router (if behind NAT)
- Firewall rules allow inbound TCP on ports 8080, 9000
- No CGNAT (must have public IP, not shared)

**Security**:
- ✅ Firewall enabled (ufw recommended on Ubuntu)
- ✅ Fail2ban for SSH brute-force protection (recommended)
- ✅ Automatic security updates enabled
- ❌ Do NOT disable firewall entirely

### Uptime Requirements

**Minimum**: 95% uptime
- ~36 hours downtime per month acceptable
- Suitable for hobby hosting

**Recommended**: 99% uptime
- ~7 hours downtime per month
- Suitable for semi-professional hosting

**Professional**: 99.9% uptime
- ~43 minutes downtime per month
- Required for serious hosting business

**Tools to Achieve High Uptime**:
- UPS (uninterruptible power supply)
- Redundant internet connection
- Monitoring and auto-restart scripts
- Regular maintenance windows

---

## Technical Skills Required

### Required Skills

**Basic**:
- ✅ Comfortable with Linux command line (bash)
- ✅ Can SSH into remote server
- ✅ Can edit text files (nano, vim)
- ✅ Can run commands with sudo
- ✅ Can read and follow documentation

**Recommended**:
- ✅ Basic Docker knowledge (docker ps, docker logs)
- ✅ Basic networking (IP addresses, ports, firewall)
- ✅ Basic troubleshooting (reading logs, searching errors)

**NOT Required** (but helpful):
- ⚠️ Rust programming
- ⚠️ Blockchain development
- ⚠️ GPU programming
- ⚠️ Advanced networking (VPN, VLANs)

### Time Commitment

**Initial Setup**: 1-2 hours
- Install prerequisites
- Deploy node
- Test and verify

**Ongoing Maintenance**: 1-2 hours per month
- Monitor logs
- Update software
- Restart if needed
- Check earnings and performance

**Emergency Response**: <30 minutes
- If node goes down, should be able to investigate and restart quickly

---

## Cost Estimates

### Hardware Costs (Initial Investment)

**Budget Setup** (~$1,000-1,500):
- GPU: RTX 3060 12GB ($300-400)
- CPU: i5-12400 ($150-200)
- RAM: 32GB DDR4 ($80-100)
- SSD: 500GB NVMe ($50-70)
- Motherboard: $100-150
- PSU: 650W ($80-100)
- Case: $50-100

**Mid-Range Setup** (~$2,500-3,500):
- GPU: RTX 4080 16GB ($1,000-1,200)
- CPU: i7-13700K ($350-400)
- RAM: 64GB DDR5 ($200-250)
- SSD: 1TB NVMe ($100-120)
- Motherboard: $200-250
- PSU: 850W ($120-150)
- Case: $100-150

**Professional Setup** (~$5,000-7,000):
- GPU: RTX 4090 24GB ($1,600-2,000)
- CPU: Threadripper or Xeon ($800-1,200)
- RAM: 128GB ECC ($500-700)
- SSD: 2TB NVMe ($200-300)
- Motherboard: $400-600
- PSU: 1000W+ ($200-300)
- Case: $150-250
- UPS: $200-400

**Enterprise Setup** (~$15,000-30,000):
- GPU: A100 80GB or H100 ($10,000-25,000)
- CPU: Dual Xeon or EPYC ($2,000-4,000)
- RAM: 256GB+ ECC ($1,000-2,000)
- SSD: 4TB+ NVMe RAID ($800-1,500)
- Motherboard: $600-1,000
- PSU: Redundant 1600W+ ($500-800)
- Rack Case: $300-500
- UPS: $500-1,000

### Operating Costs (Monthly)

**Electricity**:
- Budget setup: $30-50/month (100-150W average)
- Mid-range: $50-80/month (150-250W average)
- Professional: $80-120/month (250-400W average)
- Enterprise: $200-500/month (500-1500W average)

**Assumes**: $0.12/kWh electricity rate, 24/7 operation

**Internet**:
- Residential: $50-100/month (1 Gbps fiber)
- Business: $100-300/month (dedicated line)

**Total Monthly Operating Cost**:
- Budget: $80-150/month
- Mid-range: $100-180/month
- Professional: $130-220/month
- Enterprise: $300-800/month

### Break-Even Analysis

**Assumptions**:
- Pricing: 0.002 USDC per token (2000 units)
- Average response: 500 tokens
- Revenue per request: 500 × 0.002 = $1.00
- Operating cost: $100/month

**Break-Even Point**:
- Need: 100 requests/month = ~3 requests/day
- Or: 200 requests/month for profit = ~7 requests/day

**Realistic Profitability**:
- Low demand: 5-10 requests/day = $150-300/month revenue
- Medium demand: 20-50 requests/day = $600-1,500/month revenue
- High demand: 100+ requests/day = $3,000+/month revenue

**Note**: Demand depends on:
- Model quality and speed
- Competitive pricing
- Network growth
- Marketing and reputation

---

## Pre-Flight Checklist

Before starting deployment, verify you have:

### Hardware
- [ ] NVIDIA GPU with 6GB+ VRAM
- [ ] 16GB+ system RAM
- [ ] 100GB+ free SSD storage
- [ ] 4+ CPU cores

### Network
- [ ] Static IP or dynamic DNS configured
- [ ] Router port forwarding configured (if behind NAT)
- [ ] Ports 8080 and 9000 accessible from internet
- [ ] 100 Mbps+ internet connection

### Software
- [ ] Ubuntu 22.04 LTS (or compatible OS)
- [ ] NVIDIA Driver 525+ installed
- [ ] Docker 20.10+ installed
- [ ] Docker Compose v2+ installed
- [ ] NVIDIA Container Toolkit installed

### Blockchain
- [ ] Ethereum wallet with private key
- [ ] Sufficient ETH for gas fees (testnet or mainnet)
- [ ] Sufficient tokens for staking (if required)

### Skills & Time
- [ ] Comfortable with Linux command line
- [ ] Can SSH into server
- [ ] Can follow technical documentation
- [ ] Have 1-2 hours for initial setup

### Security
- [ ] Private key stored securely (not in git, not in plain text)
- [ ] Firewall configured (only ports 22, 8080, 9000 open)
- [ ] Automatic security updates enabled
- [ ] Backup plan for configuration files

---

## Recommendations by Use Case

### Hobby / Testing
- **GPU**: RTX 3060 12GB or similar
- **Model**: 1B-7B parameters
- **Cost**: ~$1,000 initial + $80/month
- **Expected**: Break even or small profit
- **Goal**: Learn the system, contribute to network

### Semi-Professional / Side Income
- **GPU**: RTX 4080 16GB or RTX 4090 24GB
- **Model**: 7B-20B parameters
- **Cost**: ~$2,500 initial + $100/month
- **Expected**: $200-500/month profit (if demand exists)
- **Goal**: Supplemental income, grow with network

### Professional / Full-Time
- **GPU**: RTX 4090 24GB or A5000
- **Model**: 20B-30B parameters
- **Cost**: ~$5,000 initial + $150/month
- **Expected**: $500-2,000/month profit (if demand exists)
- **Goal**: Primary or significant income source

### Enterprise / Data Center
- **GPU**: A100 80GB, H100, or multi-GPU setup
- **Model**: 70B+ parameters, multiple models
- **Cost**: ~$20,000+ initial + $400/month
- **Expected**: $2,000-10,000/month profit (if demand exists)
- **Goal**: Serious business, high availability, multiple hosts

---

## Excluded Configurations

These configurations are **NOT supported** and will not work:

❌ **CPU-Only** (no GPU)
- Too slow for real-time inference
- Would cause poor user experience
- Network would reject slow hosts

❌ **AMD or Intel GPUs**
- No CUDA support
- Different architecture (ROCm, oneAPI)
- Not compatible with current node software

❌ **Apple Silicon (M1/M2/M3)**
- Different architecture (Metal, not CUDA)
- Would require complete rewrite
- Not planned for support

✅ **Windows 11 with WSL2** (for development/testing only)
- WSL2 + Ubuntu 22.04 confirmed working
- GPU passthrough works with NVIDIA drivers
- Docker + NVIDIA Container Toolkit functional
- ⚠️ Not recommended for 24/7 production hosting
- See "Operating System" section for details

❌ **Native Windows (without WSL2)**
- Native Windows containers not supported
- CUDA in Windows containers has limitations
- Complex Docker Desktop GPU configuration

❌ **Raspberry Pi or ARM processors**
- Not enough VRAM
- Different CPU architecture
- Not supported

❌ **Cloud VMs without GPU passthrough**
- Most cloud VMs don't have GPU access
- Or GPU is shared/slow
- Expensive for the performance

❌ **VRAM < 6GB**
- Can't run even smallest models
- Would cause OOM errors
- Not practical

---

## Frequently Asked Questions

**Q: Can I run the node on a laptop?**
A: Technically yes, but not recommended for production. Laptops have:
- Thermal throttling (GPU slows down when hot)
- Lower uptime (not meant for 24/7 operation)
- Power interruptions when unplugged
- Usually smaller GPUs (mobile variants with less VRAM)

**Q: Can I share my GPU with other tasks (gaming, ML training)?**
A: Yes, but:
- Gaming/ML will reduce availability for inference
- May cause slower response times
- Could impact reputation score
- Recommended: Dedicated GPU for hosting

**Q: What happens if my internet goes down?**
A: Your node becomes unavailable. Clients will:
- Fail to connect to your node
- Try other hosts
- Your reputation score may decrease if downtime is frequent

**Q: Can I run multiple nodes on one machine?**
A: Technically yes (one per GPU), but:
- Complex configuration
- Shared resources (bandwidth, RAM)
- Only worth it for multi-GPU setups

**Q: Do I need a static IP?**
A: Strongly recommended, but dynamic DNS works:
- Static IP: Better reliability, no DNS delays
- Dynamic DNS: Works but adds complexity, propagation delays

**Q: How much can I earn?**
A: Highly variable, depends on:
- Network demand
- Your model quality and speed
- Your pricing (competitive vs. premium)
- Your uptime and reputation
- Realistic: $0-1,000/month currently (network growing)

**Q: What if my GPU breaks?**
A: You're responsible for hardware maintenance:
- No earnings while offline
- Need to replace/repair GPU
- Consider warranty or hardware insurance

**Q: Can I upgrade my model later?**
A: Yes! Just:
- Download new model file
- Update configuration
- Restart node
- No blockchain re-registration needed (unless changing pricing)

**Q: Can I use WSL2 on Windows for development/testing?**
A: **Yes!** WSL2 + Ubuntu 22.04 on Windows 11 is confirmed working:
- ✅ GPU passthrough works with NVIDIA drivers on Windows host
- ✅ Docker + NVIDIA Container Toolkit functional
- ✅ WebSocket and network connectivity works
- ✅ Perfect for development, testing, SDK integration
- ⚠️ **Not recommended for 24/7 production** due to:
  - Windows updates can reboot host (interrupting WSL2)
  - Uptime challenges (host reboots affect WSL2)
  - Static IP configuration more complex
- **Best Use**: Develop and test on WSL2, deploy to native Ubuntu server for production

**Q: How do I transition from WSL2 dev to Ubuntu production?**
A: Simple migration path:
1. Develop/test on WSL2 (Windows 11 + Ubuntu 22.04)
2. Export config files (.env, .env.contracts, docker-compose.yml)
3. Deploy to Ubuntu 22.04 server following production guide
4. Copy config files and models directory
5. Start node on production server
6. Same setup, just on dedicated hardware for 24/7 uptime

---

**Last Updated**: 2025-11-08
**Compatible with**: fabstir-llm-node v8.3.5+, SDK v1.3.36+
**Network**: Base Sepolia Testnet, Base Mainnet (future)
**Tested Environments**:
- ✅ Native Ubuntu 22.04 LTS + NVIDIA RTX 4090 (production)
- ✅ Windows 11 WSL2 + Ubuntu 22.04 + NVIDIA GPU (development/testing)
