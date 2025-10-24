#!/bin/bash
# Diagnose CUDA/vGPU issues on TEST_HOST_3
# Run this in WSL2 with kubectl configured

set -e

echo "=================================="
echo "CUDA/vGPU Diagnostic Script"
echo "=================================="
echo ""

# Get pod name
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')
echo "Pod: $POD"
echo ""

echo "[1/6] Checking GPU visibility in container..."
echo "---"
kubectl exec -n fabstir-host $POD -- nvidia-smi || echo "❌ nvidia-smi failed - GPU not visible in container!"
echo ""

echo "[2/6] Checking vGPU License Status..."
echo "---"
kubectl exec -n fabstir-host $POD -- nvidia-smi -q | grep -A 5 -i "license" || echo "⚠️ No license info found"
echo ""

echo "[3/6] Checking CUDA Runtime in Container..."
echo "---"
echo "CUDA Toolkit version:"
kubectl exec -n fabstir-host $POD -- nvcc --version 2>/dev/null || echo "⚠️ nvcc not found (CUDA toolkit not installed in container)"
echo ""
echo "CUDA libraries available:"
kubectl exec -n fabstir-host $POD -- ldconfig -p 2>/dev/null | grep -i cuda || echo "⚠️ No CUDA libraries found via ldconfig"
echo ""

echo "[4/6] Checking CUDA Environment Variables..."
echo "---"
kubectl exec -n fabstir-host $POD -- env | grep -E "CUDA|LD_LIBRARY" || echo "⚠️ No CUDA env vars set"
echo ""

echo "[5/6] Checking for NVIDIA Driver Libraries..."
echo "---"
echo "Looking for libcuda.so:"
kubectl exec -n fabstir-host $POD -- find /usr -name "libcuda.so*" 2>/dev/null || echo "⚠️ libcuda.so not found"
echo ""
echo "Looking for CUDA runtime libraries:"
kubectl exec -n fabstir-host $POD -- find /usr -name "libcudart.so*" 2>/dev/null || echo "⚠️ libcudart.so not found"
echo ""

echo "[6/6] Checking Pod GPU Resource Allocation..."
echo "---"
kubectl describe pod -n fabstir-host $POD | grep -A 5 "Limits:" || echo "⚠️ Resource limits not found"
echo ""

echo "=================================="
echo "DIAGNOSIS SUMMARY"
echo "=================================="
echo ""
echo "Expected Results:"
echo "  ✓ nvidia-smi shows GPU (NVIDIA A16)"
echo "  ✓ License Status: Licensed"
echo "  ✓ CUDA libraries present in /usr/local/cuda or /usr/lib"
echo "  ✓ nvidia.com/gpu: 1 in resource limits"
echo ""
echo "Common Issues:"
echo "  1. vGPU Unlicensed → Contact Vultr support"
echo "  2. No CUDA libraries → Need CUDA base image"
echo "  3. nvidia-smi fails → nvidia-container-toolkit issue"
echo ""
