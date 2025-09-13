# Inference Manager API Documentation

## Overview

The Inference Manager provides direct LLM inference capabilities through WebSocket connections to discovered hosts. It enables real-time token streaming, session management, and automatic host selection without requiring blockchain transactions for each inference.

## Core Components

### InferenceManager

The main class for managing inference requests and streaming responses.

```typescript
import { InferenceManager } from '@fabstir/sdk-core';
```

### WebSocketClient

Handles WebSocket connections and streaming protocols.

```typescript
import { WebSocketClient } from '@fabstir/sdk-core';
```

## API Reference

### InferenceManager

#### Constructor

```typescript
constructor(
  hostManager: HostManager,
  config?: InferenceConfig
)
```

**Parameters:**
- `hostManager`: Instance of HostManager for host discovery
- `config`: Optional configuration for inference settings

#### Configuration Options

```typescript
interface InferenceConfig {
  defaultModel?: string;          // Default model to use
  maxRetries?: number;            // Max connection retries (default: 3)
  connectionTimeout?: number;      // Connection timeout in ms (default: 30000)
  streamBufferSize?: number;       // Token buffer size (default: 100)
  compressionEnabled?: boolean;    // Enable WebSocket compression (default: true)
}
```

#### Methods

##### streamInference(prompt, options)

Performs streaming inference with automatic host selection.

```typescript
async *streamInference(
  prompt: string,
  options?: InferenceOptions
): AsyncGenerator<string>
```

**Parameters:**
- `prompt`: The input prompt for the LLM
- `options`: Optional inference parameters

**Options:**
```typescript
interface InferenceOptions {
  model?: string;           // Model to use (e.g., 'llama-2-7b')
  maxTokens?: number;       // Maximum tokens to generate
  temperature?: number;     // Temperature for sampling (0.0-1.0)
  topP?: number;           // Top-p sampling parameter
  stream?: boolean;        // Enable streaming (default: true)
  stopSequences?: string[]; // Stop generation sequences
  hostAddress?: string;    // Specific host to use
}
```

**Returns:** AsyncGenerator yielding token strings

**Example:**
```typescript
const inferenceManager = sdk.getInferenceManager();

// Stream tokens as they arrive
for await (const token of inferenceManager.streamInference(
  "Explain quantum computing in simple terms",
  { model: 'llama-2-7b', maxTokens: 200 }
)) {
  process.stdout.write(token);
}
```

##### directInference(prompt, hostUrl, options)

Performs inference with a specific host URL.

```typescript
async *directInference(
  prompt: string,
  hostUrl: string,
  options?: InferenceOptions
): AsyncGenerator<string>
```

**Parameters:**
- `prompt`: Input prompt
- `hostUrl`: Direct URL to host WebSocket endpoint
- `options`: Inference options

**Example:**
```typescript
// Use specific host
for await (const token of inferenceManager.directInference(
  "Write a haiku about coding",
  "ws://localhost:8080/v1/ws",
  { temperature: 0.7 }
)) {
  console.log(token);
}
```

##### sessionInference(sessionId, prompt, options)

Performs inference within an existing session context.

```typescript
async *sessionInference(
  sessionId: string,
  prompt: string,
  options?: InferenceOptions
): AsyncGenerator<string>
```

**Parameters:**
- `sessionId`: Active session identifier
- `prompt`: Input prompt
- `options`: Inference options

**Returns:** AsyncGenerator yielding tokens

##### selectBestHost(requirements)

Selects the best available host based on requirements.

```typescript
async selectBestHost(requirements?: HostRequirements): Promise<HostInfo>
```

**Parameters:**
```typescript
interface HostRequirements {
  model: string;           // Required model
  minStake?: string;      // Minimum stake amount
  maxLatency?: number;    // Maximum acceptable latency (ms)
  region?: string;        // Preferred region
}
```

**Returns:** Selected host information

##### connectToHost(hostUrl)

Establishes WebSocket connection to a specific host.

```typescript
async connectToHost(hostUrl: string): Promise<WebSocketClient>
```

**Parameters:**
- `hostUrl`: WebSocket URL of the host

**Returns:** Connected WebSocket client

## Usage Examples

### Basic Streaming Inference

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';

async function runInference() {
  const sdk = new FabstirSDKCore({
    network: 'base-sepolia'
  });
  
  await sdk.authenticate(privateKey);
  const inferenceManager = sdk.getInferenceManager();
  
  // Simple streaming
  const response = [];
  for await (const token of inferenceManager.streamInference(
    "What is the meaning of life?"
  )) {
    response.push(token);
    // Update UI with streaming token
    updateUI(token);
  }
  
  console.log('Complete response:', response.join(''));
}
```

### Advanced Inference with Options

```typescript
async function advancedInference() {
  const inferenceManager = sdk.getInferenceManager();
  
  try {
    const generator = inferenceManager.streamInference(
      "Generate a Python function to sort a list",
      {
        model: 'codellama-7b',
        maxTokens: 500,
        temperature: 0.2,  // Lower temperature for code
        stopSequences: ['```', '\n\n']
      }
    );
    
    let code = '';
    for await (const token of generator) {
      code += token;
      
      // Check for early stopping
      if (code.includes('def sort_list')) {
        break;
      }
    }
    
    console.log('Generated code:', code);
  } catch (error) {
    console.error('Inference failed:', error);
  }
}
```

### Batch Processing with Multiple Hosts

```typescript
async function batchInference(prompts: string[]) {
  const inferenceManager = sdk.getInferenceManager();
  
  // Discover available hosts
  const hosts = await sdk.getHostManager().discoverAllActiveHosts();
  
  // Process prompts in parallel across different hosts
  const results = await Promise.all(
    prompts.map(async (prompt, i) => {
      const host = hosts[i % hosts.length];
      const tokens = [];
      
      for await (const token of inferenceManager.directInference(
        prompt,
        `${host.apiUrl}/v1/ws`
      )) {
        tokens.push(token);
      }
      
      return tokens.join('');
    })
  );
  
  return results;
}
```

### Session-Based Conversation

```typescript
async function conversation() {
  const sessionManager = sdk.getSessionManager();
  const inferenceManager = sdk.getInferenceManager();
  
  // Create session
  const session = await sessionManager.createSession({
    model: 'llama-2-13b-chat'
  });
  
  // Conversation loop
  const prompts = [
    "Hello, I need help with JavaScript",
    "How do I sort an array?",
    "Can you show me an example?"
  ];
  
  for (const prompt of prompts) {
    console.log(`User: ${prompt}`);
    
    let response = '';
    for await (const token of inferenceManager.sessionInference(
      session.id,
      prompt
    )) {
      response += token;
      process.stdout.write(token);
    }
    
    console.log('\n---');
  }
  
  await sessionManager.endSession(session.id);
}
```

### Error Handling and Retry Logic

```typescript
async function robustInference(prompt: string, maxAttempts = 3) {
  const inferenceManager = sdk.getInferenceManager();
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const tokens = [];
      const timeout = setTimeout(() => {
        throw new Error('Inference timeout');
      }, 60000);
      
      for await (const token of inferenceManager.streamInference(prompt)) {
        tokens.push(token);
      }
      
      clearTimeout(timeout);
      return tokens.join('');
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      
      if (attempt === maxAttempts) {
        throw new Error('All inference attempts failed');
      }
      
      // Exponential backoff
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
```

## WebSocket Protocol

### Message Types

#### Inference Request
```typescript
{
  type: 'inference',
  request: {
    prompt: string,
    model: string,
    max_tokens: number,
    temperature: number,
    stream: boolean
  }
}
```

#### Stream Chunk Response
```typescript
{
  type: 'stream_chunk',
  content: string,
  finish_reason?: 'stop' | 'length' | 'error'
}
```

#### Stream End
```typescript
{
  type: 'stream_end',
  usage: {
    prompt_tokens: number,
    completion_tokens: number,
    total_tokens: number
  }
}
```

#### Error Response
```typescript
{
  type: 'error',
  error: {
    code: string,
    message: string
  }
}
```

## Performance Optimization

### Connection Pooling

```typescript
class InferencePool {
  private connections: Map<string, WebSocketClient> = new Map();
  
  async getConnection(hostUrl: string): Promise<WebSocketClient> {
    if (!this.connections.has(hostUrl)) {
      const client = new WebSocketClient(hostUrl);
      await client.connect();
      this.connections.set(hostUrl, client);
    }
    return this.connections.get(hostUrl);
  }
  
  async closeAll() {
    for (const client of this.connections.values()) {
      await client.close();
    }
    this.connections.clear();
  }
}
```

### Token Buffering

```typescript
async function bufferedStreaming(prompt: string) {
  const buffer = [];
  const bufferSize = 10;
  
  for await (const token of inferenceManager.streamInference(prompt)) {
    buffer.push(token);
    
    if (buffer.length >= bufferSize) {
      // Process buffered tokens
      await processTokens(buffer.join(''));
      buffer.length = 0;
    }
  }
  
  // Process remaining tokens
  if (buffer.length > 0) {
    await processTokens(buffer.join(''));
  }
}
```

## Best Practices

1. **Use Streaming**: Always use streaming for better UX and reduced memory usage
2. **Handle Disconnections**: Implement reconnection logic for long-running sessions
3. **Buffer Tokens**: Buffer tokens for UI updates to reduce rendering overhead
4. **Set Timeouts**: Always set reasonable timeouts for inference requests
5. **Validate Input**: Sanitize and validate prompts before sending
6. **Monitor Usage**: Track token usage for cost management
7. **Cache Responses**: Cache common queries when appropriate

## Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `NO_HOSTS_AVAILABLE` | No active hosts found | Wait for hosts to come online |
| `CONNECTION_FAILED` | WebSocket connection failed | Check network and host status |
| `INFERENCE_TIMEOUT` | Request timed out | Retry with shorter prompt or different host |
| `MODEL_NOT_AVAILABLE` | Requested model not found | Use different model or host |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Implement backoff strategy |
| `INVALID_PROMPT` | Prompt validation failed | Check prompt format and length |

## Security Considerations

1. **Prompt Injection**: Sanitize user inputs to prevent prompt injection attacks
2. **Token Limits**: Enforce maximum token limits to prevent abuse
3. **Rate Limiting**: Implement client-side rate limiting
4. **Secure Connections**: Use WSS (WebSocket Secure) for production
5. **Authentication**: Implement proper authentication for private models
6. **Content Filtering**: Add content filtering for sensitive applications

## Related Documentation

- [Host Discovery API](./HOST_DISCOVERY_API.md)
- [WebSocket Protocol Guide](./WEBSOCKET_PROTOCOL_GUIDE.md)
- [Session Manager API](./SESSION_MANAGER_API.md)
- [SDK Core Documentation](./SDK_API.md)