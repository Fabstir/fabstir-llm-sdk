import { describe, test, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import * as secp from '@noble/secp256k1';
import { EncryptionManager } from '../../src/managers/EncryptionManager';
import { bytesToHex } from '../../src/crypto/utilities';

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
    // Access private method for testing
    const privKey = (manager as any).getClientPrivateKey();

    // Should match wallet private key (without 0x prefix)
    const expectedKey = wallet.privateKey.replace(/^0x/, '');
    expect(privKey).toBe(expectedKey);
  });

  test('should derive client public key correctly', () => {
    // Access private field for testing
    const pubKey = (manager as any).clientPublicKey;

    // Should be 33 bytes compressed (66 hex chars)
    expect(pubKey).toHaveLength(66);

    // Should start with 02 or 03 (compressed format)
    expect(pubKey.startsWith('02') || pubKey.startsWith('03')).toBe(true);

    // Verify it's derived correctly from private key
    const privKeyHex = wallet.privateKey.replace(/^0x/, '');
    const expectedPubKey = secp.getPublicKey(privKeyHex, true);
    expect(pubKey).toBe(bytesToHex(expectedPubKey));
  });

  test('should store client address', () => {
    // Access private field for testing
    const address = (manager as any).clientAddress;

    // Should match wallet address
    expect(address).toBe(wallet.address);

    // Should be EIP-55 checksummed (has mixed case)
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('should throw error when wallet not provided', () => {
    expect(() => new EncryptionManager(undefined as any))
      .toThrow(/wallet required/i);
  });

  test('should throw "Not implemented" for message/storage methods', async () => {
    const hostPubKey = '02' + '0'.repeat(64); // Mock public key
    const mockSessionKey = new Uint8Array(32);
    const mockEncryptedMessage = {
      type: 'encrypted_message' as const,
      nonceHex: '0'.repeat(48),
      ciphertextHex: '0'.repeat(32),
      aadHex: '0'.repeat(32)
    };
    const mockEncryptedStorage = {
      payload: {
        ephPubHex: '02' + '0'.repeat(64),
        saltHex: '0'.repeat(32),
        nonceHex: '0'.repeat(48),
        ciphertextHex: '0'.repeat(32),
        sigHex: '0'.repeat(128),
        recid: 0,
        alg: 'test',
        info: 'test'
      },
      storedAt: new Date().toISOString(),
      conversationId: 'test-conv-1'
    };

    // Test encryptMessage
    expect(() => manager.encryptMessage(mockSessionKey, 'test', 0))
      .toThrow(/not implemented.*2\.3/i);

    // Test decryptMessage
    expect(() => manager.decryptMessage(mockSessionKey, mockEncryptedMessage))
      .toThrow(/not implemented.*2\.3/i);

    // Test encryptForStorage
    await expect(manager.encryptForStorage(hostPubKey, { test: 'data' }))
      .rejects.toThrow(/not implemented.*2\.3/i);

    // Test decryptFromStorage
    await expect(manager.decryptFromStorage(mockEncryptedStorage))
      .rejects.toThrow(/not implemented.*2\.3/i);
  });
});

describe('EncryptionManager - Session Init Encryption', () => {
  let clientManager: EncryptionManager;
  let hostManager: EncryptionManager;
  let clientWallet: ethers.Wallet;
  let hostWallet: ethers.Wallet;

  beforeEach(() => {
    clientWallet = ethers.Wallet.createRandom();
    hostWallet = ethers.Wallet.createRandom();
    clientManager = new EncryptionManager(clientWallet);
    hostManager = new EncryptionManager(hostWallet);
  });

  test('should encrypt session init with full signature', async () => {
    const payload = {
      jobId: 123n,
      modelName: 'llama-3',
      sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      pricePerToken: 2000
    };

    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptSessionInit(hostPubKey, payload);

    // Verify structure
    expect(encrypted.type).toBe('encrypted_session_init');
    expect(encrypted.payload).toBeDefined();
    expect(encrypted.payload.ephPubHex).toBeDefined();
    expect(encrypted.payload.sigHex).toBeDefined();
    expect(encrypted.payload.recid).toBeGreaterThanOrEqual(0);
    expect(encrypted.payload.recid).toBeLessThanOrEqual(3);

    // Verify ephemeral key is compressed
    expect(encrypted.payload.ephPubHex).toHaveLength(66);
    expect(encrypted.payload.ephPubHex.startsWith('02') || encrypted.payload.ephPubHex.startsWith('03')).toBe(true);
  });

  test('should decrypt and recover sender address', async () => {
    const payload = {
      jobId: 456n,
      modelName: 'gpt-4',
      sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      pricePerToken: 3000
    };

    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptSessionInit(hostPubKey, payload);

    const { data, senderAddress } = await hostManager.decryptSessionInit(encrypted);

    // Verify data matches
    expect(data.jobId).toBe(payload.jobId);
    expect(data.modelName).toBe(payload.modelName);
    expect(data.sessionKey).toBe(payload.sessionKey);
    expect(data.pricePerToken).toBe(payload.pricePerToken);

    // Verify sender address recovered correctly
    expect(senderAddress.toLowerCase()).toBe(clientWallet.address.toLowerCase());
  });

  test('should preserve bigint values in round-trip', async () => {
    const payload = {
      jobId: 999999999999999999n, // Large bigint
      modelName: 'claude-3',
      sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      pricePerToken: 5000
    };

    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptSessionInit(hostPubKey, payload);
    const { data } = await hostManager.decryptSessionInit(encrypted);

    // BigInt should survive JSON serialization
    expect(data.jobId).toBe(payload.jobId);
    expect(typeof data.jobId).toBe('bigint');
  });

  test('should reject tampered payload', async () => {
    const payload = {
      jobId: 789n,
      modelName: 'mistral',
      sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      pricePerToken: 1500
    };

    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptSessionInit(hostPubKey, payload);

    // Tamper with ciphertext
    const tamperedPayload = {
      ...encrypted.payload,
      ciphertextHex: '00' + encrypted.payload.ciphertextHex.slice(2)
    };
    const tamperedEncrypted = { ...encrypted, payload: tamperedPayload };

    // Should throw on decryption
    await expect(hostManager.decryptSessionInit(tamperedEncrypted))
      .rejects.toThrow();
  });

  test('should reject payload with wrong recipient', async () => {
    const payload = {
      jobId: 111n,
      modelName: 'llama-2',
      sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      pricePerToken: 1000
    };

    // Encrypt for host
    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptSessionInit(hostPubKey, payload);

    // Try to decrypt with wrong recipient (different wallet)
    const wrongWallet = ethers.Wallet.createRandom();
    const wrongManager = new EncryptionManager(wrongWallet);

    // Should throw because shared secret won't match
    await expect(wrongManager.decryptSessionInit(encrypted))
      .rejects.toThrow();
  });
});
