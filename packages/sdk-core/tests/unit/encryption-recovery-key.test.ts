/**
 * Tests for User Recovery Public Key (Sub-phase 8.1)
 *
 * Tests that EncryptionManager exposes a stable "recovery" public key
 * that the host can use to encrypt checkpoint deltas.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Wallet } from 'ethers';
import { EncryptionManager } from '../../src/managers/EncryptionManager';

describe('EncryptionManager Recovery Key', () => {
  const TEST_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const TEST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f5B0E1';
  let wallet: Wallet;
  let encryptionManager: EncryptionManager;

  beforeEach(() => {
    wallet = new Wallet(TEST_PRIVATE_KEY);
    encryptionManager = new EncryptionManager(wallet);
  });

  describe('getRecoveryPublicKey()', () => {
    it('should return a valid compressed secp256k1 public key', () => {
      const recoveryPubKey = encryptionManager.getRecoveryPublicKey();

      // Should be 0x-prefixed hex string
      expect(recoveryPubKey).toMatch(/^0x[0-9a-fA-F]+$/);

      // Compressed public key is 33 bytes = 66 hex chars + 2 for 0x prefix
      expect(recoveryPubKey.length).toBe(68);

      // Compressed keys start with 02 or 03
      const prefix = recoveryPubKey.slice(2, 4);
      expect(['02', '03']).toContain(prefix);
    });

    it('should return consistent key across multiple calls (deterministic)', () => {
      const key1 = encryptionManager.getRecoveryPublicKey();
      const key2 = encryptionManager.getRecoveryPublicKey();
      const key3 = encryptionManager.getRecoveryPublicKey();

      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });

    it('should return same key for same wallet private key', () => {
      // Create two EncryptionManagers with same wallet
      const wallet1 = new Wallet(TEST_PRIVATE_KEY);
      const wallet2 = new Wallet(TEST_PRIVATE_KEY);

      const em1 = new EncryptionManager(wallet1);
      const em2 = new EncryptionManager(wallet2);

      expect(em1.getRecoveryPublicKey()).toBe(em2.getRecoveryPublicKey());
    });

    it('should return different key for different wallet', () => {
      const otherPrivateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const otherWallet = new Wallet(otherPrivateKey);
      const otherEM = new EncryptionManager(otherWallet);

      expect(encryptionManager.getRecoveryPublicKey()).not.toBe(otherEM.getRecoveryPublicKey());
    });
  });

  describe('Recovery key vs session key', () => {
    it('should have getRecoveryPublicKey() return same value as getPublicKey()', () => {
      // For now, recovery key IS the client's stable public key
      // They should be the same - the distinction is semantic
      const recoveryKey = encryptionManager.getRecoveryPublicKey();
      const publicKey = encryptionManager.getPublicKey();

      expect(recoveryKey).toBe(publicKey);
    });
  });

  describe('fromSignature() recovery key', () => {
    it('should derive stable recovery key from signature', () => {
      const testSignature = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12';

      const em1 = EncryptionManager.fromSignature(testSignature, TEST_ADDRESS);
      const em2 = EncryptionManager.fromSignature(testSignature, TEST_ADDRESS);

      expect(em1.getRecoveryPublicKey()).toBe(em2.getRecoveryPublicKey());
    });
  });

  describe('fromAddress() recovery key', () => {
    it('should derive stable recovery key from address', () => {
      const chainId = 84532; // Base Sepolia

      const em1 = EncryptionManager.fromAddress(TEST_ADDRESS, chainId);
      const em2 = EncryptionManager.fromAddress(TEST_ADDRESS, chainId);

      expect(em1.getRecoveryPublicKey()).toBe(em2.getRecoveryPublicKey());
    });

    it('should derive different recovery key for different chain', () => {
      const em1 = EncryptionManager.fromAddress(TEST_ADDRESS, 84532);
      const em2 = EncryptionManager.fromAddress(TEST_ADDRESS, 1); // Mainnet

      expect(em1.getRecoveryPublicKey()).not.toBe(em2.getRecoveryPublicKey());
    });
  });
});

describe('SessionInitPayload with recoveryPublicKey', () => {
  it('should accept recoveryPublicKey as optional field', () => {
    // Test that the type allows recoveryPublicKey
    const payload: import('../../src/interfaces/IEncryptionManager').SessionInitPayload = {
      jobId: '123',
      modelName: 'test-model',
      sessionKey: 'abcd1234',
      pricePerToken: 1000,
      recoveryPublicKey: '0x02abc123...'
    };

    expect(payload.recoveryPublicKey).toBe('0x02abc123...');
  });

  it('should work without recoveryPublicKey (backward compat)', () => {
    // Test that the type still works without recoveryPublicKey
    const payload: import('../../src/interfaces/IEncryptionManager').SessionInitPayload = {
      jobId: '123',
      modelName: 'test-model',
      sessionKey: 'abcd1234',
      pricePerToken: 1000
    };

    expect(payload.recoveryPublicKey).toBeUndefined();
  });
});
