# End-to-End Encryption Implementation Plan (v1.0)

> Complete implementation plan for adding ephemeral-static ECDH encryption to Fabstir LLM SDK
>
> **Status**: ⏳ NOT STARTED (0/17 sub-phases complete, 0%) | **Target**: Secure browser ↔ node communication | **Progress**: Phase 1 (0/3) ⏳, Phase 2 (0/3) ⏳, Phase 3 (0/3) ⏳, Phase 4 (0/3) ⏳, Phase 5 (0/3) ⏳, Phase 6 (0/2) ⏳

## Overview

Add end-to-end encryption to protect user prompts, LLM responses, and stored conversation history. Uses modern cryptographic primitives with ephemeral key generation for forward secrecy and ECDSA signature recovery for sender authentication integrated with existing Ethereum addresses.

**Current Problem**: All communication between clients and LLM hosts is unencrypted. Messages travel in plaintext over WebSockets and are stored unencrypted in S5 storage. Anyone with network access can read user prompts and AI responses.

**Solution**: Implement ephemeral-static ECDH with signature recovery, enabling:
- Client authenticates with Ethereum address (verified via signature recovery)
- Host authenticates with registered node address
- Forward secrecy via ephemeral keypairs
- Message authenticity via XChaCha20-Poly1305 AEAD
- Integration with existing contract allowlists

## Prerequisites

Before starting implementation, ensure:

✅ SDK Core working with multi-chain support
✅ SessionManager WebSocket communication functional
✅ StorageManager S5 persistence working
✅ AuthManager provides wallet private keys
✅ HostManager can retrieve host information
✅ Test accounts have Ethereum private keys available

## Business Requirements

### Current State (Pre-MVP)
- **WebSocket messages**: Plaintext JSON
- **S5 storage**: Unencrypted conversation history
- **Authentication**: Wallet signatures for deposits only
- **Privacy**: None - all data visible
- **Problem**: Privacy violation, regulatory risk, enterprise blocker

### Target State (MVP)
- **Session-level auth**: Full ECDSA signature with ephemeral key
- **Message encryption**: Symmetric XChaCha20-Poly1305 (fast streaming)
- **Storage encryption**: Full signature for long-term security
- **Key management**: Automatic, no user intervention required
- **Contract integration**: Verify sender addresses against allowlists
- **Opt-in**: Encryption optional initially

### Post-MVP Features (Future)
- Mandatory encryption (opt-out removed)
- Group encryption (multi-party sessions)
- Key rotation policies
- Encrypted model parameters
- Zero-knowledge proofs for certain operations
- Hardware security module (HSM) support

## Architecture

### Cryptographic Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser Client                                                  │
│                                                                 │
│ 1. Session Init (Full Signature)                               │
│    ┌───────────────────────────────────────────────────────┐   │
│    │ • Generate ephemeral keypair (secp256k1)              │   │
│    │ • ECDH(ephemeral_priv, host_static_pub) → shared_key │   │
│    │ • HKDF(shared_key, salt, info) → symmetric_key       │   │
│    │ • XChaCha20-Poly1305.encrypt(plaintext, key, nonce)  │   │
│    │ • ECDSA.sign(context, client_static_priv) → sig      │   │
│    │ • Send: {ephPub, salt, nonce, ciphertext, sig}       │   │
│    └───────────────────────────────────────────────────────┘   │
│                                                                 │
│ 2. Streaming Messages (Symmetric Only)                         │
│    ┌───────────────────────────────────────────────────────┐   │
│    │ • Use session_key from init                           │   │
│    │ • XChaCha20-Poly1305.encrypt(message, session_key)   │   │
│    │ • AAD includes message_index (prevent replay)        │   │
│    │ • Send: {nonce, ciphertext, aad}                     │   │
│    └───────────────────────────────────────────────────────┘   │
│                                                                 │
│ 3. Storage (Full Signature)                                    │
│    ┌───────────────────────────────────────────────────────┐   │
│    │ • Generate fresh ephemeral keypair per upload         │   │
│    │ • Encrypt conversation history with full signature   │   │
│    │ • Upload to S5 with metadata                         │   │
│    └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                    WebSocket/HTTPS
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ fabstir-llm-node (Host)                                         │
│                                                                 │
│ 1. Session Init Verification                                    │
│    ┌───────────────────────────────────────────────────────┐   │
│    │ • Receive encrypted payload                           │   │
│    │ • Recover sender pubkey from signature               │   │
│    │ • Derive sender EVM address from pubkey              │   │
│    │ • Check allowlist (ClientManager.isRegistered)       │   │
│    │ • ECDH(host_static_priv, ephemeral_pub) → shared_key│   │
│    │ • Decrypt and verify                                 │   │
│    │ • Extract proposed session_key                       │   │
│    └───────────────────────────────────────────────────────┘   │
│                                                                 │
│ 2. Stream Messages                                              │
│    ┌───────────────────────────────────────────────────────┐   │
│    │ • Decrypt using session_key                           │   │
│    │ • Process LLM inference                              │   │
│    │ • Encrypt response chunks                            │   │
│    │ • Send encrypted stream                              │   │
│    └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Message Format Specifications

```typescript
// Session Init (Full Signature)
interface EphemeralCipherPayload {
  // Encryption params
  ephPubHex: string;          // 33 bytes (compressed secp256k1 ephemeral public key)
  saltHex: string;            // 16 bytes (HKDF salt)
  nonceHex: string;           // 24 bytes (XChaCha20 nonce)
  ciphertextHex: string;      // variable (ciphertext + 16-byte Poly1305 tag)

  // Authentication
  sigHex: string;             // 64 bytes (ECDSA signature - compact form)
  recid: number;              // 0-3 (recovery ID for pubkey recovery)

  // Metadata
  alg: string;                // "secp256k1-ecdh(ephemeral→static)+hkdf(sha256)+xchacha20-poly1305"
  info: string;               // HKDF info/domain separator
  aadHex?: string;            // optional AAD (bound to ciphertext)
}

// Streaming Message (Symmetric Only)
interface StreamingMessage {
  nonceHex: string;           // 24 bytes (fresh nonce per message)
  ciphertextHex: string;      // variable (message + tag)
  aadHex: string;             // AAD = {message_index, session_id, timestamp}
}

// Storage Encryption (Full Signature)
interface StoragePayload {
  // Same as EphemeralCipherPayload
  ephPubHex: string;
  saltHex: string;
  nonceHex: string;
  ciphertextHex: string;
  sigHex: string;
  recid: number;
  alg: string;
  info: string;

  // Storage-specific metadata
  storedAt: string;           // ISO 8601 timestamp
  conversationId: string;     // Unique conversation identifier
}
```

## Security Model

**Cryptographic Guarantees**:
- **Forward Secrecy**: Ephemeral keys discarded after session → past messages safe if long-term key compromised
- **Sender Authentication**: ECDSA signature proves sender identity, recoverable to EVM address
- **Message Integrity**: Poly1305 AEAD tag prevents tampering
- **Replay Protection**: AAD includes message_index and timestamp
- **Context Binding**: Signature covers ephemeral key, salt, nonce, preventing MITM key swapping

**Key Management**:
- **Client Keys**: Derived from wallet private key (already available in AuthManager)
- **Host Keys**: Derived from node operator wallet (NodeRegistry metadata or signature recovery)
- **Ephemeral Keys**: Generated fresh per session/upload, immediately discarded
- **Session Keys**: Stored in memory only, never persisted

**Contract Integration**:
- Host verification: Check sender address against `NodeRegistry.nodes[address].active`
- Client verification: Check sender address against `ClientManager` allowlist (future)
- No separate key registry needed - use existing Ethereum addresses

**Performance Targets**:
- Session init: < 10ms overhead (signature generation)
- Message encryption: < 1ms per message (symmetric only)
- Signature recovery: < 2ms (host-side verification)
- Storage encryption: < 50ms for 10KB conversation

## Implementation Status

⏳ **Phase 1: Core Crypto Module** (0/3 sub-phases complete)
⏳ **Phase 2: EncryptionManager** (0/3 sub-phases complete)
⏳ **Phase 3: Host Public Key Discovery** (0/3 sub-phases complete)
⏳ **Phase 4: SessionManager Integration** (0/3 sub-phases complete)
⏳ **Phase 5: StorageManager Integration** (0/3 sub-phases complete)
⏳ **Phase 6: Testing & Documentation** (0/2 sub-phases complete)

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST for all cryptographic operations
2. **Bounded Autonomy**: Each sub-phase has strict scope and line limits
3. **Security First**: Use audited libraries (@noble), never roll your own crypto
4. **Fail Fast**: Clear errors for all cryptographic failures
5. **No Hardcoded Keys**: All keys derived from wallets or generated fresh
6. **Opt-In Initially**: Encryption optional to allow gradual rollout
7. **Backward Compatible**: Non-encrypted flows continue to work

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase
- **Test First**: Tests must exist and FAIL before writing implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **Real Crypto Testing**: Use known test vectors from specifications
- **No Mocks for Crypto**: Test actual encryption/decryption, not mocks

---

## Phase 1: Core Crypto Module

**Dependencies**: None (foundational)
**Estimated Time**: 6-8 hours
**Goal**: Implement low-level cryptographic primitives with full test coverage

### Sub-phase 1.1: Core Utilities & Type Definitions ⏳

**Goal**: Create foundational utilities and TypeScript interfaces for encryption

**Status**: ⏳ Not started

**Tasks**:
- [ ] Install dependencies (`@noble/secp256k1@^2.0.0`, `@noble/hashes@^1.3.3`, `@noble/ciphers@^0.4.0`)
- [ ] Write tests in `packages/sdk-core/tests/crypto/utilities.test.ts` (100 lines max)
  - [ ] Test: hexToBytes converts hex strings correctly
  - [ ] Test: bytesToHex converts Uint8Array correctly
  - [ ] Test: toCompressedPub handles both compressed/uncompressed keys
  - [ ] Test: pubkeyToAddress derives correct EVM address (known test vectors)
  - [ ] Test: toChecksumAddress produces EIP-55 checksum
  - [ ] Test: makeSigMessage produces consistent hash for same inputs
- [ ] Create `packages/sdk-core/src/crypto/types.ts` (80 lines max)
  - [ ] Define Hex type alias
  - [ ] Define EphemeralCipherPayload interface
  - [ ] Define EncryptEphemeralOptions interface
  - [ ] Define DecryptEphemeralOptions interface
  - [ ] Export all types
- [ ] Create `packages/sdk-core/src/crypto/utilities.ts` (150 lines max)
  - [ ] Implement hexToBytes(hex: Hex): Uint8Array
  - [ ] Implement bytesToHex(b: Uint8Array): string
  - [ ] Implement toCompressedPub(pub): Uint8Array
  - [ ] Implement pubkeyToAddress(pubkey): string
  - [ ] Implement toChecksumAddress(addr): string
  - [ ] Implement makeSigMessage(context params): Uint8Array
- [ ] Verify all tests pass (6/6 ✅)

**Test Requirements**:
```typescript
describe('Crypto Utilities', () => {
  describe('Hex conversion', () => {
    test('hexToBytes handles 0x prefix');
    test('bytesToHex produces lowercase hex');
    test('round-trip conversion preserves data');
  });

  describe('Public key compression', () => {
    test('toCompressedPub compresses 65-byte uncompressed key to 33 bytes');
    test('toCompressedPub preserves already-compressed key');
  });

  describe('EVM address derivation', () => {
    test('pubkeyToAddress derives correct address from known pubkey');
    test('toChecksumAddress produces EIP-55 checksum');
    // Use test vectors from EIP-55 specification
  });

  describe('Signature message construction', () => {
    test('makeSigMessage produces consistent hash');
    test('makeSigMessage binds all context parameters');
  });
});
```

**Known Test Vectors** (from EIP-55):
```typescript
// Test pubkeyToAddress with known values
const TEST_VECTORS = [
  {
    pubkey: '0x...',  // Known secp256k1 public key
    address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
  },
  // Add more from EIP-55 spec
];
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/crypto/utilities.ts
import * as secp from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';

export type Hex = `0x${string}` | string;

export function hexToBytes(hex: Hex): Uint8Array {
  const h = (hex as string).replace(/^0x/i, '');
  if (h.length % 2) throw new Error('Invalid hex length');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export function toCompressedPub(pub: Uint8Array | string): Uint8Array {
  const bytes = typeof pub === 'string' ? hexToBytes(pub) : pub;
  if (bytes.length === 33 && (bytes[0] === 0x02 || bytes[0] === 0x03)) {
    return bytes; // Already compressed
  }
  const point = secp.ProjectivePoint.fromHex(bytes);
  return point.toRawBytes(true); // true = compressed
}

export function pubkeyToAddress(pubkey: Uint8Array | Hex): string {
  // Convert to uncompressed 65-byte format
  const point = secp.ProjectivePoint.fromHex(
    typeof pubkey === 'string' ? hexToBytes(pubkey) : pubkey
  );
  const uncompressed = point.toRawBytes(false); // 65 bytes: 0x04 || X || Y

  // EVM address = keccak256(uncompressed[1:])[12:]
  const hash = keccak_256(uncompressed.slice(1)); // Drop 0x04 prefix
  const addrHex = '0x' + bytesToHex(hash.slice(-20));
  return toChecksumAddress(addrHex);
}

export function toChecksumAddress(addr: string): string {
  const hex = addr.toLowerCase().replace(/^0x/, '');
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(hex)));
  let result = '0x';
  for (let i = 0; i < hex.length; i++) {
    result += parseInt(hash[i], 16) >= 8 ? hex[i].toUpperCase() : hex[i];
  }
  return result;
}

export function makeSigMessage(
  ephPub: Uint8Array,
  recipientPub: Uint8Array,
  salt: Uint8Array,
  nonce: Uint8Array,
  info: string,
  aad?: Uint8Array
): Uint8Array {
  const enc = new TextEncoder();
  const parts = [
    enc.encode('E2EEv1|'),
    ephPub, enc.encode('|'),
    recipientPub, enc.encode('|'),
    salt, enc.encode('|'),
    nonce, enc.encode('|'),
    enc.encode(info),
  ];
  if (aad && aad.length) {
    parts.push(enc.encode('|'), aad);
  }

  // Concatenate all parts
  const totalLen = parts.reduce((n, p) => n + p.length, 0);
  const message = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    message.set(part, offset);
    offset += part.length;
  }

  // Return SHA-256 hash (ECDSA signs 32-byte digest)
  return sha256(message);
}
```

**Acceptance Criteria**:
- [ ] All utility functions pass tests with known vectors
- [ ] EVM address derivation matches EIP-55 spec
- [ ] Hex conversion is bidirectional
- [ ] Types compile without errors
- [ ] Dependencies installed and imported correctly

---

### Sub-phase 1.2: Encryption Implementation ⏳

**Goal**: Implement ephemeral-static encryption with signature

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/crypto/encryption.test.ts` (200 lines max)
  - [ ] Test: encryptForEphemeral produces valid payload
  - [ ] Test: decryptFromEphemeral recovers plaintext
  - [ ] Test: round-trip encryption/decryption preserves data
  - [ ] Test: different plaintexts produce different ciphertexts
  - [ ] Test: signature verification fails with wrong senderPubKey
  - [ ] Test: decryption fails with tampered ciphertext
  - [ ] Test: decryption fails with tampered signature
  - [ ] Test: AAD binding works (decryption fails with different AAD)
- [ ] Create `packages/sdk-core/src/crypto/encryption.ts` (250 lines max)
  - [ ] Import @noble libraries
  - [ ] Implement hkdf32(keyMaterial, salt, info): Uint8Array
  - [ ] Implement encryptForEphemeral(recipientPubHex, senderPrivHex, plaintext, options)
    - [ ] Generate ephemeral keypair
    - [ ] ECDH with recipient's static public key
    - [ ] HKDF key derivation
    - [ ] XChaCha20-Poly1305 AEAD encryption
    - [ ] ECDSA signature over context
    - [ ] Return EphemeralCipherPayload
  - [ ] Implement decryptFromEphemeral(myPrivHex, myPubHex, payload, options)
    - [ ] Verify ECDSA signature
    - [ ] ECDH with sender's ephemeral public key
    - [ ] HKDF key derivation
    - [ ] XChaCha20-Poly1305 decryption
    - [ ] Return plaintext
- [ ] Verify all tests pass (8/8 ✅)

**Test Requirements**:
```typescript
describe('Ephemeral-Static Encryption', () => {
  // Generate test keypairs
  const alicePriv = secp.utils.randomPrivateKey();
  const alicePub = secp.getPublicKey(alicePriv, true);
  const bobPriv = secp.utils.randomPrivateKey();
  const bobPub = secp.getPublicKey(bobPriv, true);

  describe('Basic encryption/decryption', () => {
    test('should encrypt and decrypt successfully', async () => {
      const plaintext = 'Secret message';

      const payload = await encryptForEphemeral(
        bytesToHex(bobPub),
        bytesToHex(alicePriv),
        plaintext
      );

      expect(payload.ephPubHex).toBeDefined();
      expect(payload.ciphertextHex).toBeDefined();
      expect(payload.sigHex).toBeDefined();

      const decrypted = decryptFromEphemeral(
        bytesToHex(bobPriv),
        bytesToHex(bobPub),
        payload
      );

      expect(decrypted).toBe(plaintext);
    });

    test('should produce different ciphertexts for same plaintext', async () => {
      const plaintext = 'Secret';
      const payload1 = await encryptForEphemeral(bobPubHex, alicePrivHex, plaintext);
      const payload2 = await encryptForEphemeral(bobPubHex, alicePrivHex, plaintext);

      expect(payload1.ciphertextHex).not.toBe(payload2.ciphertextHex);
      expect(payload1.ephPubHex).not.toBe(payload2.ephPubHex); // Different ephemeral keys
    });
  });

  describe('Security properties', () => {
    test('should reject tampered ciphertext', async () => {
      const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Secret');

      // Tamper with ciphertext
      const tampered = { ...payload, ciphertextHex: payload.ciphertextHex.replace(/^../, 'ff') };

      expect(() => decryptFromEphemeral(bobPrivHex, bobPubHex, tampered))
        .toThrow();
    });

    test('should reject tampered signature', async () => {
      const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Secret');

      // Tamper with signature
      const tampered = { ...payload, sigHex: payload.sigHex.replace(/^../, 'ff') };

      expect(() => decryptFromEphemeral(bobPrivHex, bobPubHex, tampered))
        .toThrow(/signature verification failed/i);
    });

    test('should enforce AAD binding', async () => {
      const aad = new TextEncoder().encode('metadata');
      const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Secret', { aad });

      // Try to decrypt with different AAD
      const wrongAad = new TextEncoder().encode('wrong-metadata');
      expect(() => decryptFromEphemeral(bobPrivHex, bobPubHex, payload, { aad: wrongAad }))
        .toThrow();
    });
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/crypto/encryption.ts
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hexToBytes, bytesToHex, toCompressedPub, makeSigMessage } from './utilities';
import type { EphemeralCipherPayload, EncryptEphemeralOptions } from './types';

const enc = new TextEncoder();
const dec = new TextDecoder();

function hkdf32(keyMaterial: Uint8Array, salt: Uint8Array, info: string): Uint8Array {
  return hkdf(sha256, keyMaterial, salt, enc.encode(info), 32);
}

export async function encryptForEphemeral(
  recipientPubHex: string,
  senderStaticPrivHex: string,
  plaintext: string | Uint8Array,
  opts: EncryptEphemeralOptions = {}
): Promise<EphemeralCipherPayload> {
  const alg = 'secp256k1-ecdh(ephemeral→static)+hkdf(sha256)+xchacha20-poly1305';
  const info = opts.info ?? 'e2ee:ecdh-secp256k1:xchacha20poly1305:v1';

  // 1. Generate ephemeral keypair
  const ephPriv = secp.utils.randomPrivateKey();
  const ephPubCompressed = secp.getPublicKey(ephPriv, true);

  // 2. Prepare identities
  const recipientPubCompressed = toCompressedPub(recipientPubHex);
  const senderIdPubCompressed = secp.getPublicKey(senderStaticPrivHex, true);

  // 3. ECDH: ephemeral_priv × recipient_static_pub → shared_secret
  const sharedSecret = secp.getSharedSecret(ephPriv, recipientPubCompressed, true); // 32 bytes

  // 4. HKDF: shared_secret → symmetric_key
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = hkdf32(sharedSecret, salt, info);

  // 5. AEAD encrypt
  const nonce = opts.nonce ?? crypto.getRandomValues(new Uint8Array(24));
  const cipher = xchacha20poly1305(key);
  const aad = opts.aad;
  const pt = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
  const ct = cipher.encrypt(nonce, pt, aad);

  // 6. Sign context (binds ephemeral key to sender identity)
  const msg = makeSigMessage(
    ephPubCompressed,
    recipientPubCompressed,
    salt,
    nonce,
    info,
    aad
  );
  const [sigHex, recid] = await secp.signAsync(msg, senderStaticPrivHex, { recovered: true });

  // 7. Build payload
  const payload: EphemeralCipherPayload = {
    ephPubHex: bytesToHex(ephPubCompressed),
    saltHex: bytesToHex(salt),
    nonceHex: bytesToHex(nonce),
    ciphertextHex: bytesToHex(ct),
    sigHex,
    recid,
    alg,
    info,
    ...(aad ? { aadHex: bytesToHex(aad) } : {}),
  };

  // 8. Security hygiene: erase ephemeral private key
  ephPriv.fill(0);

  return payload;
}

export function decryptFromEphemeral(
  myRecipientPrivHex: string,
  recipientPubHex: string,
  payload: EphemeralCipherPayload,
  opts: { aad?: Uint8Array; info?: string } = {}
): string {
  const info = opts.info ?? payload.info ?? 'e2ee:ecdh-secp256k1:xchacha20poly1305:v1';

  // 1. Parse payload
  const ephPub = toCompressedPub(payload.ephPubHex);
  const salt = hexToBytes(payload.saltHex);
  const nonce = hexToBytes(payload.nonceHex);
  const ct = hexToBytes(payload.ciphertextHex);
  const recipientPubCompressed = toCompressedPub(recipientPubHex);
  const aad = payload.aadHex ? hexToBytes(payload.aadHex) : opts.aad;

  // 2. Recover sender's static public key from signature
  const msg = makeSigMessage(ephPub, recipientPubCompressed, salt, nonce, info, aad);
  const senderIdPub = secp.recoverPublicKey(msg, payload.sigHex, payload.recid, true);
  if (!senderIdPub) {
    throw new Error('Failed to recover sender public key from signature');
  }

  // 3. Verify signature
  const valid = secp.verify(payload.sigHex, msg, senderIdPub, { strict: true });
  if (!valid) {
    throw new Error('Signature verification failed: message not from claimed sender');
  }

  // 4. ECDH: my_static_priv × ephemeral_pub → shared_secret
  const sharedSecret = secp.getSharedSecret(myRecipientPrivHex, ephPub, true);

  // 5. HKDF: shared_secret → symmetric_key
  const key = hkdf32(sharedSecret, salt, info);

  // 6. AEAD decrypt
  const cipher = xchacha20poly1305(key);
  const pt = cipher.decrypt(nonce, ct, aad);

  return dec.decode(pt);
}
```

**Acceptance Criteria**:
- [ ] Encryption produces valid payload structure
- [ ] Decryption recovers original plaintext
- [ ] Signature verification prevents impersonation
- [ ] Tampering detection works (ciphertext, signature)
- [ ] AAD binding enforced
- [ ] All tests pass with strong cryptographic guarantees

---

### Sub-phase 1.3: Address Recovery ⏳

**Goal**: Implement EVM address recovery from encrypted payload

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/crypto/recovery.test.ts` (150 lines max)
  - [ ] Test: recoverSenderAddress returns correct address
  - [ ] Test: recovered address matches sender's actual address
  - [ ] Test: recovery fails with invalid signature
  - [ ] Test: checksummed address format
  - [ ] Test: integration with encryptForEphemeral
- [ ] Create `packages/sdk-core/src/crypto/recovery.ts` (120 lines max)
  - [ ] Implement recoverSenderAddress(payload, recipientPubHex): string
  - [ ] Use signature recovery to get sender's public key
  - [ ] Derive EVM address from recovered public key
  - [ ] Return checksummed address
- [ ] Update `packages/sdk-core/src/crypto/index.ts` (30 lines max)
  - [ ] Export all public functions and types
  - [ ] Create barrel export for clean imports
- [ ] Verify all tests pass (5/5 ✅)

**Test Requirements**:
```typescript
describe('Address Recovery', () => {
  const alicePriv = secp.utils.randomPrivateKey();
  const alicePub = secp.getPublicKey(alicePriv, true);
  const aliceAddress = pubkeyToAddress(alicePub);

  const bobPriv = secp.utils.randomPrivateKey();
  const bobPub = secp.getPublicKey(bobPriv, true);

  test('should recover sender address from encrypted payload', async () => {
    const payload = await encryptForEphemeral(
      bytesToHex(bobPub),
      bytesToHex(alicePriv),
      'Secret message'
    );

    const recoveredAddress = recoverSenderAddress(payload, bytesToHex(bobPub));

    expect(recoveredAddress.toLowerCase()).toBe(aliceAddress.toLowerCase());
  });

  test('should return checksummed address', async () => {
    const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Test');
    const address = recoverSenderAddress(payload, bobPubHex);

    // EIP-55: checksummed addresses have mixed case
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(address).toBe(toChecksumAddress(address)); // Idempotent
  });

  test('should fail with tampered signature', async () => {
    const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Secret');
    const tampered = { ...payload, sigHex: payload.sigHex.replace(/^../, 'ff') };

    expect(() => recoverSenderAddress(tampered, bobPubHex))
      .toThrow(/recovery failed|signature verification failed/i);
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/crypto/recovery.ts
import * as secp from '@noble/secp256k1';
import { hexToBytes, bytesToHex, toCompressedPub, pubkeyToAddress, makeSigMessage } from './utilities';
import type { EphemeralCipherPayload } from './types';

/**
 * Recover the sender's EVM address from an encrypted payload.
 *
 * This extracts the sender's public key from the ECDSA signature
 * and derives their Ethereum address, enabling verification against
 * on-chain allowlists without requiring the sender to explicitly
 * provide their public key.
 *
 * @param payload - Encrypted payload with signature
 * @param recipientPubHex - Recipient's static public key (compressed, 33 bytes)
 * @returns Checksummed EVM address (EIP-55 format)
 * @throws Error if signature recovery or verification fails
 */
export function recoverSenderAddress(
  payload: EphemeralCipherPayload,
  recipientPubHex: string
): string {
  const info = payload.info ?? 'e2ee:ecdh-secp256k1:xchacha20poly1305:v1';

  // Parse payload components
  const ephPub = toCompressedPub(payload.ephPubHex);
  const recipientPub = toCompressedPub(recipientPubHex);
  const salt = hexToBytes(payload.saltHex);
  const nonce = hexToBytes(payload.nonceHex);
  const aad = payload.aadHex ? hexToBytes(payload.aadHex) : undefined;

  // Reconstruct signed message
  const msg = makeSigMessage(ephPub, recipientPub, salt, nonce, info, aad);

  // Recover sender's public key from signature
  const sig = hexToBytes(payload.sigHex);
  const recid = payload.recid;
  const senderPubCompressed = secp.recoverPublicKey(msg, sig, recid, true);

  if (!senderPubCompressed) {
    throw new Error('Failed to recover public key from signature');
  }

  // Verify signature (defense in depth)
  const valid = secp.verify(sig, msg, senderPubCompressed, { strict: true });
  if (!valid) {
    throw new Error('Signature verification failed');
  }

  // Derive EVM address from recovered public key
  return pubkeyToAddress(senderPubCompressed);
}

// packages/sdk-core/src/crypto/index.ts
export * from './types';
export * from './utilities';
export * from './encryption';
export * from './recovery';
```

**Acceptance Criteria**:
- [ ] Address recovery works correctly
- [ ] Recovered address matches sender's actual address
- [ ] Returns EIP-55 checksummed format
- [ ] Fails gracefully with invalid signatures
- [ ] All exports available from `@fabstir/sdk-core/crypto`

---

## Phase 2: EncryptionManager

**Dependencies**: Phase 1 complete (crypto primitives working)
**Estimated Time**: 6-8 hours
**Goal**: Create high-level encryption manager with session/message/storage modes

### Sub-phase 2.1: Manager Core & Interfaces ⏳

**Goal**: Define EncryptionManager class and interfaces

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/EncryptionManager.test.ts` (150 lines max)
  - [ ] Test: manager instantiates correctly
  - [ ] Test: getClientPrivateKey returns wallet key
  - [ ] Test: manager handles missing wallet gracefully
- [ ] Create `packages/sdk-core/src/interfaces/IEncryptionManager.ts` (100 lines max)
  - [ ] Define IEncryptionManager interface
  - [ ] Define SessionInitPayload type
  - [ ] Define EncryptedMessage type
  - [ ] Define EncryptedStorage type
  - [ ] Define EncryptionMode type ('session' | 'message' | 'storage')
- [ ] Create `packages/sdk-core/src/managers/EncryptionManager.ts` (200 lines max)
  - [ ] Implement class skeleton with constructor
  - [ ] Add private clientPrivateKey field
  - [ ] Add private wallet field (from AuthManager)
  - [ ] Implement getClientPrivateKey() helper
  - [ ] Add error handling for missing wallet
- [ ] Verify all tests pass (3/3 ✅)

**Test Requirements**:
```typescript
describe('EncryptionManager', () => {
  let manager: EncryptionManager;
  let wallet: ethers.Wallet;

  beforeEach(() => {
    wallet = ethers.Wallet.createRandom();
    manager = new EncryptionManager(wallet);
  });

  test('should instantiate correctly', () => {
    expect(manager).toBeInstanceOf(EncryptionManager);
  });

  test('should get client private key from wallet', () => {
    const privKey = (manager as any).getClientPrivateKey();
    expect(privKey).toBe(wallet.privateKey);
  });

  test('should throw error when wallet not provided', () => {
    expect(() => new EncryptionManager(undefined as any))
      .toThrow(/wallet required/i);
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/interfaces/IEncryptionManager.ts
import type { EphemeralCipherPayload } from '../crypto/types';

export interface SessionInitPayload {
  jobId: bigint;
  modelName: string;
  sessionKey: string;  // Hex-encoded 32-byte key for subsequent messages
  pricePerToken: number;
}

export interface EncryptedSessionInit {
  type: 'encrypted_session_init';
  payload: EphemeralCipherPayload;
}

export interface EncryptedMessage {
  type: 'encrypted_message';
  nonceHex: string;
  ciphertextHex: string;
  aadHex: string;
}

export interface EncryptedStorage {
  payload: EphemeralCipherPayload;
  storedAt: string;
  conversationId: string;
}

export interface IEncryptionManager {
  // Session-level (full signature)
  encryptSessionInit(
    hostPubKey: string,
    payload: SessionInitPayload
  ): Promise<EncryptedSessionInit>;

  decryptSessionInit(
    encrypted: EncryptedSessionInit
  ): Promise<{ data: SessionInitPayload; senderAddress: string }>;

  // Message-level (symmetric)
  encryptMessage(
    sessionKey: Uint8Array,
    message: string,
    messageIndex: number
  ): EncryptedMessage;

  decryptMessage(
    sessionKey: Uint8Array,
    encrypted: EncryptedMessage
  ): string;

  // Storage-level (full signature)
  encryptForStorage<T>(
    hostPubKey: string,
    data: T
  ): Promise<EncryptedStorage>;

  decryptFromStorage<T>(
    encrypted: EncryptedStorage
  ): Promise<{ data: T; senderAddress: string }>;
}

// packages/sdk-core/src/managers/EncryptionManager.ts
import type { Wallet } from 'ethers';
import type { IEncryptionManager, SessionInitPayload, EncryptedSessionInit } from '../interfaces/IEncryptionManager';

export class EncryptionManager implements IEncryptionManager {
  private clientPrivateKey: string;
  private clientPublicKey: string;
  private clientAddress: string;

  constructor(private wallet: Wallet) {
    if (!wallet) {
      throw new Error('Wallet required for EncryptionManager');
    }

    this.clientPrivateKey = wallet.privateKey.replace(/^0x/, '');
    this.clientAddress = wallet.address;

    // Derive public key from wallet
    const pubKey = secp.getPublicKey(this.clientPrivateKey, true);
    this.clientPublicKey = bytesToHex(pubKey);
  }

  private getClientPrivateKey(): string {
    return this.clientPrivateKey;
  }

  // Methods implemented in subsequent sub-phases
  async encryptSessionInit(hostPubKey: string, payload: SessionInitPayload): Promise<EncryptedSessionInit> {
    throw new Error('Not implemented - see Sub-phase 2.2');
  }

  async decryptSessionInit(encrypted: EncryptedSessionInit): Promise<{ data: SessionInitPayload; senderAddress: string }> {
    throw new Error('Not implemented - see Sub-phase 2.2');
  }

  encryptMessage(sessionKey: Uint8Array, message: string, messageIndex: number): EncryptedMessage {
    throw new Error('Not implemented - see Sub-phase 2.3');
  }

  decryptMessage(sessionKey: Uint8Array, encrypted: EncryptedMessage): string {
    throw new Error('Not implemented - see Sub-phase 2.3');
  }

  async encryptForStorage<T>(hostPubKey: string, data: T): Promise<EncryptedStorage> {
    throw new Error('Not implemented - see Sub-phase 2.3');
  }

  async decryptFromStorage<T>(encrypted: EncryptedStorage): Promise<{ data: T; senderAddress: string }> {
    throw new Error('Not implemented - see Sub-phase 2.3');
  }
}
```

**Acceptance Criteria**:
- [ ] Manager instantiates with wallet
- [ ] Interface defines all required methods
- [ ] Types exported correctly
- [ ] Error handling for missing wallet

---

### Sub-phase 2.2: Session Init Encryption ⏳

**Goal**: Implement session initialization with full signature

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/EncryptionManager.test.ts` (+150 lines)
  - [ ] Test: encryptSessionInit produces valid payload
  - [ ] Test: decryptSessionInit recovers original data
  - [ ] Test: decryptSessionInit returns correct sender address
  - [ ] Test: round-trip preserves session data
  - [ ] Test: tampered payload rejected
- [ ] Update `packages/sdk-core/src/managers/EncryptionManager.ts` (+80 lines)
  - [ ] Implement encryptSessionInit(hostPubKey, payload)
    - [ ] Generate random session key
    - [ ] Serialize SessionInitPayload to JSON
    - [ ] Encrypt with ephemeral-static ECDH
    - [ ] Return EncryptedSessionInit
  - [ ] Implement decryptSessionInit(encrypted)
    - [ ] Decrypt payload
    - [ ] Recover sender address from signature
    - [ ] Parse JSON to SessionInitPayload
    - [ ] Return data and sender address
- [ ] Verify all tests pass (5/5 ✅)

**Test Requirements**:
```typescript
describe('Session Init Encryption', () => {
  let clientManager: EncryptionManager;
  let hostManager: EncryptionManager;
  let clientWallet: Wallet;
  let hostWallet: Wallet;

  beforeEach(() => {
    clientWallet = ethers.Wallet.createRandom();
    hostWallet = ethers.Wallet.createRandom();
    clientManager = new EncryptionManager(clientWallet);
    hostManager = new EncryptionManager(hostWallet);
  });

  test('should encrypt session init with full signature', async () => {
    const payload: SessionInitPayload = {
      jobId: 123n,
      modelName: 'llama-3',
      sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      pricePerToken: 2000
    };

    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptSessionInit(hostPubKey, payload);

    expect(encrypted.type).toBe('encrypted_session_init');
    expect(encrypted.payload.ephPubHex).toBeDefined();
    expect(encrypted.payload.sigHex).toBeDefined();
  });

  test('should decrypt and recover sender address', async () => {
    const payload: SessionInitPayload = {
      jobId: 456n,
      modelName: 'gpt-4',
      sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      pricePerToken: 3000
    };

    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptSessionInit(hostPubKey, payload);

    const { data, senderAddress } = await hostManager.decryptSessionInit(encrypted);

    expect(data.jobId).toBe(payload.jobId);
    expect(data.modelName).toBe(payload.modelName);
    expect(senderAddress.toLowerCase()).toBe(clientWallet.address.toLowerCase());
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/EncryptionManager.ts (additions)
import { encryptForEphemeral, decryptFromEphemeral, recoverSenderAddress } from '../crypto';

async encryptSessionInit(
  hostPubKey: string,
  payload: SessionInitPayload
): Promise<EncryptedSessionInit> {
  // Serialize payload to JSON
  const plaintext = JSON.stringify({
    jobId: payload.jobId.toString(), // BigInt → string for JSON
    modelName: payload.modelName,
    sessionKey: payload.sessionKey,
    pricePerToken: payload.pricePerToken
  });

  // Encrypt with full signature
  const encryptedPayload = await encryptForEphemeral(
    hostPubKey,
    this.clientPrivateKey,
    plaintext
  );

  return {
    type: 'encrypted_session_init',
    payload: encryptedPayload
  };
}

async decryptSessionInit(
  encrypted: EncryptedSessionInit
): Promise<{ data: SessionInitPayload; senderAddress: string }> {
  // Decrypt
  const plaintext = decryptFromEphemeral(
    this.clientPrivateKey,
    this.clientPublicKey,
    encrypted.payload
  );

  // Recover sender address
  const senderAddress = recoverSenderAddress(encrypted.payload, this.clientPublicKey);

  // Parse JSON
  const parsed = JSON.parse(plaintext);
  const data: SessionInitPayload = {
    jobId: BigInt(parsed.jobId),
    modelName: parsed.modelName,
    sessionKey: parsed.sessionKey,
    pricePerToken: parsed.pricePerToken
  };

  return { data, senderAddress };
}
```

**Acceptance Criteria**:
- [ ] Session init encrypts correctly
- [ ] Decryption recovers all fields
- [ ] Sender address recovery works
- [ ] BigInt serialization handled
- [ ] All tests pass

---

### Sub-phase 2.3: Message & Storage Encryption ⏳

**Goal**: Implement symmetric message encryption and storage encryption

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/EncryptionManager.test.ts` (+200 lines)
  - [ ] Test: encryptMessage produces valid encrypted message
  - [ ] Test: decryptMessage recovers plaintext
  - [ ] Test: message index changes AAD (prevents replay)
  - [ ] Test: encryptForStorage works with arbitrary data
  - [ ] Test: decryptFromStorage recovers typed data
  - [ ] Test: storage encryption includes metadata
- [ ] Update `packages/sdk-core/src/managers/EncryptionManager.ts` (+120 lines)
  - [ ] Implement encryptMessage(sessionKey, message, messageIndex)
  - [ ] Implement decryptMessage(sessionKey, encrypted)
  - [ ] Implement encryptForStorage(hostPubKey, data)
  - [ ] Implement decryptFromStorage(encrypted)
- [ ] Verify all tests pass (6/6 ✅)

**Test Requirements**:
```typescript
describe('Message Encryption (Symmetric)', () => {
  let manager: EncryptionManager;
  let sessionKey: Uint8Array;

  beforeEach(() => {
    manager = new EncryptionManager(ethers.Wallet.createRandom());
    sessionKey = crypto.getRandomValues(new Uint8Array(32));
  });

  test('should encrypt and decrypt message', () => {
    const message = 'Hello, this is a streaming message';
    const messageIndex = 42;

    const encrypted = manager.encryptMessage(sessionKey, message, messageIndex);
    expect(encrypted.type).toBe('encrypted_message');
    expect(encrypted.nonceHex).toBeDefined();

    const decrypted = manager.decryptMessage(sessionKey, encrypted);
    expect(decrypted).toBe(message);
  });

  test('should prevent replay attacks via message index', () => {
    const message = 'Test';
    const encrypted = manager.encryptMessage(sessionKey, message, 1);

    // Try to decrypt with wrong index in AAD
    const tamperedAAD = encrypted.aadHex.replace(/....$/, '9999');
    const tampered = { ...encrypted, aadHex: tamperedAAD };

    expect(() => manager.decryptMessage(sessionKey, tampered)).toThrow();
  });
});

describe('Storage Encryption (Full Signature)', () => {
  let clientManager: EncryptionManager;
  let hostManager: EncryptionManager;

  beforeEach(() => {
    clientManager = new EncryptionManager(ethers.Wallet.createRandom());
    hostManager = new EncryptionManager(ethers.Wallet.createRandom());
  });

  test('should encrypt and decrypt arbitrary data', async () => {
    const conversation = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ],
      timestamp: Date.now()
    };

    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptForStorage(hostPubKey, conversation);

    expect(encrypted.payload.ephPubHex).toBeDefined();
    expect(encrypted.conversationId).toBeDefined();
    expect(encrypted.storedAt).toBeDefined();

    const { data, senderAddress } = await hostManager.decryptFromStorage(encrypted);

    expect(data).toEqual(conversation);
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/EncryptionManager.ts (additions)
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hexToBytes, bytesToHex } from '../crypto/utilities';

encryptMessage(
  sessionKey: Uint8Array,
  message: string,
  messageIndex: number
): EncryptedMessage {
  // Generate fresh nonce for each message
  const nonce = crypto.getRandomValues(new Uint8Array(24));

  // AAD includes message index to prevent replay/reordering
  const aad = new TextEncoder().encode(JSON.stringify({
    message_index: messageIndex,
    timestamp: Date.now()
  }));

  // Encrypt with XChaCha20-Poly1305
  const cipher = xchacha20poly1305(sessionKey);
  const plaintext = new TextEncoder().encode(message);
  const ciphertext = cipher.encrypt(nonce, plaintext, aad);

  return {
    type: 'encrypted_message',
    nonceHex: bytesToHex(nonce),
    ciphertextHex: bytesToHex(ciphertext),
    aadHex: bytesToHex(aad)
  };
}

decryptMessage(
  sessionKey: Uint8Array,
  encrypted: EncryptedMessage
): string {
  const nonce = hexToBytes(encrypted.nonceHex);
  const ciphertext = hexToBytes(encrypted.ciphertextHex);
  const aad = hexToBytes(encrypted.aadHex);

  const cipher = xchacha20poly1305(sessionKey);
  const plaintext = cipher.decrypt(nonce, ciphertext, aad);

  return new TextDecoder().decode(plaintext);
}

async encryptForStorage<T>(
  hostPubKey: string,
  data: T
): Promise<EncryptedStorage> {
  const plaintext = JSON.stringify(data);

  const payload = await encryptForEphemeral(
    hostPubKey,
    this.clientPrivateKey,
    plaintext
  );

  return {
    payload,
    storedAt: new Date().toISOString(),
    conversationId: crypto.randomUUID()
  };
}

async decryptFromStorage<T>(
  encrypted: EncryptedStorage
): Promise<{ data: T; senderAddress: string }> {
  const plaintext = decryptFromEphemeral(
    this.clientPrivateKey,
    this.clientPublicKey,
    encrypted.payload
  );

  const senderAddress = recoverSenderAddress(encrypted.payload, this.clientPublicKey);

  const data = JSON.parse(plaintext) as T;

  return { data, senderAddress };
}
```

**Acceptance Criteria**:
- [ ] Message encryption uses symmetric crypto (fast)
- [ ] AAD includes message index (replay protection)
- [ ] Storage encryption uses full signature (long-term security)
- [ ] Arbitrary data types supported (generics)
- [ ] All tests pass

---

## Phase 3: Host Public Key Discovery

**Dependencies**: Phase 2 complete (EncryptionManager ready)
**Estimated Time**: 4-6 hours
**Goal**: Enable clients to discover and verify host public keys

### Sub-phase 3.1: Host Metadata Extension ⏳

**Goal**: Add public key to host metadata in NodeRegistry

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/HostManager-pubkey.test.ts` (120 lines max)
  - [ ] Test: registerHost includes publicKey in metadata
  - [ ] Test: getHostInfo returns publicKey
  - [ ] Test: publicKey is compressed secp256k1 (33 bytes)
  - [ ] Test: missing publicKey handled gracefully (legacy hosts)
- [ ] Update `packages/sdk-core/src/types/models.ts` (+5 lines)
  - [ ] Add publicKey?: string to HostMetadata interface
  - [ ] Add publicKey?: string to HostInfo interface
- [ ] Update `packages/sdk-core/src/managers/HostManager.ts` (+40 lines)
  - [ ] Extract publicKey from wallet in registerHost
  - [ ] Include publicKey in metadata JSON
  - [ ] Parse publicKey in getHostInfo
  - [ ] Handle missing publicKey (return undefined)
- [ ] Verify all tests pass (4/4 ✅)

**Test Requirements**:
```typescript
describe('Host Public Key Management', () => {
  let hostManager: HostManager;
  let wallet: Wallet;

  beforeEach(() => {
    wallet = ethers.Wallet.createRandom();
    // Initialize hostManager with wallet
  });

  test('should include public key in registration metadata', async () => {
    // Mock contract call
    const registerSpy = vi.spyOn(nodeRegistry, 'registerNode');

    await hostManager.registerHostWithModels({
      stake: '1000',
      apiUrl: 'http://localhost:8080',
      models: ['model1'],
      minPricePerToken: '2000'
    });

    const metadata = JSON.parse(registerSpy.mock.calls[0][0]);
    expect(metadata.publicKey).toBeDefined();
    expect(metadata.publicKey).toMatch(/^[0-9a-f]{66}$/); // 33 bytes hex
  });

  test('should return public key in getHostInfo', async () => {
    // Mock contract response with publicKey in metadata
    const hostInfo = await hostManager.getHostInfo(wallet.address);

    expect(hostInfo.publicKey).toBeDefined();
    expect(hostInfo.publicKey?.length).toBe(66); // 33 bytes = 66 hex chars
  });

  test('should handle missing publicKey for legacy hosts', async () => {
    // Mock contract response WITHOUT publicKey
    const hostInfo = await hostManager.getHostInfo(legacyHostAddress);

    expect(hostInfo.publicKey).toBeUndefined();
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/types/models.ts (additions)
export interface HostMetadata {
  hardware?: {
    gpu: string;
    vram: number;
    ram: number;
  };
  capabilities?: string[];
  location?: string;
  maxConcurrent?: number;
  publicKey?: string;  // NEW: Compressed secp256k1 pubkey (33 bytes hex)
}

export interface HostInfo {
  address: string;
  apiUrl: string;
  isActive: boolean;
  stakedAmount?: bigint;
  supportedModels: string[];
  minPricePerToken: bigint;
  advertisedPrice?: bigint;
  reputation?: number;
  region?: string;
  metadata?: string;
  publicKey?: string;  // NEW: For encryption
}

// packages/sdk-core/src/managers/HostManager.ts (additions)
import * as secp from '@noble/secp256k1';
import { bytesToHex } from '../crypto/utilities';

async registerHostWithModels(params: HostRegistrationWithModels): Promise<string> {
  // ... existing validation ...

  // Extract public key from wallet
  const privKey = this.wallet.privateKey.replace(/^0x/, '');
  const pubKeyBytes = secp.getPublicKey(privKey, true); // compressed
  const publicKey = bytesToHex(pubKeyBytes);

  // Build metadata with publicKey
  const metadata = {
    hardware: params.metadata?.hardware,
    capabilities: params.metadata?.capabilities,
    location: params.metadata?.location,
    maxConcurrent: params.metadata?.maxConcurrent,
    publicKey  // NEW
  };

  const metadataJson = JSON.stringify(metadata);

  // ... call contract with metadataJson ...
}

async getHostInfo(address: string): Promise<HostInfo> {
  // ... existing logic to fetch from contract ...

  // Parse metadata
  let publicKey: string | undefined;
  if (node.metadata) {
    try {
      const meta = JSON.parse(node.metadata);
      publicKey = meta.publicKey;  // Extract publicKey if present
    } catch {
      // Invalid metadata, ignore
    }
  }

  return {
    address,
    apiUrl: node.apiUrl,
    isActive: node.active,
    supportedModels: node.supportedModels,
    minPricePerToken: node.minPricePerToken,
    publicKey,  // NEW
    // ... other fields ...
  };
}
```

**Acceptance Criteria**:
- [ ] publicKey included in registration metadata
- [ ] publicKey returned in HostInfo
- [ ] Handles legacy hosts without publicKey
- [ ] publicKey is valid compressed secp256k1 format

---

### Sub-phase 3.2: Signature-Based Key Recovery (Alternative) ⏳

**Goal**: Implement signature-based public key recovery as fallback

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/HostManager-sig-recovery.test.ts` (150 lines max)
  - [ ] Test: requestHostPublicKey sends challenge
  - [ ] Test: verifyHostSignature recovers correct pubkey
  - [ ] Test: recovered address matches host address
  - [ ] Test: invalid signature rejected
  - [ ] Test: challenge includes nonce (prevents replay)
- [ ] Create `packages/sdk-core/src/managers/HostKeyRecovery.ts` (180 lines max)
  - [ ] Implement requestHostPublicKey(hostApiUrl, hostAddress)
    - [ ] Generate random challenge nonce
    - [ ] Request signature from host
    - [ ] Receive { signature, recid }
  - [ ] Implement verifyHostSignature(challenge, signature, recid, expectedAddress)
    - [ ] Recover public key from signature
    - [ ] Derive EVM address from pubkey
    - [ ] Verify address matches expected
    - [ ] Return recovered public key
- [ ] Update `packages/sdk-core/src/managers/HostManager.ts` (+30 lines)
  - [ ] Add getHostPublicKey(hostAddress, hostApiUrl) method
    - [ ] Try to get from metadata first
    - [ ] Fall back to signature recovery if missing
    - [ ] Cache recovered key
- [ ] Verify all tests pass (5/5 ✅)

**Test Requirements**:
```typescript
describe('Signature-Based Key Recovery', () => {
  test('should recover host public key from signature', () => {
    const hostPriv = secp.utils.randomPrivateKey();
    const hostPub = secp.getPublicKey(hostPriv, true);
    const hostAddress = pubkeyToAddress(hostPub);

    // Simulate host signing challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const challengeHash = sha256(challenge);
    const [sig, recid] = secp.signSync(challengeHash, hostPriv, { recovered: true });

    // Verify and recover
    const recoveredPubKey = verifyHostSignature(challenge, sig, recid, hostAddress);

    expect(bytesToHex(recoveredPubKey)).toBe(bytesToHex(hostPub));
  });

  test('should reject signature from wrong host', () => {
    const hostPriv = secp.utils.randomPrivateKey();
    const wrongHostAddress = '0x0000000000000000000000000000000000000001';

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const challengeHash = sha256(challenge);
    const [sig, recid] = secp.signSync(challengeHash, hostPriv, { recovered: true });

    expect(() => verifyHostSignature(challenge, sig, recid, wrongHostAddress))
      .toThrow(/address mismatch/i);
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/HostKeyRecovery.ts
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, bytesToHex, pubkeyToAddress } from '../crypto/utilities';

/**
 * Request host to sign a challenge and recover their public key.
 *
 * Protocol:
 * 1. Client generates random challenge
 * 2. Client sends challenge to host
 * 3. Host signs: signature = ECDSA.sign(SHA256(challenge), host_private_key)
 * 4. Host returns { signature, recid }
 * 5. Client recovers pubkey and verifies address match
 */

export async function requestHostPublicKey(
  hostApiUrl: string,
  hostAddress: string
): Promise<string> {
  // Generate challenge
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeHex = bytesToHex(challenge);

  // Request signature from host
  const response = await fetch(`${hostApiUrl}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: challengeHex })
  });

  if (!response.ok) {
    throw new Error(`Host key request failed: ${response.statusText}`);
  }

  const { signature, recid } = await response.json();

  // Verify and recover
  const pubKey = verifyHostSignature(challenge, signature, recid, hostAddress);

  return bytesToHex(pubKey);
}

export function verifyHostSignature(
  challenge: Uint8Array,
  signatureHex: string,
  recid: number,
  expectedAddress: string
): Uint8Array {
  // Hash challenge (hosts sign the hash)
  const challengeHash = sha256(challenge);

  // Recover public key from signature
  const sig = hexToBytes(signatureHex);
  const pubKey = secp.recoverPublicKey(challengeHash, sig, recid, true);

  if (!pubKey) {
    throw new Error('Failed to recover public key from signature');
  }

  // Verify signature
  const valid = secp.verify(sig, challengeHash, pubKey, { strict: true });
  if (!valid) {
    throw new Error('Invalid host signature');
  }

  // Verify address matches
  const recoveredAddress = pubkeyToAddress(pubKey);
  if (recoveredAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Host address mismatch: expected ${expectedAddress}, got ${recoveredAddress}`
    );
  }

  return pubKey;
}

// packages/sdk-core/src/managers/HostManager.ts (additions)
import { requestHostPublicKey } from './HostKeyRecovery';

private publicKeyCache: Map<string, string> = new Map();

async getHostPublicKey(hostAddress: string, hostApiUrl?: string): Promise<string> {
  // Check cache
  if (this.publicKeyCache.has(hostAddress)) {
    return this.publicKeyCache.get(hostAddress)!;
  }

  // Try to get from metadata
  const hostInfo = await this.getHostInfo(hostAddress);
  if (hostInfo.publicKey) {
    this.publicKeyCache.set(hostAddress, hostInfo.publicKey);
    return hostInfo.publicKey;
  }

  // Fall back to signature recovery
  if (!hostApiUrl) {
    hostApiUrl = hostInfo.apiUrl;
  }

  if (!hostApiUrl) {
    throw new Error(`Cannot recover public key for host ${hostAddress}: no API URL available`);
  }

  const pubKey = await requestHostPublicKey(hostApiUrl, hostAddress);
  this.publicKeyCache.set(hostAddress, pubKey);
  return pubKey;
}
```

**Acceptance Criteria**:
- [ ] Signature-based recovery works
- [ ] Address verification prevents impersonation
- [ ] Falls back gracefully from metadata
- [ ] Caches recovered keys
- [ ] All tests pass

---

### Sub-phase 3.3: HostManager Integration ⏳

**Goal**: Integrate public key retrieval into FabstirSDKCore

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/integration/host-pubkey-discovery.test.ts` (100 lines max)
  - [ ] Test: FabstirSDKCore provides getHostPublicKey method
  - [ ] Test: SessionManager can retrieve host pubkey
  - [ ] Test: End-to-end: register host → discover → get pubkey
- [ ] Update `packages/sdk-core/src/FabstirSDKCore.ts` (+15 lines)
  - [ ] Add getHostPublicKey(hostAddress, hostApiUrl?) method
  - [ ] Delegate to HostManager.getHostPublicKey
- [ ] Update `packages/sdk-core/src/interfaces/IHostManager.ts` (+10 lines)
  - [ ] Add getHostPublicKey method to interface
- [ ] Verify all tests pass (3/3 ✅)

**Test Requirements**:
```typescript
describe('Host Public Key Discovery Integration', () => {
  let sdk: FabstirSDKCore;

  beforeEach(async () => {
    sdk = new FabstirSDKCore({ /* config */ });
    await sdk.authenticate(TEST_USER_1_PRIVATE_KEY);
  });

  test('should provide getHostPublicKey method', () => {
    expect(sdk.getHostPublicKey).toBeDefined();
    expect(typeof sdk.getHostPublicKey).toBe('function');
  });

  test('should retrieve host public key', async () => {
    // Assume TEST_HOST_1 is registered with publicKey in metadata
    const pubKey = await sdk.getHostPublicKey(TEST_HOST_1_ADDRESS);

    expect(pubKey).toBeDefined();
    expect(pubKey).toMatch(/^[0-9a-f]{66}$/);
  });

  test('should work end-to-end', async () => {
    // 1. Discover hosts
    const hostDiscovery = await sdk.getHostDiscoveryService();
    const hosts = await hostDiscovery.discoverAllActiveHosts();
    expect(hosts.length).toBeGreaterThan(0);

    // 2. Get public key for first host
    const host = hosts[0];
    const pubKey = await sdk.getHostPublicKey(host.address, host.apiUrl);

    expect(pubKey).toBeDefined();
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/interfaces/IHostManager.ts (additions)
export interface IHostManager {
  // ... existing methods ...

  /**
   * Get host's public key for encryption.
   * Tries metadata first, falls back to signature recovery.
   */
  getHostPublicKey(hostAddress: string, hostApiUrl?: string): Promise<string>;
}

// packages/sdk-core/src/FabstirSDKCore.ts (additions)
/**
 * Get host's public key for end-to-end encryption.
 *
 * @param hostAddress - Host's Ethereum address
 * @param hostApiUrl - Optional host API URL (for signature recovery fallback)
 * @returns Compressed secp256k1 public key (33 bytes hex)
 */
async getHostPublicKey(hostAddress: string, hostApiUrl?: string): Promise<string> {
  const hostManager = await this.getHostManager();
  return hostManager.getHostPublicKey(hostAddress, hostApiUrl);
}
```

**Acceptance Criteria**:
- [ ] SDK exposes getHostPublicKey method
- [ ] SessionManager can retrieve host keys
- [ ] Integration tests pass
- [ ] Documentation added to SDK_API.md

---

## Phase 4: SessionManager Integration

**Dependencies**: Phase 2 & 3 complete (EncryptionManager + host pubkeys)
**Estimated Time**: 6-8 hours
**Goal**: Add encryption to WebSocket session initialization and streaming

### Sub-phase 4.1: Session Init with Encryption ⏳

**Goal**: Encrypt session initialization messages

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/SessionManager-encryption.test.ts` (200 lines max)
  - [ ] Test: startSession with encryption=true encrypts init message
  - [ ] Test: session_key proposed by client
  - [ ] Test: encrypted init message has correct structure
  - [ ] Test: host can decrypt init message
  - [ ] Test: encryption=false works (backward compatible)
- [ ] Update `packages/sdk-core/src/managers/SessionManager.ts` (+120 lines)
  - [ ] Add encryptionManager?: EncryptionManager field
  - [ ] Add encryption?: boolean to StartSessionParams
  - [ ] Modify startSession to encrypt if encryption=true
    - [ ] Generate random session key
    - [ ] Get host public key
    - [ ] Encrypt init payload with EncryptionManager
    - [ ] Send encrypted_session_init message
    - [ ] Store session key for subsequent messages
  - [ ] Handle unencrypted sessions (backward compatible)
- [ ] Update `packages/sdk-core/src/FabstirSDKCore.ts` (+10 lines)
  - [ ] Pass EncryptionManager to SessionManager constructor
- [ ] Verify all tests pass (5/5 ✅)

**Test Requirements**:
```typescript
describe('SessionManager Encryption', () => {
  let sessionManager: SessionManager;
  let encryptionManager: EncryptionManager;
  let wallet: Wallet;

  beforeEach(() => {
    wallet = ethers.Wallet.createRandom();
    encryptionManager = new EncryptionManager(wallet);
    // Initialize sessionManager with encryptionManager
  });

  test('should encrypt session init when encryption=true', async () => {
    const mockWs = {
      send: vi.fn(),
      on: vi.fn()
    };

    await sessionManager.startSession({
      hostUrl: 'ws://localhost:8080/ws',
      hostAddress: TEST_HOST_1_ADDRESS,
      jobId: 123n,
      modelName: 'llama-3',
      chainId: 84532,
      encryption: true  // NEW
    });

    // Verify encrypted message sent
    expect(mockWs.send).toHaveBeenCalled();
    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentMessage.type).toBe('encrypted_session_init');
    expect(sentMessage.payload.ephPubHex).toBeDefined();
  });

  test('should propose session key in init', async () => {
    // Mock decryption on host side
    const decryptSpy = vi.spyOn(encryptionManager, 'decryptSessionInit');

    await sessionManager.startSession({ /* ... */ encryption: true });

    expect(decryptSpy).toHaveBeenCalled();
    const { data } = decryptSpy.mock.results[0].value;
    expect(data.sessionKey).toBeDefined();
    expect(data.sessionKey.length).toBe(64); // 32 bytes hex
  });

  test('should support unencrypted sessions (backward compatible)', async () => {
    await sessionManager.startSession({
      hostUrl: 'ws://localhost:8080/ws',
      hostAddress: TEST_HOST_1_ADDRESS,
      jobId: 123n,
      modelName: 'llama-3',
      chainId: 84532,
      encryption: false  // or omit
    });

    // Should send plaintext session_init
    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentMessage.type).toBe('session_init');
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/SessionManager.ts (additions)
import type { EncryptionManager } from './EncryptionManager';

export interface StartSessionParams {
  hostUrl: string;
  hostAddress: string;
  jobId: bigint;
  modelName: string;
  chainId: number;
  pricePerToken?: number;
  encryption?: boolean;  // NEW: Enable E2EE
}

export class SessionManager implements ISessionManager {
  private encryptionManager?: EncryptionManager;
  private sessionKey?: Uint8Array;
  private messageIndex: number = 0;

  constructor(
    /* ... existing params ... */
    encryptionManager?: EncryptionManager
  ) {
    // ... existing initialization ...
    this.encryptionManager = encryptionManager;
  }

  async startSession(params: StartSessionParams): Promise<StartSessionResult> {
    // ... existing validation and setup ...

    // Establish WebSocket connection
    const ws = await this.connectToHost(params.hostUrl);

    // Send session init (encrypted or plaintext)
    if (params.encryption && this.encryptionManager) {
      await this.sendEncryptedInit(ws, params);
    } else {
      await this.sendPlaintextInit(ws, params);
    }

    // ... wait for response, return session ...
  }

  private async sendEncryptedInit(ws: WebSocket, params: StartSessionParams): Promise<void> {
    // Generate session key for subsequent messages
    this.sessionKey = crypto.getRandomValues(new Uint8Array(32));
    const sessionKeyHex = bytesToHex(this.sessionKey);

    // Get host public key
    const hostPubKey = await this.sdk.getHostPublicKey(params.hostAddress, params.hostUrl);

    // Prepare init payload
    const initPayload: SessionInitPayload = {
      jobId: params.jobId,
      modelName: params.modelName,
      sessionKey: sessionKeyHex,
      pricePerToken: params.pricePerToken || 0
    };

    // Encrypt with EncryptionManager
    const encrypted = await this.encryptionManager!.encryptSessionInit(hostPubKey, initPayload);

    // Send over WebSocket
    ws.send(JSON.stringify(encrypted));

    this.messageIndex = 0; // Reset for streaming messages
  }

  private async sendPlaintextInit(ws: WebSocket, params: StartSessionParams): Promise<void> {
    // Existing plaintext logic
    ws.send(JSON.stringify({
      type: 'session_init',
      job_id: params.jobId.toString(),
      model_name: params.modelName,
      chain_id: params.chainId,
      price_per_token: params.pricePerToken
    }));
  }
}
```

**Acceptance Criteria**:
- [ ] Session init encrypts when encryption=true
- [ ] Session key proposed and stored
- [ ] Backward compatible (encryption=false works)
- [ ] Host public key retrieved automatically
- [ ] All tests pass

---

### Sub-phase 4.2: Streaming Message Encryption ⏳

**Goal**: Encrypt streaming inference messages

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/SessionManager-streaming.test.ts` (200 lines max)
  - [ ] Test: sendMessage encrypts with session key
  - [ ] Test: receiveMessage decrypts correctly
  - [ ] Test: message index increments (replay protection)
  - [ ] Test: streaming chunks encrypted individually
  - [ ] Test: unencrypted sessions still work
- [ ] Update `packages/sdk-core/src/managers/SessionManager.ts` (+100 lines)
  - [ ] Modify sendMessage to encrypt if sessionKey exists
  - [ ] Modify onMessage handler to decrypt if sessionKey exists
  - [ ] Increment messageIndex with each message
  - [ ] Handle both encrypted and plaintext responses
- [ ] Verify all tests pass (5/5 ✅)

**Test Requirements**:
```typescript
describe('Streaming Message Encryption', () => {
  let sessionManager: SessionManager;
  let encryptionManager: EncryptionManager;

  beforeEach(async () => {
    // Setup with encryption enabled
    encryptionManager = new EncryptionManager(ethers.Wallet.createRandom());
    sessionManager = new SessionManager(/* ... */, encryptionManager);

    // Start encrypted session
    await sessionManager.startSession({ /* ... */ encryption: true });
  });

  test('should encrypt outgoing messages', async () => {
    const mockWs = { send: vi.fn() };

    await sessionManager.sendMessage('Hello, LLM!');

    const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sent.type).toBe('encrypted_message');
    expect(sent.nonceHex).toBeDefined();
    expect(sent.ciphertextHex).toBeDefined();
    expect(sent.aadHex).toBeDefined();
  });

  test('should decrypt incoming messages', async () => {
    const plaintext = 'LLM response chunk';
    const encrypted = encryptionManager.encryptMessage(
      sessionManager.sessionKey!,
      plaintext,
      0
    );

    // Simulate receiving encrypted message
    const received = await sessionManager.handleIncomingMessage(encrypted);

    expect(received).toBe(plaintext);
  });

  test('should increment message index (replay protection)', async () => {
    await sessionManager.sendMessage('Message 1');
    await sessionManager.sendMessage('Message 2');

    const msg1 = JSON.parse(mockWs.send.mock.calls[0][0]);
    const msg2 = JSON.parse(mockWs.send.mock.calls[1][0]);

    const aad1 = JSON.parse(new TextDecoder().decode(hexToBytes(msg1.aadHex)));
    const aad2 = JSON.parse(new TextDecoder().decode(hexToBytes(msg2.aadHex)));

    expect(aad2.message_index).toBe(aad1.message_index + 1);
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/SessionManager.ts (additions)

async sendMessage(message: string): Promise<void> {
  if (this.sessionKey && this.encryptionManager) {
    // Encrypt with session key
    const encrypted = this.encryptionManager.encryptMessage(
      this.sessionKey,
      message,
      this.messageIndex++
    );

    this.ws.send(JSON.stringify(encrypted));
  } else {
    // Plaintext fallback
    this.ws.send(JSON.stringify({
      type: 'inference_request',
      prompt: message
    }));
  }
}

private setupMessageHandlers(ws: WebSocket): void {
  ws.on('message', (data: string) => {
    const message = JSON.parse(data);

    if (message.type === 'encrypted_message') {
      this.handleEncryptedMessage(message);
    } else {
      this.handlePlaintextMessage(message);
    }
  });
}

private async handleEncryptedMessage(encrypted: EncryptedMessage): Promise<void> {
  if (!this.sessionKey || !this.encryptionManager) {
    throw new Error('Received encrypted message but no session key available');
  }

  const plaintext = this.encryptionManager.decryptMessage(this.sessionKey, encrypted);

  // Emit to user callback
  this.onMessageCallback?.(plaintext);
}

private handlePlaintextMessage(message: any): void {
  // Existing plaintext handling
  this.onMessageCallback?.(message.content);
}
```

**Acceptance Criteria**:
- [ ] Messages encrypted with session key
- [ ] Decryption works for responses
- [ ] Message index prevents replay
- [ ] Streaming chunks encrypted individually
- [ ] All tests pass

---

### Sub-phase 4.3: Error Handling & Recovery ⏳

**Goal**: Handle encryption failures gracefully

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/SessionManager-errors.test.ts` (150 lines max)
  - [ ] Test: decryption failure closes session
  - [ ] Test: missing host public key falls back gracefully
  - [ ] Test: tampered message detected and rejected
  - [ ] Test: error events emitted for encryption failures
- [ ] Update `packages/sdk-core/src/managers/SessionManager.ts` (+60 lines)
  - [ ] Wrap encryption/decryption in try-catch
  - [ ] Emit 'encryption_error' events
  - [ ] Close session on critical failures
  - [ ] Log detailed error information
- [ ] Verify all tests pass (4/4 ✅)

**Test Requirements**:
```typescript
describe('Encryption Error Handling', () => {
  test('should emit error event on decryption failure', async () => {
    const errorSpy = vi.fn();
    sessionManager.on('encryption_error', errorSpy);

    // Send tampered encrypted message
    const tampered = { type: 'encrypted_message', ciphertextHex: 'invalid' };
    await sessionManager.handleIncomingMessage(tampered);

    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
      code: 'DECRYPTION_FAILED',
      message: expect.stringContaining('decrypt')
    }));
  });

  test('should close session on critical encryption failure', async () => {
    const closeSpy = vi.spyOn(sessionManager, 'close');

    // Trigger critical failure
    await sessionManager.handleIncomingMessage({ type: 'encrypted_message', ciphertextHex: 'bad' });

    expect(closeSpy).toHaveBeenCalled();
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/SessionManager.ts (additions)

private async handleEncryptedMessage(encrypted: EncryptedMessage): Promise<void> {
  try {
    if (!this.sessionKey || !this.encryptionManager) {
      throw new Error('Session key not available for decryption');
    }

    const plaintext = this.encryptionManager.decryptMessage(this.sessionKey, encrypted);
    this.onMessageCallback?.(plaintext);

  } catch (error) {
    // Emit encryption error event
    this.emit('encryption_error', {
      code: 'DECRYPTION_FAILED',
      message: `Failed to decrypt message: ${error.message}`,
      originalError: error
    });

    // Close session on critical failure (prevents continued communication)
    await this.close();
  }
}

async sendMessage(message: string): Promise<void> {
  try {
    if (this.sessionKey && this.encryptionManager) {
      const encrypted = this.encryptionManager.encryptMessage(
        this.sessionKey,
        message,
        this.messageIndex++
      );

      this.ws.send(JSON.stringify(encrypted));
    } else {
      this.ws.send(JSON.stringify({ type: 'inference_request', prompt: message }));
    }
  } catch (error) {
    this.emit('encryption_error', {
      code: 'ENCRYPTION_FAILED',
      message: `Failed to encrypt message: ${error.message}`,
      originalError: error
    });

    throw error; // Re-throw so caller knows encryption failed
  }
}
```

**Acceptance Criteria**:
- [ ] Decryption failures handled gracefully
- [ ] Error events emitted
- [ ] Session closed on critical failures
- [ ] All tests pass

---

## Phase 5: StorageManager Integration

**Dependencies**: Phase 2 complete (EncryptionManager)
**Estimated Time**: 4-6 hours
**Goal**: Encrypt conversation history in S5 storage

### Sub-phase 5.1: Conversation Encryption ⏳

**Goal**: Encrypt conversations before S5 upload

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/StorageManager-encryption.test.ts` (180 lines max)
  - [ ] Test: saveConversation encrypts before upload
  - [ ] Test: loadConversation decrypts after download
  - [ ] Test: round-trip preserves conversation data
  - [ ] Test: encryption optional (encrypt: boolean flag)
  - [ ] Test: unencrypted conversations still work
- [ ] Update `packages/sdk-core/src/managers/StorageManager.ts` (+100 lines)
  - [ ] Add encryptionManager?: EncryptionManager field
  - [ ] Add encrypt?: boolean to SaveConversationOptions
  - [ ] Modify saveConversation to encrypt if encrypt=true
  - [ ] Modify loadConversation to decrypt if encrypted
  - [ ] Add encryption metadata to S5 blob
- [ ] Verify all tests pass (5/5 ✅)

**Test Requirements**:
```typescript
describe('StorageManager Encryption', () => {
  let storageManager: StorageManager;
  let encryptionManager: EncryptionManager;
  let hostPubKey: string;

  beforeEach(() => {
    const wallet = ethers.Wallet.createRandom();
    encryptionManager = new EncryptionManager(wallet);

    const hostWallet = ethers.Wallet.createRandom();
    const hostPriv = hostWallet.privateKey.replace(/^0x/, '');
    hostPubKey = bytesToHex(secp.getPublicKey(hostPriv, true));

    storageManager = new StorageManager(/* ... */, encryptionManager);
  });

  test('should encrypt conversation before upload', async () => {
    const conversation = {
      messages: [
        { role: 'user', content: 'Secret prompt' },
        { role: 'assistant', content: 'Secret response' }
      ],
      timestamp: Date.now()
    };

    const cid = await storageManager.saveConversation(conversation, {
      hostPubKey,
      encrypt: true
    });

    // Verify uploaded data is encrypted
    const uploaded = await storageManager.s5.downloadBlob(cid);
    const parsed = JSON.parse(uploaded);
    expect(parsed.payload.ephPubHex).toBeDefined();
    expect(parsed.payload.ciphertextHex).toBeDefined();
  });

  test('should decrypt conversation on load', async () => {
    const original = {
      messages: [{ role: 'user', content: 'Test' }],
      timestamp: 123456
    };

    const cid = await storageManager.saveConversation(original, { hostPubKey, encrypt: true });
    const loaded = await storageManager.loadConversation(cid);

    expect(loaded).toEqual(original);
  });

  test('should support unencrypted conversations (backward compatible)', async () => {
    const conversation = { messages: [] };

    const cid = await storageManager.saveConversation(conversation, { encrypt: false });
    const loaded = await storageManager.loadConversation(cid);

    expect(loaded).toEqual(conversation);
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/StorageManager.ts (additions)
import type { EncryptionManager } from './EncryptionManager';

export interface SaveConversationOptions {
  hostPubKey?: string;  // Required if encrypt=true
  encrypt?: boolean;
  conversationId?: string;
}

export class StorageManager implements IStorageManager {
  private encryptionManager?: EncryptionManager;

  constructor(
    /* ... existing params ... */
    encryptionManager?: EncryptionManager
  ) {
    // ... existing initialization ...
    this.encryptionManager = encryptionManager;
  }

  async saveConversation(
    conversation: Conversation,
    options: SaveConversationOptions = {}
  ): Promise<string> {
    if (options.encrypt && this.encryptionManager) {
      return this.saveEncryptedConversation(conversation, options);
    } else {
      return this.savePlaintextConversation(conversation);
    }
  }

  private async saveEncryptedConversation(
    conversation: Conversation,
    options: SaveConversationOptions
  ): Promise<string> {
    if (!options.hostPubKey) {
      throw new Error('hostPubKey required for encrypted conversation storage');
    }

    // Encrypt with EncryptionManager
    const encrypted = await this.encryptionManager!.encryptForStorage(
      options.hostPubKey,
      conversation
    );

    // Add encryption metadata
    const blob = JSON.stringify({
      ...encrypted,
      encrypted: true,
      version: 1
    });

    // Upload to S5
    const cid = await this.s5.uploadBlob(blob);
    return cid;
  }

  private async savePlaintextConversation(conversation: Conversation): Promise<string> {
    // Existing plaintext logic
    const blob = JSON.stringify({
      conversation,
      encrypted: false,
      version: 1
    });

    return await this.s5.uploadBlob(blob);
  }

  async loadConversation(cid: string): Promise<Conversation> {
    // Download from S5
    const blob = await this.s5.downloadBlob(cid);
    const data = JSON.parse(blob);

    if (data.encrypted) {
      return this.loadEncryptedConversation(data);
    } else {
      return data.conversation;
    }
  }

  private async loadEncryptedConversation(data: any): Promise<Conversation> {
    if (!this.encryptionManager) {
      throw new Error('EncryptionManager required to load encrypted conversation');
    }

    const encrypted: EncryptedStorage = {
      payload: data.payload,
      storedAt: data.storedAt,
      conversationId: data.conversationId
    };

    const { data: conversation } = await this.encryptionManager.decryptFromStorage<Conversation>(encrypted);

    return conversation;
  }
}
```

**Acceptance Criteria**:
- [ ] Conversations encrypted before upload
- [ ] Decryption works on load
- [ ] Backward compatible (unencrypted still works)
- [ ] Encryption metadata stored
- [ ] All tests pass

---

### Sub-phase 5.2: Conversation Metadata & Discovery ⏳

**Goal**: Add encryption metadata and sender verification

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/StorageManager-metadata.test.ts` (120 lines max)
  - [ ] Test: encrypted conversations include metadata
  - [ ] Test: sender address recovered on load
  - [ ] Test: listConversations shows encryption status
  - [ ] Test: conversation ownership verified
- [ ] Update `packages/sdk-core/src/managers/StorageManager.ts` (+60 lines)
  - [ ] Add encryption metadata to saved conversations
  - [ ] Recover sender address on load
  - [ ] Add isEncrypted field to ConversationInfo
  - [ ] Update listConversations to show encryption status
- [ ] Verify all tests pass (4/4 ✅)

**Test Requirements**:
```typescript
describe('Conversation Metadata', () => {
  test('should include encryption metadata', async () => {
    const conversation = { messages: [] };
    const cid = await storageManager.saveConversation(conversation, { hostPubKey, encrypt: true });

    const blob = await storageManager.s5.downloadBlob(cid);
    const data = JSON.parse(blob);

    expect(data.encrypted).toBe(true);
    expect(data.version).toBe(1);
    expect(data.storedAt).toBeDefined();
  });

  test('should recover sender address on load', async () => {
    const conversation = { messages: [] };
    const cid = await storageManager.saveConversation(conversation, { hostPubKey, encrypt: true });

    const result = await storageManager.loadConversationWithMetadata(cid);

    expect(result.conversation).toEqual(conversation);
    expect(result.senderAddress).toBeDefined();
  });

  test('should list conversations with encryption status', async () => {
    await storageManager.saveConversation({ messages: [] }, { hostPubKey, encrypt: true });
    await storageManager.saveConversation({ messages: [] }, { encrypt: false });

    const list = await storageManager.listConversations();

    expect(list[0].isEncrypted).toBe(true);
    expect(list[1].isEncrypted).toBe(false);
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/StorageManager.ts (additions)

export interface ConversationInfo {
  cid: string;
  storedAt: string;
  conversationId: string;
  isEncrypted: boolean;
  senderAddress?: string;
}

export interface LoadConversationResult {
  conversation: Conversation;
  senderAddress?: string;
}

async loadConversationWithMetadata(cid: string): Promise<LoadConversationResult> {
  const blob = await this.s5.downloadBlob(cid);
  const data = JSON.parse(blob);

  if (data.encrypted && this.encryptionManager) {
    const encrypted: EncryptedStorage = {
      payload: data.payload,
      storedAt: data.storedAt,
      conversationId: data.conversationId
    };

    const { data: conversation, senderAddress } =
      await this.encryptionManager.decryptFromStorage<Conversation>(encrypted);

    return { conversation, senderAddress };
  } else {
    return { conversation: data.conversation };
  }
}

async listConversations(): Promise<ConversationInfo[]> {
  // List all conversation CIDs from S5
  const cids = await this.s5.listBlobs({ prefix: 'conversations/' });

  const infos: ConversationInfo[] = [];
  for (const cid of cids) {
    const blob = await this.s5.downloadBlob(cid);
    const data = JSON.parse(blob);

    infos.push({
      cid,
      storedAt: data.storedAt,
      conversationId: data.conversationId,
      isEncrypted: data.encrypted === true
    });
  }

  return infos;
}
```

**Acceptance Criteria**:
- [ ] Metadata stored with conversations
- [ ] Sender address recovered
- [ ] listConversations shows encryption status
- [ ] Conversation ownership verifiable
- [ ] All tests pass

---

### Sub-phase 5.3: FabstirSDKCore Integration ⏳

**Goal**: Integrate encrypted storage into SDK

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/integration/sdk-encrypted-storage.test.ts` (100 lines max)
  - [ ] Test: SDK provides encrypted storage methods
  - [ ] Test: End-to-end: start session → encrypt messages → save encrypted
- [ ] Update `packages/sdk-core/src/FabstirSDKCore.ts` (+20 lines)
  - [ ] Pass EncryptionManager to StorageManager constructor
  - [ ] Add convenience methods for encrypted storage
- [ ] Update documentation in `docs/SDK_API.md` (+50 lines)
  - [ ] Document encrypted storage API
  - [ ] Add usage examples
- [ ] Verify all tests pass (2/2 ✅)

**Test Requirements**:
```typescript
describe('SDK Encrypted Storage Integration', () => {
  let sdk: FabstirSDKCore;

  beforeEach(async () => {
    sdk = new FabstirSDKCore({ /* config */ });
    await sdk.authenticate(TEST_USER_1_PRIVATE_KEY);
  });

  test('should provide encrypted storage methods', () => {
    expect(sdk.saveConversation).toBeDefined();
    expect(sdk.loadConversation).toBeDefined();
  });

  test('should work end-to-end', async () => {
    // 1. Start encrypted session
    const sessionManager = await sdk.getSessionManager();
    await sessionManager.startSession({
      hostAddress: TEST_HOST_1_ADDRESS,
      hostUrl: 'ws://localhost:8080/ws',
      jobId: 123n,
      modelName: 'llama-3',
      chainId: 84532,
      encryption: true
    });

    // 2. Send/receive messages
    await sessionManager.sendMessage('Test prompt');
    // ... receive response ...

    // 3. Save encrypted conversation
    const conversation = sessionManager.getConversation();
    const hostPubKey = await sdk.getHostPublicKey(TEST_HOST_1_ADDRESS);
    const cid = await sdk.saveConversation(conversation, { hostPubKey, encrypt: true });

    // 4. Load and verify
    const loaded = await sdk.loadConversation(cid);
    expect(loaded).toEqual(conversation);
  });
});
```

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/FabstirSDKCore.ts (additions)

constructor(config: FabstirSDKConfig) {
  // ... existing initialization ...

  // Initialize EncryptionManager early (after AuthManager)
  this.encryptionManager = new EncryptionManager(this.wallet);

  // Pass to SessionManager and StorageManager
  this.sessionManager = new SessionManager(/* ... */, this.encryptionManager);
  this.storageManager = new StorageManager(/* ... */, this.encryptionManager);
}

/**
 * Save conversation with optional encryption.
 */
async saveConversation(
  conversation: Conversation,
  options: SaveConversationOptions = {}
): Promise<string> {
  const storageManager = await this.getStorageManager();
  return storageManager.saveConversation(conversation, options);
}

/**
 * Load conversation (decrypts if encrypted).
 */
async loadConversation(cid: string): Promise<Conversation> {
  const storageManager = await this.getStorageManager();
  return storageManager.loadConversation(cid);
}
```

**Acceptance Criteria**:
- [ ] SDK provides encrypted storage methods
- [ ] EncryptionManager passed to all managers
- [ ] End-to-end test passes
- [ ] Documentation updated
- [ ] All tests pass

---

## Phase 6: Testing & Documentation

**Dependencies**: Phases 1-5 complete
**Estimated Time**: 6-8 hours
**Goal**: Comprehensive testing and documentation

### Sub-phase 6.1: End-to-End Integration Tests ⏳

**Goal**: Test complete encrypted workflows

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/integration/encryption-e2e.test.ts` (300 lines max)
  - [ ] Test: Full encrypted session workflow
    - [ ] Client authenticates
    - [ ] Discovers host with public key
    - [ ] Starts encrypted session
    - [ ] Sends encrypted messages
    - [ ] Receives encrypted responses
    - [ ] Saves encrypted conversation
    - [ ] Loads encrypted conversation
  - [ ] Test: Multi-host scenario (different encryption keys)
  - [ ] Test: Session recovery (reconnect with same session key)
  - [ ] Test: Encryption opt-in/opt-out transitions
  - [ ] Test: Host verification (recovered address matches NodeRegistry)
- [ ] Run full test suite
- [ ] Verify all tests pass (5/5 ✅)

**Test Requirements**:
```typescript
describe('End-to-End Encryption Integration', () => {
  let sdk: FabstirSDKCore;
  let hostSdk: FabstirSDKCore; // For simulating host-side

  beforeEach(async () => {
    sdk = new FabstirSDKCore({ /* client config */ });
    hostSdk = new FabstirSDKCore({ /* host config */ });

    await sdk.authenticate(TEST_USER_1_PRIVATE_KEY);
    await hostSdk.authenticate(TEST_HOST_1_PRIVATE_KEY);
  });

  test('should complete full encrypted workflow', async () => {
    // 1. Register host with public key
    const hostManager = await hostSdk.getHostManager();
    await hostManager.registerHostWithModels({
      stake: '1000',
      apiUrl: 'http://localhost:8080',
      models: ['llama-3'],
      minPricePerToken: '2000'
      // publicKey automatically included in metadata
    });

    // 2. Client discovers host
    const hostDiscovery = await sdk.getHostDiscoveryService();
    const hosts = await hostDiscovery.findHosts({ modelId: 'llama-3' });
    expect(hosts.length).toBeGreaterThan(0);

    const selectedHost = hosts[0];
    expect(selectedHost.publicKey).toBeDefined();

    // 3. Start encrypted session
    const sessionManager = await sdk.getSessionManager();
    const session = await sessionManager.startSession({
      hostAddress: selectedHost.address,
      hostUrl: selectedHost.apiUrl,
      jobId: 123n,
      modelName: 'llama-3',
      chainId: 84532,
      encryption: true
    });

    // 4. Send encrypted message
    await sessionManager.sendMessage('What is 2+2?');

    // 5. (Simulate) Receive encrypted response
    // ... mock host-side decryption and response encryption ...

    // 6. Save encrypted conversation
    const conversation = sessionManager.getConversation();
    const cid = await sdk.saveConversation(conversation, {
      hostPubKey: selectedHost.publicKey,
      encrypt: true
    });

    expect(cid).toBeDefined();

    // 7. Load and verify
    const loaded = await sdk.loadConversation(cid);
    expect(loaded.messages.length).toBe(conversation.messages.length);
  });

  test('should verify host identity via address recovery', async () => {
    // Host sends encrypted session init
    const hostPubKey = await sdk.getHostPublicKey(TEST_HOST_1_ADDRESS);
    const encryptedInit = await sdk.encryptionManager!.encryptSessionInit(hostPubKey, {
      jobId: 456n,
      modelName: 'gpt-4',
      sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      pricePerToken: 2000
    });

    // Recover sender address
    const { senderAddress } = await hostSdk.encryptionManager!.decryptSessionInit(encryptedInit);

    // Verify sender is registered client (in real scenario, check ClientManager contract)
    expect(senderAddress.toLowerCase()).toBe(TEST_USER_1_ADDRESS.toLowerCase());
  });
});
```

**Acceptance Criteria**:
- [ ] Full encrypted workflow works end-to-end
- [ ] Host identity verification works
- [ ] Multi-host scenarios handled
- [ ] All integration tests pass
- [ ] No regressions in unencrypted flows

---

### Sub-phase 6.2: Documentation & Migration Guide ⏳

**Goal**: Complete documentation for encryption feature

**Status**: ⏳ Not started

**Tasks**:
- [ ] Update `docs/SDK_API.md` (+150 lines)
  - [ ] Document EncryptionManager API
  - [ ] Document encryption options in SessionManager
  - [ ] Document encrypted storage methods
  - [ ] Add code examples for each feature
- [ ] Create `docs/ENCRYPTION_GUIDE.md` (400 lines max)
  - [ ] Overview of encryption architecture
  - [ ] Key management explanation
  - [ ] How to enable encryption
  - [ ] Best practices
  - [ ] Security considerations
  - [ ] Troubleshooting
- [ ] Create `docs/ENCRYPTION_FAQ.md` (200 lines max)
  - [ ] What is encrypted?
  - [ ] How are keys managed?
  - [ ] Performance impact?
  - [ ] Can I use without encryption?
  - [ ] What if host doesn't support encryption?
  - [ ] How to verify encryption is working?
- [ ] Update `CLAUDE.md` (+50 lines)
  - [ ] Add encryption patterns
  - [ ] Update examples with encryption
  - [ ] Document EncryptionManager usage
- [ ] Verify all documentation complete

**Documentation Outline**:

#### `docs/ENCRYPTION_GUIDE.md`:
```markdown
# End-to-End Encryption Guide

## Overview

Fabstir LLM SDK provides optional end-to-end encryption using modern cryptographic primitives...

## Quick Start

```typescript
// 1. Initialize SDK (encryption automatic)
const sdk = new FabstirSDKCore({ /* config */ });
await sdk.authenticate(privateKey);

// 2. Start encrypted session
const session = await sessionManager.startSession({
  hostAddress: hostAddress,
  hostUrl: hostUrl,
  jobId: jobId,
  modelName: 'llama-3',
  chainId: 84532,
  encryption: true  // Enable E2EE
});

// 3. Send encrypted messages
await sessionManager.sendMessage('Secret prompt');
```

## Architecture

[Detailed explanation of ephemeral-static ECDH, signature recovery, etc.]

## Key Management

[How keys are derived, stored, and used]

## Security Considerations

- Forward secrecy via ephemeral keys
- Sender authentication via ECDSA signatures
- Replay protection via message indices
- No keys persisted to disk
- Contract-based allowlists

## Performance Impact

- Session init: ~10ms overhead (one-time)
- Streaming messages: < 1ms overhead per message
- Storage: ~50ms for 10KB conversation

## Troubleshooting

[Common issues and solutions]
```

#### `docs/ENCRYPTION_FAQ.md`:
```markdown
# Encryption FAQ

## What is encrypted?

- WebSocket session initialization (full signature)
- Streaming inference messages (symmetric)
- Stored conversation history (full signature)

## What is NOT encrypted?

- On-chain transactions (public by design)
- Host discovery metadata (public for marketplace)
- Payment information (visible on blockchain)

## How are keys managed?

Client keys: Derived from wallet private key (same as transaction signing)
Host keys: Retrieved from NodeRegistry metadata or signature recovery
Session keys: Generated fresh per session, stored in memory only
...

[More Q&A]
```

**Acceptance Criteria**:
- [ ] SDK_API.md updated with encryption docs
- [ ] ENCRYPTION_GUIDE.md created
- [ ] ENCRYPTION_FAQ.md created
- [ ] CLAUDE.md updated
- [ ] All examples work and tested
- [ ] Documentation reviewed for clarity

---

## Success Metrics

### Pre-MVP (Immediate)
- ✅ All crypto primitives tested with known vectors
- ✅ EncryptionManager fully functional
- ✅ Host public key discovery working
- ✅ SessionManager encryption integrated
- ✅ StorageManager encryption working
- ✅ All tests pass (17/17 sub-phases complete)

### MVP Launch
- 🎯 Encryption opt-in available to all users
- 🎯 >= 30% of sessions use encryption
- 🎯 No performance regressions
- 🎯 Host public keys discoverable for all active hosts
- 🎯 Stored conversations encrypted by default

### Post-MVP
- 🎯 Mandatory encryption (opt-out removed)
- 🎯 Security audit completed
- 🎯 >= 95% encryption adoption
- 🎯 Zero cryptographic vulnerabilities reported

## Risk Mitigation

### Cryptographic Risks
- **Risk**: Implementation bugs in crypto primitives
- **Mitigation**: Use audited @noble libraries, extensive testing with known vectors
- **Fallback**: Encryption optional initially, can disable if issues found

### Key Management Risks
- **Risk**: Private keys leaked or compromised
- **Mitigation**: Keys derived from wallet (same security as blockchain transactions), ephemeral keys discarded
- **Fallback**: Session keys in memory only, never persisted

### Performance Risks
- **Risk**: Encryption slows down streaming
- **Mitigation**: Use fast symmetric crypto (XChaCha20-Poly1305), async operations
- **Measurement**: Benchmark before/after, target < 1ms overhead per message

### Adoption Risks
- **Risk**: Users don't enable encryption
- **Mitigation**: Opt-in initially, measure adoption, make default later
- **Incentive**: Privacy-conscious users, enterprise requirements

### Node Integration Risks
- **Risk**: fabstir-llm-node doesn't support encryption
- **Mitigation**: Coordinate with node team, provide reference implementation
- **Timeline**: Node updates parallel to SDK development

## Timeline

**Week 1**: Phase 1 (Core Crypto Module)
**Week 2**: Phase 2 (EncryptionManager) + Phase 3 (Host Public Key Discovery)
**Week 3**: Phase 4 (SessionManager Integration)
**Week 4**: Phase 5 (StorageManager Integration) + Phase 6 (Testing & Docs)

**Total**: 4 weeks for full implementation

## Next Steps

1. **Immediate**: Review this plan with team
2. **Day 1**: Begin Phase 1.1 (install dependencies, write utility tests)
3. **Continuous**: Follow strict TDD - write tests FIRST for every sub-phase
4. **Week 4**: Complete Phase 6 and prepare for MVP launch
5. **Post-MVP**: Monitor adoption, prepare for mandatory encryption

## Dependencies to Install

```bash
cd packages/sdk-core
pnpm add @noble/secp256k1@^2.0.0 @noble/hashes@^1.3.3 @noble/ciphers@^0.4.0
```

**Total Size**: ~50KB gzipped (acceptable for browser bundle)

## Questions for Team

Before starting:
1. Approve encryption as opt-in feature initially?
2. Timeline acceptable (4 weeks)?
3. Performance targets acceptable (< 1ms per message)?
4. Node team ready to implement decryption side?
5. Any regulatory requirements for encryption (e.g., export controls)?

---

**Document Version**: 1.0
**Last Updated**: 2025-10-12
**Status**: ⏳ Ready for implementation
**Maintainer**: Fabstir Development Team
