# Kubernetes GPU Node Deployment Guide

**CRITICAL LESSONS LEARNED**: This guide documents the CORRECT deployment workflow after 6 hours of troubleshooting. Follow it exactly to avoid common pitfalls.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Deployment Architecture](#deployment-architecture)
3. [Step-by-Step Deployment](#step-by-step-deployment)
4. [Registration Workflow](#registration-workflow)
5. [Verification](#verification)
6. [Common Pitfalls](#common-pitfalls)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Infrastructure

- ✅ Kubernetes cluster (1.28+)
- ✅ GPU node with NVIDIA GPU (e.g., NVIDIA A16)
- ✅ `kubectl` configured with cluster access
- ✅ NVIDIA device plugin installed on GPU node

### Required Files

```bash
deployment/kubernetes/
├── fabstir-host-configmap.yaml    # Environment variables
├── fabstir-host-pvc.yaml          # Model storage (5Gi)
├── fabstir-host-deployment.yaml   # Pod deployment
└── fabstir-host-service.yaml      # NodePort service
```

### Docker Image

- Image: `ghcr.io/fabstir/llm-host:beta-latest`
- Contains BOTH:
  - fabstir-llm-node (Rust binary)
  - fabstir-host CLI (TypeScript Management API)

---

## Deployment Architecture

### Critical Understanding

The deployment runs **TWO servers in ONE pod**:

1. **fabstir-llm-node** (port 8083) - LLM inference server
2. **Management API** (port 3001) - Registration and control server

**WRONG APPROACH** ❌:
- Running ONLY fabstir-llm-node
- Trying to register via `fabstir-host register` CLI command (expects to start node itself)

**CORRECT APPROACH** ✅:
- Run fabstir-llm-node in background
- Run Management API in foreground
- Register via Management API HTTP endpoint

---

## Step-by-Step Deployment

### Step 1: Create Namespace

```bash
kubectl create namespace fabstir-host
```

### Step 2: Apply Manifests

```bash
kubectl apply -f deployment/kubernetes/fabstir-host-configmap.yaml
kubectl apply -f deployment/kubernetes/fabstir-host-pvc.yaml
kubectl apply -f deployment/kubernetes/fabstir-host-deployment.yaml
kubectl apply -f deployment/kubernetes/fabstir-host-service.yaml
```

### Step 3: Verify Deployment YAML Has Correct Command

**CRITICAL**: The deployment MUST run both servers. Verify this in `fabstir-host-deployment.yaml`:

```yaml
containers:
- name: fabstir-host
  image: ghcr.io/fabstir/llm-host:beta-latest
  command: ["/bin/sh", "-c"]
  args:
  - |
    # Start fabstir-llm-node in background
    /usr/local/bin/fabstir-llm-node &

    # Wait for node to be ready
    sleep 5

    # Start Management API server (foreground)
    node --require /app/polyfills.js /app/dist/index.js serve --port 3001 --cors '*'
```

**If your deployment.yaml has different args**, update it:

```bash
kubectl patch deployment -n fabstir-host fabstir-host --type='json' -p='[
  {
    "op": "replace",
    "path": "/spec/template/spec/containers/0/command",
    "value": ["/bin/sh", "-c"]
  },
  {
    "op": "replace",
    "path": "/spec/template/spec/containers/0/args",
    "value": [
      "/usr/local/bin/fabstir-llm-node & sleep 5 && node --require /app/polyfills.js /app/dist/index.js serve --port 3001 --cors '*'"
    ]
  }
]'

kubectl delete pods -n fabstir-host --all
```

### Step 4: Wait for Pod to be Ready

```bash
kubectl get pods -n fabstir-host -w
```

Wait for:
```
NAME                            READY   STATUS    RESTARTS   AGE
fabstir-host-xxxxxxxxxx-xxxxx   1/1     Running   0          2m
```

Press Ctrl+C when you see `1/1 Running`.

### Step 5: Verify Both Servers are Running

```bash
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')

# Check fabstir-llm-node (port 8083)
kubectl exec -n fabstir-host $POD -- curl -s http://localhost:8083/health

# Check Management API (port 3001)
kubectl exec -n fabstir-host $POD -- curl -s http://localhost:3001/health
```

**Expected output**:
```json
{"status":"degraded","issues":["No P2P node available"]}  # Node not registered yet
{"status":"ok","uptime":120}  # Management API running
```

### Step 6: Get External NodePort

```bash
kubectl get svc -n fabstir-host fabstir-host-service

# Get specific ports
NODEPORT_API=$(kubectl get svc -n fabstir-host fabstir-host-service -o jsonpath='{.spec.ports[?(@.name=="api")].nodePort}')
NODEPORT_MGMT=$(kubectl get svc -n fabstir-host fabstir-host-service -o jsonpath='{.spec.ports[?(@.name=="management")].nodePort}')

echo "API URL: http://<NODE_IP>:$NODEPORT_API"
echo "Management URL: http://<NODE_IP>:$NODEPORT_MGMT"
```

Replace `<NODE_IP>` with your Kubernetes node's public IP.

---

## Registration Workflow

### CRITICAL: Use Management API, NOT CLI

**WRONG** ❌:
```bash
# DO NOT DO THIS - Will fail with "Node startup timeout"
kubectl exec -n fabstir-host $POD -- node dist/index.js register ...
```

**CORRECT** ✅:
```bash
# Register via Management API HTTP endpoint
kubectl exec -n fabstir-host $POD -- curl -X POST http://localhost:3001/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71",
    "publicUrl": "http://<NODE_IP>:<NODEPORT_API>",
    "models": ["CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"],
    "stakeAmount": "1000",
    "metadata": {
      "hardware": {"gpu": "NVIDIA A16-2Q", "vram": 2, "ram": 8},
      "capabilities": ["streaming"],
      "location": "vultr-ewr",
      "maxConcurrent": 2,
      "costPerToken": 0.002
    },
    "privateKey": "0x36c4dbaead98ebd10417c0325da8cf1217e12488185f8c4aec68d5c476f39fa5",
    "minPricePerTokenNative": "11363636363636",
    "minPricePerTokenStable": "2000"
  }'
```

**Replace**:
- `<NODE_IP>:<NODEPORT_API>` with your actual public URL
- `privateKey` with your actual host private key (TEST_HOST_3 key shown above)

**Expected output**:
```json
{
  "transactionHash": "0xd6976da078feab1dbb65e6a6260a8cb6e57100...",
  "hostAddress": "0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71",
  "success": true
}
```

---

## Verification

### 1. Check Registration Status

```bash
kubectl exec -n fabstir-host $POD -- curl -s http://localhost:3001/api/status
```

Expected output:
```json
{
  "isRegistered": true,
  "hostAddress": "0x1f63aB27e7dcB5BA7d3b54f461c98A1E9b855F71",
  "stake": "1000.0",
  "models": ["0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced"]
}
```

### 2. Check Health (Should No Longer Be Degraded)

```bash
kubectl exec -n fabstir-host $POD -- curl -s http://localhost:8083/health
```

Expected output:
```json
{
  "status": "healthy",
  "gpu_available": true,
  "model_loaded": true
}
```

### 3. Test from External URL

```bash
curl http://<NODE_IP>:<NODEPORT_API>/health
```

### 4. View Logs

```bash
kubectl logs -n fabstir-host $POD -f
```

Look for:
```
✅ Checkpoint manager initialized with host address: 0x1f63...
✅ API server started on http://0.0.0.0:8083
🚀 Starting management server...
✅ Management server started
```

---

## Common Pitfalls

### Pitfall 1: Running ONLY fabstir-llm-node

**Symptom**: Can't register, no Management API on port 3001

**Solution**: Must run BOTH servers (see Step 3 above)

### Pitfall 2: Using CLI `register` Command

**Symptom**: Error "Node startup timeout - model may not have loaded"

**Why**: The CLI `register` command expects to START the node itself, but the node is already running

**Solution**: Use Management API HTTP endpoint instead (see Registration Workflow)

### Pitfall 3: Missing Environment Variables

**Symptom**: Error "Missing RPC URL for network: base-sepolia"

**Solution**: Ensure ConfigMap has ALL required variables:
- `NETWORK: "base-sepolia"`
- `RPC_URL_BASE_SEPOLIA: "https://base-sepolia.g.alchemy.com/v2/..."`
- `CONTRACT_*` addresses
- `ENTRY_POINT_ADDRESS`
- `BASE_CONTRACT_SPEND_PERMISSION_MANAGER`

### Pitfall 4: Insufficient GPU Node Resources

**Symptom**: Pod stuck in Pending, error "Insufficient cpu"

**Solution**: Reduce CPU/memory requests in deployment:
```yaml
resources:
  requests:
    cpu: "100m"      # Reduced from 500m
    memory: "2Gi"    # Reduced from 4Gi
    nvidia.com/gpu: 1
```

### Pitfall 5: Model Download Fails

**Symptom**: Init container error "Permission denied" writing to /models/

**Solution**: Add `securityContext` to init container:
```yaml
initContainers:
- name: download-model
  securityContext:
    runAsUser: 0  # Run as root to write to PVC
```

---

## Troubleshooting

### Pod CrashLoopBackOff

```bash
# Check logs
kubectl logs -n fabstir-host $POD

# Check init container logs
kubectl logs -n fabstir-host $POD -c download-model

# Describe pod for events
kubectl describe pod -n fabstir-host $POD
```

### Management API Not Responding

```bash
# Check if process is running
kubectl exec -n fabstir-host $POD -- ps aux | grep node

# Check port is listening
kubectl exec -n fabstir-host $POD -- netstat -tlnp | grep 3001
```

### Registration Fails

```bash
# Check Management API logs
kubectl logs -n fabstir-host $POD | grep -i "register"

# Verify wallet has funds
kubectl exec -n fabstir-host $POD -- curl -s http://localhost:3001/api/balance
```

### GPU Not Accessible

```bash
# Verify GPU is available
kubectl exec -n fabstir-host $POD -- nvidia-smi

# Check GPU resource request
kubectl get pod -n fabstir-host $POD -o yaml | grep -A 5 resources
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Kubernetes Pod: fabstir-host-xxxxxxxxxx-xxxxx          │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ Init Container: download-model                  │   │
│  │   • Downloads TinyVicuna 1B (~700MB)           │   │
│  │   • Runs as root (PVC write access)            │   │
│  └────────────────────────────────────────────────┘   │
│                      ↓                                  │
│  ┌────────────────────────────────────────────────┐   │
│  │ Main Container: fabstir-host                    │   │
│  │                                                  │   │
│  │  Process 1 (background):                        │   │
│  │    /usr/local/bin/fabstir-llm-node             │   │
│  │    • Port 8083 (API/WebSocket)                 │   │
│  │    • Port 9000 (P2P)                           │   │
│  │    • GPU inference                              │   │
│  │                                                  │   │
│  │  Process 2 (foreground):                        │   │
│  │    node dist/index.js serve                    │   │
│  │    • Port 3001 (Management API)                │   │
│  │    • HTTP endpoints for registration           │   │
│  │    • WebSocket for log streaming               │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                         ↓
         ┌───────────────────────────────┐
         │ Service: fabstir-host-service │
         │ Type: NodePort                │
         │                               │
         │ 8083:30152  (API)            │
         │ 9000:32470  (P2P)            │
         │ 3001:31844  (Management)     │
         └───────────────────────────────┘
                         ↓
         External: http://<NODE_IP>:30152
```

---

## Summary of Correct Workflow

1. ✅ Deploy with BOTH servers running (fabstir-llm-node + Management API)
2. ✅ Wait for pod to be Ready (1/1)
3. ✅ Verify both ports responding (8083 and 3001)
4. ✅ Get external NodePort URL
5. ✅ Register via Management API HTTP POST to `/api/register`
6. ✅ Verify registration via `/api/status`
7. ✅ Test health endpoint shows "healthy"

**Total time**: ~10 minutes (if you follow this guide)

**Time wasted if you don't**: 6+ hours (lesson learned!)

---

## Next Steps

After successful deployment and registration:

1. Test inference via SDK client (see `docs/SDK_API.md`)
2. Monitor logs via Management API WebSocket
3. Update pricing via `/api/update-pricing`
4. Check earnings via `/api/earnings`

---

**Last Updated**: 2025-10-24
**Tested On**: Vultr Kubernetes Engine with NVIDIA A16 GPU node
