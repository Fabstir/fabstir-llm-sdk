#!/bin/bash
# Diagnose why TEST_HOST_3 isn't settling payments on disconnect
# Run this in WSL2 with kubectl configured for Vultr VKE cluster

set -e

echo "=================================="
echo "Settlement Diagnostic Script"
echo "=================================="
echo ""

# Get pod name
echo "[1/6] Getting pod name..."
POD=$(kubectl get pods -n fabstir-host -l app=fabstir-host -o jsonpath='{.items[0].metadata.name}')
echo "✓ Pod: $POD"
echo ""

# Check pod status
echo "[2/6] Checking pod status..."
kubectl get pod -n fabstir-host $POD
echo ""

# Check environment variables in running pod
echo "[3/6] Checking critical environment variables..."
echo "HOST_PRIVATE_KEY:"
kubectl exec -n fabstir-host $POD -- env | grep HOST_PRIVATE_KEY || echo "❌ NOT SET!"
echo ""
echo "CONTRACT_JOB_MARKETPLACE:"
kubectl exec -n fabstir-host $POD -- env | grep CONTRACT_JOB_MARKETPLACE || echo "❌ NOT SET!"
echo ""
echo "RPC_URL:"
kubectl exec -n fabstir-host $POD -- env | grep '^RPC_URL=' || echo "❌ NOT SET!"
echo ""
echo "CHAIN_ID:"
kubectl exec -n fabstir-host $POD -- env | grep CHAIN_ID || echo "❌ NOT SET!"
echo ""

# Check recent logs for settlement-related messages
echo "[4/6] Checking logs for settlement warnings..."
echo "Looking for critical errors:"
kubectl logs -n fabstir-host $POD --tail=200 | grep -E "NO SETTLEMENT|HOST_PRIVATE_KEY not set|CONTRACT_JOB_MARKETPLACE not set" || echo "✓ No critical errors found"
echo ""

# Check logs for contract version
echo "[5/6] Checking which contract is being used..."
kubectl logs -n fabstir-host $POD --tail=500 | grep -E "CONTRACT VERSION|JobMarketplace at" || echo "⚠️ Contract version not logged"
echo ""

# Check for disconnect handling
echo "[6/6] Checking for WebSocket disconnect handling..."
echo "Recent disconnect events:"
kubectl logs -n fabstir-host $POD --tail=500 | grep -E "DISCONNECT|disconnect|WebSocket.*close|session.*end" | tail -10 || echo "⚠️ No disconnect events found"
echo ""

echo "=================================="
echo "SUMMARY"
echo "=================================="
echo ""
echo "Expected to see:"
echo "  ✓ HOST_PRIVATE_KEY is set"
echo "  ✓ CONTRACT_JOB_MARKETPLACE = 0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E"
echo "  ✓ RPC_URL is set"
echo "  ✓ CHAIN_ID = 84532"
echo "  ✓ Disconnect events with settlement attempts"
echo ""
echo "If any are missing, run:"
echo "  kubectl apply -f deployment/kubernetes/fabstir-host-configmap.yaml"
echo "  kubectl rollout restart deployment -n fabstir-host fabstir-host"
echo ""
echo "To view full logs:"
echo "  kubectl logs -n fabstir-host $POD --tail=500"
echo ""
echo "To follow logs in real-time:"
echo "  kubectl logs -n fabstir-host $POD -f"
echo ""
