# Host Management UI - Production Implementation Guide

> **Purpose**: Guide for UI developers to create a production-ready Host Management UI application using the Fabstir SDK and Host CLI.
>
> **Target Audience**: Frontend developers building the host operator dashboard
>
> **Last Updated**: January 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Reference Implementation](#reference-implementation)
4. [Setup & Prerequisites](#setup--prerequisites)
5. [Core Features](#core-features)
6. [SDK Integration](#sdk-integration)
7. [Management API Integration](#management-api-integration)
8. [Pricing Features (NEW)](#pricing-features-new)
9. [WebSocket Integration](#websocket-integration)
10. [Security Considerations](#security-considerations)
11. [Production Deployment](#production-deployment)
12. [Testing Checklist](#testing-checklist)
13. [Code References](#code-references)

---

## Overview

### What You're Building

A **standalone web application** that allows host operators to:
- Register their compute nodes on the Fabstir network
- Set and update pricing for their services
- Monitor node status in real-time
- Manage supported models and metadata
- View earnings and withdraw funds
- Start/stop their node daemon
- View live streaming logs

### Current State vs Production

**Current State** (Test Harness):
- Lives in `apps/harness/pages/node-management-enhanced.tsx`
- Mixed with test/development features
- Requires full monorepo environment
- NOT suitable for production deployment

**Your Goal** (Production UI):
- Standalone React/Next.js application
- Clean separation from test harness
- Deployable as static site or simple server
- Optimized for host operators (not developers)

### User Personas

**Primary User**: Host Operator
- Runs GPU compute nodes
- Wants simple UI to manage their node
- May not be technical/blockchain expert
- Needs clear pricing controls and earnings visibility

**NOT**: End users requesting LLM inference (they use a different UI)

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Host Management UI                    │
│                  (Your Production App)                   │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Registration │  │   Pricing    │  │     Node     │ │
│  │     Form     │  │  Management  │  │   Control    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Real-time   │  │   Earnings   │  │     Logs     │ │
│  │    Status    │  │   Tracking   │  │   Viewer     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
           │                      │                   │
           ▼                      ▼                   ▼
   ┌───────────────┐      ┌──────────────┐   ┌──────────────┐
   │  @fabstir/    │      │ Management   │   │  WebSocket   │
   │   sdk-core    │      │   API Server │   │   (Logs)     │
   │               │      │  (port 3001) │   │              │
   │ (Blockchain)  │      └──────────────┘   └──────────────┘
   └───────────────┘              │
           │                      │
           ▼                      ▼
   ┌───────────────────────────────────────┐
   │    Blockchain (Base Sepolia)          │
   │  - NodeRegistry                       │
   │  - JobMarketplace                     │
   │  - HostEarnings                       │
   └───────────────────────────────────────┘
```

### Data Flow

1. **User Action** → UI Component
2. **UI Component** → SDK or Management API
3. **SDK** → Blockchain Contracts (via RPC)
4. **Management API** → Host CLI → Node Daemon
5. **WebSocket** → Live Updates → UI

---

## Reference Implementation

### Source Files to Study

The test harness implementation is your **reference**, but you'll need to adapt it for production:

**Main Component**:
```
apps/harness/pages/node-management-enhanced.tsx (wrapper)
apps/harness/components/NodeManagementClient.tsx (main logic, 1956 lines)
```

**Supporting Files**:
```
apps/harness/lib/hostApiClient.ts      (Management API client)
apps/harness/lib/hostWsClient.ts       (WebSocket client for logs)
packages/sdk-core/src/FabstirSDKCore.ts (SDK initialization)
packages/sdk-core/src/managers/HostManager.ts (Host operations)
```

### What to Keep vs What to Change

**✅ Keep from Reference**:
- SDK initialization pattern (lines 456-486)
- Registration flow (lines 713-789)
- Pricing management (lines 684-711)
- WebSocket log streaming (lines 161-200)
- Status monitoring (lines 276-302)

**❌ Remove for Production**:
- Multi-chain selector (lines 243-275) - Base Sepolia only for MVP
- Test account selector (lines 1306-1338) - Production uses real wallets
- Development-only features (network discovery testing, etc.)
- Internal logging for debugging

**🔧 Adapt for Production**:
- Wallet connection (support MetaMask only, remove test accounts)
- Error handling (user-friendly messages, not console.log)
- Loading states (better UX, progress indicators)
- Form validation (client-side validation before submission)

---

## Setup & Prerequisites

### Technology Stack

**Recommended**:
- **Framework**: Next.js 14+ (App Router or Pages Router)
- **React**: 18+
- **Styling**: Tailwind CSS or MUI (your choice)
- **State Management**: React Context or Zustand (simple state)
- **Web3**: ethers.js v6 (included in SDK)

**Required Dependencies**:
```json
{
  "dependencies": {
    "@fabstir/sdk-core": "workspace:*",
    "ethers": "^6.15.0",
    "react": "^18.0.0",
    "next": "^14.0.0"
  }
}
```

### Environment Variables

Create `.env.local` for production:

```bash
# Blockchain (Base Sepolia for MVP)
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Contract Addresses (from .env.test - get from project owner)
NEXT_PUBLIC_CONTRACT_NODE_REGISTRY=0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6
NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE=0xe169A4B57700080725f9553E3Cc69885fea13629
NEXT_PUBLIC_CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
NEXT_PUBLIC_CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NEXT_PUBLIC_CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776

# Management API (local for development, configurable for production)
NEXT_PUBLIC_MANAGEMENT_API_URL=http://localhost:3001
NEXT_PUBLIC_MANAGEMENT_WS_URL=ws://localhost:3001/ws/logs

# App Configuration
NEXT_PUBLIC_APP_NAME=Fabstir Host Manager
NEXT_PUBLIC_SUPPORT_EMAIL=support@fabstir.com
```

---

## Core Features

### 1. Wallet Connection

**What Users Need**:
- Connect MetaMask wallet
- Display connected address
- Show wallet balance (ETH + FAB)
- Disconnect wallet

**Reference Implementation**:
See `NodeManagementClient.tsx` lines 386-453 (connectWallet function)

**Production Adaptation**:

```typescript
// src/hooks/useWallet.ts
import { useState } from 'react';
import { ethers } from 'ethers';

export function useWallet() {
  const [address, setAddress] = useState<string>('');
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = async () => {
    if (!window.ethereum) {
      throw new Error('Please install MetaMask');
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);

    if (accounts.length === 0) {
      throw new Error('No accounts found');
    }

    const walletSigner = await provider.getSigner();
    const walletAddress = await walletSigner.getAddress();

    setSigner(walletSigner);
    setAddress(walletAddress);
    setConnected(true);

    return { signer: walletSigner, address: walletAddress };
  };

  const disconnect = () => {
    setSigner(null);
    setAddress('');
    setConnected(false);
  };

  return { address, signer, connected, connect, disconnect };
}
```

**UI Component**:

```tsx
// src/components/WalletConnect.tsx
import { useWallet } from '@/hooks/useWallet';

export function WalletConnect() {
  const { address, connected, connect, disconnect } = useWallet();
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await connect();
    } catch (error) {
      alert(error.message); // Replace with better error UI
    } finally {
      setLoading(false);
    }
  };

  if (connected) {
    return (
      <div>
        <p>Connected: {address.slice(0, 6)}...{address.slice(-4)}</p>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <button onClick={handleConnect} disabled={loading}>
      {loading ? 'Connecting...' : 'Connect MetaMask'}
    </button>
  );
}
```

---

### 2. Node Registration

**What Users Need**:
- Form to input node details (API URL, stake, models, pricing)
- Real-time price calculator (USDC conversion)
- Submit registration to blockchain
- View transaction status

**Reference Implementation**:
See `NodeManagementClient.tsx` lines 713-789 (registerNode function)

**Key Fields**:
- `apiUrl`: Public URL where their node is accessible
- `stakeAmount`: FAB tokens to stake (minimum 1000)
- `supportedModels`: Model string in `repo:file` format
- `minPricePerToken`: Minimum price per token (100-100,000)
- `metadata`: JSON with hardware specs and capabilities

**Production Form**:

```tsx
// src/components/RegisterForm.tsx
import { useState } from 'react';
import { useSDK } from '@/hooks/useSDK';

export function RegisterForm() {
  const { mgmtApiClient, walletAddress } = useSDK();

  const [apiUrl, setApiUrl] = useState('');
  const [stakeAmount, setStakeAmount] = useState('1000');
  const [minPricePerToken, setMinPricePerToken] = useState('2000');
  const [supportedModels, setSupportedModels] = useState(
    'CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf'
  );
  const [metadata, setMetadata] = useState({
    hardware: {
      gpu: 'NVIDIA RTX 4090',
      vram: 24,
      ram: 64
    },
    capabilities: ['streaming', 'batch'],
    location: 'us-east-1',
    maxConcurrent: 5
  });

  // Real-time price display calculator
  const priceDisplay = {
    perToken: (parseInt(minPricePerToken) / 1000000).toFixed(6),
    per1000: ((parseInt(minPricePerToken) * 1000) / 1000000).toFixed(3),
    per10000: ((parseInt(minPricePerToken) * 10000) / 1000000).toFixed(2)
  };

  const handleRegister = async () => {
    try {
      // Validate inputs
      if (!apiUrl || !apiUrl.startsWith('http')) {
        throw new Error('Invalid API URL');
      }

      const price = parseInt(minPricePerToken);
      if (price < 100 || price > 100000) {
        throw new Error('Price must be between 100 and 100,000');
      }

      // Parse model format
      const modelParts = supportedModels.trim().split(':');
      if (modelParts.length !== 2) {
        throw new Error('Invalid model format. Use: repo:file');
      }

      const [repo, file] = modelParts;
      const modelString = `${repo}:${file}`;

      // Call Management API
      const result = await mgmtApiClient.register({
        walletAddress,
        publicUrl: apiUrl,
        models: [modelString],
        stakeAmount,
        metadata,
        minPricePerToken
      });

      alert(`✅ Registered! Transaction: ${result.transactionHash}`);
    } catch (error) {
      alert(`❌ Registration failed: ${error.message}`);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>
      <div>
        <label>API URL</label>
        <input
          type="url"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="http://your-node.example.com:8080"
          required
        />
      </div>

      <div>
        <label>Stake Amount (FAB)</label>
        <input
          type="number"
          value={stakeAmount}
          onChange={(e) => setStakeAmount(e.target.value)}
          min="1000"
          required
        />
      </div>

      <div>
        <label>Minimum Price Per Token</label>
        <input
          type="number"
          value={minPricePerToken}
          onChange={(e) => setMinPricePerToken(e.target.value)}
          min="100"
          max="100000"
          step="100"
          required
        />
        <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
          <div>💵 ${priceDisplay.perToken} USDC per token</div>
          <div>💵 ${priceDisplay.per1000} USDC per 1,000 tokens</div>
          <div>💵 ${priceDisplay.per10000} USDC per 10,000 tokens</div>
        </div>
      </div>

      <div>
        <label>Supported Model</label>
        <input
          type="text"
          value={supportedModels}
          onChange={(e) => setSupportedModels(e.target.value)}
          placeholder="repo:file"
          required
        />
        <small>Format: CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf</small>
      </div>

      <button type="submit">Register Node</button>
    </form>
  );
}
```

---

### 3. Pricing Management

**What Users Need**:
- View current minimum price
- Update price with real-time preview
- See before/after comparison
- Confirmation before submitting

**Reference Implementation**:
See `NodeManagementClient.tsx` lines 684-711 (updatePricing function)

**Production Component**:

```tsx
// src/components/PricingManager.tsx
import { useState, useEffect } from 'react';
import { useSDK } from '@/hooks/useSDK';

export function PricingManager() {
  const { mgmtApiClient, nodeInfo } = useSDK();
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState(false);

  const currentPrice = nodeInfo?.minPricePerToken?.toString() || '0';

  const calculateDisplay = (price: string) => {
    const p = parseInt(price) || 0;
    return {
      perToken: (p / 1000000).toFixed(6),
      per1000: ((p * 1000) / 1000000).toFixed(3),
      per10000: ((p * 10000) / 1000000).toFixed(2)
    };
  };

  const handleUpdate = async () => {
    if (!newPrice || parseInt(newPrice) < 100 || parseInt(newPrice) > 100000) {
      alert('Price must be between 100 and 100,000');
      return;
    }

    const confirmed = confirm(
      `Update pricing from ${currentPrice} to ${newPrice}?\n\n` +
      `Current: $${calculateDisplay(currentPrice).perToken} USDC/token\n` +
      `New: $${calculateDisplay(newPrice).perToken} USDC/token`
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await mgmtApiClient.updatePricing({ price: newPrice });
      alert(`✅ Pricing updated! TX: ${result.transactionHash}`);
      setNewPrice('');
      // Trigger refresh of node info
    } catch (error) {
      alert(`❌ Update failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3>💰 Pricing Management</h3>

      <div>
        <strong>Current Price:</strong> {currentPrice}
        <span> (${calculateDisplay(currentPrice).perToken} USDC/token)</span>
      </div>

      <div style={{ marginTop: '15px' }}>
        <label>New Price:</label>
        <input
          type="number"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          min="100"
          max="100000"
          step="100"
          placeholder="Enter new price"
        />

        {newPrice && parseInt(newPrice) >= 100 && parseInt(newPrice) <= 100000 && (
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            <div>New: ${calculateDisplay(newPrice).perToken} USDC/token</div>
            <div>• Per 1,000 tokens: ${calculateDisplay(newPrice).per1000} USDC</div>
            <div>• Per 10,000 tokens: ${calculateDisplay(newPrice).per10000} USDC</div>
          </div>
        )}

        <button onClick={handleUpdate} disabled={loading || !newPrice}>
          {loading ? 'Updating...' : 'Update Price'}
        </button>
      </div>
    </div>
  );
}
```

---

### 4. Node Status & Control

**What Users Need**:
- See if node is running or stopped
- Start/stop node daemon
- View uptime and PID
- Real-time status updates

**Reference Implementation**:
See `NodeManagementClient.tsx` lines 276-358 (refreshNodeStatus, handleStartNode, handleStopNode)

**Production Component**:

```tsx
// src/components/NodeControl.tsx
import { useState, useEffect } from 'react';
import { useSDK } from '@/hooks/useSDK';

export function NodeControl() {
  const { mgmtApiClient } = useSDK();
  const [status, setStatus] = useState<'running' | 'stopped'>('stopped');
  const [pid, setPid] = useState<number | null>(null);
  const [uptime, setUptime] = useState(0);
  const [loading, setLoading] = useState(false);

  // Poll status every 10 seconds when running
  useEffect(() => {
    const interval = setInterval(async () => {
      if (status === 'running') {
        await refreshStatus();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [status]);

  const refreshStatus = async () => {
    try {
      const result = await mgmtApiClient.getStatus();
      setStatus(result.status);
      setPid(result.pid || null);
      setUptime(result.uptime || 0);
    } catch (error) {
      console.error('Status refresh failed:', error);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await mgmtApiClient.start(true); // daemon mode
      setPid(result.pid);
      setStatus('running');
      alert(`✅ Node started (PID: ${result.pid})`);
    } catch (error) {
      alert(`❌ Start failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await mgmtApiClient.stop(false); // graceful stop
      setPid(null);
      setStatus('stopped');
      alert('✅ Node stopped');
    } catch (error) {
      alert(`❌ Stop failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div>
      <h3>🎮 Node Control</h3>

      <div>
        <strong>Status:</strong>
        <span style={{ color: status === 'running' ? 'green' : 'gray' }}>
          {status === 'running' ? ' ● Running' : ' ○ Stopped'}
        </span>
      </div>

      {status === 'running' && (
        <>
          <div><strong>PID:</strong> {pid}</div>
          <div><strong>Uptime:</strong> {formatUptime(uptime)}</div>
        </>
      )}

      <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
        <button
          onClick={handleStart}
          disabled={loading || status === 'running'}
        >
          ▶️ Start Node
        </button>

        <button
          onClick={handleStop}
          disabled={loading || status === 'stopped'}
        >
          ⏹️ Stop Node
        </button>

        <button onClick={refreshStatus} disabled={loading}>
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
```

---

### 5. Live Log Viewer

**What Users Need**:
- Real-time streaming logs from their node
- Filter logs (stdout, stderr, all)
- Auto-scroll option
- Clear logs button

**Reference Implementation**:
See `NodeManagementClient.tsx` lines 161-200 (WebSocket connection for logs)

**Production Component**:

```tsx
// src/components/LiveLogs.tsx
import { useState, useEffect, useRef } from 'react';

export function LiveLogs() {
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<'all' | 'stdout' | 'stderr'>('all');
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to WebSocket
    const wsUrl = process.env.NEXT_PUBLIC_MANAGEMENT_WS_URL || 'ws://localhost:3001/ws/logs';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'log') {
          const timestamp = new Date(data.timestamp).toLocaleTimeString();
          const logLine = `[${timestamp}] [${data.level}] ${data.message}`;
          setLogs(prev => [...prev, logLine]);
        } else if (data.type === 'history') {
          setLogs(prev => [...prev, ...data.logs]);
        }
      } catch (e) {
        console.error('Failed to parse log message:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnected(false);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    return log.includes(`[${filter}]`);
  });

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3>🔴 Live Server Logs {connected ? '(Connected)' : '(Disconnected)'}</h3>

        <div style={{ display: 'flex', gap: '10px' }}>
          <label>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All Logs</option>
            <option value="stdout">stdout only</option>
            <option value="stderr">stderr only</option>
          </select>

          <button onClick={clearLogs}>Clear</button>
        </div>
      </div>

      <div
        style={{
          maxHeight: '400px',
          overflowY: 'auto',
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          padding: '10px',
          fontFamily: 'monospace',
          fontSize: '12px',
          borderRadius: '5px'
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: '#888' }}>
            {connected ? 'Waiting for logs...' : 'Disconnected from server'}
          </div>
        ) : (
          filteredLogs.map((log, i) => (
            <div
              key={i}
              style={{
                marginBottom: '2px',
                color: log.includes('[stderr]') ? '#f48771' : '#d4d4d4'
              }}
            >
              {log}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
```

---

## SDK Integration

### Initialization Pattern

**Reference**: `NodeManagementClient.tsx` lines 456-486

```typescript
// src/hooks/useSDK.ts
import { useState, useEffect } from 'react';
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ethers } from 'ethers';

export function useSDK(signer: ethers.Signer | null) {
  const [sdk, setSdk] = useState<FabstirSDKCore | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!signer) return;

    const init = async () => {
      try {
        const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532');

        const sdkInstance = new FabstirSDKCore({
          mode: 'production',
          chainId,
          rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
          contractAddresses: {
            jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
            nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
            fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
            usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
            hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
            proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
            modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
          }
        });

        await sdkInstance.authenticate('signer', { signer });

        setSdk(sdkInstance);
        setInitialized(true);
      } catch (error) {
        console.error('SDK initialization failed:', error);
      }
    };

    init();
  }, [signer]);

  return { sdk, initialized };
}
```

### Getting HostManager

```typescript
// After SDK is initialized
const hostManager = sdk.getHostManager();

// Check registration status
const hostInfo = await hostManager.getHostInfo(walletAddress);
console.log('Is registered:', hostInfo.isRegistered);
console.log('Min price:', hostInfo.minPricePerToken);

// Get pricing
const pricing = await hostManager.getPricing(walletAddress);
console.log('Current pricing:', pricing.toString());
```

---

## Management API Integration

### Backend Setup

The Management API is provided by the Host CLI's `serve` command:

```bash
# Host operator runs this on their server
fabstir-host serve --port 3001
```

This provides:
- REST API endpoints on http://localhost:3001
- WebSocket for live logs on ws://localhost:3001/ws/logs

### API Client

**Reference**: `apps/harness/lib/hostApiClient.ts`

```typescript
// src/lib/managementApiClient.ts
export class ManagementApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async register(params: {
    walletAddress: string;
    publicUrl: string;
    models: string[];
    stakeAmount: string;
    metadata: object;
    minPricePerToken: string;
    privateKey?: string;
  }) {
    const response = await fetch(`${this.baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    return await response.json();
  }

  async updatePricing(params: { price: string }) {
    const response = await fetch(`${this.baseUrl}/api/update-pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Update failed');
    }

    return await response.json();
  }

  async getStatus() {
    const response = await fetch(`${this.baseUrl}/api/status`);

    if (!response.ok) {
      throw new Error('Failed to get status');
    }

    return await response.json();
  }

  async start(daemon: boolean = true) {
    const response = await fetch(`${this.baseUrl}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daemon })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Start failed');
    }

    return await response.json();
  }

  async stop(force: boolean = false) {
    const response = await fetch(`${this.baseUrl}/api/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Stop failed');
    }

    return await response.json();
  }
}
```

---

## Pricing Features (NEW)

### Implementation Checklist

Based on Test Suites 4.1 and 4.2 from `docs/IMPLEMENTATION-MARKET.md`:

**✅ Registration with Pricing (Sub-phase 4.1)**:
- [x] Pricing input field in registration form
- [x] Default value: 2000 (0.002 USDC/token)
- [x] Validation: min=100, max=100000, step=100
- [x] Real-time USDC conversion display (3 formats)
- [x] Pass minPricePerToken to registration API
- [x] Display pricing in success message

**✅ Pricing Update UI (Sub-phase 4.2)**:
- [x] Display current price with USDC format
- [x] New price input with validation
- [x] Before/after comparison preview
- [x] Update button calls Management API
- [x] Refresh node info after update
- [x] Show transaction hash on success

### Price Display Formatting

Always show pricing in 3 formats for clarity:

```typescript
const formatPricing = (rawPrice: string | number) => {
  const price = parseInt(rawPrice.toString());

  return {
    raw: price,
    perToken: `$${(price / 1000000).toFixed(6)} USDC/token`,
    per1000: `$${((price * 1000) / 1000000).toFixed(3)} USDC per 1,000 tokens`,
    per10000: `$${((price * 10000) / 1000000).toFixed(2)} USDC per 10,000 tokens`
  };
};

// Usage:
const display = formatPricing(2000);
console.log(display.perToken);  // "$0.002000 USDC/token"
console.log(display.per1000);   // "$2.000 USDC per 1,000 tokens"
console.log(display.per10000);  // "$20.00 USDC per 10,000 tokens"
```

### Validation Rules

```typescript
const validatePrice = (price: string | number): boolean => {
  const p = parseInt(price.toString());

  if (isNaN(p)) {
    throw new Error('Price must be a number');
  }

  if (p < 100) {
    throw new Error('Price too low. Minimum: 100 (0.0001 USDC/token)');
  }

  if (p > 100000) {
    throw new Error('Price too high. Maximum: 100,000 (0.1 USDC/token)');
  }

  return true;
};
```

---

## WebSocket Integration

### Log Streaming

**Reference**: `NodeManagementClient.tsx` lines 161-200

```typescript
// src/hooks/useLogStream.ts
import { useState, useEffect, useRef } from 'react';

export function useLogStream(wsUrl: string) {
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Log stream connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'log') {
          const timestamp = new Date(data.timestamp).toLocaleTimeString();
          const logLine = `[${timestamp}] [${data.level}] ${data.message}`;
          setLogs(prev => [...prev, logLine]);
        } else if (data.type === 'history') {
          // Initial history dump
          setLogs(prev => [...prev, ...data.logs]);
        }
      } catch (error) {
        console.error('Failed to parse log:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Log stream disconnected');
      setConnected(false);
    };

    wsRef.current = ws;

    // Cleanup on unmount
    return () => {
      ws.close();
    };
  }, [wsUrl]);

  const clearLogs = () => {
    setLogs([]);
  };

  return { logs, connected, clearLogs };
}
```

---

## Security Considerations

### 1. Private Key Handling

**❌ NEVER**:
- Store private keys in localStorage
- Send private keys over HTTP
- Log private keys to console
- Hardcode private keys in source

**✅ DO**:
- Use MetaMask for wallet management
- Let users manage their own keys
- Only use private keys server-side (Management API)
- Encrypt private keys at rest (if storing)

### 2. API Security

**Production Deployment**:
```typescript
// CORS configuration for Management API
// packages/host-cli/src/server/api.ts should restrict origins:

app.use(cors({
  origin: [
    'http://localhost:3000',           // Development
    'https://your-production-ui.com'   // Production
  ],
  credentials: true
}));
```

### 3. Environment Variables

**Never commit**:
- `.env.local` to git
- Production RPC URLs with API keys
- Any credentials

**Use**:
- `.env.example` as template
- Environment variable injection at build/deploy time

### 4. Input Validation

Always validate user inputs:

```typescript
// Sanitize API URL
const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Sanitize metadata JSON
const validateMetadata = (metadata: string): boolean => {
  try {
    const parsed = JSON.parse(metadata);
    // Add additional validation rules
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
};
```

---

## Production Deployment

### Build Configuration

**Next.js Static Export**:

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Static HTML export
  images: {
    unoptimized: true // Required for static export
  },
  // Environment variables must be prefixed with NEXT_PUBLIC_
  env: {
    MANAGEMENT_API_URL: process.env.NEXT_PUBLIC_MANAGEMENT_API_URL || 'http://localhost:3001'
  }
};

module.exports = nextConfig;
```

**Build Commands**:

```bash
# Install dependencies
pnpm install

# Build for production
pnpm build

# Output will be in out/ directory (static HTML/CSS/JS)
```

### Deployment Options

**Option 1: Static Hosting (Simplest)**
- Build static export (`pnpm build`)
- Deploy `out/` folder to:
  - Netlify
  - Vercel
  - AWS S3 + CloudFront
  - GitHub Pages
  - Any static file host

**Option 2: Node.js Server**
- Run Next.js in production mode
- Deploy to:
  - Railway
  - Render
  - DigitalOcean
  - AWS EC2

**Option 3: Docker Container**
```dockerfile
# Dockerfile for Host UI
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
```

### Host Operator Setup

**Step 1**: Install Host CLI
```bash
npm install -g @fabstir/host-cli
```

**Step 2**: Start Management API
```bash
fabstir-host serve --port 3001
```

**Step 3**: Access UI
```
http://localhost:3000
```

Or deploy UI to a domain:
```
https://host-manager.your-domain.com
```

**Configuration**:
```bash
# Set Management API URL in .env.local
NEXT_PUBLIC_MANAGEMENT_API_URL=http://your-server-ip:3001
NEXT_PUBLIC_MANAGEMENT_WS_URL=ws://your-server-ip:3001/ws/logs
```

---

## Testing Checklist

### Manual Testing (Before Production Release)

**Registration Flow**:
- [ ] Connect MetaMask wallet
- [ ] Fill registration form with valid data
- [ ] See real-time price conversion update
- [ ] Submit registration
- [ ] Transaction appears on BaseScan
- [ ] Success message shows transaction hash
- [ ] Node info refreshes to show registered status

**Pricing Management**:
- [ ] View current price in USDC format
- [ ] Enter new price
- [ ] See before/after preview
- [ ] Update pricing on blockchain
- [ ] Verify new price appears in node info
- [ ] Verify price on BaseScan contract

**Node Control**:
- [ ] Start node daemon
- [ ] See status change to "Running"
- [ ] View PID and uptime
- [ ] Stop node daemon
- [ ] See status change to "Stopped"

**Live Logs**:
- [ ] WebSocket connects automatically
- [ ] See live log messages
- [ ] Filter by stdout/stderr
- [ ] Auto-scroll works
- [ ] Clear logs button works

**Error Handling**:
- [ ] Invalid price shows error
- [ ] Invalid API URL shows error
- [ ] Network errors show user-friendly message
- [ ] Transaction failures show clear message

### Automated Testing (Recommended)

```typescript
// tests/registration.test.ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterForm } from '@/components/RegisterForm';

describe('RegisterForm', () => {
  it('validates price range', () => {
    render(<RegisterForm />);

    const priceInput = screen.getByLabelText('Minimum Price Per Token');

    // Below minimum
    fireEvent.change(priceInput, { target: { value: '50' } });
    expect(priceInput).toBeInvalid();

    // Above maximum
    fireEvent.change(priceInput, { target: { value: '200000' } });
    expect(priceInput).toBeInvalid();

    // Valid range
    fireEvent.change(priceInput, { target: { value: '2000' } });
    expect(priceInput).toBeValid();
  });

  it('shows real-time price conversion', () => {
    render(<RegisterForm />);

    const priceInput = screen.getByLabelText('Minimum Price Per Token');
    fireEvent.change(priceInput, { target: { value: '2000' } });

    expect(screen.getByText(/\$0\.002000 USDC per token/)).toBeInTheDocument();
    expect(screen.getByText(/\$2\.000 USDC per 1,000 tokens/)).toBeInTheDocument();
  });
});
```

---

## Code References

### File Locations

**Primary Reference Implementation**:
```
apps/harness/pages/node-management-enhanced.tsx
apps/harness/components/NodeManagementClient.tsx
```

**Supporting Libraries**:
```
apps/harness/lib/hostApiClient.ts      (Management API client)
apps/harness/lib/hostWsClient.ts       (WebSocket client)
```

**SDK Core**:
```
packages/sdk-core/src/FabstirSDKCore.ts
packages/sdk-core/src/managers/HostManager.ts
packages/sdk-core/src/interfaces/IHostManager.ts
packages/sdk-core/src/types/models.ts
```

**Host CLI Backend**:
```
packages/host-cli/src/server/api.ts    (Management API server)
packages/host-cli/src/commands/serve.ts
```

### Key Functions to Reference

**SDK Initialization**:
- `NodeManagementClient.tsx` lines 456-486: `initializeSDK()`

**Wallet Connection**:
- `NodeManagementClient.tsx` lines 386-453: `connectWallet()`

**Registration**:
- `NodeManagementClient.tsx` lines 713-789: `registerNode()`
- `hostApiClient.ts` lines 45-70: `register()` API

**Pricing Management**:
- `NodeManagementClient.tsx` lines 675-682: `calculatePriceDisplay()`
- `NodeManagementClient.tsx` lines 684-711: `updatePricing()`
- `hostApiClient.ts` lines 72-85: `updatePricing()` API

**Node Control**:
- `NodeManagementClient.tsx` lines 276-302: `refreshNodeStatus()`
- `NodeManagementClient.tsx` lines 305-329: `handleStartNode()`
- `NodeManagementClient.tsx` lines 331-358: `handleStopNode()`

**WebSocket Logs**:
- `NodeManagementClient.tsx` lines 161-200: WebSocket connection setup
- `hostWsClient.ts`: Full WebSocket client implementation

**Registration Status Check**:
- `NodeManagementClient.tsx` lines 489-584: `checkRegistrationStatus()`

---

## Next Steps

### Phase 1: Setup (Week 1)
1. Create new Next.js project
2. Install dependencies (@fabstir/sdk-core, ethers, etc.)
3. Set up environment variables
4. Configure build/deployment

### Phase 2: Core Features (Week 2-3)
1. Implement wallet connection
2. Build registration form with pricing
3. Add pricing management UI
4. Implement node control panel

### Phase 3: Real-time Features (Week 4)
1. Integrate WebSocket log streaming
2. Add status polling
3. Build monitoring dashboard

### Phase 4: Polish & Testing (Week 5)
1. Error handling and validation
2. UI/UX improvements
3. Manual testing checklist
4. Documentation for operators

### Phase 5: Deployment (Week 6)
1. Production build optimization
2. Deploy to hosting platform
3. User documentation
4. Support channel setup

---

## Support & Resources

**Documentation**:
- `docs/SDK_API.md` - Complete SDK reference
- `docs/IMPLEMENTATION-MARKET.md` - Pricing implementation details
- `docs/compute-contracts-reference/` - Smart contract documentation

**Communication**:
- Report bugs to project owner
- Request clarification on unclear requirements
- Suggest UX improvements based on user feedback

**Development Help**:
- Study reference implementation thoroughly
- Use TypeScript for type safety
- Follow existing code patterns
- Test with real Base Sepolia testnet

---

**Document Version**: 1.0
**Last Updated**: January 2025
**Maintained By**: Fabstir Development Team
