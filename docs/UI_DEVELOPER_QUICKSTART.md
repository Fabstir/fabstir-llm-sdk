# UI Developer Quick Start Guide

## Overview

This guide helps UI developers quickly integrate the Fabstir SDK into web applications. The SDK provides a decentralized LLM marketplace with USDC payments, real-time streaming, and conversation persistence.

**📝 Working Example**: See `/workspace/apps/harness/pages/chat-context-demo.tsx` for a complete, production-ready implementation with Base Account Kit integration, payment distribution, and conversation persistence.

## Table of Contents
- [What You Need to Know](#what-you-need-to-know)
- [Prerequisites](#prerequisites)
- [Quick Setup](#quick-setup)
- [Building Your First Chat App](#building-your-first-chat-app)
- [Key Concepts](#key-concepts)
- [Common UI Patterns](#common-ui-patterns)
- [Payment Flows](#payment-flows)
- [Real-time Features](#real-time-features)
- [Error Handling](#error-handling)
- [Testing Your UI](#testing-your-ui)
- [Production Checklist](#production-checklist)

## What You Need to Know

### Core Technologies
- **@fabstir/sdk-core**: Browser-compatible SDK (no Node.js dependencies)
- **Base Account Kit**: Coinbase's smart wallet for gasless transactions
- **USDC Payments**: Stablecoin payments on Base Sepolia
- **WebSocket**: Real-time streaming responses
- **S5 Storage**: Decentralized conversation storage

### Key Features for UI
- ✅ No gas fees for users (gasless transactions)
- ✅ No approval popups (sub-account auto-spend)
- ✅ Real-time streaming responses
- ✅ Conversation context preservation
- ✅ Token usage tracking
- ✅ Automatic payment distribution

## Prerequisites

### 1. Install Dependencies

```bash
npm install @fabstir/sdk-core ethers@^6 @base-org/account
```

### 2. Environment Variables

Create `.env.local`:
```env
# Base Sepolia RPC
NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Contract Addresses (Base Sepolia)
NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE=0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944
NEXT_PUBLIC_CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Test Host (for development)
NEXT_PUBLIC_TEST_HOST_1_ADDRESS=0x4594F755F593B517Bb3194F4DeC20C48a3f04504
NEXT_PUBLIC_TEST_HOST_1_URL=http://localhost:8080

# Base Account Kit (get from Coinbase Developer Platform)
NEXT_PUBLIC_BASE_BUNDLER_URL=https://api.developer.coinbase.com/rpc/v1/base-sepolia/YOUR_KEY
NEXT_PUBLIC_BASE_PAYMASTER_URL=https://api.developer.coinbase.com/rpc/v1/base-sepolia/YOUR_KEY

# Test Account (for development only!)
NEXT_PUBLIC_TEST_USER_1_PRIVATE_KEY=0x... # Never use in production!
```

## Quick Setup

### Step 1: Initialize SDK

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';

const sdk = new FabstirSDKCore({
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
  contractAddresses: {
    jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
    usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN
  }
});
```

### Step 2: Setup Wallet Connection

```typescript
import { createBaseAccountSDK } from "@base-org/account";
import { ethers } from 'ethers';

async function connectWallet() {
  // Create Base Account SDK for gasless transactions
  const baseAccountSDK = await createBaseAccountSDK({
    chainId: 84532, // Base Sepolia
    jsonRpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
    bundlerUrl: process.env.NEXT_PUBLIC_BASE_BUNDLER_URL,
    paymasterUrl: process.env.NEXT_PUBLIC_BASE_PAYMASTER_URL
  });

  // Get user's smart wallet address
  const [smartWallet] = await baseAccountSDK.getAddresses();

  // Create sub-account for auto-spend (no popups!)
  const subAccount = await baseAccountSDK.createSubAccount({
    spender: {
      address: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
      token: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN,
      allowance: parseUnits('10', 6) // $10 USDC allowance
    }
  });

  // Authenticate SDK with sub-account
  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA);
  const signer = new ethers.Wallet(subAccount.privateKey, provider);
  await sdk.authenticate(signer);

  return { smartWallet, subAccount: subAccount.address };
}
```

### Step 3: Start a Chat Session

```typescript
async function startChatSession() {
  const sessionManager = sdk.getSessionManager();

  const { sessionId, jobId } = await sessionManager.startSession(
    '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced', // Model ID
    process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS, // Host address
    {
      depositAmount: "1.0",      // $1 USDC (minimum deposit)
      pricePerToken: 200,        // 200 units per token
      duration: 3600,            // 1 hour
      proofInterval: 100         // Checkpoint every 100 tokens
    }
  );

  return sessionId;
}
```

### Step 4: Send Messages

```typescript
async function sendMessage(sessionId: bigint, message: string, context: string[] = []) {
  const sessionManager = sdk.getSessionManager();

  // Build prompt with context
  const fullPrompt = context.length > 0
    ? `${context.join('\n')}\nUser: ${message}\nAssistant:`
    : message;

  // Send and get response
  const response = await sessionManager.sendPrompt(sessionId, fullPrompt);

  return response;
}
```

## Building Your First Chat App

### Complete React Component Example

```tsx
import React, { useState, useEffect } from 'react';
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { createBaseAccountSDK } from "@base-org/account";
import { ethers } from 'ethers';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
}

export default function ChatApp() {
  const [sdk, setSdk] = useState<FabstirSDKCore | null>(null);
  const [sessionId, setSessionId] = useState<bigint | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [totalCost, setTotalCost] = useState(0);

  // Initialize SDK on mount
  useEffect(() => {
    const sdkInstance = new FabstirSDKCore({
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
      contractAddresses: {
        jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
        usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN
      }
    });
    setSdk(sdkInstance);
  }, []);

  // Connect wallet and authenticate
  async function handleConnect() {
    if (!sdk) return;
    setIsLoading(true);

    try {
      // Setup Base Account Kit
      const baseAccountSDK = await createBaseAccountSDK({
        chainId: 84532,
        jsonRpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
        bundlerUrl: process.env.NEXT_PUBLIC_BASE_BUNDLER_URL!,
        paymasterUrl: process.env.NEXT_PUBLIC_BASE_PAYMASTER_URL!
      });

      // Get smart wallet
      const [smartWallet] = await baseAccountSDK.getAddresses();

      // Create sub-account for auto-spend
      const subAccount = await baseAccountSDK.createSubAccount({
        spender: {
          address: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE as `0x${string}`,
          token: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN as `0x${string}`,
          allowance: parseUnits('10', 6)
        }
      });

      // Authenticate SDK
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA);
      const signer = new ethers.Wallet(subAccount.privateKey, provider);
      await sdk.authenticate(signer);

      setIsConnected(true);
      addSystemMessage(`Connected! Wallet: ${smartWallet.slice(0, 6)}...${smartWallet.slice(-4)}`);
    } catch (error) {
      console.error('Connection failed:', error);
      addSystemMessage(`Connection failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Start a new chat session
  async function handleStartSession() {
    if (!sdk || !isConnected) return;
    setIsLoading(true);

    try {
      const sessionManager = sdk.getSessionManager();

      const { sessionId: newSessionId } = await sessionManager.startSession(
        '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
        process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS!,
        {
          depositAmount: "1.0",      // $1 USDC
          pricePerToken: 200,
          duration: 3600,
          proofInterval: 100
        }
      );

      setSessionId(newSessionId);
      addSystemMessage(`Session started! ID: ${newSessionId.toString()}`);
    } catch (error) {
      console.error('Failed to start session:', error);
      addSystemMessage(`Failed to start session: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Send a message
  async function handleSendMessage() {
    if (!sdk || !sessionId || !input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message to UI
    addMessage('user', userMessage);

    try {
      const sessionManager = sdk.getSessionManager();

      // Build context from previous messages
      const context = messages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);

      // Create full prompt with context
      const fullPrompt = context.length > 0
        ? `${context.join('\n')}\nUser: ${userMessage}\nAssistant:`
        : userMessage;

      // Send prompt and get response
      const response = await sessionManager.sendPrompt(sessionId, fullPrompt);

      // Clean up response (remove any "A:" prefix if present)
      const cleanedResponse = response.replace(/^[\n\s]*A:\s*/, '').trim();

      // Estimate tokens and cost
      const tokens = Math.ceil((fullPrompt.length + cleanedResponse.length) / 4);
      const cost = (tokens * 200) / 1000000; // 200 units per token, convert to USDC

      // Add assistant response
      addMessage('assistant', cleanedResponse, tokens);
      setTotalCost(prev => prev + cost);

    } catch (error) {
      console.error('Failed to send message:', error);
      addSystemMessage(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Helper functions
  function addMessage(role: Message['role'], content: string, tokens?: number) {
    setMessages(prev => [...prev, {
      role,
      content,
      timestamp: Date.now(),
      tokens
    }]);
  }

  function addSystemMessage(content: string) {
    addMessage('system', content);
  }

  // Render UI
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Fabstir Chat</h1>

      {/* Status Bar */}
      <div className="bg-gray-100 p-3 rounded mb-4">
        <div className="flex justify-between">
          <span>Status: {isConnected ? 'Connected' : 'Not connected'}</span>
          <span>Total Cost: ${totalCost.toFixed(4)} USDC</span>
        </div>
        {sessionId && (
          <div className="text-sm mt-1">
            Session ID: {sessionId.toString()}
          </div>
        )}
      </div>

      {/* Connection & Session Controls */}
      {!isConnected ? (
        <button
          onClick={handleConnect}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
        >
          {isLoading ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ) : !sessionId ? (
        <button
          onClick={handleStartSession}
          disabled={isLoading}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:bg-gray-300"
        >
          {isLoading ? 'Starting...' : 'Start Chat Session ($2 USDC)'}
        </button>
      ) : null}

      {/* Messages */}
      <div className="border rounded-lg h-96 overflow-y-auto mb-4 p-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`mb-2 ${
            msg.role === 'user' ? 'text-blue-600' :
            msg.role === 'assistant' ? 'text-green-600' :
            'text-gray-500 italic'
          }`}>
            <strong>{msg.role}:</strong> {msg.content}
            {msg.tokens && (
              <span className="text-xs text-gray-400 ml-2">
                ({msg.tokens} tokens)
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      {sessionId && (
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 border rounded"
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}
    </div>
  );
}
```

## Key Concepts

### 1. Account Hierarchy
```
User Wallet (MetaMask/Coinbase Wallet)
    ↓
Smart Wallet (Base Account Kit)
    ↓
Sub-Account (Auto-spend for marketplace)
```

### 2. Payment Flow
1. User deposits USDC to start session ($1 minimum)
2. Tokens are consumed as conversation progresses
3. Checkpoint proofs submitted after minimum 100 tokens
4. Payment distributed immediately: host (90%) and treasury (10%)
5. Unused deposit refunded to sub-account for future sessions

### 3. Context Preservation
- Build full conversation history
- Include in each prompt
- Store in S5 for persistence
- Retrieve for session resumption

### 4. Token Economics
- **Price per token**: Set by host (e.g., 200 units)
- **Token generation**: ~10 tokens per second max
- **Checkpoint interval**: Proof every 100 tokens
- **Cost calculation**: `tokens * pricePerToken / 1000000` USDC

## Common UI Patterns

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
          className="bg-blue-500 h-2 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
```

### Streaming Response

```tsx
async function handleStreamingMessage() {
  let responseChunks: string[] = [];

  await sessionManager.sendPromptStreaming(
    sessionId,
    prompt,
    (chunk) => {
      // Update UI with each chunk
      responseChunks.push(chunk);
      setCurrentResponse(responseChunks.join(''));
    },
    () => {
      // Streaming complete
      addMessage('assistant', responseChunks.join(''));
      setCurrentResponse('');
    },
    (error) => {
      console.error('Streaming error:', error);
      addSystemMessage(`Streaming failed: ${error.message}`);
    }
  );
}
```

## Payment Flows

### Pre-funding Check

```tsx
async function checkAndFundAccount(subAccount: string) {
  const sessionJobManager = sdk.getSessionJobManager();

  // Check current balance
  const balance = await sessionJobManager.getUSDCBalance(subAccount);
  const balanceNum = parseFloat(ethers.formatUnits(balance, 6));

  if (balanceNum < 1.0) {
    // Need to fund account
    const needed = 1.0 - balanceNum;

    // Show funding UI
    return (
      <div className="bg-yellow-50 p-4 rounded">
        <p>Your account needs ${needed.toFixed(2)} USDC to start a session.</p>
        <button onClick={() => fundAccount(needed)}>
          Fund Account
        </button>
      </div>
    );
  }

  return null; // Sufficient balance
}
```

### Payment Distribution & Settlement

When a session ends with checkpoint submission:

```tsx
async function handleEndSession() {
  const sessionManager = sdk.getSessionManager();

  // Submit checkpoint with minimum 100 tokens
  // SDK automatically waits 5 seconds before submission
  const receipt = await sessionManager.endSession(sessionId);

  // Payment distribution happens automatically:
  // - Host receives 90% of consumed tokens value
  // - Treasury receives 10% of consumed tokens value
  // - Unused deposit stays in sub-account for future sessions

  // Host can withdraw earnings
  const hostEarnings = await paymentManager.getHostEarnings(hostAddress);
  if (hostEarnings > 0) {
    await paymentManager.withdrawHostEarnings();
  }
}
```

### No-Popup Transaction Flow

```tsx
// With sub-account setup, transactions happen without popups:
async function executeGaslessTransaction() {
  // This happens automatically without user interaction!
  const tx = await sessionManager.startSession(...);

  // No MetaMask popup!
  // No gas fees!
  // Transaction executes through Base Account Kit
}
```

## Real-time Features

### WebSocket Connection

```tsx
import { WebSocketClient } from '@fabstir/sdk-core';

function useWebSocket(url: string) {
  const [ws, setWs] = useState<WebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const client = new WebSocketClient(url, {
      reconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 5
    });

    client.onConnect(() => setIsConnected(true));
    client.onDisconnect(() => setIsConnected(false));

    client.connect();
    setWs(client);

    return () => client.close();
  }, [url]);

  return { ws, isConnected };
}
```

### Live Token Tracking

```tsx
function LiveTokenCounter({ sessionId }: { sessionId: bigint }) {
  const [tokens, setTokens] = useState(0);
  const [rate, setRate] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      const details = await sessionManager.getSessionDetails(sessionId);
      setTokens(Number(details.tokensUsed));

      // Calculate rate (tokens per second)
      const elapsed = Date.now() / 1000 - Number(details.startTime);
      setRate(tokens / elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionId]);

  return (
    <div>
      <div>Tokens: {tokens}</div>
      <div>Rate: {rate.toFixed(1)} tokens/sec</div>
    </div>
  );
}
```

## Error Handling

### Common Errors and Solutions

```tsx
function handleSDKError(error: any) {
  switch (error.code) {
    case 'INSUFFICIENT_BALANCE':
      return {
        title: 'Insufficient USDC Balance',
        message: 'Please fund your account with at least $2 USDC',
        action: 'Fund Account'
      };

    case 'SESSION_EXPIRED':
      return {
        title: 'Session Expired',
        message: 'Your session has expired. Please start a new one.',
        action: 'Start New Session'
      };

    case 'MODEL_NOT_APPROVED':
      return {
        title: 'Model Not Available',
        message: 'The selected model is not approved for use.',
        action: 'Choose Different Model'
      };

    case 'WEBSOCKET_CONNECTION_FAILED':
      return {
        title: 'Connection Lost',
        message: 'Lost connection to the host. Retrying...',
        action: 'Retry'
      };

    default:
      return {
        title: 'Error',
        message: error.message || 'An unexpected error occurred',
        action: 'Try Again'
      };
  }
}
```

### Error Boundary

```tsx
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 rounded">
          <h2 className="text-red-600 font-bold">Something went wrong</h2>
          <p className="text-red-500">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 bg-red-500 text-white rounded"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Testing Your UI

### Test Configuration

```typescript
// test-config.ts
export const TEST_CONFIG = {
  // Use test network
  chainId: 84532, // Base Sepolia

  // Test model (should be approved on testnet)
  modelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',

  // Test host
  hostAddress: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
  hostUrl: 'http://localhost:8080',

  // Test amounts
  depositAmount: "1.0",         // $1 USDC
  pricePerToken: 200,

  // Test timeouts
  duration: 3600,                // 1 hour session
  proofInterval: 100             // Checkpoint every 100 tokens
};
```

### Mock Mode for Development

```typescript
// Enable mock mode for UI development without blockchain
const sdk = new FabstirSDKCore({
  mode: 'mock', // Enable mock mode
  mockResponses: {
    'What is 1+1?': '1 + 1 equals 2',
    'Tell me a joke': 'Why did the chicken cross the road? To get to the other side!'
  }
});

// In mock mode, all operations complete instantly
// No real transactions, no real costs
```

### Testing Checklist

- [ ] Wallet connection flow
- [ ] Sub-account creation
- [ ] Session initialization
- [ ] Message sending/receiving
- [ ] Context preservation across messages
- [ ] Token tracking
- [ ] Cost calculation
- [ ] Error handling
- [ ] Session completion
- [ ] Reconnection on disconnect

## Production Checklist

### Security

- [ ] Never expose private keys in frontend code
- [ ] Use environment variables for sensitive data
- [ ] Implement proper authentication flow
- [ ] Validate all user inputs
- [ ] Add rate limiting
- [ ] Implement session timeouts

### Performance

- [ ] Implement message pagination for long conversations
- [ ] Cache session data locally
- [ ] Optimize re-renders with React.memo
- [ ] Use debouncing for input handling
- [ ] Implement virtual scrolling for message lists

### User Experience

- [ ] Show clear loading states
- [ ] Provide transaction status updates
- [ ] Display costs prominently
- [ ] Add confirmation dialogs for payments
- [ ] Implement auto-save for conversations
- [ ] Add keyboard shortcuts

### Monitoring

- [ ] Add error tracking (Sentry, etc.)
- [ ] Monitor WebSocket connection health
- [ ] Track token usage patterns
- [ ] Log transaction failures
- [ ] Monitor session completion rates

### Deployment

```env
# Production environment variables
NEXT_PUBLIC_RPC_URL_BASE=https://mainnet.base.org/
NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE=0x... # Production address
NEXT_PUBLIC_CONTRACT_USDC_TOKEN=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 # Base USDC

# Never include private keys in production!
# Use secure wallet connection methods
```

## Troubleshooting

### Issue: "chainId must be a hex encoded integer"
**Solution:**
```typescript
const CHAIN_HEX = "0x14a34"; // Base Sepolia
// Use CHAIN_HEX in wallet_sendCalls
```

### Issue: Sub-account balance shows 0
**Solution:**
- Check you're querying the sub-account, not primary account
- Ensure funding transaction completed (wait for confirmations)
- Verify USDC token address is correct

### Issue: "Invalid proof" error
**Solution:**
```typescript
// Ensure proof is 64 bytes minimum
const proof = '0x' + '00'.repeat(64);
```

### Issue: WebSocket disconnects frequently
**Solution:**
- Implement reconnection logic
- Check host API stability
- Add heartbeat/ping mechanism

### Issue: Context not preserved
**Solution:**
- Build full context before each prompt
- Store conversation in state
- Include all previous messages

## Resources

### Working Examples
- **Chat Demo**: `/workspace/apps/harness/pages/chat-context-demo.tsx`
- **USDC Flow Test**: `/workspace/apps/harness/pages/base-usdc-mvp-flow-sdk.test.tsx`
- **Integration Tests**: `/workspace/tests/integration/`

### Documentation
- **Full API Reference**: `/workspace/docs/SDK_API.md`
- **Session Jobs**: `/workspace/docs/compute-contracts-reference/SESSION_JOBS.md`
- **WebSocket Guide**: `/workspace/docs/node-reference/WEBSOCKET_API_SDK_GUIDE.md`

### Support
- GitHub Issues: https://github.com/fabstir/fabstir-llm-sdk/issues
- Discord: https://discord.gg/fabstir
- Documentation: https://docs.fabstir.com

## Next Steps

1. **Start with the example component** above
2. **Customize the UI** to match your design
3. **Add features** like model selection, conversation history
4. **Test thoroughly** on Base Sepolia
5. **Deploy to production** with proper configuration

Happy building! 🚀