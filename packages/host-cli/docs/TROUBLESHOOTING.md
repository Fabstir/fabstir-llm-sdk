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
lsof -i :8083  # Linux/macOS
netstat -ano | findstr :8083  # Windows

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
sudo ufw allow 8083/tcp

# Check firewall status
sudo ufw status

# Windows firewall
netsh advfirewall firewall add rule name="Fabstir Host" dir=in action=allow protocol=TCP localport=8083
```

2. Configure NAT/port forwarding:
```bash
# Test port accessibility
nc -zv your-public-ip 8083

# Use ngrok for testing
ngrok http 8083
```

3. Update public URL:
```bash
# Set correct public URL
fabstir-host config set host.publicUrl https://your-domain.com:8083
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
   - fabstir-llm-node binds to 0.0.0.0:8083 by default
   - Check logs for "API server started on 0.0.0.0:8083"

2. **Test localhost first**:
   ```bash
   # From the host machine
   curl http://localhost:8083/health

   # Should return:
   # {"status":"healthy"}
   ```

3. **Check firewall settings**:
   ```bash
   # Linux (UFW)
   sudo ufw status
   sudo ufw allow 8083/tcp

   # Linux (iptables)
   sudo iptables -L -n | grep 8083

   # macOS
   sudo pfctl -sr | grep 8083

   # Windows
   netsh advfirewall firewall show rule name="Fabstir Host"
   ```

4. **Test from external machine**:
   ```bash
   # From another computer
   curl http://YOUR_PUBLIC_IP:8083/health

   # Or use online tool
   # https://www.portchecktool.com/
   ```

5. **Check NAT/Router configuration**:
   - Port forwarding: External 8083 → Internal 8083
   - DMZ: Enable for host machine (security risk)
   - UPnP: Enable automatic port forwarding

6. **Show troubleshooting steps**:
   ```bash
   # CLI shows network diagnostics automatically
   fabstir-host register --url http://YOUR_IP:8083

   # If verification fails, you'll see:
   # 🔧 Troubleshooting Steps:
   # 1. Check if node is running locally: curl http://localhost:8083/health
   # 2. Check firewall allows incoming: sudo ufw allow 8083/tcp
   # 3. Verify port is listening: netstat -tuln | grep 8083
   # 4. Test from another machine: curl http://YOUR_IP:8083/health
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

## Docker Deployment Issues

### Model Not Found in Container

**Problem:** `Model file not found: /models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`

**Symptoms:**
- Node starts but immediately fails
- Logs show "MODEL_PATH does not exist"
- Container exits with error

**Solutions:**

1. **Verify volume mount**:
   ```bash
   # Check if volume is mounted correctly
   docker inspect fabstir-host | grep -A 10 Mounts

   # Should show:
   # "Source": "/home/user/fabstir-models",
   # "Destination": "/models"
   ```

2. **Check model exists on host**:
   ```bash
   # Outside container, on host machine
   ls -lh ~/fabstir-models/
   # Should show your .gguf file

   # Verify file size
   du -h ~/fabstir-models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   # Should be ~700MB
   ```

3. **Check MODEL_PATH environment variable**:
   ```bash
   # Inside container
   docker exec fabstir-host env | grep MODEL_PATH

   # Should match volume mount path:
   # MODEL_PATH=/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   ```

4. **Fix volume mount**:
   ```bash
   # Stop and remove container
   docker stop fabstir-host
   docker rm fabstir-host

   # Re-run with correct mount
   docker run -d \
     --name fabstir-host \
     -p 8083:8083 \
     -p 9000:9000 \
     -v ~/fabstir-models:/models \
     -e MODEL_PATH=/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
     fabstir/host-cli:latest
   ```

---

### Volume Mount Permission Denied

**Problem:** `Permission denied: /models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`

**Solutions:**

1. **Fix file permissions on host**:
   ```bash
   # Make files readable
   chmod 644 ~/fabstir-models/*.gguf

   # Make directory executable
   chmod 755 ~/fabstir-models
   ```

2. **Check file ownership**:
   ```bash
   # Check current ownership
   ls -l ~/fabstir-models/

   # If owned by root, fix it:
   sudo chown $USER:$USER ~/fabstir-models/*.gguf
   ```

3. **Run container with user ID**:
   ```bash
   docker run -d \
     --name fabstir-host \
     --user $(id -u):$(id -g) \
     -v ~/fabstir-models:/models \
     fabstir/host-cli:latest
   ```

---

### Container Cannot Access Environment Variables

**Problem:** `CONTRACT_JOB_MARKETPLACE is undefined`

**Solutions:**

1. **Verify environment variables are set**:
   ```bash
   # Check if vars are exported
   echo $CONTRACT_JOB_MARKETPLACE
   echo $RPC_URL_BASE_SEPOLIA

   # Export if not set
   export CONTRACT_JOB_MARKETPLACE="0xdEa1B47872C27458Bb7331Ade99099761C4944Dc"
   export RPC_URL_BASE_SEPOLIA="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
   ```

2. **Pass all required environment variables**:
   ```bash
   docker run -d \
     --name fabstir-host \
     -e HOST_PRIVATE_KEY=$HOST_PRIVATE_KEY \
     -e MODEL_PATH=/models/your-model.gguf \
     -e CHAIN_ID=84532 \
     -e RPC_URL_BASE_SEPOLIA=$RPC_URL_BASE_SEPOLIA \
     -e CONTRACT_JOB_MARKETPLACE=$CONTRACT_JOB_MARKETPLACE \
     -e CONTRACT_NODE_REGISTRY=$CONTRACT_NODE_REGISTRY \
     -e CONTRACT_PROOF_SYSTEM=$CONTRACT_PROOF_SYSTEM \
     -e CONTRACT_HOST_EARNINGS=$CONTRACT_HOST_EARNINGS \
     fabstir/host-cli:latest
   ```

3. **Use env file**:
   ```bash
   # Create .env file
   cat > docker.env <<EOF
   HOST_PRIVATE_KEY=0x...
   MODEL_PATH=/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   CHAIN_ID=84532
   RPC_URL_BASE_SEPOLIA=https://...
   CONTRACT_JOB_MARKETPLACE=0x...
   CONTRACT_NODE_REGISTRY=0x...
   CONTRACT_PROOF_SYSTEM=0x...
   CONTRACT_HOST_EARNINGS=0x...
   EOF

   # Run with env file
   docker run -d --env-file docker.env fabstir/host-cli:latest
   ```

---

### Container Ports Not Accessible

**Problem:** Cannot access `http://YOUR_IP:8083` even though container is running

**Solutions:**

1. **Verify port mapping**:
   ```bash
   docker ps | grep fabstir-host
   # Should show: 0.0.0.0:8083->8083/tcp
   ```

2. **Check if ports are exposed**:
   ```bash
   docker inspect fabstir-host | grep -A 5 ExposedPorts
   # Should show: "8083/tcp": {} and "9000/tcp": {}
   ```

3. **Test from host machine first**:
   ```bash
   curl http://localhost:8083/health
   # Should work from host

   # Then test externally
   curl http://YOUR_PUBLIC_IP:8083/health
   ```

4. **Check Docker network**:
   ```bash
   # See which network
   docker inspect fabstir-host | grep NetworkMode

   # For bridge network, check firewall allows forwarding
   sudo iptables -L DOCKER-USER
   ```

---

### Docker Container Exits Immediately

**Problem:** Container starts but stops after a few seconds

**Solutions:**

1. **Check container logs**:
   ```bash
   docker logs fabstir-host

   # Look for error messages at the end
   docker logs --tail 50 fabstir-host
   ```

2. **Run container in foreground to see errors**:
   ```bash
   # Remove -d flag to see output
   docker run -it \
     --name fabstir-host-debug \
     -p 8083:8083 \
     -v ~/fabstir-models:/models \
     -e MODEL_PATH=/models/your-model.gguf \
     fabstir/host-cli:latest
   ```

3. **Common exit causes**:
   - Missing MODEL_PATH
   - Invalid contract addresses
   - fabstir-llm-node binary not found
   - Port 8083 already in use

4. **Start with interactive shell**:
   ```bash
   docker run -it \
     --name fabstir-host-debug \
     -v ~/fabstir-models:/models \
     fabstir/host-cli:latest \
     /bin/bash

   # Inside container, debug manually
   ls -l /models
   echo $MODEL_PATH
   which fabstir-llm-node
   ```

---

## Model Download Issues

### Hugging Face Download Interrupted

**Problem:** Download stops partway through

**Solutions:**

1. **Resume with wget**:
   ```bash
   # Resume interrupted download
   wget -c https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   ```

2. **Use curl with resume**:
   ```bash
   curl -C - -L -o tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
     https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   ```

3. **Use Hugging Face CLI with retry**:
   ```bash
   pip install huggingface-hub
   huggingface-cli download \
     TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF \
     tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
     --local-dir ~/fabstir-models \
     --resume-download
   ```

---

### Model File Corrupted

**Problem:** Model downloads but fails to load

**Solutions:**

1. **Verify file size**:
   ```bash
   ls -lh ~/fabstir-models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   # Should be ~700MB (731MB exactly)
   ```

2. **Check SHA256 hash**:
   ```bash
   sha256sum ~/fabstir-models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   # Compare with hash on Hugging Face model card
   ```

3. **Re-download**:
   ```bash
   # Delete corrupted file
   rm ~/fabstir-models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

   # Download fresh
   wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   ```

---

### Model Not Approved in ModelRegistry

**Problem:** `Model not approved: {your-model-string}`

**Symptoms:**
- Registration fails with "Model not approved"
- Error mentions ModelRegistry contract

**Solutions:**

1. **Use exact approved model string**:
   ```bash
   # ✅ CORRECT (approved)
   "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"

   # ❌ WRONG (missing repository)
   "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"

   # ❌ WRONG (missing filename)
   "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF"

   # ❌ WRONG (wrong separator)
   "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
   ```

2. **Check approved models**:
   ```bash
   # Query blockchain
   docker exec fabstir-host fabstir-host list-models

   # Currently approved:
   # 1. TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   # 2. CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
   ```

3. **Verify format**:
   ```bash
   # Format must be: {repository}:{filename}
   # - Repository: Hugging Face repo path
   # - Filename: Exact .gguf file name
   # - Separator: Single colon (:)
   ```

4. **See model guide**:
   - [MODEL_DOWNLOAD_GUIDE.md](./MODEL_DOWNLOAD_GUIDE.md) for complete list
   - [ModelRegistry contract](../../docs/compute-contracts-reference/ModelRegistry.md) for on-chain status

---

### Insufficient Disk Space for Model

**Problem:** `No space left on device`

**Solutions:**

1. **Check available space**:
   ```bash
   df -h ~/fabstir-models

   # Model requirements:
   # - TinyLlama: 1GB
   # - TinyVicuna: 1GB
   # - Llama-2-7B: 5GB
   # - Mixtral-8x7B: 30GB
   ```

2. **Clean up old models**:
   ```bash
   # Remove unused models
   rm ~/fabstir-models/old-model.gguf

   # Or move to external drive
   mv ~/fabstir-models/large-model.gguf /mnt/external/
   ```

3. **Use different directory**:
   ```bash
   # Create on larger partition
   mkdir -p /mnt/data/fabstir-models

   # Download there
   cd /mnt/data/fabstir-models
   wget https://huggingface.co/.../your-model.gguf

   # Update Docker mount
   docker run -v /mnt/data/fabstir-models:/models ...
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
wscat -c ws://localhost:8083/ws/session
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