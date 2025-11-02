# RAG Integration Guide

Guide for integrating RAG into existing Fabstir SDK applications.

## Integration Patterns

### Pattern 1: Add RAG to Existing Chat Application

If you already have a chat interface using `SessionManager`:

```typescript
// Before: Simple chat without RAG
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://host:8080',
  jobId: BigInt(123),
  modelName: 'llama-3',
  chainId: 84532
});

// After: Chat with RAG enabled
const vectorRAGManager = sdk.getVectorRAGManager();
const embeddingService = new HostAdapter({ hostUrl: 'http://host:8080' });

sessionManager.setVectorRAGManager(vectorRAGManager);
sessionManager.setEmbeddingService(embeddingService);

const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://host:8080',
  jobId: BigInt(123),
  modelName: 'llama-3',
  chainId: 84532,
  ragConfig: {
    enabled: true,
    databaseName: 'my-knowledge-base',
    topK: 5,
    threshold: 0.7
  }
});
```

**That's it!** RAG context is automatically injected into all prompts.

### Pattern 2: Gradual Migration

Migrate users gradually without breaking existing functionality:

```typescript
// Check if user has any vector databases
const databases = vectorRAGManager.listDatabases();
const hasKnowledgeBase = databases.length > 0;

const ragConfig = hasKnowledgeBase ? {
  enabled: true,
  databaseName: databases[0].databaseName,
  topK: 5,
  threshold: 0.7
} : undefined;

const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://host:8080',
  jobId: BigInt(123),
  modelName: 'llama-3',
  chainId: 84532,
  ragConfig // Optional - undefined means no RAG
});
```

### Pattern 3: Per-User Knowledge Bases

Create isolated knowledge bases per user:

```typescript
const userAddress = await authManager.getUserAddress();
const userDbName = `kb-${userAddress}`;

// Create user's knowledge base if it doesn't exist
if (!vectorRAGManager.getDatabaseMetadata(userDbName)) {
  await vectorRAGManager.createSession(userDbName);
}

// Use user-specific database
const { sessionId } = await sessionManager.startSession({
  ragConfig: {
    enabled: true,
    databaseName: userDbName,
    topK: 5
  }
});
```

### Pattern 4: Project-Based Knowledge Bases

Multiple projects with separate knowledge:

```typescript
function getProjectDatabaseName(projectId: string): string {
  return `project-${projectId}`;
}

async function startProjectSession(projectId: string) {
  const dbName = getProjectDatabaseName(projectId);

  // Ensure database exists
  if (!vectorRAGManager.getDatabaseMetadata(dbName)) {
    await vectorRAGManager.createSession(dbName);
  }

  return sessionManager.startSession({
    ragConfig: {
      enabled: true,
      databaseName: dbName,
      topK: 5
    }
  });
}
```

## React Integration

### Basic React Hook

```typescript
import { useState, useEffect } from 'react';
import { VectorRAGManager } from '@fabstir/sdk-core/managers';

function useVectorDatabase(databaseName: string) {
  const [manager, setManager] = useState<VectorRAGManager | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const sdk = await initializeSDK();
      const vectorRAG = sdk.getVectorRAGManager();

      // Create database if doesn't exist
      if (!vectorRAG.getDatabaseMetadata(databaseName)) {
        await vectorRAG.createSession(databaseName);
      }

      setManager(vectorRAG);
      setLoading(false);
    }
    init();
  }, [databaseName]);

  return { manager, loading };
}
```

### Document Upload Component

```typescript
function DocumentUploader({ databaseName }: { databaseName: string }) {
  const { manager, loading } = useVectorDatabase(databaseName);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleUpload(file: File) {
    setUploading(true);

    const documentManager = new DocumentManager({
      embeddingService: new HostAdapter({ hostUrl: 'http://...' }),
      vectorManager: manager!,
      databaseName
    });

    const result = await documentManager.processDocument(file, {
      onProgress: (p) => setProgress(p.progress)
    });

    setUploading(false);
    console.log('Upload complete:', result);
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <input
        type="file"
        onChange={(e) => e.target.files && handleUpload(e.target.files[0])}
        disabled={uploading}
      />
      {uploading && <progress value={progress} max={100} />}
    </div>
  );
}
```

### Chat with RAG Component

```typescript
function ChatWithRAG({ databaseName }: { databaseName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const { manager: vectorRAG } = useVectorDatabase(databaseName);

  async function sendMessage() {
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Send to LLM with RAG
    const response = await sessionManager.sendPrompt(sessionId, input);

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: response.content
    }]);
  }

  return (
    <div>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role}>
            {msg.content}
          </div>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
      />
    </div>
  );
}
```

## State Management Integration

### Redux Integration

```typescript
// actions.ts
export const uploadDocument = (file: File) => async (dispatch, getState) => {
  const { vectorRAG, databaseName } = getState().rag;

  dispatch({ type: 'DOCUMENT_UPLOAD_START' });

  try {
    const documentManager = new DocumentManager({
      embeddingService: getState().embeddings.service,
      vectorManager: vectorRAG,
      databaseName
    });

    const result = await documentManager.processDocument(file, {
      onProgress: (progress) => {
        dispatch({ type: 'DOCUMENT_UPLOAD_PROGRESS', payload: progress });
      }
    });

    dispatch({ type: 'DOCUMENT_UPLOAD_SUCCESS', payload: result });
  } catch (error) {
    dispatch({ type: 'DOCUMENT_UPLOAD_ERROR', payload: error });
  }
};

// reducer.ts
const initialState = {
  documents: [],
  uploading: false,
  uploadProgress: 0
};

export function ragReducer(state = initialState, action) {
  switch (action.type) {
    case 'DOCUMENT_UPLOAD_START':
      return { ...state, uploading: true, uploadProgress: 0 };
    case 'DOCUMENT_UPLOAD_PROGRESS':
      return { ...state, uploadProgress: action.payload.progress };
    case 'DOCUMENT_UPLOAD_SUCCESS':
      return {
        ...state,
        uploading: false,
        documents: [...state.documents, action.payload]
      };
    default:
      return state;
  }
}
```

### Zustand Integration

```typescript
import create from 'zustand';

interface RAGStore {
  vectorRAG: VectorRAGManager | null;
  databaseName: string;
  documents: DocumentInfo[];
  initialize: (sdk: FabstirSDKCore, dbName: string) => Promise<void>;
  uploadDocument: (file: File) => Promise<void>;
}

export const useRAGStore = create<RAGStore>((set, get) => ({
  vectorRAG: null,
  databaseName: '',
  documents: [],

  initialize: async (sdk, dbName) => {
    const vectorRAG = sdk.getVectorRAGManager();

    if (!vectorRAG.getDatabaseMetadata(dbName)) {
      await vectorRAG.createSession(dbName);
    }

    set({ vectorRAG, databaseName: dbName });
  },

  uploadDocument: async (file) => {
    const { vectorRAG, databaseName } = get();
    const documentManager = new DocumentManager({
      embeddingService: new HostAdapter({ hostUrl: 'http://...' }),
      vectorManager: vectorRAG!,
      databaseName
    });

    const result = await documentManager.processDocument(file);
    set(state => ({
      documents: [...state.documents, {
        documentId: result.documentId,
        filename: file.name,
        processedAt: Date.now(),
        chunks: result.chunks,
        metadata: {}
      }]
    }));
  }
}));
```

## Backend Integration (Node.js)

### Express.js API

```typescript
import express from 'express';
import { FabstirSDKCore, VectorRAGManager, DocumentManager } from '@fabstir/sdk-core';

const app = express();
const sdk = await initializeSDK();
const vectorRAG = sdk.getVectorRAGManager();

// Upload document endpoint
app.post('/api/documents/upload', async (req, res) => {
  const { userId, file } = req.body;
  const dbName = `user-${userId}`;

  if (!vectorRAG.getDatabaseMetadata(dbName)) {
    await vectorRAG.createSession(dbName);
  }

  const documentManager = new DocumentManager({
    embeddingService: new HostAdapter({ hostUrl: 'http://...' }),
    vectorManager: vectorRAG,
    databaseName: dbName
  });

  const result = await documentManager.processDocument(file);
  res.json(result);
});

// Search endpoint
app.post('/api/search', async (req, res) => {
  const { userId, query } = req.body;
  const dbName = `user-${userId}`;

  const embeddingService = new HostAdapter({ hostUrl: 'http://...' });
  const queryEmbedding = await embeddingService.embed(query);

  const results = await vectorRAG.search(dbName, queryEmbedding, 5, {
    threshold: 0.7
  });

  res.json(results);
});

app.listen(3000);
```

## Migration Checklist

- [ ] Initialize `VectorRAGManager` from SDK
- [ ] Choose embedding service (HostAdapter for zero cost)
- [ ] Set managers on `SessionManager` (`setVectorRAGManager`, `setEmbeddingService`)
- [ ] Create vector database(s) for users
- [ ] Add `ragConfig` to `startSession()` calls
- [ ] Implement document upload UI/API
- [ ] Test RAG-enhanced responses
- [ ] Monitor RAG metrics (`session.ragMetrics`)
- [ ] Add error handling for RAG operations
- [ ] Update user documentation

## Backward Compatibility

RAG is **100% backward compatible**:

```typescript
// Old code continues to work without changes
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://host:8080',
  jobId: BigInt(123),
  modelName: 'llama-3',
  chainId: 84532
  // No ragConfig - works exactly as before
});
```

Only when you add `ragConfig` does RAG activate.

## Testing Integration

```typescript
import { describe, it, expect } from 'vitest';

describe('RAG Integration', () => {
  it('should work with existing chat flow', async () => {
    const sdk = await initializeSDK();
    const vectorRAG = sdk.getVectorRAGManager();
    const sessionManager = await sdk.getSessionManager();

    // Create database
    await vectorRAG.createSession('test-db');

    // Add test document
    await vectorRAG.addVector('test-db', 'doc-1', testVector, {
      content: 'Test content'
    });

    // Configure RAG
    sessionManager.setVectorRAGManager(vectorRAG);
    sessionManager.setEmbeddingService(new HostAdapter({ hostUrl: 'http://...' }));

    // Start session
    const { sessionId } = await sessionManager.startSession({
      hostUrl: 'http://host:8080',
      jobId: BigInt(123),
      modelName: 'llama-3',
      chainId: 84532,
      ragConfig: {
        enabled: true,
        databaseName: 'test-db',
        topK: 5
      }
    });

    // Send prompt
    const response = await sessionManager.sendPrompt(sessionId, 'Test question');

    expect(response.content).toBeDefined();

    // Check RAG metrics
    const session = sessionManager.getSession(sessionId);
    expect(session.ragMetrics.contextsRetrieved).toBeGreaterThan(0);
  });
});
```

## Performance Considerations

1. **Lazy Initialization**: Don't create vector databases until needed
2. **Connection Reuse**: Reuse `VectorRAGManager` and `EmbeddingService` instances
3. **Batch Operations**: Use `processBatch()` for multiple documents
4. **Caching**: Let SDK handle caching automatically
5. **Cleanup**: Call `destroySession()` when done to free resources

## Next Steps

- **[Best Practices](./RAG_BEST_PRACTICES.md)** - Recommended patterns
- **[Troubleshooting](./RAG_TROUBLESHOOTING.md)** - Common issues
- **[API Reference](./RAG_API_REFERENCE.md)** - Complete API docs
