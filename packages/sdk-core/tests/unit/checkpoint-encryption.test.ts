/**
 * Tests for Encrypted Checkpoint Delta Decryption (Sub-phase 8.3)
 *
 * Tests that SDK can decrypt checkpoint deltas encrypted by the node
 * using ECDH + HKDF + XChaCha20-Poly1305.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hexToBytes, bytesToHex } from '../../src/crypto/utilities';
import type { CheckpointDelta, EncryptedCheckpointDelta } from '../../src/types';

// Import the functions we're testing (will be implemented)
import {
  decryptCheckpointDelta,
  isEncryptedDelta,
  deriveCheckpointEncryptionKey,
} from '../../src/utils/checkpoint-encryption';

// Test constants
const TEST_USER_PRIVATE_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const TEST_USER_PUBLIC_KEY = bytesToHex(secp.getPublicKey(TEST_USER_PRIVATE_KEY, true));

// Different user for negative tests
const OTHER_USER_PRIVATE_KEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const OTHER_USER_PUBLIC_KEY = bytesToHex(secp.getPublicKey(OTHER_USER_PRIVATE_KEY, true));

// Host keypair for signing
const TEST_HOST_PRIVATE_KEY = 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321';
const TEST_HOST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f5B0E1';

// HKDF info string (must match NODE_CHECKPOINT_SPEC.md)
const CHECKPOINT_HKDF_INFO = 'checkpoint-delta-encryption-v1';

/**
 * Helper: Create a plaintext checkpoint delta for testing.
 */
function createTestDelta(index: number = 0): CheckpointDelta {
  return {
    sessionId: 'test-session-123',
    checkpointIndex: index,
    proofHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    startToken: index * 1000,
    endToken: (index + 1) * 1000,
    messages: [
      { role: 'user', content: 'Hello, how are you?', timestamp: 1704844800000 },
      { role: 'assistant', content: 'I am doing well, thank you!', timestamp: 1704844805000 },
    ],
    hostSignature: '0x' + 'ab'.repeat(65),
  };
}

/**
 * Helper: Recursively sort object keys for deterministic JSON.
 * Matches Python's json.dumps(sort_keys=True) behavior.
 */
function sortKeysRecursive(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursive);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: any = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysRecursive(obj[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Helper: Encrypt a checkpoint delta (simulating node behavior).
 * This creates encrypted deltas for testing SDK decryption.
 */
function encryptDeltaForTest(
  delta: CheckpointDelta,
  userRecoveryPubKey: string
): EncryptedCheckpointDelta {
  // 1. Generate ephemeral keypair
  const ephemeralPrivate = secp.utils.randomPrivateKey();
  const ephemeralPublic = secp.getPublicKey(ephemeralPrivate, true);

  // 2. ECDH: ephemeral_private x user_recovery_public = shared_point
  const userPubBytes = hexToBytes(userRecoveryPubKey.replace(/^0x/, ''));
  const sharedPoint = secp.getSharedSecret(ephemeralPrivate, userPubBytes, true);
  const xCoord = sharedPoint.slice(1); // Drop prefix, take x-coordinate (32 bytes)

  // 3. SHA256 of x-coordinate to get shared secret
  const sharedSecret = sha256(xCoord);

  // 4. HKDF key derivation (matches NODE_CHECKPOINT_SPEC.md)
  const encryptionKey = hkdf(
    sha256,
    sharedSecret,
    undefined, // salt = None
    new TextEncoder().encode(CHECKPOINT_HKDF_INFO),
    32
  );

  // 5. Serialize delta to JSON (sorted keys recursively - matches Python json.dumps(sort_keys=True))
  const sortedDelta = sortKeysRecursive(delta);
  const plaintext = JSON.stringify(sortedDelta);

  // 6. Generate random nonce (24 bytes for XChaCha20)
  const nonce = crypto.getRandomValues(new Uint8Array(24));

  // 7. Encrypt with XChaCha20-Poly1305
  const cipher = xchacha20poly1305(encryptionKey, nonce);
  const ciphertext = cipher.encrypt(new TextEncoder().encode(plaintext));

  // 8. Sign the ciphertext (simplified - just hash for testing)
  const hostSignature = '0x' + bytesToHex(sha256(ciphertext)) + '00'.repeat(33);

  return {
    encrypted: true,
    version: 1,
    userRecoveryPubKey: userRecoveryPubKey,
    ephemeralPublicKey: '0x' + bytesToHex(ephemeralPublic),
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
    hostSignature,
  };
}

/**
 * Helper: Create encrypted delta with specific ephemeral key (for deterministic tests).
 */
function encryptDeltaWithFixedKey(
  delta: CheckpointDelta,
  userRecoveryPubKey: string,
  ephemeralPrivateHex: string,
  nonceHex: string
): EncryptedCheckpointDelta {
  const ephemeralPrivate = hexToBytes(ephemeralPrivateHex);
  const ephemeralPublic = secp.getPublicKey(ephemeralPrivate, true);

  const userPubBytes = hexToBytes(userRecoveryPubKey.replace(/^0x/, ''));
  const sharedPoint = secp.getSharedSecret(ephemeralPrivate, userPubBytes, true);
  const xCoord = sharedPoint.slice(1);
  const sharedSecret = sha256(xCoord);

  const encryptionKey = hkdf(
    sha256,
    sharedSecret,
    undefined,
    new TextEncoder().encode(CHECKPOINT_HKDF_INFO),
    32
  );

  // Sort keys recursively (matches Python json.dumps(sort_keys=True))
  const sortedDelta = sortKeysRecursive(delta);
  const plaintext = JSON.stringify(sortedDelta);
  const nonce = hexToBytes(nonceHex);

  const cipher = xchacha20poly1305(encryptionKey, nonce);
  const ciphertext = cipher.encrypt(new TextEncoder().encode(plaintext));

  const hostSignature = '0x' + bytesToHex(sha256(ciphertext)) + '00'.repeat(33);

  return {
    encrypted: true,
    version: 1,
    userRecoveryPubKey: userRecoveryPubKey,
    ephemeralPublicKey: '0x' + bytesToHex(ephemeralPublic),
    nonce: nonceHex,
    ciphertext: bytesToHex(ciphertext),
    hostSignature,
  };
}

describe('Checkpoint Encryption Detection', () => {
  describe('isEncryptedDelta()', () => {
    it('should return true for encrypted delta format', () => {
      const encrypted: EncryptedCheckpointDelta = {
        encrypted: true,
        version: 1,
        userRecoveryPubKey: '0x' + TEST_USER_PUBLIC_KEY,
        ephemeralPublicKey: '0x' + 'ab'.repeat(33),
        nonce: 'cd'.repeat(24),
        ciphertext: 'ef'.repeat(100),
        hostSignature: '0x' + '12'.repeat(65),
      };

      expect(isEncryptedDelta(encrypted)).toBe(true);
    });

    it('should return false for plaintext delta format', () => {
      const plaintext = createTestDelta();

      expect(isEncryptedDelta(plaintext)).toBe(false);
    });

    it('should return false for delta with encrypted=false', () => {
      const delta = {
        encrypted: false,
        sessionId: '123',
        checkpointIndex: 0,
        // ... other fields
      };

      expect(isEncryptedDelta(delta)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isEncryptedDelta(null)).toBe(false);
      expect(isEncryptedDelta(undefined)).toBe(false);
    });
  });
});

describe('Checkpoint Key Derivation', () => {
  describe('deriveCheckpointEncryptionKey()', () => {
    it('should derive same key from same inputs (deterministic)', () => {
      const ephemeralPubHex = '0x' + bytesToHex(secp.getPublicKey(TEST_HOST_PRIVATE_KEY, true));

      const key1 = deriveCheckpointEncryptionKey(TEST_USER_PRIVATE_KEY, ephemeralPubHex);
      const key2 = deriveCheckpointEncryptionKey(TEST_USER_PRIVATE_KEY, ephemeralPubHex);

      expect(bytesToHex(key1)).toBe(bytesToHex(key2));
    });

    it('should derive different key for different ephemeral keys', () => {
      const ephemeralPub1 = '0x' + bytesToHex(secp.getPublicKey(TEST_HOST_PRIVATE_KEY, true));
      const ephemeralPub2 = '0x' + bytesToHex(secp.getPublicKey(OTHER_USER_PRIVATE_KEY, true));

      const key1 = deriveCheckpointEncryptionKey(TEST_USER_PRIVATE_KEY, ephemeralPub1);
      const key2 = deriveCheckpointEncryptionKey(TEST_USER_PRIVATE_KEY, ephemeralPub2);

      expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
    });

    it('should derive different key for different user keys', () => {
      const ephemeralPubHex = '0x' + bytesToHex(secp.getPublicKey(TEST_HOST_PRIVATE_KEY, true));

      const key1 = deriveCheckpointEncryptionKey(TEST_USER_PRIVATE_KEY, ephemeralPubHex);
      const key2 = deriveCheckpointEncryptionKey(OTHER_USER_PRIVATE_KEY, ephemeralPubHex);

      expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
    });

    it('should return 32-byte key', () => {
      const ephemeralPubHex = '0x' + bytesToHex(secp.getPublicKey(TEST_HOST_PRIVATE_KEY, true));

      const key = deriveCheckpointEncryptionKey(TEST_USER_PRIVATE_KEY, ephemeralPubHex);

      expect(key.length).toBe(32);
    });
  });
});

describe('Checkpoint Delta Decryption', () => {
  describe('decryptCheckpointDelta()', () => {
    it('should decrypt valid encrypted delta', () => {
      const originalDelta = createTestDelta(0);
      const encrypted = encryptDeltaForTest(originalDelta, '0x' + TEST_USER_PUBLIC_KEY);

      const decrypted = decryptCheckpointDelta(encrypted, TEST_USER_PRIVATE_KEY);

      expect(decrypted.sessionId).toBe(originalDelta.sessionId);
      expect(decrypted.checkpointIndex).toBe(originalDelta.checkpointIndex);
      expect(decrypted.proofHash).toBe(originalDelta.proofHash);
      expect(decrypted.startToken).toBe(originalDelta.startToken);
      expect(decrypted.endToken).toBe(originalDelta.endToken);
      expect(decrypted.messages).toHaveLength(originalDelta.messages.length);
      expect(decrypted.messages[0].content).toBe(originalDelta.messages[0].content);
    });

    it('should decrypt delta with multiple messages', () => {
      const delta: CheckpointDelta = {
        sessionId: 'multi-msg-session',
        checkpointIndex: 2,
        proofHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        startToken: 2000,
        endToken: 3000,
        messages: [
          { role: 'user', content: 'First message', timestamp: 1704844800000 },
          { role: 'assistant', content: 'First response', timestamp: 1704844801000 },
          { role: 'user', content: 'Second message', timestamp: 1704844802000 },
          { role: 'assistant', content: 'Second response', timestamp: 1704844803000 },
        ],
        hostSignature: '0x' + 'ff'.repeat(65),
      };

      const encrypted = encryptDeltaForTest(delta, '0x' + TEST_USER_PUBLIC_KEY);
      const decrypted = decryptCheckpointDelta(encrypted, TEST_USER_PRIVATE_KEY);

      expect(decrypted.messages).toHaveLength(4);
      expect(decrypted.messages[2].content).toBe('Second message');
    });

    it('should fail with wrong private key', () => {
      const originalDelta = createTestDelta(0);
      const encrypted = encryptDeltaForTest(originalDelta, '0x' + TEST_USER_PUBLIC_KEY);

      // Try to decrypt with different private key
      expect(() => {
        decryptCheckpointDelta(encrypted, OTHER_USER_PRIVATE_KEY);
      }).toThrow();
    });

    it('should fail with tampered ciphertext', () => {
      const originalDelta = createTestDelta(0);
      const encrypted = encryptDeltaForTest(originalDelta, '0x' + TEST_USER_PUBLIC_KEY);

      // Tamper with ciphertext (flip some bits)
      const tamperedCiphertext =
        encrypted.ciphertext.slice(0, 10) +
        'ff' +
        encrypted.ciphertext.slice(12);

      const tampered: EncryptedCheckpointDelta = {
        ...encrypted,
        ciphertext: tamperedCiphertext,
      };

      expect(() => {
        decryptCheckpointDelta(tampered, TEST_USER_PRIVATE_KEY);
      }).toThrow();
    });

    it('should fail with wrong nonce', () => {
      const originalDelta = createTestDelta(0);
      const encrypted = encryptDeltaForTest(originalDelta, '0x' + TEST_USER_PUBLIC_KEY);

      // Use wrong nonce
      const wrongNonce = 'aa'.repeat(24); // Different from original

      const tampered: EncryptedCheckpointDelta = {
        ...encrypted,
        nonce: wrongNonce,
      };

      expect(() => {
        decryptCheckpointDelta(tampered, TEST_USER_PRIVATE_KEY);
      }).toThrow();
    });

    it('should fail with invalid ephemeral public key', () => {
      const originalDelta = createTestDelta(0);
      const encrypted = encryptDeltaForTest(originalDelta, '0x' + TEST_USER_PUBLIC_KEY);

      // Use invalid ephemeral public key
      const tampered: EncryptedCheckpointDelta = {
        ...encrypted,
        ephemeralPublicKey: '0x' + '00'.repeat(33), // Invalid point
      };

      expect(() => {
        decryptCheckpointDelta(tampered, TEST_USER_PRIVATE_KEY);
      }).toThrow();
    });

    it('should handle delta with metadata in messages', () => {
      const delta: CheckpointDelta = {
        sessionId: 'metadata-session',
        checkpointIndex: 0,
        proofHash: '0x' + '12'.repeat(32),
        startToken: 0,
        endToken: 1000,
        messages: [
          { role: 'user', content: 'Hello', timestamp: 1704844800000 },
          {
            role: 'assistant',
            content: 'Partial response...',
            timestamp: 1704844801000,
            metadata: { partial: true },
          },
        ],
        hostSignature: '0x' + 'cc'.repeat(65),
      };

      const encrypted = encryptDeltaForTest(delta, '0x' + TEST_USER_PUBLIC_KEY);
      const decrypted = decryptCheckpointDelta(encrypted, TEST_USER_PRIVATE_KEY);

      expect(decrypted.messages[1].metadata?.partial).toBe(true);
    });
  });

  describe('decryptCheckpointDelta() - deterministic test vector', () => {
    it('should produce consistent results with fixed inputs', () => {
      const delta = createTestDelta(0);
      const ephemeralPrivate = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const fixedNonce = '000102030405060708090a0b0c0d0e0f1011121314151617';

      const encrypted = encryptDeltaWithFixedKey(
        delta,
        '0x' + TEST_USER_PUBLIC_KEY,
        ephemeralPrivate,
        fixedNonce
      );

      // Decrypt and verify
      const decrypted = decryptCheckpointDelta(encrypted, TEST_USER_PRIVATE_KEY);

      expect(decrypted.sessionId).toBe(delta.sessionId);
      expect(decrypted.checkpointIndex).toBe(delta.checkpointIndex);

      // Encrypt again with same parameters should produce same ciphertext
      const encrypted2 = encryptDeltaWithFixedKey(
        delta,
        '0x' + TEST_USER_PUBLIC_KEY,
        ephemeralPrivate,
        fixedNonce
      );

      expect(encrypted2.ciphertext).toBe(encrypted.ciphertext);
    });
  });
});

describe('EncryptedCheckpointDelta Type', () => {
  it('should accept valid encrypted delta structure', () => {
    const encrypted: EncryptedCheckpointDelta = {
      encrypted: true,
      version: 1,
      userRecoveryPubKey: '0x02abc123...',
      ephemeralPublicKey: '0x03def456...',
      nonce: 'aabbccdd...',
      ciphertext: 'encrypted_data...',
      hostSignature: '0x1234...',
    };

    expect(encrypted.encrypted).toBe(true);
    expect(encrypted.version).toBe(1);
  });
});
