# RAG Security Guide

Security and privacy considerations for production RAG systems.

## Overview

Fabstir RAG system implements multiple layers of security:

1. **End-to-End Encryption**: All data encrypted in transit and at rest
2. **Decentralized Storage**: User data stored on S5, not central servers
3. **Access Control**: Owner/reader/writer permissions with audit logging
4. **Data Sovereignty**: Users control their own data
5. **No Third-Party Dependencies**: Optional host-side embeddings eliminate external API calls

## Data Encryption

### At Rest

All vector databases and documents are encrypted before storage on S5:

```typescript
// Encryption is automatic - no configuration needed
const sessionId = await vectorRAGManager.createSession('my-docs');

// All data stored to S5 is encrypted with user's keys
await vectorRAGManager.addVector('my-docs', 'doc-1', vector, metadata);
```

**Encryption Details:**
- Algorithm: XCha Cha20-Poly1305 AEAD
- Key Derivation: HKDF-SHA256 from wallet signature
- Per-User Keys: Each user has unique encryption keys
- Zero-Knowledge: Fabstir cannot decrypt user data

### In Transit

All network communications are encrypted:

```typescript
// WebSocket connections use end-to-end encryption (Phase 6.2)
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://host:8080',
  encryption: true  // Default, explicitly shown here
});
```

**Transport Security:**
- WebSocket encryption enabled by default
- LLM inference requests/responses encrypted
- RAG context encrypted during transmission
- Host cannot read plaintext prompts/responses

## Access Control

### Permission Levels

Three permission levels with escalating access:

| Role | Read | Write | Delete | Manage Permissions |
|------|------|-------|--------|-------------------|
| Reader | ✓ | ✗ | ✗ | ✗ |
| Writer | ✓ | ✓ | ✓ | ✗ |
| Owner | ✓ | ✓ | ✓ | ✓ |

### Granting Permissions

```typescript
import { PermissionManager } from '@fabstir/sdk-core/permissions';

const permissionManager = new PermissionManager(ownerAddress);

// Grant read-only access
permissionManager.grant('docs', readerAddress, 'reader');

// Grant write access
permissionManager.grant('docs', writerAddress, 'writer');
```

**Best Practices:**
- ✅ Grant minimum permissions needed (reader vs writer)
- ✅ Revoke permissions when no longer needed
- ✅ Audit permission changes regularly
- ❌ Never grant writer access unnecessarily

### Checking Permissions

```typescript
// Check before sensitive operations
const hasPermission = permissionManager.check('docs', 'write', userAddress);

if (!hasPermission) {
  throw new Error('Permission denied');
}

// Or let SDK check automatically
await vectorRAGManager.addVector('docs', 'id', vector, metadata);
// SDK checks write permission before adding
```

### Audit Logging

All permission changes are logged automatically:

```typescript
const permissionManager = new PermissionManager(ownerAddress, {
  auditLogger: true
});

// All grant/revoke operations are logged
permissionManager.grant('docs', userAddress, 'reader');

// Retrieve audit log
const logs = permissionManager.getAuditLogs('docs');

logs.forEach(log => {
  console.log(log.timestamp, log.action, log.userAddress, log.role);
});
```

## Secure Sharing

### Invitation-Based Sharing

```typescript
import { SharingManager } from '@fabstir/sdk-core/sharing';

const sharingManager = new SharingManager({
  permissionManager: sdk.getPermissionManager()
});

// Create time-limited invitation
const invitation = await sharingManager.createInvitation({
  databaseName: 'docs',
  recipientAddress: '0x123...',
  role: 'reader',
  expiresIn: 86400000  // 24 hours
});

// Share invitation code securely
console.log('Invitation code:', invitation.invitationCode);
```

**Security Features:**
- Time-limited invitations (expire automatically)
- Specific recipient address (not open invitations)
- One-time use codes
- Revocable at any time

### Access Tokens

For programmatic access with additional controls:

```typescript
const token = await sharingManager.generateAccessToken({
  databaseName: 'docs',
  role: 'reader',
  expiresIn: 3600000,   // 1 hour
  usageLimit: 100       // Max 100 uses
});

// Token automatically expires or after 100 uses
```

### Revocation

```typescript
// Revoke invitation
await sharingManager.revokeInvitation(invitationId);

// Revoke permission (blocks all access)
permissionManager.revoke('docs', userAddress);

// Revocation is immediate
```

## Data Privacy

### Metadata Privacy

Metadata is encrypted but searchable. Avoid sensitive data in metadata:

```typescript
// ❌ BAD - Exposing sensitive data
await vectorRAGManager.addVector('docs', 'id', vector, {
  content: 'Document text...',
  password: 'secret123',      // NEVER
  creditCard: '4111...',      // NEVER
  ssn: '123-45-6789',         // NEVER
  apiKey: 'sk-...'            // NEVER
});

// ✅ GOOD - Safe metadata
await vectorRAGManager.addVector('docs', 'id', vector, {
  content: 'Document text...',
  category: 'financial-docs',
  encrypted: true,              // Flag, not data
  requiresAuth: true
});
```

### PII Handling

If storing personally identifiable information:

```typescript
// Option 1: Encrypt PII before storing
import { encrypt } from '@your-crypto-lib';

const encryptedEmail = encrypt(userEmail, encryptionKey);

await vectorRAGManager.addVector('docs', 'id', vector, {
  content: 'User data...',
  email: encryptedEmail  // Encrypted
});

// Option 2: Store PII separately, use references
await vectorRAGManager.addVector('docs', 'id', vector, {
  content: 'User data...',
  userId: 'user-123'  // Reference, not PII
});
```

### Document Deletion

Ensure complete deletion of sensitive documents:

```typescript
// Delete single document
await documentManager.deleteDocument(documentId);

// Delete all vectors matching criteria
const result = await vectorRAGManager.deleteByMetadata('docs', {
  category: 'sensitive',
  $lt: { expiresAt: Date.now() }
});

console.log(`Deleted ${result.deletedCount} sensitive documents`);

// Run vacuum to free storage
await vectorRAGManager.vacuum('docs');
```

## Embedding Security

### Host-Side Embeddings (Recommended)

Use HostAdapter to avoid sending data to third-party APIs:

```typescript
const adapter = new HostAdapter({
  hostUrl: 'http://your-host:8080',
  model: 'all-MiniLM-L6-v2'
});

// Documents never leave your infrastructure
await documentManager.processDocument(file, { embeddingService: adapter });
```

**Benefits:**
- Zero third-party data exposure
- GDPR compliant
- Zero API costs
- Full control over data processing

### External API Security

If using external embedding APIs:

```typescript
const adapter = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 30000
});

// ⚠️ Data sent to OpenAI servers
// Review OpenAI data processing agreement
// Consider GDPR implications
```

**Mitigations:**
- Use OpenAI's zero data retention mode (if available)
- Hash/anonymize sensitive data before embedding
- Use host-side embeddings for sensitive documents

## Network Security

### RPC Endpoint Security

```typescript
// Use authenticated RPC endpoint
const sdk = new FabstirSDKCore({
  rpcUrl: `https://base-sepolia.infura.io/v3/${process.env.INFURA_KEY}`,
  // Don't expose API keys in client code
});
```

### WebSocket Security

```typescript
// Default: Encrypted WebSocket connections
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'https://secure-host:8080',  // Use HTTPS
  encryption: true  // End-to-end encryption
});
```

## Smart Contract Security

### Private Key Management

```typescript
// ✅ GOOD - Environment variables
await sdk.authenticate('privatekey', {
  privateKey: process.env.PRIVATE_KEY
});

// ❌ BAD - Hardcoded keys
await sdk.authenticate('privatekey', {
  privateKey: '0x123...'  // NEVER hardcode!
});
```

**Best Practices:**
- Store private keys in environment variables
- Use hardware wallets for production
- Never commit keys to version control
- Rotate keys periodically

### Transaction Security

```typescript
// Always validate transaction parameters
const jobId = BigInt(userInput);

if (jobId < 0) {
  throw new Error('Invalid job ID');
}

await sessionManager.startSession({
  jobId,  // Validated
  // ...
});
```

## Compliance

### GDPR

RAG system is GDPR-compliant by design:

- ✅ Right to Access: Users control their own data
- ✅ Right to Deletion: `deleteDocument()`, `deleteByMetadata()`
- ✅ Right to Portability: Export from S5
- ✅ Data Minimization: Only store necessary data
- ✅ Encryption: End-to-end encryption at rest and in transit

### Data Retention

Implement retention policies:

```typescript
// Delete old documents automatically
async function enforceRetentionPolicy(databaseName: string, retentionDays: number) {
  const cutoffDate = Date.now() - (retentionDays * 86400000);

  const result = await vectorRAGManager.deleteByMetadata(databaseName, {
    $lt: { createdAt: cutoffDate }
  });

  console.log(`Deleted ${result.deletedCount} old documents`);
}

// Run daily
setInterval(() => enforceRetentionPolicy('docs', 365), 86400000);
```

## Security Checklist

### Development
- [ ] Use environment variables for secrets
- [ ] Enable encryption for all sessions
- [ ] Validate all user inputs
- [ ] Use host-side embeddings for sensitive data
- [ ] Implement permission checks
- [ ] Enable audit logging

### Production
- [ ] Use HTTPS/WSS for all connections
- [ ] Rotate API keys regularly
- [ ] Monitor permission changes
- [ ] Implement rate limiting
- [ ] Set up data retention policies
- [ ] Regular security audits
- [ ] Backup encryption keys

### Operations
- [ ] Monitor access logs
- [ ] Review audit logs regularly
- [ ] Respond to security incidents promptly
- [ ] Keep SDK updated
- [ ] Test disaster recovery procedures

## Incident Response

### Data Breach Response

1. **Identify Scope**
   ```typescript
   // Check affected databases
   const databases = vectorRAGManager.listDatabases();

   // Review audit logs
   const logs = permissionManager.getAuditLogs('affected-db');
   ```

2. **Revoke Access**
   ```typescript
   // Revoke all permissions
   const permissions = permissionManager.listPermissions('affected-db');

   for (const perm of permissions) {
     permissionManager.revoke('affected-db', perm.userAddress);
   }
   ```

3. **Rotate Keys**
   ```typescript
   // Generate new encryption keys
   // Re-encrypt all data
   // Update access controls
   ```

4. **Notify Users**
   - Inform affected users
   - Document incident
   - Implement preventive measures

## Security Updates

Stay updated on security patches:

- Monitor SDK releases: https://github.com/Fabstir/fabstir-llm-sdk/releases
- Subscribe to security advisories
- Test updates in staging before production
- Keep dependencies updated

## Contact

For security concerns:
- Email: security@fabstir.com
- GitHub: https://github.com/Fabstir/fabstir-llm-sdk/security
- Responsible disclosure policy: https://fabstir.com/security
