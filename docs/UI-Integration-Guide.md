# Fabstir LLM SDK - UI Integration Guide

This guide provides a complete reference for integrating the Fabstir LLM SDK into user interfaces.

## Quick Start

```typescript
import { FabstirSDK } from 'fabstir-llm-sdk';

// Initialize SDK
const sdk = new FabstirSDK({
  rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/YOUR_KEY',
  s5PortalUrl: 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p'
});

// Authenticate user
await sdk.authenticate(privateKey);

// Access managers
const paymentManager = sdk.getPaymentManager();
const storageManager = await sdk.getStorageManager(); // Note: await required!
const sessionManager = sdk.getSessionManager();
const inferenceManager = sdk.getInferenceManager();
const discoveryManager = sdk.getDiscoveryManager();
```

## Manager Architecture

The SDK uses a manager-based architecture where each manager handles a specific domain:

- **PaymentManager**: Payment processing, cost calculation, validation
- **StorageManager**: Conversation persistence, session metadata
- **SessionManager**: Session lifecycle, job management
- **InferenceManager**: LLM inference, streaming responses
- **DiscoveryManager**: P2P node discovery, host selection

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
  const [sessionId] = useState(`session-${Date.now()}`);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadConversation();
  }, []);
  
  const loadConversation = async () => {
    const storageManager = await sdk.getStorageManager();
    const conversation = await storageManager.loadConversation(sessionId);
    setMessages(conversation);
  };
  
  const sendMessage = async (prompt) => {
    setLoading(true);
    
    // Add user message
    const userMessage = { role: 'user', content: prompt };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    // Start inference
    const inferenceManager = sdk.getInferenceManager();
    const stream = await inferenceManager.startInference({
      prompt,
      model: 'llama-2-7b',
      temperature: 0.7
    });
    
    let response = '';
    
    stream.on('token', (token) => {
      response += token;
      // Update UI with streaming response
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: response }
      ]);
    });
    
    stream.on('complete', async () => {
      // Save complete conversation
      const storageManager = await sdk.getStorageManager();
      await storageManager.saveConversation(sessionId, [
        ...updatedMessages,
        { role: 'assistant', content: response }
      ]);
      setLoading(false);
    });
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

# Contract addresses (Base Sepolia)
CONTRACT_JOB_MARKETPLACE=0xD937c594682Fe74E6e3d06239719805C04BE804A
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
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

## Support

For issues or questions:
- GitHub: https://github.com/fabstir/fabstir-llm-sdk
- Documentation: /workspace/docs/
- Tests: /workspace/tests/e2e/