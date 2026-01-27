# Fabstir Host CLI

> Command-line interface for running a Fabstir P2P LLM host node

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-pre--MVP-orange.svg)](https://github.com/fabstir/fabstir-llm-sdk)

## Overview

Fabstir Host CLI enables you to run a host node in the Fabstir decentralized LLM marketplace. The CLI uses the `@fabstir/sdk-core` for all blockchain interactions, providing a clean SDK-based architecture.

### What You Can Do

- 🚀 **Earn tokens** by providing LLM inference services
- 🔒 **Secure operations** with on-chain registration and proof verification
- 💰 **Manage stake** and earnings through simple commands
- 🌐 **SDK-powered** - all contract interactions through tested SDK methods
- 🛡️ **Type-safe** - full TypeScript implementation with proper error handling

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Host CLI      │────▶│  @fabstir/sdk   │────▶│  Contracts  │
│   (Commands)    │     │   (Managers)     │     │  (Base L2)  │
└─────────────────┘     └──────────────────┘     └─────────────┘
         │                       │
         ▼                       ▼
  ┌─────────────┐         ┌─────────────┐
  │  .env.test  │         │  Blockchain │
  │   Config    │         │  (Testnet)  │
  └─────────────┘         └─────────────┘
```

**SDK Integration**: The CLI delegates all blockchain operations to SDK managers:
- `HostManager` - Registration, unregistration, URL/model updates
- `PaymentManagerMultiChain` - Token approvals, deposits, withdrawals
- `SessionManager` - Proof submissions
- `TreasuryManager` - Fee management

See [SDK-INTEGRATION.md](docs/SDK-INTEGRATION.md) for architecture details.

## Quick Start

**New to Fabstir?** See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for a complete step-by-step guide to becoming a host using Docker.

**Model Download Guide**: [docs/MODEL_DOWNLOAD_GUIDE.md](docs/MODEL_DOWNLOAD_GUIDE.md)

### Prerequisites

- **Node.js 18+** and **pnpm** (npm causes dependency hoisting issues)
- **Ethereum wallet** with private key
- **Base Sepolia ETH** for gas (minimum 0.01 ETH)
- **FAB tokens** for staking (minimum 1000 FAB)
- Access to `.env.test` with contract addresses (provided by project owner)

### Installation

This is a **pre-MVP monorepo package**. Install from source:

```bash
# Clone the monorepo
git clone https://github.com/fabstir/fabstir-llm-sdk.git
cd fabstir-llm-sdk

# Install dependencies (IMPORTANT: Use pnpm, not npm)
pnpm install

# Build SDK core (required dependency)
cd packages/sdk-core && pnpm build && cd ../..

# Build host-cli
cd packages/host-cli && pnpm build
```

### Environment Setup

The CLI requires contract addresses and RPC URLs from `.env.test` at the repository root:

```bash
# .env.test (managed by project owner)
CONTRACT_JOB_MARKETPLACE=0x...
CONTRACT_NODE_REGISTRY=0x...
CONTRACT_PROOF_SYSTEM=0x...
CONTRACT_HOST_EARNINGS=0x...
CONTRACT_MODEL_REGISTRY=0x...
CONTRACT_FAB_TOKEN=0x...
CONTRACT_USDC_TOKEN=0x...
RPC_URL_BASE_SEPOLIA=https://...
```

**Important**: Never modify `.env.test` - it's the source of truth for contract addresses.

### Basic Usage

```bash
# Check available commands
pnpm host --help

# Register as a host (requires FAB tokens for stake)
pnpm host register \
  --private-key 0x... \
  --rpc-url https://base-sepolia.g.alchemy.com/v2/YOUR_KEY \
  --stake 1000

# Check host info
pnpm host info \
  --private-key 0x... \
  --rpc-url https://...

# Update host URL
pnpm host update-url http://localhost:8080 \
  --private-key 0x... \
  --rpc-url https://...

# Update supported models
pnpm host update-models llama-3,gpt-4 \
  --private-key 0x... \
  --rpc-url https://...

# Withdraw earnings
pnpm host withdraw \
  --private-key 0x... \
  --rpc-url https://...

# Unregister (unstakes your tokens)
pnpm host unregister \
  --private-key 0x... \
  --rpc-url https://...
```

## Available Commands

The CLI provides 16 commands organized by function:

### Core Setup
- `init` - Initialize host configuration (interactive wizard)
- `config` - Manage configuration settings

### Wallet Operations
- `wallet` - Wallet management (address, balance, import/export)

### Host Lifecycle
- `register` - Register as a host (stake tokens)
- `unregister` - Unregister and unstake tokens
- `info` - Display host information and status
- `status` - Show current host status and statistics

### Host Management
- `update-url` - Update host API URL
- `update-models` - Update supported model list
- `add-stake` - Add additional stake
- `update-metadata` - Update host metadata

### Financial Operations
- `withdraw` - Withdraw accumulated earnings

### Runtime Operations
- `start` - Start the host node
- `stop` - Stop the running host node
- `logs` - View host logs
- `serve` - Start management API server for browser control

See [COMMANDS.md](docs/COMMANDS.md) for detailed documentation of each command.

## Browser-Based Management

In addition to CLI commands, you can control your host node through a **visual web interface**. This provides real-time log streaming, one-click controls, and status monitoring—perfect for local development and testing.

### Quick Start

```bash
# 1. Start Docker container
./start-fabstir-docker.sh

# 2. Start management server
./start-management-server.sh

# 3. Start Next.js test harness (separate terminal)
cd apps/harness && pnpm dev

# 4. Open browser
# Navigate to: http://localhost:3000/node-management-enhanced
```

### Features

- **🔴 Real-Time Log Streaming** - Watch node logs live via WebSocket
- **🎮 One-Click Controls** - Start/stop node with visual confirmation
- **📊 Status Monitoring** - Live PID, uptime, and connection status
- **🔍 Host Discovery** - See all active nodes on the network
- **📝 Registration Management** - Register/unregister through UI forms
- **🌐 Multi-Chain Support** - Switch between Base Sepolia and opBNB Testnet

### Management API

The browser UI communicates with a **management server** running inside your Docker container:

**REST Endpoints** (Port 3001):
- `GET /health` - Server health check
- `GET /api/status` - Node status (running/stopped, PID, uptime)
- `POST /api/start` - Start inference node
- `POST /api/stop` - Stop inference node
- `POST /api/register` - Register host on blockchain
- `GET /api/discover-nodes` - Discover all active hosts

**WebSocket** (Port 3001):
- `WS /ws/logs` - Real-time log streaming (stdout/stderr)

### Architecture

```
Browser (localhost:3000)
    ↓ HTTP/WebSocket
Management Server (Docker :3001)
    ↓ delegates to
CLI Commands (single source of truth)
    ↓ spawns/controls
fabstir-llm-node (Rust binary :8080)
```

**Key Design**: The management server is just HTTP/WebSocket plumbing. All business logic remains in CLI commands—no code duplication!

### Documentation

- **[Browser Management Guide](docs/BROWSER_MANAGEMENT.md)** - Complete user guide with examples and troubleshooting
- **[API Reference](docs/API_REFERENCE.md)** - REST and WebSocket API documentation with curl examples
- **[Docker Deployment](docs/DOCKER_DEPLOYMENT.md)** - Docker setup with browser management section

### Security

**Localhost-Only by Design**:
- Management server binds to port 3001 inside Docker
- Port mapping restricts access to host machine only
- CORS limited to `http://localhost:3000`
- Perfect for local development/testing

**For Production**: Use CLI commands via SSH. Don't expose port 3001 publicly!

### serve Command

Start the management server manually:

```bash
# Inside Docker container
fabstir-host serve --port 3001

# With optional API key authentication
fabstir-host serve --port 3001 --api-key mySecretKey

# Custom CORS origins
fabstir-host serve --cors "http://localhost:3000,http://localhost:3001"
```

Or use the convenient startup script:

```bash
./start-management-server.sh
```

### When to Use

| Scenario | CLI Commands | Browser UI |
|----------|-------------|------------|
| **Local Testing** | ⚠️ Good | ✅ Excellent |
| **Production** | ✅ Recommended | ❌ Not for production |
| **Automation** | ✅ Scriptable | ❌ Not scriptable |
| **Visual Feedback** | ⚠️ Terminal only | ✅ Real-time UI |
| **Remote Access** | ✅ via SSH | ⚠️ SSH tunnel only |

**Recommendation**: Use browser UI for learning and debugging. Use CLI for production and scripts.

## Terminal Dashboard (TUI)

For **headless servers** without a browser, use the interactive terminal dashboard:

```bash
# Start the dashboard (requires management server running)
fabstir-host dashboard
```

### Features

- **📊 Real-Time Status** - Node status, PID, uptime displayed live
- **📝 Live Log Streaming** - WebSocket-based log streaming in terminal
- **⌨️ Keyboard Controls** - Start/stop node with single keystrokes
- **🔄 Auto-Refresh** - Status updates at configurable intervals

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit dashboard |
| `r` | Refresh status |
| `s` | Start node |
| `x` | Stop node |
| `p` | Update pricing (coming soon) |
| `w` | Withdraw earnings (coming soon) |

### Usage

```bash
# Start management server first
fabstir-host serve --port 3001

# Then launch dashboard (in another terminal)
fabstir-host dashboard

# With custom options
fabstir-host dashboard --mgmt-url http://localhost:3001 --refresh-interval 5000
```

### When to Use

| Scenario | CLI | Browser UI | TUI Dashboard |
|----------|-----|------------|---------------|
| **SSH Session** | ✅ Works | ❌ Not available | ✅ Perfect |
| **Docker/Headless** | ✅ Works | ❌ Not available | ✅ Perfect |
| **Visual Monitoring** | ⚠️ Limited | ✅ Excellent | ✅ Good |
| **Quick Actions** | ⚠️ Multi-command | ✅ One-click | ✅ Single-key |

See [docs/DASHBOARD_GUIDE.md](docs/DASHBOARD_GUIDE.md) for complete documentation.

## SDK Integration Benefits

After the recent SDK refactoring (Oct 2024), the Host CLI:

✅ **No direct contract calls** - All operations through SDK managers
✅ **No ABI imports** - SDK handles contract interfaces
✅ **Consistent error handling** - SDK provides typed errors
✅ **Automatic retries** - Built into SDK methods
✅ **Type safety** - Full TypeScript interfaces
✅ **59% less code** - Removed ~118 lines of boilerplate

**Before Refactoring:**
```typescript
// Old: Direct contract instantiation
const wallet = await getWallet(privateKey);
const nodeRegistry = new ethers.Contract(
  nodeRegistryAddress,
  NodeRegistryABI,
  signer
);
const tx = await nodeRegistry.updateApiUrl(url);
await tx.wait(3);
```

**After Refactoring:**
```typescript
// New: SDK method
await initializeSDK('base-sepolia');
await authenticateSDK(privateKey);
const hostManager = getHostManager();
const txHash = await hostManager.updateApiUrl(url);
// SDK waits for confirmations internally
```

See [docs/SDK-INTEGRATION.md](docs/SDK-INTEGRATION.md) for migration details.

## Configuration

Configuration is handled through environment variables (`.env.test`) and SDK initialization, not JSON config files.

The SDK is initialized with:
```typescript
createSDKConfig('base-sepolia')
// Returns: {
//   chainId: 84532,
//   rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
//   contractAddresses: { /* from .env.test */ },
//   mode: 'production'
// }
```

See [CONFIGURATION.md](docs/CONFIGURATION.md) for details.

## Development

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/commands/register.test.ts

# Run with verbose output
npx vitest run --reporter=verbose
```

### Building from Source

```bash
# Build SDK core first (dependency)
cd packages/sdk-core && pnpm build

# Build host-cli
cd packages/host-cli && pnpm build

# Watch mode for development
pnpm dev
```

### Project Structure

```
packages/host-cli/
├── src/
│   ├── commands/          # CLI command implementations
│   ├── sdk/
│   │   ├── client.ts      # SDK wrapper (getHostManager, etc.)
│   │   ├── config.ts      # SDK config from env vars
│   │   └── auth.ts        # Authentication helpers
│   ├── utils/             # Utilities (wallet, formatting)
│   ├── proof/             # Proof submission logic
│   └── index.ts           # CLI entry point
├── tests/
│   ├── commands/          # Command tests
│   └── sdk/               # SDK integration tests
└── docs/                  # Documentation
```

## Production Deployment

### 🌐 Public IP vs Localhost

**IMPORTANT**: The CLI now distinguishes between development and production deployments.

**Development/Testing (Localhost)**:
```bash
# Register with localhost URL
fabstir-host register --url http://localhost:8080 --models "model1,model2"

⚠️  WARNING: Using localhost URL
   This host will NOT be accessible to real clients.
   Use your public IP or domain for production.
```

**Production (Public IP/Domain)**:
```bash
# Register with public URL
fabstir-host register \
  --url http://203.0.113.45:8080 \
  --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"

🚀 Starting inference node on port 8080...
🔍 Verifying node at http://203.0.113.45:8080/health...
✅ Node is publicly accessible
💰 Approving FAB tokens...
📝 Registering on blockchain...
✅ Registration successful!
```

### 🔥 Firewall Configuration

After registration, ensure your firewall allows incoming connections:

**Linux (UFW)**:
```bash
# Allow API port
sudo ufw allow 8080/tcp

# Allow P2P port (if using P2P discovery)
sudo ufw allow 9000/tcp

# Check status
sudo ufw status
```

**Linux (iptables)**:
```bash
# Allow API port
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables-save
```

**macOS**:
```bash
# Disable firewall temporarily to test
sudo pfctl -d

# Or add rule permanently (advanced)
# Edit /etc/pf.conf and add:
# pass in proto tcp from any to any port 8080
```

**Windows**:
```powershell
# Add firewall rule
netsh advfirewall firewall add rule name="Fabstir Host" dir=in action=allow protocol=TCP localport=8080

# Check rule
netsh advfirewall firewall show rule name="Fabstir Host"
```

### 🐳 Production Deployment Options

#### Option 1: Systemd Service (Linux)

Create `/etc/systemd/system/fabstir-host.service`:

```ini
[Unit]
Description=Fabstir Host Node
After=network.target

[Service]
Type=simple
User=fabstir
WorkingDirectory=/home/fabstir/fabstir-llm-sdk/packages/host-cli
Environment="PATH=/home/fabstir/.nvm/versions/node/v18.0.0/bin:/usr/bin"
ExecStart=/home/fabstir/.nvm/versions/node/v18.0.0/bin/pnpm host start --daemon
Restart=on-failure
RestartSec=10s
StandardOutput=append:/var/log/fabstir-host.log
StandardError=append:/var/log/fabstir-host-error.log

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable fabstir-host

# Start service
sudo systemctl start fabstir-host

# Check status
sudo systemctl status fabstir-host

# View logs
sudo journalctl -u fabstir-host -f
```

#### Option 2: PM2 Process Manager

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start "pnpm host start" --name fabstir-host

# Save configuration
pm2 save

# Enable startup on boot
pm2 startup

# Monitor
pm2 monit

# View logs
pm2 logs fabstir-host
```

#### Option 3: Docker Deployment (MVP - Recommended)

**Complete Guide**: See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for step-by-step Docker setup.

**Quick Setup**:

1. **Download Model** (do this FIRST on host machine):
   ```bash
   mkdir -p ~/fabstir-models
   cd ~/fabstir-models
   wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   ```

2. **Pull Docker Image**:
   ```bash
   docker pull fabstir/host-cli:latest
   ```

3. **Run Container** (with model volume mount):
   ```bash
   docker run -d \
     --name fabstir-host \
     -p 8080:8080 \
     -p 9000:9000 \
     -v ~/fabstir-models:/models \
     -e MODEL_PATH=/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
     -e HOST_PRIVATE_KEY=$YOUR_PRIVATE_KEY \
     -e CHAIN_ID=84532 \
     -e RPC_URL_BASE_SEPOLIA=$YOUR_RPC_URL \
     -e CONTRACT_JOB_MARKETPLACE=$CONTRACT_JOB_MARKETPLACE \
     -e CONTRACT_NODE_REGISTRY=$CONTRACT_NODE_REGISTRY \
     -e CONTRACT_PROOF_SYSTEM=$CONTRACT_PROOF_SYSTEM \
     -e CONTRACT_HOST_EARNINGS=$CONTRACT_HOST_EARNINGS \
     fabstir/host-cli:latest
   ```

4. **Register as Host** (inside container):
   ```bash
   docker exec -it fabstir-host fabstir-host register \
     --url http://YOUR_PUBLIC_IP:8080 \
     --models "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" \
     --stake 1000
   ```

**Key Points**:
- ✅ Models are mounted from host machine (not in image)
- ✅ Pre-built image is small (~500MB)
- ✅ Use your existing model downloads
- ✅ All Host CLI commands available via `docker exec`

**Environment Variables**:

See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md#step-3-prepare-environment) for complete environment variable reference.

**Common Commands**:
```bash
# Check status
docker exec fabstir-host fabstir-host status

# View logs
docker logs -f fabstir-host

# Stop node
docker exec fabstir-host fabstir-host stop

# Start node
docker exec fabstir-host fabstir-host start --daemon

# Unregister (recovers stake)
docker exec fabstir-host fabstir-host unregister
```

### 📊 Network Troubleshooting

**Test Local Accessibility**:
```bash
# Check if node is running locally
curl http://localhost:8080/health

# Expected response:
# {"status":"healthy","model":"TinyVicuna-1B"}
```

**Test Public Accessibility**:
```bash
# From another machine or service
curl http://YOUR_PUBLIC_IP:8080/health

# Or use online tools:
# https://www.portchecktool.com/
```

**Common Issues**:

1. **"Connection Refused" from outside**:
   - Node is binding to 127.0.0.1 instead of 0.0.0.0
   - Firewall blocking port 8080
   - NAT/router not forwarding port

2. **"Port Already in Use"**:
   ```bash
   # Find process using port
   lsof -i :8080  # Linux/macOS
   netstat -ano | findstr :8080  # Windows

   # Kill process
   kill -9 <PID>  # Linux/macOS
   taskkill /PID <PID> /F  # Windows
   ```

3. **"Health Check Timeout"**:
   - fabstir-llm-node still loading model (check logs for "Model loaded successfully")
   - Network latency too high
   - Node crashed during startup

**Debug Mode**:
```bash
# Start with debug logging
fabstir-host start --log-level debug

# Monitor logs
tail -f ~/.fabstir/logs/host.log

# Look for:
# ✅ Model loaded successfully
# ✅ P2P node started
# ✅ API server started
# 🎉 Fabstir LLM Node is running
```

### 🔐 Security Best Practices

**Production Checklist**:
- [ ] Use strong private key (never reuse test keys)
- [ ] Secure `.env.test` with proper permissions (`chmod 600`)
- [ ] Use HTTPS with reverse proxy (nginx/caddy)
- [ ] Enable rate limiting on API
- [ ] Monitor for unauthorized access
- [ ] Regular backups of wallet/config
- [ ] Keep fabstir-llm-node binary updated
- [ ] Use dedicated server/VM for hosting

**Reverse Proxy Example (Nginx)**:
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Common Operations

### First-Time Host Setup

```bash
# 1. Ensure you have FAB tokens and ETH on Base Sepolia
# 2. Register as a host
pnpm host register --private-key 0x... --rpc-url https://... --stake 1000

# 3. Update your public URL
pnpm host update-url http://your-host.example.com:8080 \
  --private-key 0x... --rpc-url https://...

# 4. Set supported models
pnpm host update-models llama-3,mistral-7b \
  --private-key 0x... --rpc-url https://...

# 5. Check registration
pnpm host info --private-key 0x... --rpc-url https://...
```

### Checking Earnings

```bash
# View host info (includes accumulated earnings)
pnpm host info --private-key 0x... --rpc-url https://...

# Withdraw all earnings
pnpm host withdraw --private-key 0x... --rpc-url https://...
```

### Updating Configuration

```bash
# Change API URL
pnpm host update-url http://new-url:8080 \
  --private-key 0x... --rpc-url https://...

# Add new models
pnpm host update-models llama-3,gpt-4,claude-3 \
  --private-key 0x... --rpc-url https://...

# Increase stake
pnpm host add-stake 500 \
  --private-key 0x... --rpc-url https://...
```

## Troubleshooting

### Common Issues

**"SDK not initialized"**
- Ensure SDK initialization happens before manager calls
- Check that environment variables are loaded from `.env.test`

**"Insufficient FAB balance"**
- Check your FAB token balance: `pnpm host wallet --private-key 0x...`
- Minimum 1000 FAB required for registration

**"Contract address not found"**
- Verify `.env.test` is in repository root
- Never hardcode contract addresses - they're in `.env.test` only

**"PaymentManager.depositNative is not a function"**
- This indicates old PaymentManager usage
- Use PaymentManagerMultiChain (SDK handles this automatically)

**"Transaction timeout"**
- SDK methods wait for confirmations internally (3 blocks)
- Increase timeout if on slow network: add `--timeout` flag

See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for more solutions.

## Security

- **Private keys**: Never commit private keys or `.env` files
- **Environment isolation**: Use `.env.test` for testnet only
- **SDK authentication**: All operations require authenticated SDK instance
- **Contract verification**: All contract addresses verified on-chain
- **No mocks in production**: All E2E tests use real contracts on testnet

See [SECURITY.md](docs/SECURITY.md) for best practices.

## Testing Philosophy

The Host CLI follows strict **TDD (Test-Driven Development)**:

1. ✅ Write tests first (they should fail)
2. ✅ Implement to make tests pass
3. ✅ No mocks in E2E tests (real blockchain interactions)
4. ✅ All tests must pass before merge

**Test Coverage**: 40/40 tests passing (100%) after SDK refactoring.

## Pre-MVP Status

⚠️ **This project is pre-MVP**:

- No external users yet
- No npm package published
- Install from source only
- Breaking changes allowed without deprecation
- `.env.test` managed by project owner only
- Documentation reflects current state only (no migration guides)

## Support & Contributing

- 📖 **Documentation**: [docs/](docs/)
- 🐛 **Issues**: [GitHub Issues](https://github.com/fabstir/fabstir-llm-sdk/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/fabstir/fabstir-llm-sdk/discussions)

**Contributing**: Read [CONTRIBUTING.md](../../CONTRIBUTING.md) for development workflow.

## Related Packages

This CLI is part of the Fabstir LLM SDK monorepo:

- **@fabstir/sdk-core** - Core SDK with managers and contracts
- **@fabstir/sdk-node** - Node.js-specific features (planned)
- **apps/harness** - Next.js test harness for UI development

## License

Business Source License 1.1 (BUSL-1.1) - see [LICENSE](../../LICENSE) file for details.

---

Built by the Fabstir team | Last updated: January 2026
