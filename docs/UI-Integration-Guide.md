# Fabstir LLM SDK - UI Integration Guide

This guide provides a complete reference for integrating the Fabstir LLM SDK into user interfaces.

## Quick Start

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';

// Initialize SDK - ALL 7 contract addresses required!
const sdk = new FabstirSDKCore({
  rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/YOUR_KEY',
  contractAddresses: {
    jobMarketplace: '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944',
    nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
    proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
    hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
    modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E',
    usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62'
  },
  s5Config: {
    portalUrl: 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p'
  }
});

// Authenticate user (multiple options)
// Option 1: Private key
await sdk.authenticate('privateKey', { privateKey: '0x...' });

// Option 2: Ethers signer (recommended for browser)
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
await sdk.authenticate('signer', { signer });

// Access managers (all synchronous after authentication)
const paymentManager = sdk.getPaymentManager();
const storageManager = sdk.getStorageManager();
const sessionManager = sdk.getSessionManager();
const clientManager = sdk.getClientManager();
const modelManager = sdk.getModelManager();
const hostManager = sdk.getHostManagerEnhanced();
```

## Manager Architecture

The SDK uses a manager-based architecture where each manager handles a specific domain:

- **PaymentManager**: Payment processing, USDC/ETH transactions
- **StorageManager**: S5 conversation persistence, session metadata
- **SessionManager**: Session lifecycle, streaming responses, context management
- **ClientManager**: Host selection, job creation, cost estimation
- **ModelManager**: Model governance, validation, approval
- **HostManager**: Host discovery, capabilities, metadata

## PaymentManager API

### Core Payment Methods

#### `depositFunds(amount: string, paymentType: 'ETH' | 'USDC'): Promise<TransactionResponse>`
Deposits funds for inference jobs.

#### `approveUSDC(spender: string, amount: string): Promise<TransactionResponse>`
Approves USDC spending (required before USDC deposits).

### Utility Methods for UI

#### Payment Method Support
```typescript
// Get supported payment methods
const methods = paymentManager.getSupportedPaymentMethods();
// Returns: ['ETH', 'USDC']
```

#### Cost Calculation
```typescript
// Calculate job cost
const tokenCount = 1000;
const pricePerToken = 10000; // wei
const cost = paymentManager.calculateJobCost(tokenCount, pricePerToken);

// Estimate tokens for deposit
const depositWei = paymentManager.parseETHAmount('0.1'); // 0.1 ETH
const estimatedTokens = paymentManager.estimateTokensForDeposit(depositWei, pricePerToken);
```

#### Validation
```typescript
// Validate ETH deposit
const validation = paymentManager.validateETHDeposit(weiAmount);
if (!validation.valid) {
  console.error(validation.error);
}

// Validate USDC deposit
const usdcValidation = paymentManager.validateUSDCDeposit(usdcAmount);
```

#### Formatting
```typescript
// Format for display
const ethDisplay = paymentManager.formatETHAmount(weiAmount); // "1.5"
const usdcDisplay = paymentManager.formatUSDCAmount(smallestUnit); // "100.5"

// Parse user input
const weiAmount = paymentManager.parseETHAmount("1.5"); // ETH to wei
const usdcAmount = paymentManager.parseUSDCAmount("100.5"); // USDC to smallest unit
```

#### Limits and Recommendations
```typescript
// ETH limits
const minETH = paymentManager.getMinimumDeposit(); // 0.001 ETH in wei
const maxETH = paymentManager.getMaximumDeposit(); // 10 ETH in wei

// USDC limits
const minUSDC = paymentManager.getUSDCMinimumDeposit(); // 1 USDC
const maxUSDC = paymentManager.getUSDCMaximumDeposit(); // 10,000 USDC

// Recommended prices
const ethPrice = paymentManager.getRecommendedPricePerToken(); // 0.00001 ETH
const usdcPrice = paymentManager.getRecommendedUSDCPricePerToken(); // 0.001 USDC
```

## StorageManager API

### Initialization
```typescript
// IMPORTANT: StorageManager requires await!
const storageManager = await sdk.getStorageManager();
```

### Conversation Management

#### Save/Load Conversations
```typescript
// Save conversation
const messages = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi! How can I help?' }
];
await storageManager.saveConversation(sessionId, messages);

// Load conversation
const conversation = await storageManager.loadConversation(sessionId);
```

#### Session Metadata
```typescript
// Save metadata
await storageManager.saveSessionMetadata(sessionId, {
  model: 'llama-2-7b',
  temperature: 0.7,
  maxTokens: 1000,
  createdAt: Date.now(),
  totalTokensUsed: 450
});

// Load metadata
const metadata = await storageManager.loadSessionMetadata(sessionId);
```

#### Session Management
```typescript
// List all sessions
const sessions = await storageManager.listSessions();
// Returns: [{ id: 'session-123', created: 1704067200000 }, ...]
```

### Streaming Optimization

For real-time streaming, use exchange-based methods:

```typescript
// Store single exchange (O(1) operation)
const exchange = {
  prompt: 'What is Python?',
  response: 'Python is a programming language...',
  timestamp: Date.now()
};
await storageManager.storeExchange(sessionId, exchange);

// Get recent exchanges
const recent = await storageManager.getRecentExchanges(sessionId, 10);
```

## SessionManager API

### Creating Sessions

```typescript
const session = await sessionManager.createSession({
  paymentType: 'ETH',
  amount: '1000000000000000', // 0.001 ETH in wei
  pricePerToken: 10000,
  duration: 300, // 5 minutes
  proofInterval: 100, // Prove every 100 tokens
  hostAddress: '0x...' // Optional: specific host
});
```

### Session Operations

```typescript
// Get session status
const status = await sessionManager.getSessionStatus(jobId);

// Complete session
const completion = await sessionManager.completeSession(jobId);

// Cancel session
await sessionManager.cancelSession(jobId);
```

## InferenceManager API

### Starting Inference

```typescript
// Start inference session
const stream = await inferenceManager.startInference({
  prompt: 'Explain quantum computing',
  model: 'llama-2-7b',
  temperature: 0.7,
  maxTokens: 500
});

// Listen for tokens
stream.on('token', (token) => {
  console.log('Token:', token);
});

// Listen for completion
stream.on('complete', (result) => {
  console.log('Total tokens:', result.tokenCount);
});
```

### Session Recovery

```typescript
// Resume session with history from S5
await inferenceManager.resumeSessionWithHistory(
  sessionId,
  hostUrl,
  jobId
);
```

## React Integration Example

```jsx
function ChatInterface({ sdk }) {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Start session with host discovery
  const startSession = async () => {
    setLoading(true);
    try {
      const sessionManager = sdk.getSessionManager();
      const clientManager = sdk.getClientManager();

      // Discover hosts
      const hosts = await clientManager.discoverHosts();
      if (hosts.length === 0) throw new Error('No hosts available');

      // Select best host
      const host = hosts[0]; // Or use selection criteria

      // Start session with $1 USDC
      const { sessionId: newSessionId } = await sessionManager.startSession(
        host.modelHash,
        host.address,
        {
          depositAmount: "1.0", // $1 USDC
          pricePerToken: 200,   // 0.02 cents per token
          duration: 3600,       // 1 hour
          proofInterval: 100    // Checkpoint every 100 tokens
        },
        host.apiUrl
      );

      setSessionId(newSessionId);
      setMessages([{
        role: 'system',
        content: 'Session started! You can now send messages.'
      }]);
    } catch (error) {
      console.error('Failed to start session:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (prompt) => {
    if (!sessionId) return;

    setLoading(true);

    // Add user message
    const userMessage = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMessage]);

    try {
      const sessionManager = sdk.getSessionManager();

      // Send prompt with streaming
      let response = '';
      await sessionManager.sendPromptStreaming(
        sessionId,
        prompt,
        (chunk) => {
          response += chunk;
          // Update UI with streaming response
          setMessages(prev => {
            const msgs = [...prev];
            if (msgs[msgs.length - 1]?.role === 'assistant') {
              msgs[msgs.length - 1].content = response;
            } else {
              msgs.push({ role: 'assistant', content: response });
            }
            return msgs;
          });
        },
        () => {
          // Complete - save to S5 if available
          const storageManager = sdk.getStorageManager();
          if (storageManager.isInitialized()) {
            storageManager.storeConversation(sessionId.toString(), messages);
          }
        },
        (error) => {
          console.error('Streaming error:', error);
        }
      );
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      {messages.map((msg, i) => (
        <Message key={i} {...msg} />
      ))}
      <MessageInput onSend={sendMessage} disabled={loading} />
    </div>
  );
}
```

## Payment Form Component

```jsx
function PaymentDeposit({ sdk, onDeposit }) {
  const [method, setMethod] = useState('ETH');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const paymentManager = sdk.getPaymentManager();
  
  const handleDeposit = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Parse amount
      const parsedAmount = method === 'ETH'
        ? paymentManager.parseETHAmount(amount)
        : paymentManager.parseUSDCAmount(amount);
      
      // Validate
      const validation = method === 'ETH'
        ? paymentManager.validateETHDeposit(parsedAmount)
        : paymentManager.validateUSDCDeposit(parsedAmount);
      
      if (!validation.valid) {
        setError(validation.error);
        return;
      }
      
      // Process deposit
      if (method === 'USDC') {
        // Approve first
        const marketplace = paymentManager.getJobMarketplaceAddress();
        await paymentManager.approveUSDC(marketplace, parsedAmount);
      }
      
      const tx = await paymentManager.depositFunds(parsedAmount, method);
      await tx.wait();
      
      onDeposit({ method, amount: parsedAmount });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const limits = method === 'ETH'
    ? {
        min: paymentManager.formatETHAmount(paymentManager.getMinimumDeposit()),
        max: paymentManager.formatETHAmount(paymentManager.getMaximumDeposit())
      }
    : {
        min: paymentManager.formatUSDCAmount(paymentManager.getUSDCMinimumDeposit()),
        max: paymentManager.formatUSDCAmount(paymentManager.getUSDCMaximumDeposit())
      };
  
  return (
    <div>
      <select value={method} onChange={e => setMethod(e.target.value)}>
        {paymentManager.getSupportedPaymentMethods().map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      
      <input
        type="number"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder={`${limits.min} - ${limits.max} ${method}`}
      />
      
      <button onClick={handleDeposit} disabled={loading}>
        Deposit {method}
      </button>
      
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

## Session List Component

```jsx
function SessionHistory({ sdk }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  
  useEffect(() => {
    loadSessions();
  }, []);
  
  const loadSessions = async () => {
    const storageManager = await sdk.getStorageManager();
    const list = await storageManager.listSessions();
    setSessions(list);
  };
  
  const loadSession = async (sessionId) => {
    const storageManager = await sdk.getStorageManager();
    const conversation = await storageManager.loadConversation(sessionId);
    const metadata = await storageManager.loadSessionMetadata(sessionId);
    
    setSelectedSession({
      id: sessionId,
      conversation,
      metadata
    });
  };
  
  return (
    <div>
      <div className="session-list">
        {sessions.map(session => (
          <div 
            key={session.id}
            onClick={() => loadSession(session.id)}
            className="session-item"
          >
            <span>{session.id}</span>
            {session.created && (
              <span>{new Date(session.created).toLocaleString()}</span>
            )}
          </div>
        ))}
      </div>
      
      {selectedSession && (
        <ConversationView 
          conversation={selectedSession.conversation}
          metadata={selectedSession.metadata}
        />
      )}
    </div>
  );
}
```

## Error Handling

Always wrap SDK calls in try-catch blocks:

```typescript
try {
  const storageManager = await sdk.getStorageManager();
  const conversation = await storageManager.loadConversation(sessionId);
} catch (error) {
  if (error.code === 'STORAGE_NOT_INITIALIZED') {
    // S5 portal not connected
  } else if (error.code === 'SESSION_NOT_FOUND') {
    // Session doesn't exist
  } else {
    // Generic error
    console.error('Storage error:', error);
  }
}
```

## Best Practices

1. **Always await StorageManager**: `await sdk.getStorageManager()`
2. **Validate inputs**: Use validation methods before processing payments
3. **Handle errors gracefully**: Wrap SDK calls in try-catch
4. **Use streaming for real-time**: Leverage storeExchange() for O(1) updates
5. **Check authentication**: Ensure user is authenticated before manager access
6. **Format for display**: Use formatting helpers for user-friendly amounts
7. **Persist important data**: Save conversations and metadata to S5

## Environment Setup

```bash
# Required environment variables
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
S5_PORTAL_URL=wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p

# Contract addresses (Base Sepolia) - From .env.test
CONTRACT_JOB_MARKETPLACE=0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944
CONTRACT_NODE_REGISTRY=0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218
CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776
CONTRACT_MODEL_REGISTRY=0x92b2De840bB2171203011A6dBA928d855cA8183E
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
```

## Testing Your Integration

```typescript
// Test payment flow
const testPayment = async () => {
  const paymentManager = sdk.getPaymentManager();
  
  // Test validation
  const amount = paymentManager.parseETHAmount('0.1');
  const validation = paymentManager.validateETHDeposit(amount);
  console.assert(validation.valid);
  
  // Test formatting
  const display = paymentManager.formatETHAmount(amount);
  console.assert(display === '0.1');
};

// Test storage flow
const testStorage = async () => {
  const storageManager = await sdk.getStorageManager();
  const testSessionId = `test-${Date.now()}`;
  
  // Save and load
  await storageManager.saveConversation(testSessionId, [
    { role: 'user', content: 'test' }
  ]);
  
  const loaded = await storageManager.loadConversation(testSessionId);
  console.assert(loaded.length === 1);
};
```

## Gas Payment Responsibilities

Understanding who pays gas is critical for UX design:

| Operation | Who Pays | Gas Cost | Notes |
|-----------|----------|----------|-------|
| Session Creation | User | ~200k gas | Initial session setup |
| Checkpoint Proofs | Host | ~30k gas each | Every 100 tokens |
| Session Completion | User | ~100k gas | Payment distribution |

### Design Considerations

1. **Users may abandon sessions** to avoid completion gas
2. **Hosts should price accordingly** to cover checkpoint costs
3. **Consider gasless options** via Base Account Kit

## Base Account Kit Integration (Gasless Transactions)

Enable gasless transactions with Coinbase Smart Wallet:

```typescript
// Custom signer for gasless transactions
const createGaslessSigner = (primaryAccount, subAccount, provider) => {
  return {
    async getAddress() {
      return subAccount;
    },

    async signMessage(message) {
      // Use primary for signing
      return provider.request({
        method: 'personal_sign',
        params: [message, primaryAccount]
      });
    },

    async sendTransaction(tx) {
      // Use wallet_sendCalls for gasless
      const calls = [{
        to: tx.to,
        data: tx.data,
        value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : undefined
      }];

      const response = await provider.request({
        method: "wallet_sendCalls",
        params: [{
          from: subAccount,
          calls: calls,
          capabilities: {
            atomic: { required: true }
          }
        }]
      });

      // Wait for confirmation
      // ... polling logic
      return tx;
    }
  };
};

// Use with SDK
const signer = createGaslessSigner(primaryAccount, subAccount, provider);
await sdk.authenticate('signer', { signer });
```

## Payment Distribution

Current distribution model (from treasury configuration):
- **Host**: 90% of payment
- **Treasury**: 10% of payment
- **User**: Refund of unused deposit

## Support

For issues or questions:
- GitHub: https://github.com/fabstir/fabstir-llm-sdk
- Documentation: /workspace/docs/
- Tests: /workspace/tests/e2e/
