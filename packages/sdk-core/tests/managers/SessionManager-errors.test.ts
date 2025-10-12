/**
 * SessionManager Error Handling Tests
 *
 * Tests for Phase 4.3: Error Handling & Recovery
 *
 * These tests verify:
 * 1. Decryption failures handled gracefully
 * 2. Encryption failures reported to caller
 * 3. Invalid/tampered messages rejected
 * 4. Detailed error information logged
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { SessionManager } from '../../src/managers/SessionManager';
import { EncryptionManager } from '../../src/managers/EncryptionManager';
import { HostManager } from '../../src/managers/HostManager';
import { PaymentManager } from '../../src/managers/PaymentManagerMultiChain';
import { StorageManager } from '../../src/managers/StorageManager';
import { WebSocketClient } from '../../src/websocket/WebSocketClient';
import * as secp from '@noble/secp256k1';
import { bytesToHex } from '../../src/crypto/utilities';
import { SDKError } from '../../src/types';
import 'fake-indexeddb/auto';

// Mock WebSocketClient
vi.mock('../../src/websocket/WebSocketClient', () => ({
  WebSocketClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue('mock response'),
    onMessage: vi.fn().mockReturnValue(() => {}),
    isConnected: vi.fn().mockReturnValue(true)
  }))
}));

describe('SessionManager Error Handling (Phase 4.3)', () => {
  let sessionManager: SessionManager;
  let encryptionManager: EncryptionManager;
  let hostManager: HostManager;
  let paymentManager: PaymentManager;
  let storageManager: StorageManager;
  let clientWallet: ethers.Wallet;
  let hostWallet: ethers.Wallet;
  let mockWebSocketClient: any;
  let sessionKey: Uint8Array;

  beforeEach(async () => {
    // Create test wallets
    clientWallet = ethers.Wallet.createRandom();
    hostWallet = ethers.Wallet.createRandom();

    // Create EncryptionManager for client
    encryptionManager = new EncryptionManager(clientWallet);

    // Mock HostManager to provide host public key
    const hostPubKeyBytes = secp.getPublicKey(hostWallet.privateKey.replace(/^0x/, ''), true);
    const hostPubKeyHex = bytesToHex(hostPubKeyBytes);

    hostManager = {
      getHostPublicKey: vi.fn().mockResolvedValue(hostPubKeyHex),
      getHostInfo: vi.fn().mockResolvedValue({
        address: hostWallet.address,
        apiUrl: 'http://localhost:8080',
        metadata: {}
      })
    } as any;

    // Mock PaymentManager
    paymentManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(true),
      createSessionJob: vi.fn().mockResolvedValue(123),
      signer: clientWallet
    } as any;

    // Mock StorageManager
    storageManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(true),
      storeConversation: vi.fn().mockResolvedValue(undefined),
      appendMessage: vi.fn().mockResolvedValue(undefined),
      loadConversation: vi.fn().mockResolvedValue(null)
    } as any;

    // Create SessionManager with EncryptionManager
    sessionManager = new SessionManager(
      paymentManager,
      storageManager,
      hostManager
    );
    (sessionManager as any).setEncryptionManager(encryptionManager);

    // Initialize encrypted session (simulates Phase 4.1 completion)
    sessionKey = crypto.getRandomValues(new Uint8Array(32));
    (sessionManager as any).sessionKey = sessionKey;
    (sessionManager as any).messageIndex = 0;

    // Get mock WebSocket instance
    mockWebSocketClient = new WebSocketClient('ws://localhost:8080', { chainId: 84532 });
    (sessionManager as any).wsClient = mockWebSocketClient;
  });

  test('should throw SDKError when decrypting tampered message', async () => {
    // Create a valid encrypted message
    const validEncrypted = encryptionManager.encryptMessage(
      sessionKey,
      'Valid message',
      0
    );

    // Tamper with the ciphertext (flip some bits)
    const tamperedCiphertext = validEncrypted.ciphertextHex
      .split('')
      .map((char, i) => (i < 10 ? (char === 'a' ? 'b' : 'a') : char))
      .join('');

    const tamperedMessage = {
      ...validEncrypted,
      ciphertextHex: tamperedCiphertext
    };

    // Attempt to decrypt tampered message
    await expect(
      (sessionManager as any).decryptIncomingMessage(tamperedMessage)
    ).rejects.toThrow(SDKError);
  });

  test('should throw SDKError when decrypting with invalid hex encoding', async () => {
    const invalidMessage = {
      type: 'encrypted_message',
      nonceHex: 'invalid-hex!!!',  // Invalid hex characters
      ciphertextHex: 'also-invalid',
      aadHex: 'not-hex'
    };

    // Attempt to decrypt invalid message
    await expect(
      (sessionManager as any).decryptIncomingMessage(invalidMessage)
    ).rejects.toThrow();
  });

  test('should throw SDKError when session key not available for decryption', async () => {
    // Clear session key
    (sessionManager as any).sessionKey = undefined;

    const validEncrypted = encryptionManager.encryptMessage(
      sessionKey,
      'Message',
      0
    );

    // Attempt to decrypt without session key
    await expect(
      (sessionManager as any).decryptIncomingMessage(validEncrypted)
    ).rejects.toThrow(SDKError);

    await expect(
      (sessionManager as any).decryptIncomingMessage(validEncrypted)
    ).rejects.toThrow('Session key not available');
  });

  test('should throw SDKError when EncryptionManager not available for decryption', async () => {
    // Clear EncryptionManager
    (sessionManager as any).encryptionManager = undefined;

    const validEncrypted = encryptionManager.encryptMessage(
      sessionKey,
      'Message',
      0
    );

    // Attempt to decrypt without EncryptionManager
    await expect(
      (sessionManager as any).decryptIncomingMessage(validEncrypted)
    ).rejects.toThrow(SDKError);

    await expect(
      (sessionManager as any).decryptIncomingMessage(validEncrypted)
    ).rejects.toThrow('EncryptionManager not available');
  });

  test('should throw SDKError when session key not available for encryption', async () => {
    // Clear session key
    (sessionManager as any).sessionKey = undefined;

    // Attempt to encrypt without session key
    await expect(
      (sessionManager as any).sendEncryptedMessage('Hello')
    ).rejects.toThrow(SDKError);

    await expect(
      (sessionManager as any).sendEncryptedMessage('Hello')
    ).rejects.toThrow('Session key not available');
  });

  test('should throw SDKError when EncryptionManager not available for encryption', async () => {
    // Clear EncryptionManager
    (sessionManager as any).encryptionManager = undefined;

    // Attempt to encrypt without EncryptionManager
    await expect(
      (sessionManager as any).sendEncryptedMessage('Hello')
    ).rejects.toThrow(SDKError);

    await expect(
      (sessionManager as any).sendEncryptedMessage('Hello')
    ).rejects.toThrow('EncryptionManager not available');
  });

  test('should throw SDKError when WebSocket not available for encryption', async () => {
    // Clear WebSocket client
    (sessionManager as any).wsClient = undefined;

    // Attempt to send encrypted message without WebSocket
    await expect(
      (sessionManager as any).sendEncryptedMessage('Hello')
    ).rejects.toThrow(SDKError);

    await expect(
      (sessionManager as any).sendEncryptedMessage('Hello')
    ).rejects.toThrow('WebSocket client not available');
  });

  test('should provide detailed error information on decryption failure', async () => {
    // Create tampered message
    const validEncrypted = encryptionManager.encryptMessage(
      sessionKey,
      'Message',
      0
    );

    const tamperedMessage = {
      ...validEncrypted,
      ciphertextHex: 'ff'.repeat(50)  // Invalid ciphertext
    };

    // Attempt to decrypt and capture error
    try {
      await (sessionManager as any).decryptIncomingMessage(tamperedMessage);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      // Verify error is SDKError with detailed information
      expect(error).toBeInstanceOf(SDKError);
      expect(error.code).toBeDefined();
      expect(error.message).toBeDefined();
    }
  });

  test('should handle decryption with wrong session key', async () => {
    // Encrypt with one key
    const message = 'Secret message';
    const encrypted = encryptionManager.encryptMessage(
      sessionKey,
      message,
      0
    );

    // Try to decrypt with different key
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    (sessionManager as any).sessionKey = wrongKey;

    // Should fail to decrypt
    await expect(
      (sessionManager as any).decryptIncomingMessage(encrypted)
    ).rejects.toThrow();
  });

  test('should handle missing required fields in encrypted message', async () => {
    const incompleteMessage = {
      type: 'encrypted_message',
      nonceHex: '112233',
      // Missing ciphertextHex and aadHex
    };

    // Should throw error about missing fields
    await expect(
      (sessionManager as any).decryptIncomingMessage(incompleteMessage)
    ).rejects.toThrow();
  });
});
