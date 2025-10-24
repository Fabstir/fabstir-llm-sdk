# Fabstir LLM Host - Kubernetes Deployment Guide

Deploy Fabstir LLM host on Vultr Kubernetes Engine (VKE) with GPU support.

---

## Prerequisites

- ✅ VKE cluster with GPU node pool
- ✅ kubectl configured with cluster access
- ✅ GPU node with NVIDIA A16 (or similar)
- ✅ `kubectl get nodes` shows your GPU node

---

## Quick Start (5 Commands)

```bash
# 1. Create namespace
kubectl create namespace fabstir-host

# 2. Apply all manifests
kubectl apply -f deployment/kubernetes/

# 3. Watch deployment (wait for Running status)
kubectl get pods -n fabstir-host -w

# 4. Get NodePort for external access
kubectl get svc -n fabstir-host fabstir-host-service

# 5. Test health endpoint
NODEPORT=$(kubectl get svc -n fabstir-host fabstir-host-service -o jsonpath='{.spec.ports[0].nodePort}')
curl http://209.250.225.219:$NODEPORT/health
```

Expected result: `{"status":"healthy","gpu_available":true,"model_loaded":true}`

---

## Detailed Deployment Steps

### Step 1: Create Namespace

```bash
kubectl create namespace fabstir-host
```

This creates an isolated namespace for the Fabstir host resources.

---

### Step 2: Apply Kubernetes Manifests

```bash
# Apply all manifests at once
kubectl apply -f deployment/kubernetes/

# Or apply individually in order:
kubectl apply -f deployment/kubernetes/fabstir-host-configmap.yaml
kubectl apply -f deployment/kubernetes/fabstir-host-pvc.yaml
kubectl apply -f deployment/kubernetes/fabstir-host-deployment.yaml
kubectl apply -f deployment/kubernetes/fabstir-host-service.yaml
```

---

### Step 3: Monitor Deployment Progress

```bash
# Watch pod creation
kubectl get pods -n fabstir-host -w

# Expected output:
# NAME                            READY   STATUS     RESTARTS   AGE
# fabstir-host-xxxxxxxxx-xxxxx    0/1     Init:0/1   0          10s  (downloading model)
# fabstir-host-xxxxxxxxx-xxxxx    0/1     Running    0          5m   (starting node)
# fabstir-host-xxxxxxxxx-xxxxx    1/1     Running    0          6m   (ready!)
```

**Timeline:**
- **Init container** (model download): 2-5 minutes (~700MB)
- **Main container** (startup): 1-2 minutes
- **Total**: 3-7 minutes

---

### Step 4: Check Pod Logs

```bash
# View real-time logs
kubectl logs -n fabstir-host -l app=fabstir-host --follow

# Check init container logs (model download)
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n fabstir-host $POD -c download-model

# Check main container logs
kubectl logs -n fabstir-host $POD -c fabstir-host
```

**Look for these success messages:**
```
✅ Model downloaded successfully (680M)
✅ Model loaded successfully
✅ GPU detected: NVIDIA A16-2Q
✅ fabstir-llm-node started
✅ Listening on port 8083
```

---

### Step 5: Verify GPU Access

```bash
# Get pod name
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')

# Check GPU is accessible
kubectl exec -n fabstir-host $POD -- nvidia-smi

# Expected output:
# +-----------------------------------------------------------------------------------------+
# | NVIDIA-SMI 550.90.07              Driver Version: 550.90.07      CUDA Version: 12.4     |
# |-----------------------------------------+------------------------+----------------------+
# | GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |
# |   0  NVIDIA A16-2Q                  On  |   00000000:06:00.0 Off |                    0 |
# |                                         |       XXXMiB /   2048MiB |     XX%      Default |
# +-----------------------------------------+------------------------+----------------------+
```

---

### Step 6: Get External Access URLs

```bash
# Get service details
kubectl get svc -n fabstir-host fabstir-host-service

# Example output:
# NAME                   TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)                                         AGE
# fabstir-host-service   NodePort   10.x.x.x        <none>        8083:30123/TCP,9000:30124/TCP,3001:30125/TCP   5m

# Get NodePort assignments
NODEPORT_API=$(kubectl get svc -n fabstir-host fabstir-host-service -o jsonpath='{.spec.ports[?(@.name=="api")].nodePort}')
NODEPORT_P2P=$(kubectl get svc -n fabstir-host fabstir-host-service -o jsonpath='{.spec.ports[?(@.name=="p2p")].nodePort}')
NODEPORT_MGMT=$(kubectl get svc -n fabstir-host fabstir-host-service -o jsonpath='{.spec.ports[?(@.name=="management")].nodePort}')

echo "API URL: http://209.250.225.219:$NODEPORT_API"
echo "P2P URL: http://209.250.225.219:$NODEPORT_P2P"
echo "Management URL: http://209.250.225.219:$NODEPORT_MGMT"
```

---

### Step 7: Test Health Endpoint

```bash
# Get NodePort for API
NODEPORT=$(kubectl get svc -n fabstir-host fabstir-host-service -o jsonpath='{.spec.ports[?(@.name=="api")].nodePort}')

# Test health endpoint
curl http://209.250.225.219:$NODEPORT/health

# Expected response:
# {
#   "status": "healthy",
#   "gpu_available": true,
#   "model_loaded": true,
#   "active_sessions": 0
# }
```

✅ If you see this response, your host is **fully operational**!

---

## Register on Blockchain

Once the pod is running and healthy, register the host on Base Sepolia:

```bash
# Get pod name
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')

# Get NodePort for API (public URL)
NODEPORT=$(kubectl get svc -n fabstir-host fabstir-host-service -o jsonpath='{.spec.ports[?(@.name=="api")].nodePort}')
PUBLIC_URL="http://209.250.225.219:$NODEPORT"

# Register host on blockchain
kubectl exec -n fabstir-host $POD -- node --require /app/polyfills.js dist/index.js register \
  --url "$PUBLIC_URL" \
  --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" \
  --stake 1000 \
  --price 2000 \
  --force

# Verify registration
kubectl exec -n fabstir-host $POD -- node --require /app/polyfills.js dist/index.js info
```

**Expected output:**
```
✅ Host registered successfully!
Host Address: 0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71
Registered: true
Stake: 1000 FAB
Price: 2000 (0.002 USDC/token)
Public URL: http://209.250.225.219:<nodeport>
Model: CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
```

---

## Test from SDK Client

Test your GPU node from the SDK chat demo:

```bash
# From fabstir-llm-sdk repository
cd apps/harness
pnpm dev

# Open browser: http://localhost:3000/chat-context-popupfree-demo

# Your GPU node should appear in host discovery:
# - Host: TEST_HOST_3
# - Address: 0x1f63...5F71
# - IP: 209.250.225.219
# - Status: Online
```

Send a test prompt and verify you get AI responses!

---

## Monitoring & Maintenance

### View Logs

```bash
# Real-time logs
kubectl logs -n fabstir-host -l app=fabstir-host --follow

# Last 100 lines
kubectl logs -n fabstir-host -l app=fabstir-host --tail=100

# Filter for errors
kubectl logs -n fabstir-host -l app=fabstir-host | grep -i error
```

### Check GPU Utilization

```bash
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n fabstir-host $POD -- nvidia-smi

# Watch GPU in real-time
watch kubectl exec -n fabstir-host $POD -- nvidia-smi
```

### Check Resource Usage

```bash
# Pod CPU/Memory usage
kubectl top pod -n fabstir-host

# Node resources
kubectl top node gpu-supported-528de6ebe05f
```

### Restart Pod

```bash
# Restart deployment (creates new pod)
kubectl rollout restart deployment -n fabstir-host fabstir-host

# Or delete pod (deployment recreates it)
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')
kubectl delete pod -n fabstir-host $POD
```

---

## Troubleshooting

### Pod Stuck in Init (Model Download)

```bash
# Check init container logs
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n fabstir-host $POD -c download-model

# Common issues:
# - Slow internet connection (model is ~700MB)
# - HuggingFace rate limiting
# - PVC storage full

# Solution: Wait or check network connectivity
```

### Pod CrashLoopBackOff

```bash
# Check pod events
kubectl describe pod -n fabstir-host <pod-name>

# Check logs
kubectl logs -n fabstir-host <pod-name>

# Common issues:
# - Model file not found
# - GPU not accessible
# - Environment variables incorrect
```

### GPU Not Detected

```bash
# Check if GPU resource is available on node
kubectl describe node gpu-supported-528de6ebe05f | grep -i gpu

# Should show: nvidia.com/gpu: 1

# If missing, ensure nvidia-device-plugin is running:
kubectl get pods -n kube-system | grep nvidia
```

### Health Check Failing

```bash
# Check if container is running
kubectl get pods -n fabstir-host

# Check if port 8083 is listening
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n fabstir-host $POD -- netstat -tlnp | grep 8083

# Check fabstir-llm-node process
kubectl exec -n fabstir-host $POD -- ps aux | grep fabstir
```

---

## Update Deployment

To update to a new version:

```bash
# Pull latest image
kubectl set image deployment/fabstir-host \
  fabstir-host=ghcr.io/fabstir/llm-host:beta-latest \
  -n fabstir-host

# Or edit deployment directly
kubectl edit deployment -n fabstir-host fabstir-host

# Watch rollout
kubectl rollout status deployment -n fabstir-host fabstir-host
```

---

## Clean Up

To remove the deployment:

```bash
# Delete all resources
kubectl delete namespace fabstir-host

# Or delete individually
kubectl delete -f deployment/kubernetes/
```

**Note**: This will delete the model download. Next deployment will re-download it.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Vultr Kubernetes Engine (VKE)                          │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ GPU Node: gpu-supported-528de6ebe05f           │   │
│  │ IP: 209.250.225.219                            │   │
│  │                                                 │   │
│  │  ┌──────────────────────────────────────────┐ │   │
│  │  │ fabstir-host Pod                          │ │   │
│  │  │                                            │ │   │
│  │  │  Init Container: download-model           │ │   │
│  │  │    ↓ Downloads TinyVicuna 1B (~700MB)     │ │   │
│  │  │                                            │ │   │
│  │  │  Main Container: fabstir-llm-node         │ │   │
│  │  │    • GPU: NVIDIA A16-2Q (2GB VRAM)        │ │   │
│  │  │    • Ports: 8083, 9000, 3001              │ │   │
│  │  │    • Storage: PVC (5Gi)                   │ │   │
│  │  │    • Config: ConfigMap (env vars)         │ │   │
│  │  └──────────────────────────────────────────┘ │   │
│  │                                                 │   │
│  │  Service (NodePort)                            │   │
│  │    • 8083:30xxx - API/WebSocket                │   │
│  │    • 9000:30xxx - P2P                          │   │
│  │    • 3001:30xxx - Management                   │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ Regular Nodes: main-*                          │   │
│  │   • fabstir-ui                                 │   │
│  │   • fabstir-controller                         │   │
│  │   • transcoder                                 │   │
│  │   • ingress-nginx                              │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
                Base Sepolia Testnet
              (Blockchain Registration)
```

---

## Cost Breakdown

**Current Setup:**
- VKE GPU node: $43.07/month ✅ (Already paying)
- Fabstir host pod: **No additional charge** (uses existing node)

**Total**: $43.07/month (unchanged)

---

## Support

- **Documentation**: `docs/` folder in repository
- **Issues**: https://github.com/fabstir/fabstir-llm-sdk/issues
- **Discord**: #beta-testing channel

---

**Last Updated**: 2025-10-23
