// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * E2E Integration Tests for Encrypted Checkpoint Recovery (Phase 8.5)
 *
 * Tests the complete encrypted checkpoint flow:
 * - Node encrypts deltas with user's recovery public key
 * - SDK fetches encrypted deltas from S5
 * - SDK decrypts deltas with user's recovery private key
 * - Conversation recovered successfully
 *
 * Also tests backward compatibility with plaintext deltas.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hexToBytes, bytesToHex } from '../../src/crypto/utilities';
import type { CheckpointDelta, CheckpointIndex, EncryptedCheckpointDelta, Message } from '../../src/types';
import {
  fetchAndVerifyDelta,
  mergeDeltas,
  recoverFromCheckpointsFlow,
  recoverFromCheckpointsFlowWithHttp,
  type ProofQueryContract,
  type GetSessionInfoFn,
  type GetSessionInfoWithHostUrlFn,
} from '../../src/utils/checkpoint-recovery';
import { isEncryptedDelta, decryptCheckpointDelta } from '../../src/utils/checkpoint-encryption';

// Test constants matching node v8.12.0 format
const TEST_USER_PRIVATE_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const TEST_USER_PUBLIC_KEY = bytesToHex(secp.getPublicKey(TEST_USER_PRIVATE_KEY, true));
const OTHER_USER_PRIVATE_KEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const TEST_HOST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f5B0E1';
const CHECKPOINT_HKDF_INFO = 'checkpoint-delta-encryption-v1';

// Mock fetch for HTTP tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
 * Helper: Create a plaintext checkpoint delta.
 */
function createPlaintextDelta(
  index: number,
  messages: Message[]
): CheckpointDelta {
  return {
    sessionId: 'test-session-123',
    checkpointIndex: index,
    proofHash: `0x${(index + 1).toString(16).padStart(64, '0')}`,
    startToken: index * 1000,
    endToken: (index + 1) * 1000,
    messages,
    hostSignature: '0x' + 'ab'.repeat(65),
  };
}

/**
 * Helper: Encrypt a checkpoint delta (simulating node v8.12.0 behavior).
 */
function encryptDeltaLikeNode(
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

  // 4. HKDF key derivation
  const encryptionKey = hkdf(
    sha256,
    sharedSecret,
    undefined, // salt = None
    new TextEncoder().encode(CHECKPOINT_HKDF_INFO),
    32
  );

  // 5. Random 24-byte nonce for XChaCha20-Poly1305
  const nonce = new Uint8Array(24);
  crypto.getRandomValues(nonce);

  // 6. Serialize delta with sorted keys (matches Python json.dumps(sort_keys=True))
  const sortedDelta = sortKeysRecursive(delta);
  const plaintext = new TextEncoder().encode(JSON.stringify(sortedDelta));

  // 7. Encrypt with XChaCha20-Poly1305
  const cipher = xchacha20poly1305(encryptionKey, nonce);
  const ciphertext = cipher.encrypt(plaintext);

  // 8. Host signature over keccak256(ciphertext) - simplified for test
  const hostSignature = '0x' + 'cd'.repeat(65);

  return {
    encrypted: true,
    version: 1,
    userRecoveryPubKey: userRecoveryPubKey.startsWith('0x')
      ? userRecoveryPubKey
      : '0x' + userRecoveryPubKey,
    ephemeralPublicKey: '0x' + bytesToHex(ephemeralPublic),
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
    hostSignature,
  };
}

/**
 * Mock StorageManager for testing.
 */
function createMockStorageManager(deltaMap: Map<string, any>) {
  return {
    getS5Client: () => ({
      fs: {
        get: async (path: string) => {
          // Parse session ID from path
          const match = path.match(/index\.json$/);
          if (match) {
            return deltaMap.get('index') || null;
          }
          return null;
        },
      },
    }),
    getByCID: async (cid: string) => {
      return deltaMap.get(cid) || null;
    },
  } as any;
}

/**
 * Mock contract for proof verification.
 */
function createMockContract(proofHashes: Map<number, string>): ProofQueryContract {
  return {
    getProofSubmission: async (sessionId: bigint, proofIndex: number) => ({
      proofHash: proofHashes.get(proofIndex) || '0x0',
      tokensClaimed: BigInt(1000),
      timestamp: BigInt(Date.now()),
      verified: true,
    }),
  };
}

describe('Encrypted Checkpoint E2E Integration', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Full Flow with Encrypted Checkpoints', () => {
    it('should recover conversation from encrypted checkpoints', async () => {
      // Setup: Create encrypted deltas as node would
      const messages1: Message[] = [
        { role: 'user', content: 'Hello!', timestamp: 1704844800000 },
        { role: 'assistant', content: 'Hi there!', timestamp: 1704844805000 },
      ];
      const messages2: Message[] = [
        { role: 'user', content: 'How are you?', timestamp: 1704844810000 },
        { role: 'assistant', content: 'I am doing well!', timestamp: 1704844815000 },
      ];

      const delta1 = createPlaintextDelta(0, messages1);
      const delta2 = createPlaintextDelta(1, messages2);

      // Node encrypts deltas
      const encryptedDelta1 = encryptDeltaLikeNode(delta1, TEST_USER_PUBLIC_KEY);
      const encryptedDelta2 = encryptDeltaLikeNode(delta2, TEST_USER_PUBLIC_KEY);

      // Create checkpoint index
      const cid1 = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00001';
      const cid2 = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00002';

      const checkpointIndex: CheckpointIndex = {
        sessionId: 'test-session-123',
        hostAddress: TEST_HOST_ADDRESS,
        checkpoints: [
          {
            index: 0,
            proofHash: delta1.proofHash,
            deltaCid: cid1,
            tokenRange: [0, 1000],
            timestamp: 1704844800000,
          },
          {
            index: 1,
            proofHash: delta2.proofHash,
            deltaCid: cid2,
            tokenRange: [1000, 2000],
            timestamp: 1704844810000,
          },
        ],
        messagesSignature: '0x' + 'aa'.repeat(65),
        checkpointsSignature: '0x' + 'bb'.repeat(65),
      };

      // Mock storage with encrypted deltas
      const deltaMap = new Map<string, any>([
        ['index', checkpointIndex],
        [cid1, encryptedDelta1],
        [cid2, encryptedDelta2],
      ]);

      const storageManager = createMockStorageManager(deltaMap);
      const contract = createMockContract(
        new Map([
          [0, delta1.proofHash],
          [1, delta2.proofHash],
        ])
      );

      const getSessionInfo: GetSessionInfoFn = async () => ({
        hostAddress: TEST_HOST_ADDRESS,
        status: 'completed',
      });

      // Execute recovery with user's private key
      const result = await recoverFromCheckpointsFlow(
        storageManager,
        contract,
        getSessionInfo,
        BigInt(123),
        TEST_USER_PRIVATE_KEY
      );

      // Verify recovered messages
      expect(result.messages).toHaveLength(4);
      expect(result.messages[0].content).toBe('Hello!');
      expect(result.messages[1].content).toBe('Hi there!');
      expect(result.messages[2].content).toBe('How are you?');
      expect(result.messages[3].content).toBe('I am doing well!');
      expect(result.tokenCount).toBe(2000);
      expect(result.checkpoints).toHaveLength(2);
    });

    it('should handle HTTP-based recovery with encrypted deltas', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test message', timestamp: 1704844800000 },
        { role: 'assistant', content: 'Test response', timestamp: 1704844805000 },
      ];

      const delta = createPlaintextDelta(0, messages);
      const encryptedDelta = encryptDeltaLikeNode(delta, TEST_USER_PUBLIC_KEY);
      const cid = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00001';

      const checkpointIndex: CheckpointIndex = {
        sessionId: 'test-session-123',
        hostAddress: TEST_HOST_ADDRESS,
        checkpoints: [
          {
            index: 0,
            proofHash: delta.proofHash,
            deltaCid: cid,
            tokenRange: [0, 1000],
            timestamp: 1704844800000,
          },
        ],
        messagesSignature: '0x' + 'aa'.repeat(65),
        checkpointsSignature: '0x' + 'bb'.repeat(65),
      };

      // Mock HTTP fetch for index
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => checkpointIndex,
      });

      const deltaMap = new Map<string, any>([[cid, encryptedDelta]]);
      const storageManager = createMockStorageManager(deltaMap);
      const contract = createMockContract(new Map([[0, delta.proofHash]]));

      const getSessionInfo: GetSessionInfoWithHostUrlFn = async () => ({
        hostAddress: TEST_HOST_ADDRESS,
        hostUrl: 'http://localhost:8080',
        status: 'completed',
      });

      const result = await recoverFromCheckpointsFlowWithHttp(
        storageManager,
        contract,
        getSessionInfo,
        BigInt(123),
        TEST_USER_PRIVATE_KEY
      );

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe('Test message');
      expect(result.messages[1].content).toBe('Test response');
    });
  });

  describe('Mixed Encrypted and Plaintext Deltas (Backward Compatibility)', () => {
    it('should recover conversation with mix of encrypted and plaintext deltas', async () => {
      // First checkpoint: plaintext (legacy node)
      const messages1: Message[] = [
        { role: 'user', content: 'Legacy prompt', timestamp: 1704844800000 },
        { role: 'assistant', content: 'Legacy response', timestamp: 1704844805000 },
      ];
      const plaintextDelta = createPlaintextDelta(0, messages1);

      // Second checkpoint: encrypted (node v8.12.0+)
      const messages2: Message[] = [
        { role: 'user', content: 'New prompt', timestamp: 1704844810000 },
        { role: 'assistant', content: 'Encrypted response', timestamp: 1704844815000 },
      ];
      const delta2 = createPlaintextDelta(1, messages2);
      const encryptedDelta = encryptDeltaLikeNode(delta2, TEST_USER_PUBLIC_KEY);

      const cid1 = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00001';
      const cid2 = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00002';

      const checkpointIndex: CheckpointIndex = {
        sessionId: 'test-session-123',
        hostAddress: TEST_HOST_ADDRESS,
        checkpoints: [
          {
            index: 0,
            proofHash: plaintextDelta.proofHash,
            deltaCid: cid1,
            tokenRange: [0, 1000],
            timestamp: 1704844800000,
          },
          {
            index: 1,
            proofHash: delta2.proofHash,
            deltaCid: cid2,
            tokenRange: [1000, 2000],
            timestamp: 1704844810000,
          },
        ],
        messagesSignature: '0x' + 'aa'.repeat(65),
        checkpointsSignature: '0x' + 'bb'.repeat(65),
      };

      const deltaMap = new Map<string, any>([
        ['index', checkpointIndex],
        [cid1, plaintextDelta], // Plaintext
        [cid2, encryptedDelta], // Encrypted
      ]);

      const storageManager = createMockStorageManager(deltaMap);
      const contract = createMockContract(
        new Map([
          [0, plaintextDelta.proofHash],
          [1, delta2.proofHash],
        ])
      );

      const getSessionInfo: GetSessionInfoFn = async () => ({
        hostAddress: TEST_HOST_ADDRESS,
        status: 'completed',
      });

      // Recovery with private key handles both
      const result = await recoverFromCheckpointsFlow(
        storageManager,
        contract,
        getSessionInfo,
        BigInt(123),
        TEST_USER_PRIVATE_KEY
      );

      expect(result.messages).toHaveLength(4);
      expect(result.messages[0].content).toBe('Legacy prompt');
      expect(result.messages[1].content).toBe('Legacy response');
      expect(result.messages[2].content).toBe('New prompt');
      expect(result.messages[3].content).toBe('Encrypted response');
    });

    it('should recover plaintext-only checkpoints without private key', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Plaintext only', timestamp: 1704844800000 },
      ];
      const plaintextDelta = createPlaintextDelta(0, messages);
      const cid = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00001';

      const checkpointIndex: CheckpointIndex = {
        sessionId: 'test-session-123',
        hostAddress: TEST_HOST_ADDRESS,
        checkpoints: [
          {
            index: 0,
            proofHash: plaintextDelta.proofHash,
            deltaCid: cid,
            tokenRange: [0, 1000],
            timestamp: 1704844800000,
          },
        ],
        messagesSignature: '0x' + 'aa'.repeat(65),
        checkpointsSignature: '0x' + 'bb'.repeat(65),
      };

      const deltaMap = new Map<string, any>([
        ['index', checkpointIndex],
        [cid, plaintextDelta],
      ]);

      const storageManager = createMockStorageManager(deltaMap);
      const contract = createMockContract(new Map([[0, plaintextDelta.proofHash]]));

      const getSessionInfo: GetSessionInfoFn = async () => ({
        hostAddress: TEST_HOST_ADDRESS,
        status: 'completed',
      });

      // No private key needed for plaintext
      const result = await recoverFromCheckpointsFlow(
        storageManager,
        contract,
        getSessionInfo,
        BigInt(123)
        // No userPrivateKey
      );

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Plaintext only');
    });
  });

  describe('Decryption Key Unavailable Error Handling', () => {
    it('should throw DECRYPTION_KEY_REQUIRED when encrypted delta and no key', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Secret message', timestamp: 1704844800000 },
      ];
      const delta = createPlaintextDelta(0, messages);
      const encryptedDelta = encryptDeltaLikeNode(delta, TEST_USER_PUBLIC_KEY);
      const cid = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00001';

      const checkpointIndex: CheckpointIndex = {
        sessionId: 'test-session-123',
        hostAddress: TEST_HOST_ADDRESS,
        checkpoints: [
          {
            index: 0,
            proofHash: delta.proofHash,
            deltaCid: cid,
            tokenRange: [0, 1000],
            timestamp: 1704844800000,
          },
        ],
        messagesSignature: '0x' + 'aa'.repeat(65),
        checkpointsSignature: '0x' + 'bb'.repeat(65),
      };

      const deltaMap = new Map<string, any>([
        ['index', checkpointIndex],
        [cid, encryptedDelta],
      ]);

      const storageManager = createMockStorageManager(deltaMap);
      const contract = createMockContract(new Map([[0, delta.proofHash]]));

      const getSessionInfo: GetSessionInfoFn = async () => ({
        hostAddress: TEST_HOST_ADDRESS,
        status: 'completed',
      });

      // Attempt recovery without private key
      await expect(
        recoverFromCheckpointsFlow(
          storageManager,
          contract,
          getSessionInfo,
          BigInt(123)
          // No userPrivateKey!
        )
      ).rejects.toThrow('DECRYPTION_KEY_REQUIRED');
    });

    it('should throw DECRYPTION_FAILED when wrong private key provided', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Secret message', timestamp: 1704844800000 },
      ];
      const delta = createPlaintextDelta(0, messages);
      const encryptedDelta = encryptDeltaLikeNode(delta, TEST_USER_PUBLIC_KEY);
      const cid = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00001';

      const checkpointIndex: CheckpointIndex = {
        sessionId: 'test-session-123',
        hostAddress: TEST_HOST_ADDRESS,
        checkpoints: [
          {
            index: 0,
            proofHash: delta.proofHash,
            deltaCid: cid,
            tokenRange: [0, 1000],
            timestamp: 1704844800000,
          },
        ],
        messagesSignature: '0x' + 'aa'.repeat(65),
        checkpointsSignature: '0x' + 'bb'.repeat(65),
      };

      const deltaMap = new Map<string, any>([
        ['index', checkpointIndex],
        [cid, encryptedDelta],
      ]);

      const storageManager = createMockStorageManager(deltaMap);
      const contract = createMockContract(new Map([[0, delta.proofHash]]));

      const getSessionInfo: GetSessionInfoFn = async () => ({
        hostAddress: TEST_HOST_ADDRESS,
        status: 'completed',
      });

      // Attempt recovery with WRONG private key
      await expect(
        recoverFromCheckpointsFlow(
          storageManager,
          contract,
          getSessionInfo,
          BigInt(123),
          OTHER_USER_PRIVATE_KEY // Wrong key!
        )
      ).rejects.toThrow('DECRYPTION_FAILED');
    });

    it('should provide clear error message for decryption failures', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Message', timestamp: 1704844800000 },
      ];
      const delta = createPlaintextDelta(0, messages);
      const encryptedDelta = encryptDeltaLikeNode(delta, TEST_USER_PUBLIC_KEY);

      // Tamper with ciphertext
      const tamperedDelta = {
        ...encryptedDelta,
        ciphertext: 'ff' + encryptedDelta.ciphertext.slice(2),
      };

      const cid = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00001';

      const deltaMap = new Map<string, any>([[cid, tamperedDelta]]);
      const storageManager = createMockStorageManager(deltaMap);

      await expect(
        fetchAndVerifyDelta(
          storageManager,
          cid,
          TEST_HOST_ADDRESS,
          TEST_USER_PRIVATE_KEY
        )
      ).rejects.toThrow('DECRYPTION_FAILED');
    });
  });

  describe('Encrypted Delta Detection', () => {
    it('should correctly identify encrypted deltas', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test', timestamp: 1704844800000 },
      ];
      const plaintextDelta = createPlaintextDelta(0, messages);
      const encryptedDelta = encryptDeltaLikeNode(plaintextDelta, TEST_USER_PUBLIC_KEY);

      expect(isEncryptedDelta(plaintextDelta)).toBe(false);
      expect(isEncryptedDelta(encryptedDelta)).toBe(true);
    });

    it('should handle edge cases in detection', () => {
      expect(isEncryptedDelta(null)).toBe(false);
      expect(isEncryptedDelta(undefined)).toBe(false);
      expect(isEncryptedDelta({})).toBe(false);
      expect(isEncryptedDelta({ encrypted: false })).toBe(false);
      expect(isEncryptedDelta({ encrypted: 'true' })).toBe(false); // String, not boolean
    });
  });

  describe('Multi-Checkpoint Encrypted Recovery', () => {
    it('should recover 5 encrypted checkpoints correctly', async () => {
      const deltas: CheckpointDelta[] = [];
      const encryptedDeltas: EncryptedCheckpointDelta[] = [];
      const cids: string[] = [];

      // Create 5 checkpoints
      for (let i = 0; i < 5; i++) {
        const messages: Message[] = [
          { role: 'user', content: `Question ${i + 1}`, timestamp: 1704844800000 + i * 10000 },
          { role: 'assistant', content: `Answer ${i + 1}`, timestamp: 1704844805000 + i * 10000 },
        ];
        const delta = createPlaintextDelta(i, messages);
        deltas.push(delta);
        encryptedDeltas.push(encryptDeltaLikeNode(delta, TEST_USER_PUBLIC_KEY));
        cids.push(`baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd0000${i}`);
      }

      const checkpointIndex: CheckpointIndex = {
        sessionId: 'test-session-123',
        hostAddress: TEST_HOST_ADDRESS,
        checkpoints: deltas.map((delta, i) => ({
          index: i,
          proofHash: delta.proofHash,
          deltaCid: cids[i],
          tokenRange: [i * 1000, (i + 1) * 1000] as [number, number],
          timestamp: 1704844800000 + i * 10000,
        })),
        messagesSignature: '0x' + 'aa'.repeat(65),
        checkpointsSignature: '0x' + 'bb'.repeat(65),
      };

      const deltaMap = new Map<string, any>([['index', checkpointIndex]]);
      cids.forEach((cid, i) => deltaMap.set(cid, encryptedDeltas[i]));

      const proofHashes = new Map<number, string>();
      deltas.forEach((delta, i) => proofHashes.set(i, delta.proofHash));

      const storageManager = createMockStorageManager(deltaMap);
      const contract = createMockContract(proofHashes);

      const getSessionInfo: GetSessionInfoFn = async () => ({
        hostAddress: TEST_HOST_ADDRESS,
        status: 'completed',
      });

      const result = await recoverFromCheckpointsFlow(
        storageManager,
        contract,
        getSessionInfo,
        BigInt(123),
        TEST_USER_PRIVATE_KEY
      );

      // 5 checkpoints × 2 messages = 10 messages
      expect(result.messages).toHaveLength(10);
      expect(result.tokenCount).toBe(5000);
      expect(result.checkpoints).toHaveLength(5);

      // Verify message order
      for (let i = 0; i < 5; i++) {
        expect(result.messages[i * 2].content).toBe(`Question ${i + 1}`);
        expect(result.messages[i * 2 + 1].content).toBe(`Answer ${i + 1}`);
      }
    });
  });
});
