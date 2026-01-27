# UI Developer Quickstart Guide

## 🚀 Build Production-Ready LLM Apps with Fabstir SDK

This quickstart guide will get you building production-ready LLM applications with the Fabstir SDK in minutes.

## ⚠️ Critical Requirements

### 1. Use the RIGHT SDK
```typescript
// ✅ CORRECT - Use this
import { FabstirSDKCore } from '@fabstir/sdk-core';

// ❌ WRONG - Don't use these
import { FabstirSDK } from '@fabstir/llm-sdk';  // Old SDK
import { FabstirSDK } from '../src/FabstirSDK';  // Obsolete
```

### 2. ALL 7 Contract Addresses Required
The SDK will **throw errors** if any required contract is missing.

**Note:** All 7 contracts must be provided. The SDK does not have fallback addresses and will fail to initialize if any are missing.

Required contracts:
- `jobMarketplace` ✅ Required
- `nodeRegistry` ✅ Required
- `proofSystem` ✅ Required
- `hostEarnings` ✅ Required
- `usdcToken` ✅ Required
- `fabToken` ✅ Required
- `modelRegistry` ✅ Required

## 📦 Installation

```bash
# For React/Next.js applications
npm install @fabstir/sdk-core

# Or with pnpm (recommended)
pnpm add @fabstir/sdk-core
```

## 🏃 5-Minute Setup

### Step 1: Environment Variables
Create `.env.local` file:
```env
# RPC URL (Alchemy recommended)
NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Contract Addresses (Base Sepolia - Current as of Sep 2025)
NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE=0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944
NEXT_PUBLIC_CONTRACT_NODE_REGISTRY=0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218
NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
NEXT_PUBLIC_CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776
NEXT_PUBLIC_CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NEXT_PUBLIC_CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY=0x92b2De840bB2171203011A6dBA928d855cA8183E

# S5 Storage (Optional - SDK will work without it, but storage operations will throw errors)
# If not provided, storage features are disabled but all other SDK features work normally
NEXT_PUBLIC_S5_PORTAL_URL=wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p
```

### Step 2: Initialize SDK
```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';

const sdk = new FabstirSDKCore({
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
  contractAddresses: {
    // ALL 7 REQUIRED - No fallbacks!
    jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
    nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
    proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
    hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
    usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
    fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
    modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
  }
});
```

### Step 3: Authenticate User
```typescript
// Option 1: With private key
await sdk.authenticate(privateKey);

// Option 2: With ethers signer (recommended for wallets)
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
await sdk.authenticate(signer);
```

### Step 4: Start LLM Session

#### Option A: Manual host selection
```typescript
const sessionManager = sdk.getSessionManager();

const { sessionId, jobId } = await sessionManager.startSession(
  modelHash,     // Model identifier
  providerAddr,  // Host address
  {
    depositAmount: "1.0",   // $1 USDC minimum
    pricePerToken: 200,     // 0.02 cents per token
    duration: 3600,         // 1 hour timeout
    proofInterval: 100      // Checkpoint interval
  }
);
```

#### Option B: Automatic host selection (recommended)
```typescript
const clientManager = sdk.getClientManager();
const modelManager = sdk.getModelManager();

// Get approved model
const modelId = await modelManager.getModelId(
  'meta-llama/Llama-2-7b-hf',
  'model.safetensors'
);

// Select optimal host
const host = await clientManager.selectHostForModel(modelId, {
  maxCostPerToken: 250,
  requiredCapabilities: ['streaming'],
  minReputation: 75
});

// Create inference job
const result = await clientManager.createInferenceJob(
  { repo: 'meta-llama/Llama-2-7b-hf', fileName: 'model.safetensors' },
  host.address,
  {
    depositAmount: "1.0",
    pricePerToken: host.metadata.costPerToken,
    duration: 3600,
    proofInterval: 100
  }
);
```

### Step 5: Send Prompts
```typescript
// Simple prompt
const response = await sessionManager.sendPrompt(sessionId, "Hello!");

// Streaming response
await sessionManager.sendPromptStreaming(
  sessionId,
  "Tell me a story",
  (chunk) => console.log(chunk),  // Handle each chunk
  () => console.log("Done"),      // Complete callback
  (err) => console.error(err)     // Error handler
);
```

## 📦 Understanding S5 Storage Behavior

**IMPORTANT:** S5 storage configuration is optional, but there's a key distinction:

### Initialization vs Usage (Critical Distinction)

1. **At SDK Initialization:**
   - If S5 is not configured or connection fails, the SDK **continues to work normally**
   - A warning is logged: "StorageManager not initialized - session persistence disabled"
   - This is "graceful degradation" at initialization time
   - **The SDK does NOT crash or throw errors during initialization**

2. **When Using Storage Features:**
   - If you call storage methods without S5 initialized, they **WILL throw errors immediately**
   - Error code: `STORAGE_NOT_INITIALIZED`
   - This includes: `storeConversation()`, `retrieveConversation()`, `listSessions()`, etc.
   - **This is NOT graceful degradation - storage operations will fail hard**

### Checking Storage Availability

Always check if storage is available before using storage features:

```typescript
const storageManager = sdk.getStorageManager();

// Check if storage is initialized
if (storageManager.isInitialized()) {
  // Safe to use storage features
  const cid = await storageManager.storeConversation(sessionId, messages);
} else {
  console.log('Storage not available - S5 not configured');
  // Handle without storage (e.g., use local storage as fallback)
}
```

### Error Handling for Storage Operations

```typescript
try {
  // Attempt to store conversation
  const cid = await storageManager.storeConversation(
    sessionId.toString(),
    conversation
  );
  console.log('Conversation stored:', cid);
} catch (error: any) {
  if (error.code === 'STORAGE_NOT_INITIALIZED') {
    // S5 storage not available
    console.log('S5 storage not configured - using local storage fallback');
    localStorage.setItem(`conversation-${sessionId}`, JSON.stringify(conversation));
  } else {
    // Other storage error
    console.error('Storage error:', error);
  }
}
```

### What Works Without S5

All these features work perfectly without S5 configuration:
- ✅ Authentication and wallet connection
- ✅ Session creation and management
- ✅ Sending prompts and receiving responses
- ✅ Payment processing and token tracking
- ✅ Host discovery and selection
- ✅ Model validation
- ✅ WebSocket streaming

### What Requires S5

These features require S5 to be configured and will throw errors if not:
- ❌ Storing conversations to decentralized storage
- ❌ Retrieving previous conversations
- ❌ Listing user's session history
- ❌ Exporting conversation data
- ❌ Cross-device conversation sync

### Recommendation

- **For MVP/Testing:** Skip S5 configuration, use local storage for persistence
- **For Production:** Configure S5 for decentralized, permanent storage
- **Hybrid Approach:** Use S5 when available, fallback to local storage

## 🎯 Smart Host & Model Selection

The SDK provides ClientManager and ModelManager for intelligent host and model selection:

```typescript
// Get the managers after authentication
const clientManager = sdk.getClientManager();
const modelManager = sdk.getModelManager();
const hostManager = sdk.getHostManagerEnhanced();

// 1. Discover all approved models
const approvedModels = await modelManager.getAllApprovedModels();
console.log(`Found ${approvedModels.length} approved models`);

// 2. Find hosts for a specific model
const modelId = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
const hosts = await clientManager.getHostsByModel(modelId);

// 3. Select optimal host based on criteria
const optimalHost = await clientManager.selectHostForModel(modelId, {
  maxCostPerToken: 250,      // Maximum price willing to pay
  requiredCapabilities: ['streaming', 'batch'],
  minReputation: 80,         // Minimum reputation score
  maxResponseTime: 1000      // Maximum response time in ms
});

// 4. Estimate job cost before starting
const estimate = await clientManager.estimateJobCost(
  modelId,
  1000,  // Expected tokens
  optimalHost.address
);
console.log(`Estimated cost: $${estimate.estimatedCost}`);

// 5. Create inference job with validation
const job = await clientManager.createInferenceJob(
  {
    repo: 'CohereForAI/TinyVicuna-1B-32k-GGUF',
    fileName: 'tiny-vicuna-1b.q4_k_m.gguf'
  },
  optimalHost.address,
  {
    depositAmount: estimate.estimatedCost,
    pricePerToken: estimate.pricePerToken,
    duration: 3600,
    proofInterval: 100
  }
);
```

### Host Discovery Patterns

```typescript
// Pattern 1: Find cheapest host
const hosts = await clientManager.getHostsByModel(modelId);
const cheapest = hosts.sort((a, b) =>
  a.metadata.costPerToken - b.metadata.costPerToken
)[0];

// Pattern 2: Find fastest host
const fastest = hosts.sort((a, b) =>
  a.metadata.avgResponseTime - b.metadata.avgResponseTime
)[0];

// Pattern 3: Balance cost and performance
const balanced = hosts.sort((a, b) => {
  const scoreA = a.metadata.costPerToken * 0.5 + a.metadata.avgResponseTime * 0.5;
  const scoreB = b.metadata.costPerToken * 0.5 + b.metadata.avgResponseTime * 0.5;
  return scoreA - scoreB;
})[0];

// Pattern 4: Filter by location
const usHosts = hosts.filter(h => h.metadata.location === 'us-east');
```

## 💰 Coinbase Smart Wallet Integration (Gasless)

Enable gasless transactions with Coinbase Smart Wallet:

```typescript
import { coinbaseWallet } from '@wagmi/connectors';
import { createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';

// 1. Configure Wagmi with Smart Wallet
const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    coinbaseWallet({
      appName: 'Your App Name',
      enableMobileWalletLink: true,
      preference: 'smartWalletOnly'
    })
  ],
  transports: {
    [baseSepolia.id]: http()
  }
});

// 2. Connect and authenticate
const account = await connect(config, {
  connector: coinbaseWallet()
});

const walletClient = await getWalletClient(config);
const signer = await walletClientToSigner(walletClient);
await sdk.authenticate(signer);
```

## 📝 Building Your First Chat App

### Complete Working Example

This example is based on the production-ready implementation in `/workspace/apps/harness/pages/chat-context-demo.tsx`.

```tsx
import React, { useState, useEffect } from 'react';
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ethers } from 'ethers';
import { formatUnits, parseUnits } from 'ethers';
import { coinbaseWallet } from '@wagmi/connectors';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
}

export default function ChatApp() {
  const [sdk, setSdk] = useState<FabstirSDKCore | null>(null);
  const [sessionId, setSessionId] = useState<bigint | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  const [subAccount, setSubAccount] = useState<string | null>(null);
  const [primaryAccount, setPrimaryAccount] = useState<string | null>(null);

  const PRICE_PER_TOKEN = 200; // 0.0002 USDC per token
  const CHAIN_HEX = "0x14a34"; // Base Sepolia

  // Initialize SDK on mount
  useEffect(() => {
    const initSDK = new FabstirSDKCore({
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
      contractAddresses: {
        // ALL 7 REQUIRED - SDK will throw if any missing
        jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
        nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
        proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
        hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
        usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
        fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
        modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!,
      },
      mode: 'production' as const
    });
    setSdk(initSDK);
    setStatus('SDK initialized. Click "Connect Wallet" to start.');
  }, []);

  // Add message to chat
  const addMessage = (role: ChatMessage['role'], content: string, tokens?: number) => {
    const message: ChatMessage = {
      role,
      content,
      timestamp: Date.now(),
      tokens
    };
    setMessages(prev => [...prev, message]);

    if (tokens) {
      setTotalTokens(prev => prev + tokens);
      setTotalCost(prev => prev + (tokens * PRICE_PER_TOKEN / 1000000));
    }
  };

  // Connect wallet (Coinbase Smart Wallet)
  async function connectWallet() {
    if (!sdk) {
      console.error('SDK not initialized');
      return;
    }

    setIsLoading(true);
    setStatus('Connecting wallet...');

    try {
      // Check if Coinbase Wallet is available
      const isCoinbaseWallet = window.ethereum?.isCoinbaseWallet;

      if (!isCoinbaseWallet) {
        throw new Error('Please use Coinbase Wallet for gasless transactions');
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found');
      }

      // Coinbase Smart Wallet provides 2 accounts:
      // [0] = Primary account (holds funds)
      // [1] = Sub-account (for gasless transactions)
      const primary = accounts[0];
      const sub = accounts[1] || accounts[0]; // Fallback to primary if no sub

      setPrimaryAccount(primary);
      setSubAccount(sub);

      // Create custom signer for sub-account
      const provider = window.ethereum;
      const subAccountSigner = {
        provider: new ethers.BrowserProvider(provider),

        async getAddress(): Promise<string> {
          return sub;
        },

        async signMessage(message: string): Promise<string> {
          // Use primary account for signing (S5 seed generation)
          return provider.request({
            method: 'personal_sign',
            params: [message, primary]
          });
        },

        async sendTransaction(tx: any): Promise<any> {
          // Use wallet_sendCalls for gasless transactions
          const calls = [{
            to: tx.to as `0x${string}`,
            data: tx.data as `0x${string}`,
            value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : undefined
          }];

          const response = await provider.request({
            method: "wallet_sendCalls",
            params: [{
              version: "2.0.0",
              chainId: CHAIN_HEX,
              from: sub as `0x${string}`,
              calls: calls,
              capabilities: {
                atomic: { required: true }
              }
            }]
          });

          // Wait for transaction confirmation
          const bundleId = typeof response === 'string' ? response : (response as any).id;

          // Poll for confirmation
          let txHash: string | undefined;
          for (let i = 0; i < 30; i++) {
            try {
              const status = await provider.request({
                method: "wallet_getCallsStatus",
                params: [bundleId]
              }) as any;

              if (status.receipts?.[0]?.transactionHash) {
                txHash = status.receipts[0].transactionHash;
                break;
              }
            } catch (err) {
              // Continue polling
            }
            await new Promise(r => setTimeout(r, 1000));
          }

          if (!txHash) throw new Error("Transaction failed");

          // Return transaction response
          const ethersProvider = new ethers.BrowserProvider(provider);
          return await ethersProvider.getTransaction(txHash);
        }
      };

      // Authenticate SDK with sub-account signer
      await sdk.authenticate(subAccountSigner as any);

      setIsConnected(true);
      addMessage('system', `✅ Connected! Primary: ${primary.slice(0, 6)}...${primary.slice(-4)}`);
      addMessage('system', `📱 Sub-account for gasless: ${sub.slice(0, 6)}...${sub.slice(-4)}`);
      setStatus('Wallet connected. Click "Start Session" to begin chatting.');

    } catch (error: any) {
      console.error('Connection failed:', error);
      setStatus(`Connection failed: ${error.message}`);
      addMessage('system', `❌ Failed to connect: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Start a chat session
  async function startSession() {
    if (!sdk || !isConnected) {
      addMessage('system', '⚠️ Please connect wallet first');
      return;
    }

    setIsLoading(true);
    setStatus('Starting session...');

    try {
      const sessionManager = sdk.getSessionManager();
      const hostManager = sdk.getHostManagerEnhanced();

      // Discover active hosts
      const hosts = await hostManager.discoverAllActiveHostsWithModels();
      if (hosts.length === 0) {
        throw new Error('No active hosts available');
      }

      // Randomly select a host
      const randomIndex = Math.floor(Math.random() * hosts.length);
      const host = hosts[randomIndex];

      addMessage('system', `📡 Connecting to host ${randomIndex + 1} of ${hosts.length}`);
      addMessage('system', `🤖 Host: ${host.address.slice(0, 6)}...${host.address.slice(-4)}`);

      // Start session with $1 USDC deposit
      const { sessionId: newSessionId, jobId } = await sessionManager.startSession(
        host.models[0] || '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
        host.address,
        {
          depositAmount: "1.0",      // $1 USDC minimum
          pricePerToken: PRICE_PER_TOKEN,
          duration: 3600,            // 1 hour
          proofInterval: 100         // Checkpoint every 100 tokens
        },
        host.apiUrl || 'http://localhost:8080'
      );

      setSessionId(newSessionId);
      addMessage('system', `✅ Session started! ID: ${newSessionId.toString()}`);
      addMessage('system', `💰 Deposited $1.00 USDC for this session`);
      addMessage('assistant', 'Hello! I\'m ready to help. What would you like to know?');
      setStatus('Session active. Type a message to chat.');

    } catch (error: any) {
      console.error('Failed to start session:', error);
      setStatus(`Failed to start session: ${error.message}`);
      addMessage('system', `❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Send a message
  async function sendMessage() {
    if (!sdk || !sessionId || !input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message
    addMessage('user', userMessage);

    try {
      const sessionManager = sdk.getSessionManager();

      // Build context from previous messages
      const context = messages
        .filter(m => m.role !== 'system')
        .slice(-10) // Last 10 messages for context
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      // Create full prompt with context
      const fullPrompt = context ?
        `${context}\nUser: ${userMessage}\nAssistant:` :
        userMessage;

      // Send and get response
      const response = await sessionManager.sendPrompt(sessionId, fullPrompt);

      // Clean response
      const cleanedResponse = response.replace(/^[\n\s]*A:\s*/, '').trim();

      // Estimate tokens
      const tokens = Math.ceil((fullPrompt.length + cleanedResponse.length) / 4);

      // Add assistant response
      addMessage('assistant', cleanedResponse, tokens);

    } catch (error: any) {
      console.error('Failed to send message:', error);
      addMessage('system', `❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Fabstir Chat Demo</h1>

      {/* Status Bar */}
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <div className="flex justify-between mb-2">
          <span className="font-semibold">Status:</span>
          <span>{status}</span>
        </div>
        <div className="flex justify-between">
          <span>Total Tokens: {totalTokens}</span>
          <span>Total Cost: ${totalCost.toFixed(4)} USDC</span>
        </div>
        {sessionId && (
          <div className="text-sm text-gray-600 mt-2">
            Session ID: {sessionId.toString()}
          </div>
        )}
      </div>

      {/* Connection & Session Controls */}
      <div className="flex gap-4 mb-6">
        {!isConnected ? (
          <button
            onClick={connectWallet}
            disabled={isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:bg-gray-400"
          >
            {isLoading ? 'Connecting...' : 'Connect Wallet'}
          </button>
        ) : !sessionId ? (
          <button
            onClick={startSession}
            disabled={isLoading}
            className="px-6 py-3 bg-green-600 text-white rounded-lg disabled:bg-gray-400"
          >
            {isLoading ? 'Starting...' : 'Start Session ($1 USDC)'}
          </button>
        ) : null}
      </div>

      {/* Chat Messages */}
      <div className="border border-gray-300 rounded-lg h-96 overflow-y-auto mb-4 p-4 bg-white">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-3 ${
              msg.role === 'user' ? 'text-blue-600' :
              msg.role === 'assistant' ? 'text-green-600' :
              'text-gray-500 italic'
            }`}
          >
            <strong className="capitalize">{msg.role}:</strong> {msg.content}
            {msg.tokens && (
              <span className="text-xs text-gray-400 ml-2">
                ({msg.tokens} tokens)
              </span>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="text-gray-400 italic">Thinking...</div>
        )}
      </div>

      {/* Input Field */}
      {sessionId && (
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !isLoading) {
                sendMessage();
              }
            }}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-400"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}
    </div>
  );
}
```

## 💡 Key Concepts

### 1. Account Hierarchy
```
User's Coinbase Wallet
    ↓
Primary Account (holds USDC balance)
    ↓
Sub-Account (gasless transactions)
```

### 2. Payment Flow
1. User deposits $1 USDC to start session (minimum)
2. Tokens consumed as conversation progresses (~0.02 cents per token)
3. Checkpoint proofs submitted by host every 100+ tokens (host pays gas)
4. Payment distributed on session end: host (90%) and treasury (10%)
5. User pays gas for session completion (~100k gas)
6. Unused deposit refunded to user (or stays in sub-account for gasless wallets)

### 3. Context Preservation
- Build full conversation history
- Include in each prompt for context
- Store in S5 for persistence (auto-generated seed)
- Retrieve for session resumption

### 4. Token Economics
- **Price per token**: 200 units (0.0002 USDC)
- **Token generation**: ~10 tokens/second max
- **Checkpoint interval**: Every 100 tokens
- **Cost calculation**: `tokens * 200 / 1000000` USDC

## 🎨 Common UI Patterns

### Loading States
```tsx
function LoadingSpinner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent" />
      <span>{message}</span>
    </div>
  );
}

// Usage
{isLoading && <LoadingSpinner message="Processing transaction..." />}
```

### Transaction Status
```tsx
function TransactionStatus({ hash, status }: { hash?: string; status: string }) {
  return (
    <div className="bg-blue-50 p-3 rounded">
      <div className="font-semibold">{status}</div>
      {hash && (
        <a
          href={`https://sepolia.basescan.org/tx/${hash}`}
          target="_blank"
          className="text-blue-500 text-sm"
        >
          View on BaseScan →
        </a>
      )}
    </div>
  );
}
```

### Token Usage Display
```tsx
function TokenUsage({ used, remaining, cost }: {
  used: number;
  remaining: number;
  cost: number;
}) {
  const percentage = (used / (used + remaining)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Tokens Used: {used}</span>
        <span>Cost: ${cost.toFixed(4)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">
        Remaining: {remaining} tokens (~${(remaining * 0.0002).toFixed(2)})
      </div>
    </div>
  );
}
```

### Message Bubble Component
```tsx
function ChatMessage({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`
        max-w-xs lg:max-w-md px-4 py-2 rounded-lg
        ${isUser ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}
      `}>
        <p className="text-sm">{message.content}</p>
        {message.tokens && (
          <p className="text-xs opacity-70 mt-1">
            {message.tokens} tokens • ${(message.tokens * 0.0002).toFixed(4)}
          </p>
        )}
      </div>
    </div>
  );
}
```

## 💰 Payment Flows

### Pre-funding Check
```tsx
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

async function checkAndFundAccount(subAccount: string) {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA)
  });

  // Read USDC balance
  const balance = await publicClient.readContract({
    address: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN as `0x${string}`,
    abi: [{
      inputs: [{ name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function'
    }],
    functionName: 'balanceOf',
    args: [subAccount as `0x${string}`]
  });

  const balanceInUSDC = Number(balance) / 1e6;

  if (balanceInUSDC < 1.0) {
    const needed = 1.0 - balanceInUSDC;

    return (
      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
        <p className="font-semibold">Insufficient Balance</p>
        <p className="text-sm mt-1">
          Your sub-account needs ${needed.toFixed(2)} more USDC.
        </p>
        <button
          onClick={() => fundAccount(needed)}
          className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded"
        >
          Fund Account
        </button>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
      <p className="font-semibold">Ready to Start</p>
      <p className="text-sm mt-1">
        Balance: ${balanceInUSDC.toFixed(2)} USDC
      </p>
      <p className="text-xs text-gray-600 mt-2">
        Can run ~{Math.floor(balanceInUSDC)} sessions
      </p>
    </div>
  );
}
```

### Payment Distribution Monitoring
```tsx
function PaymentDistribution({ sessionId, tokensUsed }: {
  sessionId: bigint;
  tokensUsed: number;
}) {
  const totalCost = tokensUsed * 0.0002; // USDC
  const hostEarnings = totalCost * 0.9; // 90%
  const treasuryFee = totalCost * 0.1; // 10%

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <h3 className="font-semibold mb-3">Payment Distribution</h3>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Total Cost:</span>
          <span className="font-mono">${totalCost.toFixed(4)}</span>
        </div>

        <div className="flex justify-between text-green-600">
          <span>Host Earnings (90%):</span>
          <span className="font-mono">${hostEarnings.toFixed(4)}</span>
        </div>

        <div className="flex justify-between text-blue-600">
          <span>Treasury Fee (10%):</span>
          <span className="font-mono">${treasuryFee.toFixed(4)}</span>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Payments distributed on checkpoint submission
      </div>
    </div>
  );
}
```

## 🚀 Real-time Features

### Streaming Responses
```tsx
async function handleStreamingMessage(prompt: string) {
  const sessionManager = sdk.getSessionManager();
  let responseChunks: string[] = [];
  let isStreaming = true;

  // Show typing indicator
  setMessages(prev => [...prev, {
    role: 'assistant',
    content: '...',
    timestamp: Date.now(),
    isTyping: true
  }]);

  await sessionManager.sendPromptStreaming(
    sessionId,
    prompt,
    (chunk) => {
      // Accumulate chunks
      responseChunks.push(chunk);

      // Update message in real-time
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = responseChunks.join('');
          lastMsg.isTyping = true;
        }
        return newMessages;
      });
    },
    () => {
      // Streaming complete
      isStreaming = false;
      const fullResponse = responseChunks.join('');
      const tokens = Math.ceil(fullResponse.length / 4);

      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = fullResponse;
          lastMsg.tokens = tokens;
          lastMsg.isTyping = false;
        }
        return newMessages;
      });
    },
    (error) => {
      console.error('Streaming error:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = 'Error: ' + error.message;
          lastMsg.isTyping = false;
        }
        return newMessages;
      });
    }
  );
}
```

### Live Token Counter
```tsx
function LiveTokenCounter({ sessionId }: { sessionId: bigint }) {
  const [metrics, setMetrics] = useState({
    tokens: 0,
    rate: 0,
    cost: 0,
    timeElapsed: 0
  });

  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;

      // In production, fetch from sessionManager.getSessionDetails()
      // For demo, we'll simulate
      setMetrics(prev => ({
        ...prev,
        timeElapsed: elapsed,
        rate: prev.tokens / elapsed
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionId]);

  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div>
        <span className="text-gray-500">Tokens:</span>
        <span className="ml-2 font-mono">{metrics.tokens}</span>
      </div>
      <div>
        <span className="text-gray-500">Rate:</span>
        <span className="ml-2 font-mono">{metrics.rate.toFixed(1)}/s</span>
      </div>
      <div>
        <span className="text-gray-500">Cost:</span>
        <span className="ml-2 font-mono">${metrics.cost.toFixed(4)}</span>
      </div>
      <div>
        <span className="text-gray-500">Time:</span>
        <span className="ml-2 font-mono">{Math.floor(metrics.timeElapsed)}s</span>
      </div>
    </div>
  );
}
```

## 🧪 Testing Checklist

### Local Development
- [ ] SDK initializes without errors
- [ ] Wallet connection works
- [ ] USDC balance shows correctly
- [ ] Sessions start successfully
- [ ] Messages send and receive
- [ ] Streaming responses work
- [ ] Context preservation works

### Base Sepolia Testnet
- [ ] Get test USDC from faucet or bridge
- [ ] Fund primary account with $1+ USDC
- [ ] Verify sub-account auto-spend works
- [ ] Test with real host node
- [ ] Verify payment distribution (90/10 split)
- [ ] Check gasless transaction execution
- [ ] Confirm no MetaMask popups after setup

## ⚡ WebSocket Client Updates

The WebSocketClient API has been updated. Here's the correct usage:

```typescript
import { WebSocketClient } from '@fabstir/sdk-core';

// Create WebSocket client
const ws = new WebSocketClient('ws://localhost:8080', {
  reconnect: true,
  reconnectInterval: 5000,
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000
});

// Connect to server
await ws.connect();

// Register message handler (returns unsubscribe function)
const unsubscribe = ws.onMessage((data) => {
  console.log('Received:', data);
});

// Send message and wait for response
const response = await ws.sendMessage({
  type: 'prompt',
  sessionId: sessionId.toString(),
  prompt: 'Hello'
});

// Check connection
if (ws.isConnected()) {
  console.log('Connected');
}

// Clean up
unsubscribe();
await ws.disconnect();
```

**Note:** The WebSocketClient no longer has `onError` or `onConnect` methods. Use the promise returned by `connect()` for connection handling and try-catch for error handling.

## ⚠️ Gas Payment Responsibilities

### Who Pays Gas When:

1. **Session Creation**: User pays (~200k gas)
2. **Checkpoint Submissions**: Host pays (~30k gas each)
3. **Session Completion**: User pays (~100k gas)
   - Note: Users may abandon session to avoid this gas cost
   - Host can call `claimAbandonedSession` after 24 hours (host pays gas)

### Incentive Alignment Issue:
The current design has an economic flaw where users are incentivized to abandon sessions rather than properly complete them to save gas fees. Hosts should price their services accordingly to cover potential completion gas costs.

## 🚨 Common Errors & Solutions

### "Missing required contract address"
```typescript
// ❌ Wrong - Missing required contracts
const sdk = new FabstirSDKCore({
  contractAddresses: {
    jobMarketplace: '0x...',
    usdcToken: '0x...'
  }
});

// ✅ Correct - All 7 required
const sdk = new FabstirSDKCore({
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
  contractAddresses: {
    jobMarketplace: '0x...',
    nodeRegistry: '0x...',
    proofSystem: '0x...',
    hostEarnings: '0x...',
    usdcToken: '0x...',
    fabToken: '0x...',
    modelRegistry: '0x...'
  }
});
```

### "Insufficient USDC balance"
```typescript
// Check the correct address (sub-account if using Smart Wallet)
const balance = await paymentManager.getUSDCBalance(userAddress);
console.log(`Balance: $${balance}`);

// Minimum deposit is $1.00 USDC
```

### "No active hosts available"
```typescript
// Find active hosts first
const hostManager = sdk.getHostManagerEnhanced();
const hosts = await hostManager.discoverAllActiveHostsWithModels();

if (hosts.length === 0) {
  throw new Error('No hosts available - try again later');
}

// Use first available host
const hostAddress = hosts[0].address;
```

### WebSocket connection failed
```typescript
// Verify host endpoint is accessible
const hostEndpoint = host.apiUrl || 'ws://localhost:8080'; // Use host's API URL

// Add error handling with retry logic
import { WebSocketClient } from '@fabstir/sdk-core';

let retryCount = 0;
const maxRetries = 3;

function connectWithRetry() {
  const ws = new WebSocketClient(hostEndpoint, {
    reconnect: true,
    reconnectInterval: 5000,
    maxReconnectAttempts: maxRetries
  });

  ws.onError((error) => {
    console.error('WebSocket error:', error);
    if (retryCount < maxRetries) {
      retryCount++;
      setTimeout(() => connectWithRetry(), 5000);
    } else {
      throw new Error('Failed to connect after ' + maxRetries + ' attempts');
    }
  });

  ws.onConnect(() => {
    retryCount = 0; // Reset on successful connection
  });

  return ws;
}
```

## ⚠️ Error Handling

### Common SDK Errors
```typescript
function handleSDKError(error: any) {
  switch (error.code) {
    case 'INSUFFICIENT_BALANCE':
      return {
        title: 'Insufficient USDC Balance',
        message: 'Please fund your account with at least $1 USDC',
        action: () => fundAccount(1.0),
        actionText: 'Fund Account'
      };

    case 'SESSION_EXPIRED':
      return {
        title: 'Session Expired',
        message: 'Your session has expired. Please start a new one.',
        action: () => startNewSession(),
        actionText: 'Start New Session'
      };

    case 'MODEL_NOT_APPROVED':
      return {
        title: 'Model Not Available',
        message: 'The selected model is not approved for use.',
        action: () => selectDifferentModel(),
        actionText: 'Choose Different Model'
      };

    case 'NO_ACTIVE_HOSTS':
      return {
        title: 'No Hosts Available',
        message: 'No active hosts found. Please try again later.',
        action: () => retryHostDiscovery(),
        actionText: 'Retry'
      };

    case 'AUTH_FAILED':
      return {
        title: 'Authentication Failed',
        message: 'Failed to authenticate with wallet.',
        action: () => connectWallet(),
        actionText: 'Reconnect Wallet'
      };

    default:
      return {
        title: 'Error',
        message: error.message || 'An unexpected error occurred',
        action: null,
        actionText: 'Close'
      };
  }
}

// Usage in component
try {
  await sessionManager.startSession(...);
} catch (error) {
  const errorInfo = handleSDKError(error);
  showErrorModal(errorInfo);
}
```

### Error Boundary Component
```tsx
import React from 'react';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{ error: Error }> },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Send to error tracking service (e.g., Sentry)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-red-800 font-bold mb-2">Something went wrong</h2>
          <p className="text-red-600">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage: Wrap your app
<ErrorBoundary>
  <ChatApp />
</ErrorBoundary>
```

## 📊 Production Deployment

### Environment Setup
1. Use production RPC URL (not public endpoints)
2. Secure private keys with key management service
3. Enable CORS for your domain
4. Use wss:// for WebSocket connections

### Contract Addresses (Mainnet)
```env
# Will be provided when mainnet launches
NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE=0x...
NEXT_PUBLIC_CONTRACT_NODE_REGISTRY=0x...
# etc.
```

### Performance Tips
- Cache SDK instance (don't recreate)
- Reuse sessions for multiple prompts
- Implement proper error retry logic
- Monitor gas prices for optimal timing

### Security Checklist
- [ ] Never expose private keys in code
- [ ] Use environment variables for secrets
- [ ] Implement rate limiting
- [ ] Validate all user inputs
- [ ] Use HTTPS/WSS in production
- [ ] Audit smart contract interactions

## 🔗 Resources

### Working Examples
- **chat-context-demo**: `/workspace/apps/harness/pages/chat-context-demo.tsx`
- Full implementation with Coinbase Smart Wallet
- Context preservation and streaming
- Balance tracking and payment flow

### Documentation
- **SDK API Reference**: `/workspace/docs/SDK_API.md`
- **Contract Reference**: `/workspace/docs/compute-contracts-reference/`
- **WebSocket Protocol**: `/workspace/docs/node-reference/WEBSOCKET_API_SDK_GUIDE.md`

### Test Resources
- **Base Sepolia Faucet**: https://faucet.base.org
- **USDC Test Tokens**: Use bridge from Ethereum Sepolia
- **Block Explorer**: https://sepolia.basescan.org

## 💡 Quick Tips

1. **Start Simple**: Get basic chat working before adding features
2. **Test Locally**: Use mock mode for rapid development
3. **Monitor Costs**: $1 deposit lasts ~30+ sessions typically
4. **Handle Errors**: Always wrap SDK calls in try-catch
5. **Cache Sessions**: Reuse sessions to save on gas fees
6. **Price Accordingly**: Hosts should factor in checkpoint gas costs
7. **Monitor Abandonment**: Track sessions that users don't complete

## 🆘 Getting Help

- **GitHub Issues**: Report bugs and request features
- **Discord**: Join community for real-time help
- **Documentation**: Check `/workspace/docs/` for detailed guides

---

**Ready to build?** Start with the React example above and customize for your needs. The SDK handles all the complexity of blockchain interactions, P2P networking, and payment distribution - you just focus on building great UX!