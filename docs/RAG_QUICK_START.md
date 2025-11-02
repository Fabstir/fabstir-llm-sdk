# RAG Quick Start Guide

Get started with Retrieval-Augmented Generation (RAG) in the Fabstir SDK in under 5 minutes.

## What is RAG?

Retrieval-Augmented Generation (RAG) enhances LLM responses by retrieving relevant context from your documents before generating answers. This enables:

- **Accurate Answers**: Ground responses in your actual documents
- **Up-to-date Information**: No retraining needed - just upload new documents
- **Source Attribution**: Know which documents contributed to each answer
- **Data Sovereignty**: Your documents stay encrypted on decentralized storage

## Prerequisites

- Node.js 18+ or browser environment
- Fabstir SDK Core installed: `npm install @fabstir/sdk-core`
- Wallet with private key for authentication

## 5-Minute Quickstart

### Step 1: Initialize SDK with RAG Support

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { VectorRAGManager } from '@fabstir/sdk-core/managers';
import { DocumentManager } from '@fabstir/sdk-core/documents';
import { OpenAIAdapter } from '@fabstir/sdk-core/embeddings/adapters';

// Initialize SDK
const sdk = new FabstirSDKCore({
  mode: 'production',
  chainId: 84532, // Base Sepolia
  rpcUrl: process.env.RPC_URL,
  contractAddresses: {
    // ... your contract addresses
  }
});

// Authenticate
await sdk.authenticate('privatekey', { privateKey: yourPrivateKey });

// Get managers
const vectorRAGManager = sdk.getVectorRAGManager();
const sessionManager = await sdk.getSessionManager();
```

### Step 2: Create Your First Vector Database

```typescript
// Create a vector database for your documents
const sessionId = await vectorRAGManager.createSession('my-knowledge-base');

console.log('Vector database created:', sessionId);
```

### Step 3: Upload and Process Documents

```typescript
// Initialize embedding service (OpenAI for quick start)
const embeddingService = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-3-small',
  dimensions: 384
});

// Initialize document manager
const documentManager = new DocumentManager({
  embeddingService,
  vectorManager: vectorRAGManager,
  databaseName: 'my-knowledge-base'
});

// Upload a document
const file = new File(['Your document content here...'], 'document.txt');

const result = await documentManager.processDocument(file, {
  chunkSize: 500,
  overlap: 50,
  metadata: {
    category: 'tutorial',
    author: 'Your Name'
  },
  onProgress: (progress) => {
    console.log(`${progress.stage}: ${progress.progress}%`);
  }
});

console.log(`Document processed: ${result.chunks} chunks, ${result.vectorsStored} vectors stored`);
```

### Step 4: Start a Chat Session with RAG

```typescript
// Configure SessionManager to use RAG
sessionManager.setVectorRAGManager(vectorRAGManager);
sessionManager.setEmbeddingService(embeddingService);

// Start LLM session with RAG enabled
const { sessionId: llmSessionId } = await sessionManager.startSession({
  hostUrl: 'http://your-host-url:8080',
  jobId: BigInt(123),
  modelName: 'llama-3',
  chainId: 84532,
  ragConfig: {
    enabled: true,
    databaseName: 'my-knowledge-base', // Use your vector DB
    topK: 5,
    threshold: 0.7
  }
});

console.log('LLM session started with RAG:', llmSessionId);
```

### Step 5: Send Prompts and Get RAG-Enhanced Responses

```typescript
// Send a question - RAG automatically injects relevant context
const response = await sessionManager.sendPrompt(
  llmSessionId,
  'What does the document say about X?'
);

console.log('Response:', response.content);

// Check RAG metrics
const session = sessionManager.getSession(llmSessionId);
console.log('RAG metrics:', session.ragMetrics);
// {
//   contextsRetrieved: 5,
//   avgSimilarityScore: 0.85,
//   retrievalTimeMs: 45,
//   tokensAdded: 234
// }
```

## What Just Happened?

1. **Document Processing**: Your document was chunked into 500-token segments with 50-token overlap
2. **Embedding Generation**: Each chunk was converted to a 384-dimensional vector using OpenAI
3. **Vector Storage**: Vectors were stored in decentralized S5 storage with encryption
4. **Context Retrieval**: When you sent a prompt, relevant chunks were retrieved via similarity search
5. **Prompt Augmentation**: Retrieved context was automatically injected into your prompt
6. **Enhanced Response**: The LLM generated a response grounded in your actual documents

## Key Concepts

### Vector Database
A specialized database that stores document embeddings (vectors) and enables fast similarity search. Each user can create multiple isolated databases.

### Embeddings
Numerical representations (vectors) of text that capture semantic meaning. Similar texts have similar vectors.

### Chunking
Breaking documents into smaller segments (chunks) that fit within LLM context windows while maintaining semantic coherence.

### Similarity Search
Finding the most relevant chunks by comparing vector similarity (cosine similarity) between your query and stored documents.

### Context Injection
Automatically adding relevant document chunks to your prompt before sending to the LLM.

## Next Steps

### Multiple Documents
```typescript
// Upload multiple documents
const files = [doc1.pdf, doc2.txt, doc3.md];

const batchResult = await documentManager.processBatch(files, {
  chunkSize: 500,
  overlap: 50,
  concurrency: 3
});

console.log(`Processed ${batchResult.successful} documents`);
```

### Multiple Vector Databases
```typescript
// Create databases for different topics
await vectorRAGManager.createSession('work-documents');
await vectorRAGManager.createSession('personal-notes');
await vectorRAGManager.createSession('research-papers');

// Query across multiple databases
const results = await vectorRAGManager.searchMultipleDatabases(
  ['work-documents', 'research-papers'],
  queryVector,
  { topK: 10, threshold: 0.7 }
);
```

### Folder Organization
```typescript
// Organize documents in virtual folders
await vectorRAGManager.addVector('my-knowledge-base', 'doc-1', vector, {
  content: 'Document content...',
  folderPath: '/tutorials/getting-started'
});

// Search within specific folder
const results = await vectorRAGManager.searchInFolder(
  'my-knowledge-base',
  '/tutorials',
  queryVector,
  5
);
```

### Conversation Memory
```typescript
// Enable conversation memory to maintain context across messages
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://your-host-url:8080',
  jobId: BigInt(123),
  modelName: 'llama-3',
  chainId: 84532,
  ragConfig: {
    enabled: true,
    databaseName: 'my-knowledge-base',
    conversationMemory: {
      enabled: true,
      maxMessages: 10,
      includeRecent: 5,
      similarityThreshold: 0.8
    }
  }
});
```

### Host-Side Embeddings (Zero Cost)
```typescript
// Use host-side embeddings instead of OpenAI (no API costs)
import { HostAdapter } from '@fabstir/sdk-core/embeddings/adapters';

const hostEmbedding = new HostAdapter({
  hostUrl: 'http://your-host-url:8080',
  model: 'all-MiniLM-L6-v2',
  dimensions: 384
});

const documentManager = new DocumentManager({
  embeddingService: hostEmbedding, // Zero-cost embeddings
  vectorManager: vectorRAGManager,
  databaseName: 'my-knowledge-base'
});
```

### Sharing Knowledge Bases
```typescript
// Share your vector database with another user
import { SharingManager } from '@fabstir/sdk-core/sharing';

const sharingManager = new SharingManager({
  permissionManager: sdk.getPermissionManager(),
  notificationHandler: (notification) => {
    console.log('Sharing notification:', notification);
  }
});

// Send invitation
const invitation = await sharingManager.createInvitation({
  databaseName: 'my-knowledge-base',
  recipientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  role: 'reader',
  expiresIn: 86400000 // 24 hours
});

console.log('Invitation code:', invitation.invitationCode);
```

## Common Patterns

### Pattern 1: Project-Specific Knowledge Base
Create separate databases for each project:
```typescript
const projectDB = await vectorRAGManager.createSession(`project-${projectId}`);
// Upload project-specific documents
// Query within project context only
```

### Pattern 2: Personal + Shared Knowledge
Combine your personal notes with shared team documents:
```typescript
const { sessionId } = await sessionManager.startSession({
  ragConfig: {
    enabled: true,
    databaseNames: ['my-personal-notes', 'team-shared-docs'],
    topK: 5
  }
});
```

### Pattern 3: Incremental Knowledge Building
Add documents progressively as you learn:
```typescript
// Day 1: Upload initial documents
await documentManager.processDocument(doc1);

// Day 7: Add more documents
await documentManager.processDocument(doc2);

// Your vector database grows over time
// No retraining needed!
```

## Cost Considerations

### Embedding Costs (Using External APIs)
- **OpenAI**: $0.02 per 1M tokens (~$0.02 per 250 documents)
- **Cohere**: $0.10 per 1M tokens (~$0.10 per 250 documents)

### Zero-Cost Alternative
Use host-side embeddings (all-MiniLM-L6-v2) for zero API costs:
```typescript
const hostAdapter = new HostAdapter({ hostUrl: 'http://...' });
```

### Storage Costs
- **S5 Storage**: Decentralized, user-controlled (minimal costs)
- **Vector Database**: In-memory during session, persisted to S5 (chunked storage for efficiency)

## Performance Expectations

- **Document Upload**: 1-2 seconds per document (depends on size and embedding service)
- **Vector Search**: <100ms with 100K vectors (with warm cache)
- **Context Retrieval**: 45-80ms typical latency
- **Memory Usage**: 64MB for 100K vectors (10x more efficient than traditional approaches)

## Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| "EmbeddingService not initialized" | Call `sessionManager.setEmbeddingService()` before starting session |
| "Vector database not found" | Ensure database name matches exactly (case-sensitive) |
| Search returns no results | Lower similarity threshold (try 0.5 instead of 0.7) |
| High embedding costs | Switch to host-side embeddings (HostAdapter) |
| Slow search performance | Check cache configuration, ensure vectors are indexed |

## Next Documentation

- **[API Reference](./RAG_API_REFERENCE.md)** - Complete API documentation
- **[Integration Guide](./RAG_INTEGRATION_GUIDE.md)** - Integrate RAG into existing apps
- **[Best Practices](./RAG_BEST_PRACTICES.md)** - Recommended patterns and optimizations
- **[Troubleshooting](./RAG_TROUBLESHOOTING.md)** - Common issues and solutions
- **[Security Guide](./RAG_SECURITY.md)** - Security and privacy considerations

## Getting Help

- GitHub Issues: https://github.com/Fabstir/fabstir-llm-sdk/issues
- Documentation: https://docs.fabstir.com
- Discord: https://discord.gg/fabstir

---

**Congratulations!** You've successfully set up RAG and created your first knowledge-enhanced LLM session. Your documents are now powering intelligent, grounded responses.
