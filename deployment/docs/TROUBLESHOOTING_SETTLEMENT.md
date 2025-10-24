# Troubleshooting Payment Settlement Issues

**Problem:** Host performs inference successfully but no payment settlement occurs when session ends.

**Root Cause:** Environment variable configuration or node initialization issues preventing `completeSessionJob()` from executing.

## Quick Diagnostic Steps

### Step 1: Check Pod Logs for Settlement Warnings

```bash
# Get pod name
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')

# Check for settlement-related logs
kubectl logs -n fabstir-host $POD | grep -E "SETTLEMENT|complete_session|CHECKPOINT-MGR|HOST_PRIVATE_KEY|CONTRACT_JOB_MARKETPLACE"
```

**What to look for:**

✅ **Good signs:**
```
📝 CONTRACT VERSION: Using JobMarketplace at 0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E
[CHECKPOINT-MGR] Initialized with host wallet: 0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71
[DISCONNECT-HANDLER] 🔌 === WebSocket Disconnect Event === Session: 123
[CHECKPOINT-MGR] 🎯 === STARTING PAYMENT SETTLEMENT PROCESS ===
💰 Completing session job 123 to trigger payment settlement...
Transaction sent for completing job 123 - tx_hash: 0x...
✅ Transaction confirmed after 2.3s for job 123
```

❌ **Bad signs:**
```
⚠️ NO SETTLEMENT MANAGER AVAILABLE!
⚠️ HOST_PRIVATE_KEY not set - payments will NOT work!
CONTRACT_JOB_MARKETPLACE not set, using default address
Using default contract: 0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944  <-- OLD CONTRACT!
```

###Step 2: Verify Environment Variables in Running Pod

```bash
# Exec into pod and check env vars
kubectl exec -n fabstir-host $POD -- env | grep -E "HOST_PRIVATE_KEY|CONTRACT_JOB_MARKETPLACE|RPC_URL|CHAIN_ID"
```

**Expected output:**
```
HOST_PRIVATE_KEY=0x36c4dbaead98ebd10417c0325da8cf1217e12488185f8c4aec68d5c476f39fa5
CONTRACT_JOB_MARKETPLACE=0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E
RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
CHAIN_ID=84532
```

If any are missing or wrong, the ConfigMap isn't being loaded properly.

### Step 3: Check ConfigMap is Applied

```bash
# View current ConfigMap
kubectl get configmap -n fabstir-host fabstir-host-config -o yaml
```

**Verify these critical values:**
```yaml
data:
  HOST_PRIVATE_KEY: "0x36c4dbaead98ebd10417c0325da8cf1217e12488185f8c4aec68d5c476f39fa5"
  CONTRACT_JOB_MARKETPLACE: "0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E"  # NOT 0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944
  RPC_URL: "https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR"
  CHAIN_ID: "84532"
```

### Step 4: Check Host Wallet Balance

The host needs Base Sepolia ETH for gas to call `completeSessionJob()`:

```bash
# Using cast (if foundry installed)
cast balance 0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71 --rpc-url https://sepolia.base.org

# Or check on BaseScan
# https://sepolia.basescan.org/address/0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71
```

**Minimum required:** ~0.001 ETH for settlement gas costs

### Step 5: Verify Pod is Using Latest Image

```bash
# Check image being used
kubectl get pod -n fabstir-host $POD -o jsonpath='{.spec.containers[0].image}'
```

**Expected:** `ghcr.io/fabstir/llm-host:beta-latest`

If it's pulling an old cached image:
```bash
# Force pull latest image
kubectl rollout restart deployment -n fabstir-host fabstir-host
kubectl rollout status deployment -n fabstir-host fabstir-host
```

## Common Issues and Fixes

### Issue 1: ConfigMap Not Loaded

**Symptom:** Environment variables missing in pod

**Fix:**
```bash
# Verify ConfigMap exists
kubectl get configmap -n fabstir-host fabstir-host-config

# If missing, apply it
kubectl apply -f deployment/kubernetes/fabstir-host-configmap.yaml

# Restart deployment to pick up ConfigMap
kubectl rollout restart deployment -n fabstir-host fabstir-host
```

### Issue 2: Using Old Contract Address

**Symptom:** Logs show `0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944`

**Fix:**
```bash
# Update ConfigMap
kubectl edit configmap -n fabstir-host fabstir-host-config

# Change this line:
CONTRACT_JOB_MARKETPLACE: "0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E"

# Restart pod
kubectl rollout restart deployment -n fabstir-host fabstir-host
```

### Issue 3: HOST_PRIVATE_KEY Not Set

**Symptom:** Logs show `⚠️ HOST_PRIVATE_KEY not set`

**Fix:**
```bash
# Update ConfigMap
kubectl edit configmap -n fabstir-host fabstir-host-config

# Add this line in data section:
HOST_PRIVATE_KEY: "0x36c4dbaead98ebd10417c0325da8cf1217e12488185f8c4aec68d5c476f39fa5"

# Restart pod
kubectl rollout restart deployment -n fabstir-host fabstir-host
```

### Issue 4: Insufficient Gas

**Symptom:** Transaction fails with "insufficient funds" error

**Fix:**
Fund the host wallet with Base Sepolia ETH:
```bash
# Get testnet ETH from faucet
# https://www.alchemy.com/faucets/base-sepolia

# Send to: 0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71
# Amount: 0.01 ETH (should last for ~100 settlements)
```

### Issue 5: Pod Restart Loop

**Symptom:** Pod keeps restarting

**Check logs:**
```bash
kubectl logs -n fabstir-host $POD --previous
```

Common causes:
- Model download failed (check init container logs)
- Invalid RPC_URL (test with curl)
- GPU not available (check node selector)

## Expected Settlement Flow

When working correctly, you should see this sequence:

1. **Session starts:**
```
[SESSION-MGR] New WebSocket session initialized: 123
[SESSION-MGR] Chain ID: 84532, Job ID: 123
```

2. **Inference happens:**
```
[INFERENCE] Generating response for prompt: "Hello"
[INFERENCE] Tokens generated: 150 / 1000 limit
```

3. **Session ends (user closes connection):**
```
[DISCONNECT-HANDLER] 🔌 === WebSocket Disconnect Event === Session: 123
[DISCONNECT-HANDLER] ✓ Session found - Chain ID: 84532, Tokens: 150
[CHECKPOINT-MGR] 🎯 === STARTING PAYMENT SETTLEMENT PROCESS ===
```

4. **Contract settlement:**
```
[CHECKPOINT-MGR] Job ID: 123, Tokens: 150
💰 Completing session job 123 to trigger payment settlement...
[CHECKPOINT-MGR] 📤 Sending transaction to JobMarketplace: 0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E
Transaction sent for completing job 123 - tx_hash: 0xabcd1234...
Waiting for confirmation...
✅ Transaction confirmed after 2.3s for job 123
```

5. **Payment distributed:**
```
💰 Session completed and payments distributed for job 123
  - Host earnings (90%): 0.00027 USDC (credited to HostEarnings)
  - Treasury fee (10%): 0.00003 USDC (credited to Treasury)
```

6. **Verify on blockchain:**
```bash
# Check transaction on BaseScan
https://sepolia.basescan.org/tx/0xabcd1234...

# Should show:
# - Event: SessionCompleted(jobId=123, totalTokens=150, ...)
# - Host balance in HostEarnings contract increased
# - Treasury balance increased
```

## Verification Checklist

After applying fixes, verify settlement works:

- [ ] Logs show correct contract address (0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E)
- [ ] Logs show CheckpointManager initialized with host address
- [ ] Create new session and send prompts
- [ ] Close session (disconnect WebSocket)
- [ ] Logs show "STARTING PAYMENT SETTLEMENT PROCESS"
- [ ] Transaction hash appears in logs
- [ ] Transaction confirmed on BaseScan
- [ ] HostEarnings contract balance increased
- [ ] No errors in pod logs

## Still Not Working?

If settlement still doesn't work after all checks:

1. **Capture full logs:**
```bash
kubectl logs -n fabstir-host $POD --tail=500 > settlement-debug.log
```

2. **Check contract state:**
```bash
# Using cast
cast call 0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E \
  "sessionJobs(uint256)(address,address,uint256,uint256,uint256,uint8)" \
  123 \
  --rpc-url https://sepolia.base.org
```

3. **Verify host is registered:**
```bash
cast call 0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6 \
  "getHostInfo(address)(uint256,string,bool)" \
  0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71 \
  --rpc-url https://sepolia.base.org
```

4. **Contact support** with:
   - Full pod logs (settlement-debug.log)
   - Transaction hash (if any)
   - Job ID that failed to settle
   - Screenshots of BaseScan transaction page

## Reference: Environment Variables Required for Settlement

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `HOST_PRIVATE_KEY` | ✅ Yes | Signs transactions | `0x36c4dbaead...` |
| `CONTRACT_JOB_MARKETPLACE` | ✅ Yes | Contract to call | `0xc6D44D7f2DfA...` |
| `RPC_URL` | ✅ Yes | Blockchain endpoint | `https://sepolia.base.org` |
| `CHAIN_ID` | ✅ Yes | Network identifier | `84532` |
| `CONTRACT_HOST_EARNINGS` | ⚠️ Recommended | Verify payments | `0x908962e8c6CE...` |
| `RUST_LOG` | 🔍 Debug | Enable detailed logs | `debug` or `info` |

---

**Last Updated:** 2025-10-24
**For Node Version:** fabstir-llm-node v8.1.6+
**Deployment:** Kubernetes (Vultr VKE)
