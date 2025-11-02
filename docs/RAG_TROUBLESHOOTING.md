# RAG Troubleshooting Guide

Common issues and solutions for RAG system problems.

## Setup Issues

### "EmbeddingService not initialized"

**Symptom:** Error when starting RAG session
**Cause:** SessionManager doesn't have embedding service configured

**Solution:**
```typescript
sessionManager.setEmbeddingService(embeddingService);
sessionManager.setVectorRAGManager(vectorRAGManager);
```

### "Database not found"

**Symptom:** Error when searching or adding vectors
**Cause:** Database name doesn't exist or typo

**Solution:**
```typescript
// Check database exists
const metadata = vectorRAGManager.getDatabaseMetadata('my-docs');
if (!metadata) {
  await vectorRAGManager.createSession('my-docs');
}
```

### "Dimension mismatch"

**Symptom:** Error adding vectors
**Cause:** Vector dimensions don't match database dimensions

**Solution:**
```typescript
// Ensure embedding service matches database dimensions
const adapter = new HostAdapter({
  dimensions: 384  // Must match database
});

// Check database dimensions
const stats = vectorRAGManager.getDatabaseStats('docs');
console.log('Database dimensions:', stats); // Check configuration
```

## Search Issues

### No Search Results

**Symptoms:**
- `results.length === 0`
- RAG not retrieving context

**Causes & Solutions:**

**1. Threshold Too High**
```typescript
// Try lower threshold
const results = await vectorRAGManager.search('docs', queryVector, 5, {
  threshold: 0.5  // Lower from 0.7
});
```

**2. Empty Database**
```typescript
const stats = vectorRAGManager.getDatabaseStats('docs');
console.log('Vector count:', stats.vectorCount);

if (stats.vectorCount === 0) {
  // Database is empty - upload documents first
}
```

**3. Wrong Database Name**
```typescript
// List all databases
const databases = vectorRAGManager.listDatabases();
console.log('Available databases:', databases.map(d => d.databaseName));
```

### Low Similarity Scores

**Symptom:** Search results have low scores (<0.6)

**Causes:**
1. Query doesn't match document content
2. Poor quality embeddings
3. Wrong embedding model

**Solutions:**
```typescript
// 1. Rephrase query to match document language
const query = 'API authentication';  // Instead of 'How to login'

// 2. Use same embedding model for query and documents
const adapter = new HostAdapter({
  model: 'all-MiniLM-L6-v2'  // Match document embedding model
});

// 3. Lower threshold to see more results
const results = await vectorRAGManager.search('docs', queryVector, 10, {
  threshold: 0.0  // Show all results
});
console.log('Similarity scores:', results.map(r => r.score));
```

## Performance Issues

### Slow Search (<100ms expected)

**Symptoms:**
- High `ragMetrics.retrievalTimeMs`
- UI lag during search

**Causes & Solutions:**

**1. Large Database**
```typescript
const stats = vectorRAGManager.getDatabaseStats('docs');

if (stats.vectorCount > 100000) {
  // Consider partitioning database
  // Split by time period or category
}
```

**2. Complex Metadata Filters**
```typescript
// ❌ BAD - Complex filter
{ $and: [{ $or: [...] }, { $or: [...] }, ...] }

// ✅ GOOD - Simpler filter
{ category: 'tutorial' }
```

**3. Cold Cache**
```typescript
// First search after session creation is slower
// Subsequent searches use cache (<50ms)

// Prime cache for important databases
await vectorRAGManager.search('common-db', dummyVector, 1);
```

### High Memory Usage

**Symptoms:**
- Browser/Node.js crashes
- Out of memory errors

**Causes & Solutions:**

**1. Too Many Open Sessions**
```typescript
// Close sessions when done
await vectorRAGManager.destroySession('temp-db');
await sessionManager.endSession(sessionId);
```

**2. Large Database in Memory**
```typescript
// SDK uses chunked storage (10K vectors per chunk)
// Memory usage should be ~64MB for 100K vectors

// If higher, check for session leaks
const sessions = vectorRAGManager.listSessions();
console.log('Active sessions:', sessions.length);
```

## Document Processing Issues

### Upload Failures

**Symptoms:**
- `processDocument()` throws error
- Documents not appearing in searches

**Causes & Solutions:**

**1. Unsupported File Format**
```typescript
// Supported: PDF, DOCX, TXT, MD, HTML

// Check file type
console.log('File type:', file.type);

// Convert unsupported formats to TXT first
```

**2. API Rate Limit (External Embeddings)**
```typescript
// Switch to HostAdapter (zero rate limits)
const adapter = new HostAdapter({
  hostUrl: 'http://...'
});

// Or add retry logic
const adapter = new OpenAIAdapter({
  maxRetries: 5,
  retryDelay: 2000
});
```

**3. Document Too Large**
```typescript
// Estimate cost/chunks first
const estimate = await documentManager.estimateCost(largeFile);

console.log('Estimated chunks:', estimate.estimatedChunks);

if (estimate.estimatedChunks > 1000) {
  // Split document or increase chunk size
  await documentManager.processDocument(largeFile, {
    chunkSize: 1000  // Larger chunks
  });
}
```

### Embedding Errors

**Symptoms:**
- "API key invalid"
- "Rate limit exceeded"
- "Timeout"

**Solutions:**

**API Key Issues:**
```typescript
// Verify API key is set
console.log('OpenAI key set:', !!process.env.OPENAI_API_KEY);

// Switch to HostAdapter (no API key needed)
const adapter = new HostAdapter({ hostUrl: 'http://...' });
```

**Rate Limits:**
```typescript
// Use batch processing with rate limiting
const adapter = new OpenAIAdapter({
  requestsPerMinute: 50,  // Stay under limit
  maxRetries: 3
});

// Or switch to HostAdapter (no limits)
```

**Timeouts:**
```typescript
const adapter = new OpenAIAdapter({
  timeout: 60000  // Increase to 60 seconds
});
```

## Permission Issues

### "Permission denied"

**Symptom:** Error when accessing database
**Cause:** User doesn't have required permission

**Solution:**
```typescript
// Check permissions
const permissions = permissionManager.listPermissions('docs');
console.log('Permissions:', permissions);

// Grant permission (as owner)
permissionManager.grant('docs', userAddress, 'reader');

// Verify
const hasPermission = permissionManager.check('docs', 'read', userAddress);
console.log('Has read permission:', hasPermission);
```

### Share Link Not Working

**Symptoms:**
- Invitation code invalid
- Access denied after accepting

**Solutions:**

**1. Invitation Expired**
```typescript
// Check invitation status
const invitation = sharingManager.getInvitation(invitationCode);

if (invitation.expiresAt < Date.now()) {
  console.error('Invitation expired');
  // Create new invitation
}
```

**2. Wrong User Address**
```typescript
// Verify recipient address matches current user
const userAddress = await authManager.getUserAddress();
console.log('Current user:', userAddress);
console.log('Invitation for:', invitation.recipientAddress);
```

## RAG Integration Issues

### RAG Not Injecting Context

**Symptoms:**
- LLM responses don't reflect documents
- `ragMetrics.contextsRetrieved === 0`

**Causes & Solutions:**

**1. RAG Not Enabled**
```typescript
// Verify RAG config
const session = sessionManager.getSession(sessionId);
console.log('RAG enabled:', session.ragConfig?.enabled);

// Enable RAG
const { sessionId } = await sessionManager.startSession({
  ragConfig: {
    enabled: true,  // Must be true!
    databaseName: 'docs',
    topK: 5
  }
});
```

**2. Database Empty**
```typescript
const stats = vectorRAGManager.getDatabaseStats('docs');

if (stats.vectorCount === 0) {
  // Upload documents first
  await documentManager.processDocument(file);
}
```

**3. No Matching Context**
```typescript
// Check if any documents match query
const embedding = await embeddingService.embed('test query');
const results = await vectorRAGManager.search('docs', embedding, 5, {
  threshold: 0.0  // Show all results
});

console.log('Matching documents:', results.length);
```

### Context Not Relevant

**Symptom:** Retrieved context doesn't help answer question

**Solutions:**

**1. Adjust Threshold**
```typescript
ragConfig: {
  threshold: 0.75  // Higher threshold = more relevant
}
```

**2. Increase topK**
```typescript
ragConfig: {
  topK: 10  // Retrieve more context
}
```

**3. Use Metadata Filtering**
```typescript
const results = await vectorRAGManager.search('docs', queryVector, 5, {
  filter: {
    category: 'api-reference'  // Narrow to specific category
  }
});
```

## Debugging Tips

### Enable Verbose Logging

```typescript
// Check RAG metrics
const session = sessionManager.getSession(sessionId);
console.log('RAG Metrics:', session.ragMetrics);

// Check search results
const results = await vectorRAGManager.search('docs', queryVector, 5, {
  threshold: 0.0,
  includeVectors: true  // See full vectors
});

console.log('Results:', results);
```

### Inspect Database State

```typescript
// List all databases
const databases = vectorRAGManager.listDatabases();
console.log('Databases:', databases);

// Check specific database
const metadata = vectorRAGManager.getDatabaseMetadata('docs');
const stats = vectorRAGManager.getDatabaseStats('docs');

console.log('Metadata:', metadata);
console.log('Stats:', stats);

// List folders
const folders = vectorRAGManager.listFolders('docs');
console.log('Folders:', folders);
```

### Test Embeddings

```typescript
// Verify embedding service works
const testEmbedding = await embeddingService.embed('test text');

console.log('Embedding dimensions:', testEmbedding.length);
console.log('Sample values:', testEmbedding.slice(0, 5));

// Should be 384 dimensions with values between -1 and 1
```

## Getting Help

If issues persist:

1. Check GitHub Issues: https://github.com/Fabstir/fabstir-llm-sdk/issues
2. Review logs for error messages
3. Create minimal reproduction case
4. Report issue with:
   - SDK version
   - Error message
   - Code snippet
   - Expected vs actual behavior

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `DatabaseNotFoundError` | Database doesn't exist | Create database first |
| `DimensionMismatchError` | Vector dimensions wrong | Match embedding service dimensions |
| `PermissionDeniedError` | No permission | Grant permission to user |
| `RateLimitError` | API rate limit hit | Use HostAdapter or reduce rate |
| `ValidationError` | Invalid input | Check parameter types/values |
| `StorageError` | S5 storage failed | Check network/retry |
