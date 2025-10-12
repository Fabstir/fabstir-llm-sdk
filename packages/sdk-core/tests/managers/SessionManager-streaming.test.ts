/**
 * SessionManager Streaming Encryption Tests
 *
 * Tests for Phase 4.2: Streaming Message Encryption
 *
 * These tests verify:
 * 1. Outgoing messages encrypted with session key
 * 2. Incoming messages decrypted correctly
 * 3. Message index increments (replay protection)
 * 4. Streaming chunks encrypted individually
 * 5. Unencrypted sessions continue to work
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
import { bytesToHex, hexToBytes } from '../../src/crypto/utilities';
import type { EncryptedMessage } from '../../src/interfaces/IEncryptionManager';
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

describe('SessionManager Streaming Encryption (Phase 4.2)', () => {
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
    // Generate session key and set it directly
    sessionKey = crypto.getRandomValues(new Uint8Array(32));
    (sessionManager as any).sessionKey = sessionKey;
    (sessionManager as any).messageIndex = 0;

    // Get mock WebSocket instance
    mockWebSocketClient = new WebSocketClient('ws://localhost:8080', { chainId: 84532 });
    (sessionManager as any).wsClient = mockWebSocketClient;
  });

  test('should encrypt outgoing prompt messages with session key', async () => {
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');
    const prompt = 'Hello, LLM!';

    // Call internal method to send encrypted message
    await (sessionManager as any).sendEncryptedMessage(prompt);

    // Verify encrypted message was sent
    expect(sendMessageSpy).toHaveBeenCalled();
    const sentMessage = sendMessageSpy.mock.calls[0][0];

    expect(sentMessage.type).toBe('encrypted_message');
    expect(sentMessage.nonceHex).toBeDefined();
    expect(sentMessage.ciphertextHex).toBeDefined();
    expect(sentMessage.aadHex).toBeDefined();

    // Verify hex encoding
    expect(sentMessage.nonceHex).toMatch(/^[0-9a-f]+$/i);
    expect(sentMessage.ciphertextHex).toMatch(/^[0-9a-f]+$/i);
    expect(sentMessage.aadHex).toMatch(/^[0-9a-f]+$/i);
  });

  test('should decrypt incoming encrypted messages', async () => {
    const plaintext = 'LLM response chunk';

    // Encrypt a message as if from host
    const encrypted = encryptionManager.encryptMessage(
      sessionKey,
      plaintext,
      0
    );

    // Call internal decryption handler
    const decrypted = await (sessionManager as any).decryptIncomingMessage(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  test('should increment message index with each outgoing message (replay protection)', async () => {
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');

    // Send first message
    await (sessionManager as any).sendEncryptedMessage('Message 1');

    // Send second message
    await (sessionManager as any).sendEncryptedMessage('Message 2');

    // Get AAD from both messages
    const msg1 = sendMessageSpy.mock.calls[0][0];
    const msg2 = sendMessageSpy.mock.calls[1][0];

    const aad1Bytes = hexToBytes(msg1.aadHex);
    const aad2Bytes = hexToBytes(msg2.aadHex);

    const aad1 = JSON.parse(new TextDecoder().decode(aad1Bytes));
    const aad2 = JSON.parse(new TextDecoder().decode(aad2Bytes));

    // Verify message index incremented
    expect(aad1.message_index).toBe(0);
    expect(aad2.message_index).toBe(1);
    expect(aad2.message_index).toBe(aad1.message_index + 1);

    // Verify timestamps exist
    expect(aad1.timestamp).toBeDefined();
    expect(aad2.timestamp).toBeDefined();
    expect(aad2.timestamp).toBeGreaterThanOrEqual(aad1.timestamp);
  });

  test('should handle streaming chunks by encrypting each individually', async () => {
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');
    const chunks = ['Chunk 1', 'Chunk 2', 'Chunk 3'];

    // Send multiple chunks
    for (const chunk of chunks) {
      await (sessionManager as any).sendEncryptedMessage(chunk);
    }

    // Verify all chunks were encrypted and sent
    expect(sendMessageSpy).toHaveBeenCalledTimes(3);

    // Verify each chunk is encrypted with incrementing index
    for (let i = 0; i < chunks.length; i++) {
      const sentMessage = sendMessageSpy.mock.calls[i][0];
      expect(sentMessage.type).toBe('encrypted_message');
      expect(sentMessage.nonceHex).toBeDefined();
      expect(sentMessage.ciphertextHex).toBeDefined();

      // Verify message index
      const aadBytes = hexToBytes(sentMessage.aadHex);
      const aad = JSON.parse(new TextDecoder().decode(aadBytes));
      expect(aad.message_index).toBe(i);
    }
  });

  test('should send plaintext messages when session key not available', async () => {
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');

    // Clear session key to simulate plaintext mode
    (sessionManager as any).sessionKey = undefined;

    const prompt = 'Hello, plaintext!';

    // Call internal method that should detect no session key
    await (sessionManager as any).sendPlaintextMessage(prompt);

    // Verify plaintext message was sent
    expect(sendMessageSpy).toHaveBeenCalled();
    const sentMessage = sendMessageSpy.mock.calls[0][0];

    expect(sentMessage.type).toBe('prompt');
    expect(sentMessage.prompt).toBe(prompt);

    // Should NOT have encrypted fields
    expect(sentMessage.nonceHex).toBeUndefined();
    expect(sentMessage.ciphertextHex).toBeUndefined();
  });

  test('should decrypt multiple incoming messages with correct message index', async () => {
    const messages = [
      'First response',
      'Second response',
      'Third response'
    ];

    // Encrypt messages as if from host
    const encryptedMessages = messages.map((msg, index) =>
      encryptionManager.encryptMessage(sessionKey, msg, index)
    );

    // Decrypt all messages
    for (let i = 0; i < encryptedMessages.length; i++) {
      const decrypted = await (sessionManager as any).decryptIncomingMessage(
        encryptedMessages[i]
      );
      expect(decrypted).toBe(messages[i]);
    }
  });

  test('should maintain session key throughout conversation', async () => {
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');

    // Send multiple messages
    await (sessionManager as any).sendEncryptedMessage('Message 1');
    await (sessionManager as any).sendEncryptedMessage('Message 2');
    await (sessionManager as any).sendEncryptedMessage('Message 3');

    // Verify session key was used (not regenerated)
    expect((sessionManager as any).sessionKey).toBe(sessionKey);
    expect(sendMessageSpy).toHaveBeenCalledTimes(3);

    // Verify all messages encrypted with same session key by checking they can be decrypted
    for (let i = 0; i < 3; i++) {
      const sentMessage = sendMessageSpy.mock.calls[i][0];

      // Decrypt using same session key
      const decrypted = encryptionManager.decryptMessage(
        sessionKey,
        sentMessage as EncryptedMessage
      );

      expect(decrypted).toBe(`Message ${i + 1}`);
    }
  });
});
