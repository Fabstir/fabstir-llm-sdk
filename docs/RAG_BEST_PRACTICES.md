# RAG Best Practices

Recommended patterns and optimizations for production RAG systems.

## Document Management

### Chunking Strategy

**Recommended:** 500 tokens with 50-token overlap

```typescript
await documentManager.processDocument(file, {
  chunkSize: 500,   // Sweet spot for most LLMs
  overlap: 50       // Maintains context across chunks
});
```

**When to adjust:**
- **Larger chunks (800-1000)**: Long-form documents, academic papers
- **Smaller chunks (300-400)**: Code snippets, definitions, FAQs
- **More overlap (100+)**: Dense technical content

### Metadata Strategy

Store rich metadata for better filtering:

```typescript
await vectorRAGManager.addVector('docs', 'id-1', vector, {
  // Content
  content: 'Full text content...',
  title: 'Document Title',

  // Classification
  category: 'tutorial',
  subcategory: 'getting-started',
  tags: ['python', 'beginner', 'api'],

  // Temporal
  createdAt: Date.now(),
  lastModified: Date.now(),

  // Authorship
  author: 'John Doe',
  source: 'internal-wiki',

  // Organization
  folderPath: '/tutorials/python',

  // Custom
  priority: 'high',
  language: 'en'
});
```

**Benefits:**
- Filter by category/tags for precise retrieval
- Sort by recency for time-sensitive content
- Organize with folders for logical grouping

### Folder Organization

```
/
├── docs/
│   ├── getting-started/
│   ├── api-reference/
│   └── tutorials/
├── internal/
│   ├── policies/
│   └── procedures/
└── research/
    ├── papers/
    └── notes/
```

Use folders to partition large knowledge bases and enable scoped search.

## Embedding Optimization

### Choose the Right Adapter

**Development/Testing:**
```typescript
const embeddingService = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-3-small',
  dimensions: 384
});
```

**Production:**
```typescript
const embeddingService = new HostAdapter({
  hostUrl: 'http://your-host:8080',
  model: 'all-MiniLM-L6-v2',
  dimensions: 384
});
// Zero cost, 9x faster than target (11ms vs 100ms)
```

### Batch Operations

Process multiple documents efficiently:

```typescript
// ✅ GOOD - Batch processing
const result = await documentManager.processBatch(files, {
  concurrency: 3,  // Parallel processing
  continueOnError: true
});

// ❌ BAD - Sequential processing
for (const file of files) {
  await documentManager.processDocument(file);
}
```

### Caching

Let SDK handle caching automatically - embedding cache reduces API costs by >80%:

```typescript
// SDK automatically caches embeddings
// No configuration needed!
```

## Search Optimization

### topK and Threshold

**Recommended defaults:**
- `topK: 5` - Good balance of context and performance
- `threshold: 0.7` - Filters low-relevance results

**Adjust based on use case:**

| Use Case | topK | Threshold | Rationale |
|----------|------|-----------|-----------|
| Precise answers | 3 | 0.8 | Quality over quantity |
| Exploratory search | 10 | 0.6 | Broader context |
| Fallback mode | 10 | 0.0 | Never return empty |

### Metadata Filtering

Combine vector search with metadata filters:

```typescript
const results = await vectorRAGManager.search('docs', queryVector, 5, {
  threshold: 0.7,
  filter: {
    $and: [
      { category: 'tutorial' },
      { $gte: { createdAt: Date.now() - 86400000 * 30 } }, // Last 30 days
      { $in: { tags: ['python', 'api'] } }
    ]
  }
});
```

### Multi-Database Search

Query across multiple databases for broader context:

```typescript
const results = await vectorRAGManager.searchMultipleDatabases(
  ['user-docs', 'shared-docs', 'public-wiki'],
  queryVector,
  { topK: 10, threshold: 0.7 }
);
```

## Performance Optimization

### Lazy Loading

Don't create databases until needed:

```typescript
// ✅ GOOD - Lazy creation
async function ensureDatabase(name: string) {
  if (!vectorRAGManager.getDatabaseMetadata(name)) {
    await vectorRAGManager.createSession(name);
  }
  return name;
}

// ❌ BAD - Eager creation
await vectorRAGManager.createSession('user-docs');
await vectorRAGManager.createSession('project-docs');
await vectorRAGManager.createSession('archive-docs');
```

### Resource Cleanup

Always clean up when done:

```typescript
// Close sessions when no longer needed
await vectorRAGManager.destroySession('temp-db');

// Close LLM sessions
await sessionManager.endSession(sessionId);
```

### Database Size Management

Monitor database size and prune when necessary:

```typescript
const stats = vectorRAGManager.getDatabaseStats('docs');

if (stats.vectorCount > 100000) {
  // Consider archiving old documents
  const oldDocs = await vectorRAGManager.searchVectors(
    'docs',
    queryVector,
    1000,
    {
      filter: {
        $lt: { lastAccessedAt: Date.now() - 86400000 * 365 }
      }
    }
  );

  // Move to archive database
  for (const doc of oldDocs) {
    await vectorRAGManager.addVector('archive', doc.id, doc.vector, doc.metadata);
    await vectorRAGManager.deleteVector('docs', doc.id);
  }
}
```

## RAG Configuration

### Session Configuration

```typescript
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://host:8080',
  jobId: BigInt(123),
  modelName: 'llama-3',
  chainId: 84532,
  ragConfig: {
    enabled: true,
    databaseName: 'docs',
    topK: 5,
    threshold: 0.7,
    conversationMemory: {
      enabled: true,
      maxMessages: 10,
      includeRecent: 5,
      similarityThreshold: 0.8
    }
  }
});
```

### Conversation Memory

Enable for multi-turn conversations:

```typescript
conversationMemory: {
  enabled: true,
  maxMessages: 10,        // Max messages to store
  includeRecent: 5,       // Always include N most recent
  similarityThreshold: 0.8 // Threshold for historical retrieval
}
```

Benefits:
- Maintains context across multiple exchanges
- Retrieves relevant historical messages
- Prevents context loss in long conversations

## Security Best Practices

### Permission Management

Use least-privilege principle:

```typescript
// ✅ GOOD - Grant minimum needed permissions
permissionManager.grant('docs', '0x123...', 'reader');

// ❌ BAD - Over-permissioning
permissionManager.grant('docs', '0x123...', 'writer');
```

### Sensitive Data

Never store sensitive data in metadata:

```typescript
// ❌ BAD - Exposing sensitive data
await vectorRAGManager.addVector('docs', 'id', vector, {
  content: 'Document text...',
  password: 'secret123',        // NEVER
  apiKey: 'sk-...',             // NEVER
  privateKey: '0x...'           // NEVER
});

// ✅ GOOD - Safe metadata
await vectorRAGManager.addVector('docs', 'id', vector, {
  content: 'Document text...',
  category: 'api-docs',
  hasCredentials: true  // Flag, not actual credentials
});
```

### Audit Logging

Track all permission changes:

```typescript
const permissionManager = new PermissionManager(userAddress, {
  auditLogger: true  // Automatically logs all grant/revoke operations
});

// Access audit logs
const logs = permissionManager.getAuditLogs('docs');
```

## Cost Optimization

### Use Host-Side Embeddings

```typescript
// Zero cost vs $0.02 per 250 documents (OpenAI)
const adapter = new HostAdapter({ hostUrl: 'http://...' });
```

### Batch Processing

Reduces overhead and improves throughput:

```typescript
const result = await documentManager.processBatch(files, {
  concurrency: 3  // Optimal for most scenarios
});
```

### Estimate Costs

Always estimate before processing large batches:

```typescript
const estimate = await documentManager.estimateCost(largePdf);

if (estimate.estimatedCost > 1.00) {
  if (!confirm(`Cost: $${estimate.estimatedCost.toFixed(2)}. Continue?`)) {
    return;
  }
}

await documentManager.processDocument(largePdf);
```

## Error Handling

### Graceful Degradation

```typescript
try {
  const results = await vectorRAGManager.search('docs', queryVector, 5);
  if (results.length === 0) {
    // Fallback: Lower threshold
    results = await vectorRAGManager.search('docs', queryVector, 5, {
      threshold: 0.5
    });
  }
} catch (error) {
  console.error('Search failed, proceeding without RAG', error);
  // Continue without RAG context
}
```

### Rate Limiting

Handle embedding API rate limits:

```typescript
const adapter = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  retryDelay: 1000  // Exponential backoff
});
```

## Testing

### Unit Tests

Test RAG components independently:

```typescript
describe('RAG Integration', () => {
  it('should retrieve relevant context', async () => {
    // Setup test database
    await vectorRAGManager.createSession('test-db');
    await vectorRAGManager.addVector('test-db', 'doc-1', testVector, {
      content: 'Test content'
    });

    // Test retrieval
    const results = await vectorRAGManager.search('test-db', queryVector, 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].metadata.content).toContain('Test');
  });
});
```

### Integration Tests

Test complete RAG workflows:

```typescript
it('should enhance LLM responses with RAG', async () => {
  // Upload document
  await documentManager.processDocument(testFile);

  // Start RAG session
  const { sessionId } = await sessionManager.startSession({
    ragConfig: { enabled: true, databaseName: 'docs', topK: 5 }
  });

  // Send prompt
  const response = await sessionManager.sendPrompt(sessionId, 'test query');

  // Verify RAG was used
  const session = sessionManager.getSession(sessionId);
  expect(session.ragMetrics.contextsRetrieved).toBeGreaterThan(0);
});
```

## Monitoring

### Track RAG Metrics

```typescript
const session = sessionManager.getSession(sessionId);

console.log('RAG Performance:', {
  contextsRetrieved: session.ragMetrics.contextsRetrieved,
  avgSimilarity: session.ragMetrics.avgSimilarityScore,
  retrievalTime: session.ragMetrics.retrievalTimeMs,
  tokensAdded: session.ragMetrics.tokensAdded
});
```

### Alert on Anomalies

```typescript
if (session.ragMetrics.retrievalTimeMs > 500) {
  console.warn('Slow RAG retrieval:', session.ragMetrics.retrievalTimeMs, 'ms');
}

if (session.ragMetrics.avgSimilarityScore < 0.5) {
  console.warn('Low similarity scores, consider adjusting threshold');
}
```

## Scalability

### Horizontal Scaling

Multiple databases per user/project:

```typescript
const userDb = `user-${userId}`;
const projectDb = `project-${projectId}`;

// Query both
const results = await vectorRAGManager.searchMultipleDatabases(
  [userDb, projectDb],
  queryVector,
  { topK: 10 }
);
```

### Database Partitioning

Split large databases by time/category:

```
user-docs-2024
user-docs-2023
user-docs-archive
```

### Caching Strategy

SDK handles caching automatically, but you can optimize access patterns:

```typescript
// Frequently accessed databases stay in cache
const commonDbs = ['faq', 'getting-started', 'api-reference'];

// Prime cache
for (const db of commonDbs) {
  await vectorRAGManager.search(db, dummyVector, 1);
}
```

## Next Documentation

- **[Troubleshooting Guide](./RAG_TROUBLESHOOTING.md)** - Common issues and solutions
- **[Security Guide](./RAG_SECURITY.md)** - Security considerations
- **[API Reference](./RAG_API_REFERENCE.md)** - Complete API documentation
