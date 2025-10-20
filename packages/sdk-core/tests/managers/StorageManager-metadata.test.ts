// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * StorageManager Metadata Tests
 *
 * Tests for Phase 5.2: Conversation Metadata & Discovery
 *
 * These tests verify:
 * 1. Encrypted conversations include metadata
 * 2. Sender address recovered on load
 * 3. listConversations shows encryption status
 * 4. Conversation ownership verified
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
            // Empty iterator by default
          }
        })
      }
    })
  }
}));

describe('StorageManager Metadata (Phase 5.2)', () => {
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
    const seed = 'test seed phrase for storage manager metadata';
    await storageManager.initialize(seed, clientWallet.address);

    // Get mock S5 client
    mockS5Client = (storageManager as any).s5Client;

    // Set EncryptionManager on StorageManager
    (storageManager as any).setEncryptionManager(encryptionManager);
  });

  test('should include encryption metadata in encrypted conversations', async () => {
    const conversation: ConversationData = {
      id: 'metadata-test-1',
      messages: [
        { role: 'user', content: 'Test message', timestamp: Date.now() }
      ],
      metadata: {},
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

    // Verify metadata fields are present
    expect(uploadedData.encrypted).toBe(true);
    expect(uploadedData.version).toBe(1);
    expect(uploadedData.storedAt).toBeDefined();
    expect(uploadedData.conversationId).toBeDefined();
  });

  test('should recover sender address on load', async () => {
    const originalConversation: ConversationData = {
      id: 'sender-test-1',
      messages: [
        { role: 'user', content: 'Test message', timestamp: Date.now() }
      ],
      metadata: {},
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

    // Load with metadata
    const result = await (storageManager as any).loadConversationWithMetadata('sender-test-1');

    // Verify conversation was returned
    expect(result.conversation).toBeDefined();
    expect(result.conversation.id).toBe(originalConversation.id);

    // Verify sender address was recovered
    expect(result.senderAddress).toBeDefined();
    expect(result.senderAddress).toBe(clientWallet.address);
  });

  test('should list conversations with encryption status', async () => {
    // Create encrypted conversation wrapper
    const encryptedConv: ConversationData = {
      id: 'encrypted-conv-1',
      messages: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const encrypted = await encryptionManager.encryptForStorage(
      hostPubKeyHex,
      encryptedConv
    );

    const encryptedWrapper = {
      encrypted: true,
      version: 1,
      ...encrypted,
      conversationId: 'encrypted-conv-1'  // Override conversationId after spread
    };

    // Create plaintext conversation wrapper
    const plaintextConv: ConversationData = {
      id: 'plaintext-conv-1',
      messages: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const plaintextWrapper = {
      encrypted: false,
      version: 1,
      conversation: plaintextConv
    };

    // Mock S5 list to return both conversation directories
    mockS5Client.fs.list = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'directory', name: 'encrypted-conv-1' };
        yield { type: 'directory', name: 'plaintext-conv-1' };
      }
    });

    // Mock S5 get to return appropriate data for each conversation
    mockS5Client.fs.get = vi.fn().mockImplementation((path: string) => {
      if (path.includes('encrypted-conv-1')) {
        return Promise.resolve(encryptedWrapper);
      } else if (path.includes('plaintext-conv-1')) {
        return Promise.resolve(plaintextWrapper);
      }
      return Promise.resolve(null);
    });

    // Call listConversations
    const list = await (storageManager as any).listConversations();

    // Verify list has correct encryption status
    expect(list).toHaveLength(2);

    const encryptedInfo = list.find((c: any) => c.conversationId === 'encrypted-conv-1');
    const plaintextInfo = list.find((c: any) => c.conversationId === 'plaintext-conv-1');

    expect(encryptedInfo).toBeDefined();
    expect(encryptedInfo.isEncrypted).toBe(true);

    expect(plaintextInfo).toBeDefined();
    expect(plaintextInfo.isEncrypted).toBe(false);
  });

  test('should verify conversation ownership', async () => {
    const originalConversation: ConversationData = {
      id: 'ownership-test-1',
      messages: [
        { role: 'user', content: 'Private message', timestamp: Date.now() }
      ],
      metadata: { sensitive: true },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Client encrypts with host's public key
    const encrypted = await encryptionManager.encryptForStorage(
      hostPubKeyHex,
      originalConversation
    );

    const encryptedWrapper = {
      encrypted: true,
      version: 1,
      ...encrypted
    };

    // Mock S5 get to return encrypted data
    mockS5Client.fs.get = vi.fn().mockResolvedValue(encryptedWrapper);

    // Host decrypts (only host can decrypt)
    const hostEncryptionManager = new EncryptionManager(hostWallet);
    (storageManager as any).setEncryptionManager(hostEncryptionManager);

    // Load with metadata
    const result = await (storageManager as any).loadConversationWithMetadata('ownership-test-1');

    // Verify sender address matches client wallet
    expect(result.senderAddress).toBe(clientWallet.address);

    // Verify conversation data is correct
    expect(result.conversation.id).toBe(originalConversation.id);
    expect(result.conversation.messages[0].content).toBe('Private message');
    expect(result.conversation.metadata.sensitive).toBe(true);
  });
});
