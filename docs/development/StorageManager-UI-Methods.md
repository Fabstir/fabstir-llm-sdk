# StorageManager UI Methods Documentation

This document lists the methods added to StorageManager for UI integration.

## Core Storage Methods

### Conversation Management

#### `saveConversation(sessionId: string, messages: Array<{ role: string; content: string }>): Promise<void>`
Saves a complete conversation to S5 storage.
- `sessionId`: Unique session identifier
- `messages`: Array of message objects with role ('user' or 'assistant') and content

#### `loadConversation(sessionId: string): Promise<Array<{ role: string; content: string }>>`
Loads a complete conversation from S5 storage.
- `sessionId`: Unique session identifier
- Returns: Array of messages or empty array if not found

### Session Metadata

#### `saveSessionMetadata(sessionId: string, metadata: any): Promise<void>`
Saves metadata about a session (model, settings, tokens used, etc.).
- `sessionId`: Unique session identifier
- `metadata`: Any metadata object to store

#### `loadSessionMetadata(sessionId: string): Promise<any>`
Loads session metadata from S5 storage.
- `sessionId`: Unique session identifier
- Returns: Metadata object or null if not found

### Session Management

#### `listSessions(): Promise<Array<{ id: string; created?: number }>>`
Lists all sessions for the current user.
- Returns: Array of session objects with id and optional creation timestamp

## Exchange-Based Methods (Already Existed)

### For Efficient Streaming

#### `storeExchange(sessionId: string, exchange: Exchange): Promise<string>`
Stores a single prompt-response exchange efficiently.
- O(1) operation - only stores new data
- Returns: Path where exchange was stored

#### `getRecentExchanges(sessionId: string, limit?: number): Promise<Exchange[]>`
Gets the most recent exchanges from a session.
- `limit`: Maximum number of exchanges to return (default: 10)
- Returns: Array of exchanges in chronological order

## Usage Examples

### React UI Component Example

```jsx
function ConversationView({ sdk, sessionId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadConversation();
  }, [sessionId]);
  
  const loadConversation = async () => {
    try {
      const storageManager = await sdk.getStorageManager();
      const conversation = await storageManager.loadConversation(sessionId);
      setMessages(conversation);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const saveMessage = async (role, content) => {
    const newMessage = { role, content };
    const updatedMessages = [...messages, newMessage];
    
    try {
      const storageManager = await sdk.getStorageManager();
      await storageManager.saveConversation(sessionId, updatedMessages);
      setMessages(updatedMessages);
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  };
  
  if (loading) return <div>Loading conversation...</div>;
  
  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i} className={`message ${msg.role}`}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
    </div>
  );
}
```

### Session List Component

```jsx
function SessionList({ sdk }) {
  const [sessions, setSessions] = useState([]);
  
  useEffect(() => {
    loadSessions();
  }, []);
  
  const loadSessions = async () => {
    try {
      const storageManager = await sdk.getStorageManager();
      const sessionList = await storageManager.listSessions();
      setSessions(sessionList);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };
  
  return (
    <div>
      <h3>Your Sessions</h3>
      <ul>
        {sessions.map(session => (
          <li key={session.id}>
            {session.id} - Created: {new Date(session.created).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Session Metadata Example

```typescript
// Save session metadata
const storageManager = await sdk.getStorageManager();
await storageManager.saveSessionMetadata(sessionId, {
  model: 'llama-2-7b',
  temperature: 0.7,
  maxTokens: 1000,
  createdAt: Date.now(),
  totalTokensUsed: 450,
  costEstimate: 0.0045 // in ETH or USDC
});

// Load and display metadata
const metadata = await storageManager.loadSessionMetadata(sessionId);
if (metadata) {
  console.log(`Model: ${metadata.model}`);
  console.log(`Tokens used: ${metadata.totalTokensUsed}`);
  console.log(`Cost: ${metadata.costEstimate}`);
}
```

## Important Notes

1. **Initialization Required**: StorageManager must be initialized with `await sdk.getStorageManager()` (note the await!)
2. **S5 Portal Connection**: Requires connection to S5 portal (default: 'wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p')
3. **User-Specific Storage**: All data is stored under the user's address, ensuring privacy
4. **Cross-Device Sync**: Same user can access conversations from different devices with same private key
5. **Efficient Storage**: Use `storeExchange()` for streaming responses, `saveConversation()` for bulk updates

## Error Handling

All methods throw errors if:
- StorageManager is not initialized
- S5 portal is not accessible
- Invalid session ID
- Network issues

Always wrap in try-catch blocks in production UI code.