# Encryption FAQ

## General Questions

### Is encryption enabled by default?

**Yes**. As of Phase 6.2, all sessions use end-to-end encryption by default. You don't need to configure anything.

```typescript
// This is encrypted automatically
await sessionManager.startSession({
  hostUrl: hostUrl,
  jobId: jobId,
  modelName: 'llama-3',
  chainId: ChainId.BASE_SEPOLIA
});
```

### Can I disable encryption?

**Yes, but not recommended**. You can opt-out by setting `encryption: false`:

```typescript
await sessionManager.startSession({
  hostUrl: hostUrl,
  jobId: jobId,
  modelName: 'llama-3',
  chainId: ChainId.BASE_SEPOLIA,
  encryption: false  // Only for debugging/testing
});
```

**Use cases for disabling encryption**:
- Debugging network issues
- Testing with legacy hosts that don't support encryption
- Performance benchmarking

**Not recommended for**: Production use, sensitive data, or user-facing applications.

### What is encrypted?

**Encrypted (End-to-End)**:
- ✅ WebSocket session initialization messages
- ✅ Streaming LLM inference messages (prompts and responses)
- ✅ Stored conversation history on S5 decentralized storage
- ✅ Session configuration (model name, parameters, pricing)

**Not Encrypted (Public by Design)**:
- ❌ Blockchain transactions (job creation, payments, checkpoints)
- ❌ Host discovery metadata (necessary for marketplace functionality)
- ❌ Payment amounts and token usage counts
- ❌ Contract events and logs

### What is NOT encrypted?

Blockchain data is **intentionally public** for:
- **Transparency**: Verifiable payments and compute usage
- **Auditability**: Anyone can verify host honesty
- **Dispute Resolution**: On-chain proof of work and payment

If you need privacy for payment amounts:
- Consider using privacy-preserving payment protocols (future feature)
- Use multiple smaller transactions instead of large ones
- Remember: Message content is always encrypted, only payment metadata is public

## Technical Questions

### What cryptographic algorithms are used?

- **Key Exchange**: Ephemeral-static ECDH (Elliptic Curve Diffie-Hellman) on secp256k1
- **Symmetric Encryption**: XChaCha20-Poly1305 AEAD
- **Digital Signatures**: ECDSA secp256k1 (same as Ethereum)
- **Key Derivation**: HKDF-SHA256
- **Libraries**: [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1), [@noble/ciphers](https://github.com/paulmillr/noble-ciphers)

All libraries are:
- ✅ Audited by independent security researchers
- ✅ Used by major crypto projects (Ethereum, Bitcoin)
- ✅ Actively maintained

### How are encryption keys managed?

**Client Keys**:
- Derived from your wallet's private key
- Generated deterministically by signing a message
- Have the same security as your Ethereum wallet

**Host Keys**:
- Registered on-chain in NodeRegistry contract
- Retrieved automatically by the SDK
- Verified through blockchain data

**Session Keys**:
- Generated fresh for each session (random 32 bytes)
- Stored in memory only (never persisted)
- Discarded when session ends

### Does encryption provide forward secrecy?

**Yes**. Each session uses a fresh ephemeral key that is discarded after use.

**What this means**:
- If your wallet key is compromised **today**, attackers **cannot** decrypt past sessions
- Each session is cryptographically independent
- Past conversations remain secure even if long-term keys leak

**How it works**:
```
Session 1: ephemeral_key_1 → used → discarded ✓
Session 2: ephemeral_key_2 → used → discarded ✓
Session 3: ephemeral_key_3 → used → discarded ✓
```

Even if an attacker gets your wallet key, they can't recover `ephemeral_key_1`, so Session 1 remains secure.

### How is sender authentication handled?

Every encrypted payload includes an **ECDSA signature** that:

1. **Proves sender identity** via address recovery
2. **Cannot be forged** without the private key
3. **Enables authorization** (hosts can verify client is approved)

**Example**:
```typescript
// Client sends encrypted message with signature
const encrypted = await encryptionManager.encryptSessionInit(hostPubKey, payload);
// encrypted = { ciphertext, signature, ephemeral_public_key }

// Host decrypts and recovers sender address
const { data, senderAddress } = await encryptionManager.decryptSessionInit(encrypted);

// Host verifies: Is senderAddress an approved client?
const isApproved = await clientManager.isApprovedClient(senderAddress);
```

### Are messages protected against replay attacks?

**Yes**. Each message includes:

- **Message index**: Prevents replaying the same message twice
- **Timestamp**: Prevents old messages from being injected
- **Session ID**: Prevents messages from being replayed in different sessions

**How it works**:
```typescript
// AAD (Additional Authenticated Data) for each message
const aad = {
  message_index: 5,          // Sequential index
  timestamp: 1704067200000,  // Unix timestamp
  session_id: 'sess-123'     // Unique session ID
};

// This AAD is authenticated by Poly1305 MAC
// Tampering with any field causes decryption to fail
```

## Performance Questions

### What is the performance impact of encryption?

**Negligible** for typical use cases:

| Operation | Overhead | Notes |
|-----------|----------|-------|
| Session initialization | ~10ms | One-time per session |
| Message encryption | <1ms | Per message (symmetric) |
| Message decryption | <1ms | Per message (symmetric) |
| Storage encryption | ~50ms | Per 10KB conversation |
| Storage decryption | ~50ms | Per 10KB conversation |

**Comparison**:
- Network latency: 50-200ms (much higher than encryption)
- LLM inference: 1-10 seconds (1000x higher than encryption)

**Conclusion**: Encryption overhead is insignificant compared to other factors.

### Does encryption affect streaming speed?

**No**. Message encryption/decryption takes <1ms, which is far less than:
- Network round-trip time (50-200ms)
- Token generation time (50-200ms per token)
- WebSocket frame overhead (5-10ms)

You won't notice any difference in streaming speed with encryption enabled.

### Should I disable encryption for better performance?

**No**. The performance gain from disabling encryption is unmeasurable in practice.

**Realistic scenario**:
```
Network latency:     100ms
LLM inference:      2000ms
Token streaming:     500ms
Encryption:           <1ms  ← Negligible
────────────────────────────
Total:              2601ms vs 2600ms (0.04% difference)
```

**Recommendation**: Always keep encryption enabled. The security benefits far outweigh the minimal performance cost.

## Usage Questions

### How do I verify encryption is working?

**Method 1: Check Session State**
```typescript
const session = sessionManager.getSession(sessionId.toString());
console.log('Encryption enabled:', session?.encryption);
// Should print: true
```

**Method 2: Inspect Network Traffic**
```typescript
// In browser DevTools → Network → WS (WebSocket)
// Encrypted messages look like:
{
  "type": "encrypted_message",
  "ciphertextHex": "a3f2b8c1...",  // Base64-encoded ciphertext
  "nonceHex": "d4e5f6a7...",
  "aadHex": "b8c9d0e1..."
}

// Plaintext messages look like:
{
  "type": "prompt",
  "prompt": "What is 2+2?"  // Readable text (not encrypted)
}
```

**Method 3: Check WebSocket Message Types**
```typescript
// Encrypted sessions use:
- 'encrypted_session_init' (initialization)
- 'encrypted_message' (prompts)
- 'encrypted_chunk' (streaming responses)
- 'encrypted_response' (full responses)

// Plaintext sessions use:
- 'session_init' (initialization)
- 'prompt' (prompts)
- 'stream_chunk' (streaming responses)
- 'response' (full responses)
```

### What if the host doesn't support encryption?

**Current Status**: All production hosts (v7-multi-chain and later) support encryption.

**If you encounter an older host**:
1. **Recommended**: Ask the host operator to upgrade to v7-multi-chain
2. **Temporary**: Disable encryption for that specific session:
   ```typescript
   await sessionManager.startSession({
     hostUrl: oldHostUrl,
     jobId: jobId,
     modelName: 'llama-3',
     chainId: ChainId.BASE_SEPOLIA,
     encryption: false  // Temporary workaround
   });
   ```
3. **Long-term**: Switch to a host that supports encryption

**Checking host capabilities**:
```typescript
const hostInfo = await hostManager.getHostInfo(hostAddress);
// Check host metadata for encryption support indicators
```

### Can different hosts decrypt each other's conversations?

**No**. Each host has a unique public/private key pair.

**Why**:
- Conversations are encrypted with **Host A's public key**
- Only **Host A's private key** can decrypt them
- Host B has a different key pair and **cannot** decrypt Host A's conversations

**Example**:
```typescript
// Encrypt conversation for Host A
const encryptedForHostA = await encryptionManager.encryptForStorage(
  hostA_publicKey,
  conversation
);

// Host A can decrypt (has private key)
const decrypted = await hostA_encryptionManager.decryptFromStorage(encryptedForHostA);
// ✅ Success

// Host B cannot decrypt (wrong key)
await hostB_encryptionManager.decryptFromStorage(encryptedForHostA);
// ❌ Error: Decryption failed
```

### How do I save encrypted conversations?

**Automatically handled by the SDK**:

```typescript
// Get conversation from session
const conversation = await sessionManager.getSessionHistory(sessionId);

// Save with encryption (automatic if host public key provided)
const cid = await sdk.saveConversation(conversation, {
  hostPubKey: await sdk.getHostPublicKey(hostAddress)
});

// Load encrypted conversation
const loaded = await sdk.loadConversation(cid);
// Returns decrypted conversation + sender address for verification
```

**Manual control** (advanced):
```typescript
const storageManager = await sdk.getStorageManager();

// Explicit encryption
await storageManager.saveConversation(conversation, {
  encryption: true,
  hostPubKey: hostPublicKey
});

// Explicit plaintext (not recommended)
await storageManager.saveConversation(conversation, {
  encryption: false
});
```

### Can I encrypt conversations for multiple hosts?

**Yes**, but you need to store separate copies:

```typescript
// Encrypt for Host A
const cidA = await sdk.saveConversation(conversation, {
  hostPubKey: hostA_publicKey
});

// Encrypt for Host B (different key)
const cidB = await sdk.saveConversation(conversation, {
  hostPubKey: hostB_publicKey
});

// Now both Host A and Host B can decrypt their respective copies
```

**Use case**: Migrating conversations between hosts while maintaining encryption.

## Troubleshooting

### "EncryptionManager not available"

**Cause**: SDK not authenticated.

**Solution**:
```typescript
// Always authenticate before starting sessions
await sdk.authenticate('privatekey', { privateKey: yourPrivateKey });
```

### "Cannot retrieve host public key"

**Possible causes**:
1. Host not registered on-chain
2. Network connectivity issues
3. Host metadata incomplete

**Solutions**:
```typescript
// Verify host is registered
const hostInfo = await hostManager.getHostInfo(hostAddress);
console.log('Host registered:', hostInfo.stake > 0);

// Try with explicit API URL
const hostPubKey = await sdk.getHostPublicKey(hostAddress, 'http://host-api-url:8080');

// Check network connectivity
const chainRegistry = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
console.log('RPC URL:', chainRegistry.rpcUrls[0]);
```

### "Decryption failed"

**Possible causes**:
1. Wrong encryption key (key mismatch)
2. Corrupted data during transmission
3. Man-in-the-middle attack (rare)

**Solutions**:
```typescript
// Verify host public key
const hostPubKey1 = await sdk.getHostPublicKey(hostAddress);
const hostPubKey2 = await sdk.getHostPublicKey(hostAddress);
console.log('Keys match:', hostPubKey1 === hostPubKey2);

// Retry session initialization
await sessionManager.endSession(sessionId);
const { sessionId: newSessionId } = await sessionManager.startSession({...});

// If persistent, contact host operator
```

### "Session key not available"

**Cause**: Trying to send messages before session initialization completed.

**Solution**:
```typescript
// Wait for startSession to complete
const { sessionId } = await sessionManager.startSession({...});

// Verify session is active
const session = sessionManager.getSession(sessionId.toString());
console.log('Session status:', session?.status); // Should be 'active'

// Now send messages
await sessionManager.sendPromptStreaming(sessionId, prompt);
```

## Security Questions

### Is the encryption audited?

**Cryptographic libraries**: Yes. We use [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1) and [@noble/ciphers](https://github.com/paulmillr/noble-ciphers), which are:
- ✅ Independently audited
- ✅ Used by major crypto projects (Ethereum wallets, DeFi protocols)
- ✅ Actively maintained by security experts

**SDK implementation**: Not yet audited. **Phase 6 includes comprehensive testing** but a formal security audit is planned post-MVP.

**Recommendation**: Suitable for general use, but avoid storing highly sensitive data until formal audit is complete.

### What happens if my wallet key is compromised?

**Impact**:
- ❌ Attacker can **start new sessions** as you
- ❌ Attacker can **decrypt conversations you save in the future**
- ✅ Attacker **cannot decrypt past sessions** (forward secrecy)
- ✅ Attacker **cannot decrypt conversations already stored** (if encryption keys were ephemeral)

**Mitigation**:
1. **Rotate your wallet immediately**
2. **Revoke active sessions** (if possible)
3. **Monitor on-chain activity** for unauthorized transactions
4. **Contact hosts** to report compromised address

### Can S5 storage providers read my conversations?

**No**. Conversations are encrypted before upload:

```
Your Device             S5 Storage
-----------             ----------
1. Serialize conversation
2. Encrypt with host's public key
3. Upload encrypted blob      →      Store encrypted data
                                     (Cannot decrypt - no private key)

4. Download encrypted blob    ←      Return encrypted data
5. Decrypt with host's private key
6. View conversation
```

S5 storage only sees **encrypted ciphertext**, not plaintext conversation data.

### Are there any known vulnerabilities?

**As of Phase 6.2**: No known vulnerabilities.

**Testing coverage**:
- ✅ 7/7 E2E integration tests passing
- ✅ All crypto primitives tested with known vectors
- ✅ Replay protection verified
- ✅ Multi-host isolation verified
- ✅ Sender authentication verified

**Future work**:
- 🎯 Formal security audit (post-MVP)
- 🎯 Fuzzing and penetration testing
- 🎯 Bug bounty program

### How do I report a security issue?

**Email**: security@fabstir.com

**Please include**:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested mitigation (if any)

**Do not disclose publicly** until the issue has been addressed.

## Additional Resources

- **Architecture Guide**: `docs/ENCRYPTION_GUIDE.md`
- **API Documentation**: `docs/SDK_API.md`
- **Implementation Plan**: `docs/IMPLEMENTATION-CRYPTO.md`
- **Test Coverage**: `packages/sdk-core/tests/integration/encryption-e2e.test.ts`
- **Noble Crypto Libraries**: https://github.com/paulmillr/noble-ciphers
