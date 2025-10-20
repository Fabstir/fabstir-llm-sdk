// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * StorageManager Encryption Tests
 *
 * Tests for Phase 5.1: Conversation Encryption
 *
 * These tests verify:
 * 1. Conversations encrypted before S5 upload
 * 2. Conversations decrypted after S5 download
 * 3. Round-trip preserves conversation data
 * 4. Encryption is optional (backward compatible)
 * 5. Unencrypted conversations still work
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { StorageManager } from '../../src/managers/StorageManager';
import { EncryptionManager } from '../../src/managers/EncryptionManager';
import * as secp from '@noble/secp256k1';
import { bytesToHex } from '../../src/crypto/utilities';
import type { ConversationData } from '../../src/types';
import 'fake-indexeddb/auto';

// Mock S5.js
vi.mock('@s5-dev/s5js', () => ({
  S5: {
    create: vi.fn().mockResolvedValue({
      recoverIdentityFromSeedPhrase: vi.fn().mockResolvedValue(undefined),
      registerOnNewPortal: vi.fn().mockResolvedValue(undefined),
      fs: {
        ensureIdentityInitialized: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        getMetadata: vi.fn().mockResolvedValue({ cid: 'mock-cid' }),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            // Empty iterator
          }
        })
      }
    })
  }
}));

describe('StorageManager Encryption (Phase 5.1)', () => {
  let storageManager: StorageManager;
  let encryptionManager: EncryptionManager;
  let clientWallet: ethers.Wallet;
  let hostWallet: ethers.Wallet;
  let hostPubKeyHex: string;
  let mockS5Client: any;

  beforeEach(async () => {
    // Create test wallets
    clientWallet = ethers.Wallet.createRandom();
    hostWallet = ethers.Wallet.createRandom();

    // Create EncryptionManager for client
    encryptionManager = new EncryptionManager(clientWallet);

    // Get host public key
    const hostPubKeyBytes = secp.getPublicKey(hostWallet.privateKey.replace(/^0x/, ''), true);
    hostPubKeyHex = bytesToHex(hostPubKeyBytes);

    // Create StorageManager
    storageManager = new StorageManager();

    // Initialize StorageManager (will use mocked S5)
    const seed = 'test seed phrase for storage manager encryption';
    await storageManager.initialize(seed, clientWallet.address);

    // Get mock S5 client
    mockS5Client = (storageManager as any).s5Client;

    // Set EncryptionManager on StorageManager (Phase 5.1 integration)
    (storageManager as any).setEncryptionManager(encryptionManager);
  });

  test('should accept encryption options in saveConversation', async () => {
    const conversation: ConversationData = {
      id: 'test-conversation-1',
      messages: [
        { role: 'user', content: 'Hello', timestamp: Date.now() },
        { role: 'assistant', content: 'Hi there!', timestamp: Date.now() }
      ],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Should not throw with encryption options
    await expect(
      (storageManager as any).saveConversationEncrypted(conversation, {
        hostPubKey: hostPubKeyHex,
        encrypt: true
      })
    ).resolves.toBeDefined();
  });

  test('should encrypt conversation before S5 upload', async () => {
    const conversation: ConversationData = {
      id: 'secret-conversation',
      messages: [
        { role: 'user', content: 'Secret prompt', timestamp: Date.now() },
        { role: 'assistant', content: 'Secret response', timestamp: Date.now() }
      ],
      metadata: { sensitive: true },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Spy on S5 put method
    const putSpy = vi.spyOn(mockS5Client.fs, 'put');

    // Save encrypted conversation
    await (storageManager as any).saveConversationEncrypted(conversation, {
      hostPubKey: hostPubKeyHex,
      encrypt: true
    });

    // Verify S5 put was called
    expect(putSpy).toHaveBeenCalled();

    // Get the data that was uploaded
    const uploadedData = putSpy.mock.calls[0][1];

    // Verify uploaded data is encrypted (has encrypted wrapper)
    expect(uploadedData.encrypted).toBe(true);
    expect(uploadedData.version).toBeDefined();
    expect(uploadedData.payload).toBeDefined();
    expect(uploadedData.payload.ephPubHex).toBeDefined();
    expect(uploadedData.payload.ciphertextHex).toBeDefined();
    expect(uploadedData.payload.signatureHex).toBeDefined();

    // Verify original data is NOT in plaintext
    const dataString = JSON.stringify(uploadedData);
    expect(dataString).not.toContain('Secret prompt');
    expect(dataString).not.toContain('Secret response');
  });

  test('should decrypt conversation after S5 download', async () => {
    const originalConversation: ConversationData = {
      id: 'encrypted-conversation',
      messages: [
        { role: 'user', content: 'Test message', timestamp: Date.now() }
      ],
      metadata: { test: true },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Encrypt the conversation (client encrypts with host's public key)
    const encrypted = await encryptionManager.encryptForStorage(
      hostPubKeyHex,
      originalConversation
    );

    // Mock S5 get to return encrypted data
    const encryptedWrapper = {
      encrypted: true,
      version: 1,
      ...encrypted
    };
    mockS5Client.fs.get = vi.fn().mockResolvedValue(encryptedWrapper);

    // For decryption, we need to use the host's EncryptionManager
    // (since the data was encrypted with host's public key)
    const hostEncryptionManager = new EncryptionManager(hostWallet);
    (storageManager as any).setEncryptionManager(hostEncryptionManager);

    // Load and decrypt conversation
    const decrypted = await (storageManager as any).loadConversationEncrypted('encrypted-conversation');

    // Verify decrypted data matches original
    expect(decrypted.id).toBe(originalConversation.id);
    expect(decrypted.messages).toHaveLength(1);
    expect(decrypted.messages[0].content).toBe('Test message');
    expect(decrypted.metadata.test).toBe(true);
  });

  test('should support round-trip encryption (save + load)', async () => {
    const originalConversation: ConversationData = {
      id: 'roundtrip-conversation',
      messages: [
        { role: 'user', content: 'First message', timestamp: 1000 },
        { role: 'assistant', content: 'Response', timestamp: 2000 },
        { role: 'user', content: 'Second message', timestamp: 3000 }
      ],
      metadata: {
        model: 'llama-3',
        chainId: 84532,
        sessionId: '12345'
      },
      createdAt: 100000,
      updatedAt: 200000
    };

    let uploadedData: any;

    // Mock S5 put to capture uploaded data
    mockS5Client.fs.put = vi.fn().mockImplementation((path, data) => {
      uploadedData = data;
      return Promise.resolve();
    });

    // Mock S5 get to return the uploaded data
    mockS5Client.fs.get = vi.fn().mockImplementation(() => {
      return Promise.resolve(uploadedData);
    });

    // Save encrypted (client encrypts with host's public key)
    await (storageManager as any).saveConversationEncrypted(originalConversation, {
      hostPubKey: hostPubKeyHex,
      encrypt: true
    });

    // For decryption, switch to host's EncryptionManager
    const hostEncryptionManager = new EncryptionManager(hostWallet);
    (storageManager as any).setEncryptionManager(hostEncryptionManager);

    // Load encrypted
    const loaded = await (storageManager as any).loadConversationEncrypted(originalConversation.id);

    // Verify round-trip preserves all data
    expect(loaded.id).toBe(originalConversation.id);
    expect(loaded.messages).toHaveLength(3);
    expect(loaded.messages[0].content).toBe('First message');
    expect(loaded.messages[1].content).toBe('Response');
    expect(loaded.messages[2].content).toBe('Second message');
    expect(loaded.metadata.model).toBe('llama-3');
    expect(loaded.metadata.chainId).toBe(84532);
    expect(loaded.metadata.sessionId).toBe('12345');
    expect(loaded.createdAt).toBe(100000);
    expect(loaded.updatedAt).toBe(200000);
  });

  test('should support unencrypted conversations (backward compatible)', async () => {
    const plaintextConversation: ConversationData = {
      id: 'plaintext-conversation',
      messages: [
        { role: 'user', content: 'Plaintext message', timestamp: Date.now() }
      ],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    let uploadedData: any;

    // Mock S5 put to capture uploaded data
    mockS5Client.fs.put = vi.fn().mockImplementation((path, data) => {
      uploadedData = data;
      return Promise.resolve();
    });

    // Mock S5 get to return the uploaded data
    mockS5Client.fs.get = vi.fn().mockImplementation(() => {
      return Promise.resolve(uploadedData);
    });

    // Save without encryption
    await (storageManager as any).saveConversationPlaintext(plaintextConversation);

    // Verify uploaded data is plaintext (has encrypted: false flag)
    expect(uploadedData.encrypted).toBe(false);
    expect(uploadedData.conversation).toBeDefined();
    expect(uploadedData.conversation.id).toBe('plaintext-conversation');

    // Load plaintext conversation
    const loaded = await (storageManager as any).loadConversationPlaintext(plaintextConversation.id);

    // Verify loaded data matches original
    expect(loaded.id).toBe(plaintextConversation.id);
    expect(loaded.messages[0].content).toBe('Plaintext message');
  });

  test('should throw error when trying to encrypt without hostPubKey', async () => {
    const conversation: ConversationData = {
      id: 'test-conversation',
      messages: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Should throw error if encrypt=true but no hostPubKey
    await expect(
      (storageManager as any).saveConversationEncrypted(conversation, {
        encrypt: true
        // Missing hostPubKey
      })
    ).rejects.toThrow('hostPubKey required');
  });

  test('should throw error when trying to decrypt without EncryptionManager', async () => {
    // Remove EncryptionManager
    (storageManager as any).encryptionManager = undefined;

    // Mock S5 get to return encrypted data
    const encryptedWrapper = {
      encrypted: true,
      version: 1,
      payload: { ephPubHex: 'aabbcc', ciphertextHex: 'ddeeff' },
      storedAt: new Date().toISOString(),
      conversationId: 'test'
    };
    mockS5Client.fs.get = vi.fn().mockResolvedValue(encryptedWrapper);

    // Should throw error when trying to decrypt without EncryptionManager
    await expect(
      (storageManager as any).loadConversationEncrypted('test-conversation')
    ).rejects.toThrow('EncryptionManager required');
  });
});
