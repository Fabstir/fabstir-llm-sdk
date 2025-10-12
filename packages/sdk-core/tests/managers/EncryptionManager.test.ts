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

  test('should have all encryption methods implemented', () => {
    // Verify methods exist and are callable
    expect(typeof manager.encryptMessage).toBe('function');
    expect(typeof manager.decryptMessage).toBe('function');
    expect(typeof manager.encryptForStorage).toBe('function');
    expect(typeof manager.decryptFromStorage).toBe('function');
    expect(typeof manager.encryptSessionInit).toBe('function');
    expect(typeof manager.decryptSessionInit).toBe('function');
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

describe('EncryptionManager - Message Encryption (Symmetric)', () => {
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

    // Verify structure
    expect(encrypted.type).toBe('encrypted_message');
    expect(encrypted.nonceHex).toBeDefined();
    expect(encrypted.ciphertextHex).toBeDefined();
    expect(encrypted.aadHex).toBeDefined();

    // Verify nonce is 24 bytes (XChaCha20)
    expect(encrypted.nonceHex).toHaveLength(48);

    const decrypted = manager.decryptMessage(sessionKey, encrypted);
    expect(decrypted).toBe(message);
  });

  test('should prevent replay attacks via message index in AAD', () => {
    const message = 'Test message';
    const encrypted = manager.encryptMessage(sessionKey, message, 1);

    // Parse the original AAD
    const aadBytes = new Uint8Array(encrypted.aadHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    const aad = JSON.parse(new TextDecoder().decode(aadBytes));

    // Modify message_index to simulate replay attack
    aad.message_index = 999;
    const tamperedAADBytes = new TextEncoder().encode(JSON.stringify(aad));
    const tamperedAADHex = Array.from(tamperedAADBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const tampered = { ...encrypted, aadHex: tamperedAADHex };

    // Should throw because AAD verification fails
    expect(() => manager.decryptMessage(sessionKey, tampered)).toThrow();
  });

  test('should include timestamp in AAD', () => {
    const message = 'Test';
    const encrypted = manager.encryptMessage(sessionKey, message, 0);

    // Parse AAD to verify it contains message_index and timestamp
    const aadBytes = new Uint8Array(encrypted.aadHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    const aad = JSON.parse(new TextDecoder().decode(aadBytes));

    expect(aad.message_index).toBe(0);
    expect(aad.timestamp).toBeDefined();
    expect(typeof aad.timestamp).toBe('number');
  });

  test('should use different nonces for same message', () => {
    const message = 'Same message';
    const encrypted1 = manager.encryptMessage(sessionKey, message, 0);
    const encrypted2 = manager.encryptMessage(sessionKey, message, 0);

    // Nonces should be different (random)
    expect(encrypted1.nonceHex).not.toBe(encrypted2.nonceHex);

    // Ciphertexts should be different due to different nonces
    expect(encrypted1.ciphertextHex).not.toBe(encrypted2.ciphertextHex);
  });

  test('should throw on tampered ciphertext', () => {
    const message = 'Secret';
    const encrypted = manager.encryptMessage(sessionKey, message, 5);

    // Tamper with ciphertext
    const tamperedCiphertext = '00' + encrypted.ciphertextHex.slice(2);
    const tampered = { ...encrypted, ciphertextHex: tamperedCiphertext };

    // Should throw because Poly1305 tag verification fails
    expect(() => manager.decryptMessage(sessionKey, tampered)).toThrow();
  });
});

describe('EncryptionManager - Storage Encryption (Full Signature)', () => {
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

    // Verify structure
    expect(encrypted.payload.ephPubHex).toBeDefined();
    expect(encrypted.payload.sigHex).toBeDefined();
    expect(encrypted.conversationId).toBeDefined();
    expect(encrypted.storedAt).toBeDefined();

    // Verify conversationId is a UUID-like string
    expect(encrypted.conversationId).toMatch(/^[a-f0-9-]+$/);

    // Verify storedAt is ISO timestamp
    expect(encrypted.storedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const { data, senderAddress } = await hostManager.decryptFromStorage(encrypted);

    expect(data).toEqual(conversation);
    expect(senderAddress.toLowerCase()).toBe(clientWallet.address.toLowerCase());
  });

  test('should handle complex typed data', async () => {
    interface ConversationData {
      id: string;
      messages: Array<{ role: string; content: string; tokens?: number }>;
      metadata: {
        model: string;
        temperature: number;
        maxTokens: number;
      };
    }

    const data: ConversationData = {
      id: 'conv-123',
      messages: [
        { role: 'user', content: 'Test', tokens: 5 },
        { role: 'assistant', content: 'Response', tokens: 10 }
      ],
      metadata: {
        model: 'llama-3',
        temperature: 0.7,
        maxTokens: 2048
      }
    };

    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptForStorage(hostPubKey, data);
    const { data: decrypted } = await hostManager.decryptFromStorage<ConversationData>(encrypted);

    expect(decrypted).toEqual(data);
    expect(decrypted.metadata.temperature).toBe(0.7);
  });

  test('should generate unique conversationId for each encryption', async () => {
    const data = { test: 'data' };
    const hostPubKey = (hostManager as any).clientPublicKey;

    const encrypted1 = await clientManager.encryptForStorage(hostPubKey, data);
    const encrypted2 = await clientManager.encryptForStorage(hostPubKey, data);

    expect(encrypted1.conversationId).not.toBe(encrypted2.conversationId);
  });

  test('should reject tampered storage payload', async () => {
    const data = { secret: 'information' };
    const hostPubKey = (hostManager as any).clientPublicKey;
    const encrypted = await clientManager.encryptForStorage(hostPubKey, data);

    // Tamper with ciphertext
    const tamperedPayload = {
      ...encrypted.payload,
      ciphertextHex: '00' + encrypted.payload.ciphertextHex.slice(2)
    };
    const tamperedEncrypted = { ...encrypted, payload: tamperedPayload };

    // Should throw on decryption
    await expect(hostManager.decryptFromStorage(tamperedEncrypted))
      .rejects.toThrow();
  });
});
