/**
 * Tests for signature verification utilities
 * Sub-phase 2.1: EIP-191 Signature Verification
 *
 * These tests verify that host signatures on checkpoint data can be validated.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import { verifyHostSignature, computeCheckpointHash } from '../../src/utils/signature';
import type { Message } from '../../src/types';

describe('Signature Verification Utilities', () => {
  // Test wallet for signing
  let testWallet: ethers.Wallet;
  let testAddress: string;
  const testMessage = 'Test checkpoint data for verification';

  beforeAll(() => {
    // Create a deterministic test wallet
    testWallet = new ethers.Wallet(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    );
    testAddress = testWallet.address;
  });

  describe('verifyHostSignature', () => {
    it('should return true for valid signature', async () => {
      // Sign the message with test wallet
      const signature = await testWallet.signMessage(testMessage);

      // Verify should return true
      const isValid = verifyHostSignature(signature, testMessage, testAddress);
      expect(isValid).toBe(true);
    });

    it('should return false for wrong signer', async () => {
      // Sign with test wallet
      const signature = await testWallet.signMessage(testMessage);

      // Verify against different address
      const wrongAddress = '0x1234567890123456789012345678901234567890';
      const isValid = verifyHostSignature(signature, testMessage, wrongAddress);
      expect(isValid).toBe(false);
    });

    it('should return false for tampered message', async () => {
      // Sign original message
      const signature = await testWallet.signMessage(testMessage);

      // Verify with different message
      const tamperedMessage = 'Tampered message content';
      const isValid = verifyHostSignature(signature, tamperedMessage, testAddress);
      expect(isValid).toBe(false);
    });

    it('should handle address with and without 0x prefix', async () => {
      const signature = await testWallet.signMessage(testMessage);

      // With 0x prefix
      const isValidWith0x = verifyHostSignature(signature, testMessage, testAddress);
      expect(isValidWith0x).toBe(true);

      // Without 0x prefix
      const addressWithout0x = testAddress.slice(2);
      const isValidWithout0x = verifyHostSignature(signature, testMessage, addressWithout0x);
      expect(isValidWithout0x).toBe(true);
    });

    it('should throw on invalid signature format', () => {
      // Invalid signature (too short)
      expect(() => {
        verifyHostSignature('0x1234', testMessage, testAddress);
      }).toThrow();

      // Invalid signature (not hex)
      expect(() => {
        verifyHostSignature('not-a-valid-signature', testMessage, testAddress);
      }).toThrow();

      // Empty signature
      expect(() => {
        verifyHostSignature('', testMessage, testAddress);
      }).toThrow();
    });

    it('should handle JSON stringified checkpoint data', async () => {
      // Simulate signing JSON checkpoint data
      const checkpointData = JSON.stringify({
        sessionId: '123',
        checkpointIndex: 0,
        messages: [{ role: 'user', content: 'Hello' }]
      });

      const signature = await testWallet.signMessage(checkpointData);
      const isValid = verifyHostSignature(signature, checkpointData, testAddress);
      expect(isValid).toBe(true);
    });

    it('should handle bytes32 hash as message', async () => {
      // Create a bytes32 hash (common for on-chain data)
      const dataToHash = ethers.solidityPacked(
        ['string', 'uint256'],
        ['checkpoint', 1000]
      );
      const hash = ethers.keccak256(dataToHash);

      // Sign the hash bytes
      const signature = await testWallet.signMessage(ethers.getBytes(hash));

      // Verify using the hash bytes
      const isValid = verifyHostSignature(signature, ethers.getBytes(hash), testAddress);
      expect(isValid).toBe(true);
    });
  });

  describe('computeCheckpointHash', () => {
    it('should produce consistent hash for same input', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello', timestamp: 1000 },
        { role: 'assistant', content: 'Hi there!', timestamp: 2000 }
      ];
      const tokenCount = 1000;

      const hash1 = computeCheckpointHash(messages, tokenCount);
      const hash2 = computeCheckpointHash(messages, tokenCount);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different input', () => {
      const messages1: Message[] = [
        { role: 'user', content: 'Hello', timestamp: 1000 }
      ];
      const messages2: Message[] = [
        { role: 'user', content: 'Goodbye', timestamp: 1000 }
      ];

      const hash1 = computeCheckpointHash(messages1, 1000);
      const hash2 = computeCheckpointHash(messages2, 1000);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hash for different token count', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello', timestamp: 1000 }
      ];

      const hash1 = computeCheckpointHash(messages, 1000);
      const hash2 = computeCheckpointHash(messages, 2000);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty messages array', () => {
      const hash = computeCheckpointHash([], 0);

      // Should not throw and should return valid hash
      expect(hash).toBeDefined();
      expect(hash.startsWith('0x')).toBe(true);
      expect(hash.length).toBe(66); // 0x + 64 hex chars
    });

    it('should match keccak256 format (bytes32 hex string)', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test message', timestamp: 1000 }
      ];

      const hash = computeCheckpointHash(messages, 500);

      // keccak256 produces 32 bytes = 64 hex chars + 0x prefix
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should be order-sensitive for messages', () => {
      const msg1: Message = { role: 'user', content: 'First', timestamp: 1000 };
      const msg2: Message = { role: 'assistant', content: 'Second', timestamp: 2000 };

      const hash1 = computeCheckpointHash([msg1, msg2], 1000);
      const hash2 = computeCheckpointHash([msg2, msg1], 1000);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle messages with metadata', () => {
      const messagesWithMeta: Message[] = [
        { role: 'user', content: 'Hello', timestamp: 1000, metadata: { key: 'value' } }
      ];
      const messagesWithoutMeta: Message[] = [
        { role: 'user', content: 'Hello', timestamp: 1000 }
      ];

      const hash1 = computeCheckpointHash(messagesWithMeta, 1000);
      const hash2 = computeCheckpointHash(messagesWithoutMeta, 1000);

      // Metadata should affect the hash
      expect(hash1).not.toBe(hash2);
    });
  });
});
