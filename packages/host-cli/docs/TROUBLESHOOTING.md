# Troubleshooting Guide

## Table of Contents
- [Common Issues](#common-issues)
- [Installation Problems](#installation-problems)
- [Connection Issues](#connection-issues)
- [Registration Errors](#registration-errors)
- [Session Problems](#session-problems)
- [Wallet Issues](#wallet-issues)
- [Performance Issues](#performance-issues)
- [Error Messages](#error-messages)
- [Debugging Tools](#debugging-tools)
- [Getting Help](#getting-help)

## Common Issues

### Host won't start

**Symptoms:**
- Command hangs or crashes
- "Port already in use" error
- "Configuration not found" error

**Solutions:**

1. Check if another instance is running:
```bash
# Check for running process
fabstir-host status

# Check port usage
lsof -i :8080  # Linux/macOS
netstat -ano | findstr :8080  # Windows

# Kill existing process
fabstir-host stop --force
```

2. Verify configuration:
```bash
# Validate config
fabstir-host config validate

# Reset if corrupted
fabstir-host config reset --backup
```

3. Check logs:
```bash
# View recent logs
tail -n 100 ~/.fabstir/logs/host.log

# Follow logs
tail -f ~/.fabstir/logs/host.log
```

---

### "Insufficient balance" errors

**Symptoms:**
- Cannot register as host
- Cannot withdraw earnings
- Transaction failures

**Solutions:**

1. Check all balances:
```bash
# Check wallet balances
fabstir-host wallet balance --all

# Required minimums:
# - ETH: 0.01 for gas
# - FAB: 1000 for staking
```

2. Get testnet funds:
```bash
# Base Sepolia faucet
# Visit: https://faucet.base.org

# Request test FAB (if available)
fabstir-host faucet request
```

3. Verify correct network:
```bash
# Check current network
fabstir-host config get network.name

# Switch if needed
fabstir-host config set network.name base-sepolia
```

---

### WebSocket connection failures

**Symptoms:**
- "WebSocket timeout" errors
- Clients cannot connect
- Session drops frequently

**Solutions:**

1. Check firewall settings:
```bash
# Allow port (Linux)
sudo ufw allow 8080/tcp

# Check firewall status
sudo ufw status

# Windows firewall
netsh advfirewall firewall add rule name="Fabstir Host" dir=in action=allow protocol=TCP localport=8080
```

2. Configure NAT/port forwarding:
```bash
# Test port accessibility
nc -zv your-public-ip 8080

# Use ngrok for testing
ngrok http 8080
```

3. Update public URL:
```bash
# Set correct public URL
fabstir-host config set host.publicUrl https://your-domain.com:8080
```

---

## Installation Problems

### Node.js version errors

**Problem:** "Unsupported Node.js version"

**Solution:**
```bash
# Check version
node --version

# Install Node 18+ with nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

---

### NPM permission errors

**Problem:** "EACCES: permission denied"

**Solution:**
```bash
# Option 1: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Option 2: Use npx
npx @fabstir/host-cli

# Option 3: Use sudo (not recommended)
sudo npm install -g @fabstir/host-cli
```

---

### Build failures from source

**Problem:** TypeScript compilation errors

**Solution:**
```bash
# Clean and rebuild
rm -rf node_modules dist package-lock.json
npm cache clean --force
npm install
npm run build

# Use specific Node version
nvm use 18
npm install
```

---

## Connection Issues

### RPC connection failures

**Problem:** "Could not connect to RPC endpoint"

**Solutions:**

1. Test RPC endpoint:
```bash
# Test connection
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  YOUR_RPC_URL
```

2. Try alternative RPCs:
```bash
# Base Sepolia alternatives
fabstir-host config set network.rpcUrl https://base-sepolia.publicnode.com
# or
fabstir-host config set network.rpcUrl https://sepolia.base.org
```

3. Check rate limits:
```bash
# Use private RPC with higher limits
# Get free tier from Alchemy/Infura
fabstir-host config set network.rpcUrl https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
```

---

### Public URL Not Accessible

**Problem:** Node is running locally but not accessible from internet

**Solutions:**

1. **Verify node binds to 0.0.0.0 (not 127.0.0.1)**:
   - fabstir-llm-node binds to 0.0.0.0:8080 by default
   - Check logs for "API server started on 0.0.0.0:8080"

2. **Test localhost first**:
   ```bash
   # From the host machine
   curl http://localhost:8080/health

   # Should return:
   # {"status":"healthy"}
   ```

3. **Check firewall settings**:
   ```bash
   # Linux (UFW)
   sudo ufw status
   sudo ufw allow 8080/tcp

   # Linux (iptables)
   sudo iptables -L -n | grep 8080

   # macOS
   sudo pfctl -sr | grep 8080

   # Windows
   netsh advfirewall firewall show rule name="Fabstir Host"
   ```

4. **Test from external machine**:
   ```bash
   # From another computer
   curl http://YOUR_PUBLIC_IP:8080/health

   # Or use online tool
   # https://www.portchecktool.com/
   ```

5. **Check NAT/Router configuration**:
   - Port forwarding: External 8080 → Internal 8080
   - DMZ: Enable for host machine (security risk)
   - UPnP: Enable automatic port forwarding

6. **Show troubleshooting steps**:
   ```bash
   # CLI shows network diagnostics automatically
   fabstir-host register --url http://YOUR_IP:8080

   # If verification fails, you'll see:
   # 🔧 Troubleshooting Steps:
   # 1. Check if node is running locally: curl http://localhost:8080/health
   # 2. Check firewall allows incoming: sudo ufw allow 8080/tcp
   # 3. Verify port is listening: netstat -tuln | grep 8080
   # 4. Test from another machine: curl http://YOUR_IP:8080/health
   ```

---

### Model Loading Failures

**Problem:** Node starts but model not loaded

**Symptoms:**
- `/health` returns 200 but inference fails
- Logs show errors during model loading
- High memory usage but no model active

**Solutions:**

1. **Monitor startup logs** (CRITICAL - /health is NOT sufficient):
   ```bash
   # Watch logs for startup sequence
   tail -f ~/.fabstir/logs/host.log

   # Look for these messages in order:
   # ✅ Model loaded successfully      <- Model is ready
   # ✅ P2P node started               <- P2P layer ready
   # ✅ API server started             <- HTTP ready
   # 🎉 Fabstir LLM Node is running   <- Fully operational

   # If you see "API server started" but NOT "Model loaded successfully",
   # the model is still loading!
   ```

2. **Wait for full startup** (model loading takes time):
   ```bash
   # TinyVicuna-1B: ~30 seconds
   # Llama-2-7B: ~60 seconds
   # Llama-2-13B: ~120 seconds

   # CLI waits for full startup automatically
   fabstir-host start
   # Will show:
   # ✅ Model loaded
   # ✅ P2P started
   # ✅ API started
   ```

3. **Verify model file exists**:
   ```bash
   # Check MODEL_PATH environment variable
   echo $MODEL_PATH

   # Verify file exists
   ls -lh ./models/your-model.gguf

   # Check file size (should be > 100MB for most models)
   du -h ./models/your-model.gguf
   ```

4. **Check available memory**:
   ```bash
   # Linux
   free -h

   # macOS
   vm_stat

   # Model memory requirements:
   # - TinyVicuna Q4_K_M: ~700MB
   # - Llama-2-7B Q4_K_M: ~4GB
   # - Llama-2-13B Q4_K_M: ~8GB
   ```

5. **GPU layers configuration**:
   ```bash
   # Check GPU_LAYERS setting
   echo $GPU_LAYERS

   # If out of VRAM, reduce layers:
   export GPU_LAYERS=20  # Default is 35

   # Or disable GPU entirely:
   export GPU_LAYERS=0
   ```

---

### fabstir-llm-node Not Found

**Problem:** "fabstir-llm-node binary not found"

**Solutions:**

1. **Install from source**:
   ```bash
   git clone https://github.com/fabstir/fabstir-llm-node
   cd fabstir-llm-node
   cargo build --release
   sudo cp target/release/fabstir-llm-node /usr/local/bin/
   ```

2. **Download pre-built binary**:
   ```bash
   curl -L https://github.com/fabstir/fabstir-llm-node/releases/latest/download/fabstir-llm-node-linux-x64 \
     -o /usr/local/bin/fabstir-llm-node
   chmod +x /usr/local/bin/fabstir-llm-node
   ```

3. **Verify installation**:
   ```bash
   which fabstir-llm-node
   fabstir-llm-node --version
   ```

---

### LLM backend unreachable

**Problem:** "Cannot connect to inference endpoint"

**Solutions:**

1. Verify backend is running:
```bash
# For Ollama
curl http://localhost:11434/api/tags

# For vLLM
curl http://localhost:8000/v1/models

# For OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

2. Check endpoint configuration:
```bash
# View current setting
fabstir-host config get inference.endpoint

# Update if needed
fabstir-host config set inference.endpoint http://localhost:11434
```

3. Test inference:
```bash
# Run test
fabstir-host inference test --prompt "Hello"
```

---

## Registration Errors

### "Already registered" error

**Problem:** Node is already registered

**Solution:**
```bash
# Check registration status
fabstir-host status --detailed

# Unregister first
fabstir-host unregister

# Then register again
fabstir-host register
```

---

### Gas estimation failures

**Problem:** "Cannot estimate gas" or "Gas required exceeds allowance"

**Solutions:**

1. Increase gas limit:
```bash
# Set higher gas price
fabstir-host config set network.maxGasPrice 200

# Use aggressive gas strategy
fabstir-host config set network.gasPrice aggressive
```

2. Check contract state:
```bash
# Verify contracts are deployed
fabstir-host network test
```

3. Manual gas specification:
```bash
# Register with specific gas
fabstir-host register --gas-limit 500000 --gas-price 50
```

---

## Session Problems

### Sessions not receiving prompts

**Problem:** WebSocket connected but no messages

**Solutions:**

1. Check session logs:
```bash
# View session logs
grep "session" ~/.fabstir/logs/host.log | tail -50
```

2. Verify WebSocket health:
```bash
# Test WebSocket
wscat -c ws://localhost:8080/ws/session
```

3. Check checkpoint submissions:
```bash
# View checkpoint history
fabstir-host session info SESSION_ID --checkpoints
```

---

### Proof submission failures

**Problem:** "Proof verification failed"

**Solutions:**

1. Check proof system status:
```bash
# Verify proof system contract
fabstir-host config get contracts.proofSystem
```

2. Retry with higher gas:
```bash
# Increase gas for proof submission
fabstir-host config set resilience.proof.gasMultiplier 1.5
```

3. Check logs for details:
```bash
grep "proof" ~/.fabstir/logs/host.log | tail -20
```

---

## Wallet Issues

### Lost private key

**Problem:** Cannot access wallet

**Solutions:**

1. Check for backups:
```bash
# Look for wallet backups
ls ~/.fabstir/backups/

# Restore from backup
fabstir-host wallet import backup-wallet.json
```

2. Check keychain (if using keytar):
```bash
# macOS
security find-generic-password -s "fabstir-host"

# Linux (using secret-tool)
secret-tool search application fabstir-host
```

3. Recover from mnemonic:
```bash
# If you have mnemonic
fabstir-host wallet import "your twelve word mnemonic phrase here" --type mnemonic
```

---

### Transaction stuck/pending

**Problem:** Transaction not confirming

**Solutions:**

1. Check transaction status:
```bash
# Get transaction hash from logs
grep "Transaction sent" ~/.fabstir/logs/host.log | tail -1

# Check on explorer
# https://sepolia.basescan.org/tx/YOUR_TX_HASH
```

2. Speed up transaction:
```bash
# Resend with higher gas
fabstir-host withdraw --gas-price 100 --nonce SAME_NONCE
```

3. Cancel transaction:
```bash
# Send 0 value transaction to self with same nonce
fabstir-host wallet send --to SELF --value 0 --nonce STUCK_NONCE --gas-price 150
```

---

## Performance Issues

### High CPU usage

**Solutions:**

1. Limit concurrent sessions:
```bash
fabstir-host config set host.maxConcurrent 3
```

2. Adjust checkpoint interval:
```bash
# Reduce checkpoint frequency
fabstir-host config set host.checkpointInterval 200
```

3. Enable circuit breaker:
```bash
fabstir-host config set resilience.circuitBreaker.enabled true
```

---

### Memory leaks

**Solutions:**

1. Restart periodically:
```bash
# Set up cron job for daily restart
0 3 * * * /usr/local/bin/fabstir-host daemon restart
```

2. Monitor memory:
```bash
# Check process memory
ps aux | grep fabstir-host
```

3. Limit log size:
```bash
fabstir-host config set logging.maxSize 5M
fabstir-host config set logging.maxFiles 3
```

---

## Error Messages

### Common error codes and solutions

| Error Code | Message | Solution |
|------------|---------|----------|
| `ERR_INSUFFICIENT_FUNDS` | Insufficient balance | Add ETH or FAB tokens |
| `ERR_NOT_REGISTERED` | Host not registered | Run `fabstir-host register` |
| `ERR_SESSION_NOT_FOUND` | Session does not exist | Session may have expired |
| `ERR_PROOF_FAILED` | Proof verification failed | Check proof system logs |
| `ERR_NETWORK_TIMEOUT` | Network request timeout | Check internet connection |
| `ERR_GAS_TOO_HIGH` | Gas price exceeds limit | Wait or increase limit |
| `ERR_NONCE_TOO_LOW` | Nonce too low | Clear pending transactions |
| `ERR_CONTRACT_REVERT` | Contract execution reverted | Check contract state |
| `ERR_WEBSOCKET_CLOSED` | WebSocket connection closed | Check firewall/NAT |
| `ERR_RATE_LIMIT` | Rate limit exceeded | Reduce request frequency |

---

## Debugging Tools

### Enable debug logging

```bash
# Set debug level
fabstir-host config set logging.level debug

# View debug logs
tail -f ~/.fabstir/logs/host.log | grep DEBUG
```

### Network debugging

```bash
# Test connectivity
fabstir-host network test --verbose

# Check contract calls
fabstir-host --verbose register 2>&1 | tee debug.log
```

### Session debugging

```bash
# Monitor WebSocket traffic
fabstir-host start --debug-ws

# Trace session lifecycle
fabstir-host session trace SESSION_ID
```

### Export diagnostics

```bash
# Generate diagnostic report
fabstir-host diagnostic --output report.json

# Include in bug report
cat report.json | pbcopy  # macOS
cat report.json | xclip   # Linux
```

---

## Getting Help

### Self-service resources

1. **Documentation:**
   - [README](../README.md)
   - [Configuration Guide](CONFIGURATION.md)
   - [Commands Reference](COMMANDS.md)

2. **Logs:**
   ```bash
   # Application logs
   ~/.fabstir/logs/host.log

   # Error logs
   ~/.fabstir/logs/error.log
   ```

3. **Version check:**
   ```bash
   fabstir-host version --check-update
   ```

### Community support

1. **Discord:**
   - Join: [discord.gg/fabstir](https://discord.gg/fabstir)
   - Channel: #host-support

2. **GitHub Issues:**
   - Search existing: [GitHub Issues](https://github.com/fabstir/fabstir-host-cli/issues)
   - Create new issue with:
     ```bash
     fabstir-host diagnostic --github
     ```

3. **Forum:**
   - [community.fabstir.com](https://community.fabstir.com)

### Professional support

For enterprise support:
- Email: support@fabstir.com
- Include diagnostic report
- Provide transaction hashes
- Describe expected vs actual behavior

### Emergency recovery

If host is completely broken:

```bash
# 1. Backup everything
cp -r ~/.fabstir ~/.fabstir.backup.$(date +%s)

# 2. Export wallet
fabstir-host wallet export --output emergency-wallet.json

# 3. Clean reinstall
npm uninstall -g @fabstir/host-cli
rm -rf ~/.fabstir
npm install -g @fabstir/host-cli

# 4. Restore wallet
fabstir-host init
fabstir-host wallet import emergency-wallet.json

# 5. Re-register
fabstir-host register
```

---

## Preventive Measures

### Regular maintenance

```bash
# Weekly tasks
fabstir-host diagnostic
fabstir-host config backup

# Monthly tasks
npm update -g @fabstir/host-cli
fabstir-host migrate
```

### Monitoring

```bash
# Set up alerts
fabstir-host monitor enable --email your@email.com

# Health checks
*/5 * * * * fabstir-host health || fabstir-host daemon restart
```

### Backups

```bash
# Automated backups
0 0 * * * fabstir-host config backup --auto
0 0 * * * fabstir-host wallet export --output ~/.fabstir/backups/wallet-$(date +%Y%m%d).json
```