# Session Manager API Documentation (Enhanced)

## Overview

The Session Manager provides stateful conversation management with LLM hosts, including WebSocket streaming, checkpoint proofs, and session persistence through S5 storage. It now supports direct WebSocket connections to discovered hosts without requiring blockchain transactions for each prompt.

## Core Features

- **WebSocket Streaming**: Real-time token streaming via `/v1/ws` endpoint
- **Session Persistence**: Conversation history stored in S5 decentralized storage
- **Checkpoint Proofs**: Cryptographic proofs at configurable intervals
- **Host Discovery**: Automatic selection and connection to available hosts
- **Session Recovery**: Resume sessions after disconnection

## API Reference

### SessionManager

#### Initialization

```typescript
import { SessionManager } from '@fabstir/sdk-core';

const sessionManager = sdk.getSessionManager();
await sessionManager.initialize();
```

#### Configuration

```typescript
interface SessionConfig {
  checkpointInterval?: number;     // Tokens between checkpoints (default: 1000)
  persistenceEnabled?: boolean;    // Enable S5 storage (default: true)
  compressionEnabled?: boolean;    // WebSocket compression (default: true)
  reconnectAttempts?: number;      // Max reconnection attempts (default: 3)
  sessionTimeout?: number;         // Session timeout in ms (default: 3600000)
}
```

### Core Methods

#### createSession(options)

Creates a new conversation session with automatic host discovery.

```typescript
async createSession(options?: SessionOptions): Promise<Session>
```

**Parameters:**
```typescript
interface SessionOptions {
  model?: string;              // LLM model to use
  hostAddress?: string;        // Specific host (optional)
  jobId?: number;             // Blockchain job ID (optional)
  initialContext?: string;     // Starting context
  temperature?: number;        // Sampling temperature
  maxTokens?: number;         // Max tokens per response
  systemPrompt?: string;      // System instructions
}
```

**Returns:**
```typescript
interface Session {
  id: string;                 // Unique session identifier
  hostUrl: string;            // Connected host WebSocket URL
  model: string;              // Active model
  status: 'active' | 'paused' | 'ended';
  conversationId?: string;    // S5 storage ID
  tokenCount: number;         // Total tokens used
  checkpointCount: number;    // Number of checkpoints
  createdAt: Date;
  lastActivity: Date;
}
```

**Example:**
```typescript
const session = await sessionManager.createSession({
  model: 'llama-2-13b-chat',
  temperature: 0.7,
  systemPrompt: 'You are a helpful coding assistant'
});

console.log(`Session ${session.id} connected to ${session.hostUrl}`);
```

#### streamPrompt(sessionId, prompt)

Sends a prompt and streams the response tokens.

```typescript
async *streamPrompt(
  sessionId: string,
  prompt: string
): AsyncGenerator<string>
```

**Parameters:**
- `sessionId`: Active session ID
- `prompt`: User prompt

**Returns:** AsyncGenerator yielding response tokens

**Example:**
```typescript
// Stream response tokens
for await (const token of sessionManager.streamPrompt(session.id, "Explain async/await")) {
  process.stdout.write(token);
  // Update UI with streaming token
}
```

#### getConversationHistory(sessionId)

Retrieves the full conversation history from S5 storage.

```typescript
async getConversationHistory(sessionId: string): Promise<Message[]>
```

**Returns:**
```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokenCount?: number;
}
```

#### createCheckpoint(sessionId)

Manually creates a checkpoint proof for the current conversation state.

```typescript
async createCheckpoint(sessionId: string): Promise<CheckpointProof>
```

**Returns:**
```typescript
interface CheckpointProof {
  sessionId: string;
  checkpointNumber: number;
  conversationHash: string;
  tokenCount: number;
  timestamp: Date;
  signature?: string;
}
```

#### resumeSession(sessionId, conversationContext?)

Resumes an existing session, optionally with provided context.

```typescript
async resumeSession(
  sessionId: string,
  conversationContext?: Message[]
): Promise<Session>
```

**Parameters:**
- `sessionId`: Session to resume
- `conversationContext`: Optional conversation history

#### endSession(sessionId)

Ends a session and performs cleanup.

```typescript
async endSession(sessionId: string): Promise<{
  finalTokenCount: number;
  checkpointProofs: CheckpointProof[];
  conversationId: string;
}>
```

## WebSocket Streaming Integration

### Connection Management

```typescript
class EnhancedSessionManager {
  private wsClients: Map<string, WebSocketClient> = new Map();
  
  async connectToHost(sessionId: string, hostUrl: string) {
    const wsUrl = `${hostUrl}/v1/ws`;
    const client = new WebSocketClient(wsUrl, {
      compression: true,
      reconnect: true
    });
    
    await client.connect();
    this.wsClients.set(sessionId, client);
    
    // Handle connection events
    client.on('connected', (data) => {
      console.log('WebSocket connected:', data.message);
    });
    
    client.on('stream_chunk', (data) => {
      this.handleStreamChunk(sessionId, data);
    });
  }
}
```

### Streaming Protocol

```typescript
// Send inference request
await sessionManager.sendInferenceRequest(sessionId, {
  type: 'inference',
  request: {
    prompt: userPrompt,
    model: session.model,
    stream: true,
    max_tokens: 500,
    temperature: 0.7
  }
});

// Handle streaming response
for await (const token of sessionManager.streamResponse(sessionId)) {
  // Process each token
  updateUI(token);
}
```

## Usage Examples

### Complete Conversation Flow

```typescript
async function runConversation() {
  const sdk = new FabstirSDKCore({ network: 'base-sepolia' });
  await sdk.authenticate(privateKey);
  
  const sessionManager = sdk.getSessionManager();
  
  // Create session with automatic host discovery
  const session = await sessionManager.createSession({
    model: 'llama-2-13b-chat',
    systemPrompt: 'You are an expert in TypeScript and React'
  });
  
  // Conversation loop
  const questions = [
    "What are React hooks?",
    "How do I use useState?",
    "Can you show me an example with useEffect?"
  ];
  
  for (const question of questions) {
    console.log(`\nUser: ${question}`);
    console.log('Assistant: ');
    
    // Stream the response
    for await (const token of sessionManager.streamPrompt(session.id, question)) {
      process.stdout.write(token);
    }
    
    // Checkpoint every few exchanges
    if (session.tokenCount > 1000) {
      await sessionManager.createCheckpoint(session.id);
    }
  }
  
  // End session and get summary
  const summary = await sessionManager.endSession(session.id);
  console.log(`\nSession ended. Total tokens: ${summary.finalTokenCount}`);
  console.log(`Conversation saved: ${summary.conversationId}`);
}
```

### Session Recovery After Disconnection

```typescript
async function recoverSession(sessionId: string) {
  const sessionManager = sdk.getSessionManager();
  
  try {
    // Load conversation from S5
    const history = await sessionManager.getConversationHistory(sessionId);
    
    // Resume with full context
    const session = await sessionManager.resumeSession(sessionId, history);
    
    console.log(`Session ${sessionId} recovered with ${history.length} messages`);
    
    // Continue conversation
    for await (const token of sessionManager.streamPrompt(
      session.id,
      "Where were we?"
    )) {
      process.stdout.write(token);
    }
  } catch (error) {
    console.error('Recovery failed:', error);
    // Start fresh session
    return sessionManager.createSession();
  }
}
```

### Multi-Model Session

```typescript
async function multiModelConversation() {
  const sessionManager = sdk.getSessionManager();
  
  // Start with one model
  let session = await sessionManager.createSession({
    model: 'llama-2-7b'
  });
  
  // Get initial response
  const response1 = [];
  for await (const token of sessionManager.streamPrompt(
    session.id,
    "Write a Python function"
  )) {
    response1.push(token);
  }
  
  // Switch to a different model
  await sessionManager.endSession(session.id);
  
  session = await sessionManager.createSession({
    model: 'codellama-7b',
    initialContext: response1.join('')
  });
  
  // Continue with code-specific model
  for await (const token of sessionManager.streamPrompt(
    session.id,
    "Optimize this function"
  )) {
    process.stdout.write(token);
  }
}
```

### Checkpoint Management

```typescript
async function managedCheckpoints() {
  const sessionManager = sdk.getSessionManager();
  
  const session = await sessionManager.createSession({
    checkpointInterval: 500  // Checkpoint every 500 tokens
  });
  
  // Monitor checkpoints
  sessionManager.on('checkpoint', (proof) => {
    console.log(`Checkpoint ${proof.checkpointNumber} created`);
    console.log(`Hash: ${proof.conversationHash}`);
    
    // Optionally submit to blockchain
    if (proof.checkpointNumber % 5 === 0) {
      submitProofToBlockchain(proof);
    }
  });
  
  // Run conversation
  for (const prompt of prompts) {
    for await (const token of sessionManager.streamPrompt(session.id, prompt)) {
      // Tokens streamed, checkpoints created automatically
    }
  }
  
  // Get all checkpoints
  const summary = await sessionManager.endSession(session.id);
  console.log(`Created ${summary.checkpointProofs.length} checkpoints`);
}
```

## S5 Storage Integration

### Conversation Persistence

```typescript
// Save conversation to S5
const conversationData = {
  messages: history,
  metadata: {
    model: session.model,
    tokenCount: session.tokenCount,
    duration: Date.now() - session.createdAt
  }
};

const cid = await sessionManager.saveToS5(sessionId, conversationData);
console.log(`Conversation saved to S5: ${cid}`);

// Load from S5
const loaded = await sessionManager.loadFromS5(cid);
console.log(`Loaded ${loaded.messages.length} messages`);
```

### Cross-Device Session Continuity

```typescript
// On Device A
const session = await sessionManager.createSession();
const exportData = await sessionManager.exportSession(session.id);
const shareCode = await sessionManager.generateShareCode(exportData);
console.log(`Share code: ${shareCode}`);

// On Device B
const importedSession = await sessionManager.importSession(shareCode);
const resumed = await sessionManager.resumeSession(importedSession.id);
console.log('Session resumed on new device');
```

## Error Handling

```typescript
async function robustSession() {
  const sessionManager = sdk.getSessionManager();
  
  try {
    const session = await sessionManager.createSession();
    
    for await (const token of sessionManager.streamPrompt(session.id, prompt)) {
      // Process tokens
    }
  } catch (error) {
    if (error.code === 'SESSION_TIMEOUT') {
      // Session expired
      const newSession = await sessionManager.createSession();
      return sessionManager.streamPrompt(newSession.id, prompt);
      
    } else if (error.code === 'HOST_DISCONNECTED') {
      // Host went offline
      console.log('Host disconnected, finding alternative...');
      const resumed = await sessionManager.resumeSession(session.id);
      return sessionManager.streamPrompt(resumed.id, prompt);
      
    } else if (error.code === 'CHECKPOINT_FAILED') {
      // Checkpoint creation failed
      console.warn('Checkpoint failed, continuing without proof');
      
    } else {
      throw error;
    }
  }
}
```

## Performance Optimization

### Token Buffering

```typescript
class BufferedSessionManager extends SessionManager {
  private buffers = new Map<string, string[]>();
  
  async *bufferedStream(sessionId: string, prompt: string, bufferSize = 10) {
    const buffer = [];
    
    for await (const token of this.streamPrompt(sessionId, prompt)) {
      buffer.push(token);
      
      if (buffer.length >= bufferSize) {
        yield buffer.join('');
        buffer.length = 0;
      }
    }
    
    if (buffer.length > 0) {
      yield buffer.join('');
    }
  }
}
```

### Parallel Sessions

```typescript
async function parallelSessions(prompts: string[]) {
  const sessionManager = sdk.getSessionManager();
  
  // Create multiple sessions
  const sessions = await Promise.all(
    prompts.map(() => sessionManager.createSession())
  );
  
  // Process in parallel
  const results = await Promise.all(
    prompts.map(async (prompt, i) => {
      const tokens = [];
      for await (const token of sessionManager.streamPrompt(
        sessions[i].id,
        prompt
      )) {
        tokens.push(token);
      }
      return tokens.join('');
    })
  );
  
  // Cleanup
  await Promise.all(
    sessions.map(s => sessionManager.endSession(s.id))
  );
  
  return results;
}
```

## Best Practices

1. **Always End Sessions**: Call `endSession()` to clean up resources
2. **Handle Disconnections**: Implement reconnection logic for production
3. **Monitor Token Usage**: Track tokens for cost management
4. **Regular Checkpoints**: Create checkpoints for long conversations
5. **Cache Sessions**: Keep active sessions in memory for quick access
6. **Validate Context**: Ensure conversation context is valid before resuming
7. **Set Timeouts**: Configure reasonable timeouts for streaming

## Related Documentation

- [Host Discovery API](./HOST_DISCOVERY_API.md)
- [Inference Manager API](./INFERENCE_MANAGER_API.md)
- [WebSocket Protocol Guide](./WEBSOCKET_PROTOCOL_GUIDE.md)
- [S5 Storage Integration](./s5js-reference/API.md)