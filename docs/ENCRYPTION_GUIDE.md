# End-to-End Encryption Guide

## Overview

The Fabstir LLM SDK provides **end-to-end encryption by default** for all LLM sessions using modern cryptographic primitives. This ensures that:

- **Session messages** are encrypted between client and host
- **Conversation history** stored on S5 is encrypted and authenticated
- **Host identity** is cryptographically verified
- **Forward secrecy** is maintained via ephemeral session keys

**Key Point**: Encryption is enabled by default. You don't need to configure anything - your sessions are automatically private.

## Architecture

### Cryptographic Primitives

The SDK uses industry-standard, audited cryptographic libraries:

- **Key Exchange**: Ephemeral-static ECDH (Elliptic Curve Diffie-Hellman)
- **Symmetric Encryption**: XChaCha20-Poly1305 AEAD
- **Signing**: ECDSA secp256k1 (same as Ethereum)
- **Key Derivation**: HKDF-SHA256
- **Libraries**: [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1), [@noble/ciphers](https://github.com/paulmillr/noble-ciphers)

### Encryption Workflow

#### 1. Session Initialization (Ephemeral-Static ECDH)

```
Client                                Host
------                                ----
1. Generate ephemeral keypair
2. Get host's static public key
3. ECDH(ephemeral_private, host_public) → shared_secret
4. Derive encryption key from shared_secret
5. Encrypt session_init payload
6. Sign encrypted payload with wallet
7. Send: {encrypted_data, signature, ephemeral_public_key}
                                   →
                                      8. ECDH(host_private, ephemeral_public) → shared_secret
                                      9. Derive decryption key
                                      10. Decrypt payload
                                      11. Recover sender address from signature
                                      12. Verify sender is authorized
```

**Security Properties**:
- **Forward Secrecy**: Ephemeral key is generated fresh per session and discarded after use
- **Authentication**: ECDSA signature proves sender identity
- **Replay Protection**: Session includes nonce/timestamp in signed payload

#### 2. Message Streaming (Symmetric Encryption)

After session initialization, messages use symmetric encryption with the session key:

```
Client                                Host
------                                ----
1. Generate random 32-byte session_key
2. Encrypt session_key in session_init
                                   →
                                      3. Decrypt and extract session_key

4. For each message:
   - Encrypt(session_key, message, index) → ciphertext
   - AAD includes message_index + timestamp
   - Send: {ciphertext, nonce, aad}
                                   →
                                      5. Decrypt(session_key, ciphertext, index)
                                      6. Verify AAD (prevents replay attacks)
```

**Security Properties**:
- **Replay Protection**: Message index in AAD prevents message replay
- **Authenticated Encryption**: Poly1305 MAC ensures message integrity
- **Low Overhead**: Symmetric encryption is fast (~1-2ms per message)

#### 3. Conversation Storage (Full Signature)

When saving conversations to S5 storage:

```
Client                                S5 Storage
------                                ----------
1. Serialize conversation data
2. Generate ephemeral keypair
3. ECDH encryption with host's public key
4. Sign encrypted data with wallet
5. Upload: {encrypted_data, signature, ephemeral_public_key, metadata}
                                   →
                                      Store encrypted blob

When loading:
                                   ←
                                      Retrieve encrypted blob
6. ECDH decryption with host's private key
7. Recover sender address from signature
8. Verify sender owns this conversation
9. Return decrypted conversation + sender_address
```

**Security Properties**:
- **End-to-End Encrypted**: S5 storage can't read conversation content
- **Authenticated**: Signature proves conversation ownership
- **Multi-Host Isolation**: Each host has different encryption keys

**Side note**: S5.js stores the encrypted bytes as opaque data - it doesn't add another encryption layer on top. The SDK's EncryptionManager handles all E2E encryption, and S5.js simply persists those encrypted bytes to the Sia network. This single-layer approach is efficient and provides full end-to-end encryption from client to host.

## Quick Start

### Default Behavior (Encrypted)

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';

// 1. Initialize SDK
const sdk = new FabstirSDKCore({
  chainId: ChainId.BASE_SEPOLIA,
  rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
  contractAddresses: { /* ... */ }
});

// 2. Authenticate
await sdk.authenticate('privatekey', { privateKey: yourPrivateKey });

// 3. Start session (automatically encrypted)
const sessionManager = await sdk.getSessionManager();
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://localhost:8080',
  jobId: 123n,
  modelName: 'llama-3',
  chainId: ChainId.BASE_SEPOLIA
  // encryption: true is the default - no need to specify
});

// 4. Send messages (automatically encrypted)
await sessionManager.sendPromptStreaming(
  sessionId,
  'What is quantum computing?',
  (token) => process.stdout.write(token)
);

// 5. Save conversation (automatically encrypted)
const conversation = await sessionManager.getSessionHistory(sessionId);
await sdk.saveConversation(conversation, {
  hostPubKey: await sdk.getHostPublicKey(hostAddress)
});
```

### Disabling Encryption (Debugging Only)

**Warning**: Only disable encryption for debugging or testing. Not recommended for production.

```typescript
// Explicitly opt-out of encryption
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://localhost:8080',
  jobId: 123n,
  modelName: 'llama-3',
  chainId: ChainId.BASE_SEPOLIA,
  encryption: false  // ⚠️ Disables encryption
});
```

## Key Management

### Client Keys

**Derivation**: Client encryption keys are derived from the wallet's private key using the same process as Ethereum transaction signing.

```typescript
// Internally (you don't need to do this):
// 1. Sign a deterministic message with wallet private key
// 2. Use signature as seed for key derivation
// 3. Generate secp256k1 keypair for encryption
```

**Security**: Client keys have the same security as your wallet - protect your private key.

### Host Keys

**Discovery**: Host public keys are retrieved via:
1. **NodeRegistry metadata** (primary) - stored on-chain during host registration
2. **Signature recovery** (fallback) - recovered from host's on-chain transactions
3. **Host API** (optional) - direct HTTP request to host's `/public-key` endpoint

```typescript
// Get host's public key (automatic)
const hostPubKey = await sdk.getHostPublicKey(hostAddress);

// Used internally for encryption
const encrypted = await encryptionManager.encryptSessionInit(hostPubKey, payload);
```

### Session Keys

**Lifecycle**: Session keys are generated fresh for each session and exist only in memory.

```
Session Start → Generate random 32 bytes → Use for message encryption → Discard on session end
```

**Security**: Session keys provide forward secrecy - even if long-term keys are compromised, past session messages remain secure.

## Security Considerations

### What Is Encrypted?

✅ **Encrypted:**
- WebSocket session initialization messages
- Streaming inference messages (prompts and responses)
- Stored conversation history on S5
- Session configuration (model name, pricing, etc.)

❌ **Not Encrypted (Visible On-Chain):**
- Blockchain transactions (job creation, payments, checkpoints)
- Host discovery metadata (for marketplace functionality)
- Payment amounts and token usage
- Contract interactions

**Note**: Encrypted data stored via S5.js remains encrypted on the Sia network. The SDK encrypts conversations before storage, and S5.js persists those encrypted bytes. Sia network operators and S5 nodes cannot read the content - only you and the host (with the correct keys) can decrypt it.

### Forward Secrecy

Each session uses a fresh ephemeral key that is discarded after the session ends. This ensures:
- **Past sessions cannot be decrypted** even if long-term keys are compromised
- **Each session is cryptographically independent**
- **No key material is persisted** to disk

### Sender Authentication

Every encrypted payload includes an ECDSA signature that:
- **Proves sender identity** via address recovery
- **Prevents impersonation** attacks
- **Enables contract-based authorization** (only approved clients can start sessions)

### Replay Protection

Messages include authenticated data (AAD) with:
- **Message index**: Prevents message replay within a session
- **Timestamp**: Prevents stale message injection
- **Session ID**: Prevents cross-session replay attacks

### Multi-Host Isolation

Each host has a unique public key, ensuring:
- **Host A cannot decrypt messages intended for Host B**
- **Conversations are isolated per host**
- **No shared secrets between different hosts**

## Performance Impact

Encryption overhead is negligible for typical use cases:

| Operation | Overhead | Notes |
|-----------|----------|-------|
| Session Init | ~10ms | One-time per session |
| Message Encryption | <1ms | Per message (symmetric) |
| Message Decryption | <1ms | Per message (symmetric) |
| Storage Encryption | ~50ms | Per 10KB conversation |
| Storage Decryption | ~50ms | Per 10KB conversation |

**Recommendation**: Keep encryption enabled - the security benefits far outweigh the minimal performance cost.

## Best Practices

### 1. Always Use Default Encryption

```typescript
// ✅ GOOD - Uses default encryption
await sessionManager.startSession({
  hostUrl: hostUrl,
  jobId: jobId,
  modelName: 'llama-3',
  chainId: ChainId.BASE_SEPOLIA
});

// ❌ BAD - Explicitly disables encryption (only for debugging)
await sessionManager.startSession({
  hostUrl: hostUrl,
  jobId: jobId,
  modelName: 'llama-3',
  chainId: ChainId.BASE_SEPOLIA,
  encryption: false
});
```

### 2. Verify Host Public Keys

Always retrieve host public keys through the SDK's official methods:

```typescript
// ✅ GOOD - Uses SDK's secure key retrieval
const hostPubKey = await sdk.getHostPublicKey(hostAddress);

// ❌ BAD - Hardcoded keys (vulnerable to MITM)
const hostPubKey = '0x1234...'; // DON'T DO THIS
```

### 3. Handle Encryption Errors Gracefully

```typescript
try {
  const { sessionId } = await sessionManager.startSession({
    hostUrl: hostUrl,
    jobId: jobId,
    modelName: 'llama-3',
    chainId: ChainId.BASE_SEPOLIA
  });
} catch (error) {
  if (error.code === 'ENCRYPTION_NOT_AVAILABLE') {
    console.error('EncryptionManager not initialized');
    // Fallback: Re-authenticate or reinitialize SDK
  } else if (error.code === 'HOST_MANAGER_NOT_AVAILABLE') {
    console.error('Cannot retrieve host public key');
    // Fallback: Check network connection, retry
  }
  throw error;
}
```

### 4. Protect Your Wallet Private Key

Encryption keys are derived from your wallet private key. Protect it:

- **Never hardcode** private keys in source code
- **Use environment variables** for development
- **Use secure key management** (hardware wallets, key vaults) for production
- **Never commit** `.env` files with private keys to version control

## Troubleshooting

### "EncryptionManager not available"

**Cause**: SDK not authenticated or EncryptionManager not initialized.

**Solution**:
```typescript
// Ensure you call authenticate before starting sessions
await sdk.authenticate('privatekey', { privateKey: yourPrivateKey });
```

### "Cannot retrieve host public key"

**Cause**: Host not registered, network issues, or host metadata incomplete.

**Solution**:
1. Verify host is registered: `await hostManager.getHostInfo(hostAddress)`
2. Check network connectivity
3. Try alternative key retrieval: `await sdk.getHostPublicKey(hostAddress, hostApiUrl)`

### "Session key not available"

**Cause**: Trying to send encrypted messages without session initialization.

**Solution**:
- Ensure `startSession()` completed successfully
- Check session state: `sessionManager.getSession(sessionId)`
- Verify WebSocket connection is established

### "Decryption failed"

**Cause**: Wrong key, corrupted data, or MITM attack.

**Solution**:
1. Verify host public key is correct
2. Check for network issues
3. Retry session initialization
4. If persistent, report to host operator

### Performance Issues

**Cause**: Encryption overhead on resource-constrained devices.

**Solution**:
- Encryption overhead is minimal (~1-2ms) - verify actual bottleneck
- Check network latency (likely culprit)
- Consider batching messages if sending many small messages

## Verifying Encryption Is Working

### Check Session State

```typescript
const session = sessionManager.getSession(sessionId.toString());
console.log('Encryption enabled:', session?.encryption); // Should be true
```

### Monitor WebSocket Messages

```typescript
// In SessionManager, encrypted messages have type 'encrypted_message'
// Plaintext messages have type 'prompt'

// If you see 'encrypted_message' types, encryption is working
```

### Inspect Network Traffic

Use browser DevTools or Wireshark to inspect WebSocket frames:
- **Encrypted**: You'll see base64-encoded ciphertext
- **Plaintext**: You'll see readable JSON with prompts

## Migration from Plaintext (Pre-Phase 6.2)

**Note**: This section is for historical reference only. If you're starting fresh (post-Phase 6.2), encryption is already enabled by default.

### Before (Plaintext)

```typescript
// Old code (pre-Phase 6.2) - no encryption
await sessionManager.startSession({
  hostUrl: hostUrl,
  jobId: jobId,
  modelName: 'llama-3',
  chainId: ChainId.BASE_SEPOLIA
});
```

### After (Encrypted by Default)

```typescript
// New code (post-Phase 6.2) - encryption automatic
await sessionManager.startSession({
  hostUrl: hostUrl,
  jobId: jobId,
  modelName: 'llama-3',
  chainId: ChainId.BASE_SEPOLIA
  // encryption: true is the default
});
```

**No code changes required** - encryption is automatic.

## Further Reading

- **Implementation Details**: See `docs/IMPLEMENTATION-CRYPTO.md`
- **API Reference**: See `docs/SDK_API.md` (Session Management section)
- **FAQ**: See `docs/ENCRYPTION_FAQ.md`
- **Test Coverage**: See `packages/sdk-core/tests/integration/encryption-e2e.test.ts`

**Note**: Enhanced S5.js has built-in encryption capabilities (`uploadBlobEncrypted()` for blobs, `encryptMutableBytes()` for mutable data), but the SDK uses its own EncryptionManager for end-to-end encryption between users and hosts. S5.js encryption is storage-focused, while SDK encryption provides session-level forward secrecy, sender authentication, and multi-host isolation. The SDK's encrypted data is stored as-is via S5.js to Sia network.

## Security Disclosure

If you discover a security vulnerability in the encryption implementation, please report it to:

📧 **security@fabstir.com**

Do not disclose security issues publicly until they have been addressed.
