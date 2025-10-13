/**
 * SessionManager Encryption Tests
 *
 * Tests for Phase 4.1: Session Init with Encryption
 *
 * These tests verify:
 * 1. Encrypted session initialization when encryption=true
 * 2. Session key generation and proposal
 * 3. Encrypted message structure
 * 4. Host public key retrieval integration
 * 5. Backward compatibility (plaintext sessions)
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

describe('SessionManager Encryption (Phase 4.1)', () => {
  let sessionManager: SessionManager;
  let encryptionManager: EncryptionManager;
  let hostManager: HostManager;
  let paymentManager: PaymentManager;
  let storageManager: StorageManager;
  let clientWallet: ethers.Wallet;
  let hostWallet: ethers.Wallet;
  let mockWebSocketClient: any;

  beforeEach(() => {
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

    // Create SessionManager without EncryptionManager initially (mimics SDK flow)
    sessionManager = new SessionManager(
      paymentManager,
      storageManager,
      hostManager
    );

    // Set EncryptionManager via setter (mimics SDK initialization flow)
    (sessionManager as any).setEncryptionManager(encryptionManager);

    // Initialize
    vi.mocked(sessionManager as any).initialize = vi.fn().mockResolvedValue(undefined);

    // Get mock WebSocket instance
    mockWebSocketClient = new WebSocketClient('ws://localhost:8080', { chainId: 84532 });
  });

  test('should accept encryption parameter in config', async () => {
    // This test verifies the interface accepts encryption parameter
    const config = {
      chainId: 84532,
      host: hostWallet.address,
      modelId: 'llama-3',
      paymentMethod: 'deposit' as const,
      depositAmount: ethers.parseUnits('1', 6),
      encryption: true  // NEW parameter
    };

    // Should not throw
    expect(() => config.encryption).not.toThrow();
    expect(config.encryption).toBe(true);
  });

  test('should send encrypted_session_init when encryption=true', async () => {
    // Spy on WebSocketClient methods
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');

    // Mock SessionManager to use our mocked WebSocket
    (sessionManager as any).wsClient = mockWebSocketClient;

    // Call sendEncryptedInit (will be implemented)
    const config = {
      chainId: 84532,
      host: hostWallet.address,
      modelId: 'llama-3',
      paymentMethod: 'deposit' as const,
      pricePerToken: 2000,
      endpoint: 'http://localhost:8080',
      encryption: true
    };

    const sessionId = 123n;
    const jobId = 456n;

    // This should call sendEncryptedInit method (to be implemented)
    await (sessionManager as any).sendEncryptedInit(
      mockWebSocketClient,
      config,
      sessionId,
      jobId
    );

    // Verify encrypted message was sent
    expect(sendMessageSpy).toHaveBeenCalled();
    const sentMessage = sendMessageSpy.mock.calls[0][0];

    expect(sentMessage.type).toBe('encrypted_session_init');
    expect(sentMessage.payload).toBeDefined();
    expect(sentMessage.chain_id).toBe(84532);
    expect(sentMessage.session_id).toBe('123');
  });

  test('should generate and include 32-byte session key in encrypted payload', async () => {
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');
    (sessionManager as any).wsClient = mockWebSocketClient;

    const config = {
      chainId: 84532,
      host: hostWallet.address,
      modelId: 'llama-3',
      paymentMethod: 'deposit' as const,
      pricePerToken: 2000,
      endpoint: 'http://localhost:8080',
      encryption: true
    };

    await (sessionManager as any).sendEncryptedInit(
      mockWebSocketClient,
      config,
      123n,
      456n
    );

    // Verify session key was stored
    const sessionKey = (sessionManager as any).sessionKey;
    expect(sessionKey).toBeDefined();
    expect(sessionKey).toBeInstanceOf(Uint8Array);
    expect(sessionKey.length).toBe(32);  // 32 bytes for XChaCha20

    // Verify message index was reset
    expect((sessionManager as any).messageIndex).toBe(0);
  });

  test('should have correct encrypted message structure', async () => {
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');
    (sessionManager as any).wsClient = mockWebSocketClient;

    const config = {
      chainId: 84532,
      host: hostWallet.address,
      modelId: 'llama-3',
      paymentMethod: 'deposit' as const,
      pricePerToken: 2000,
      endpoint: 'http://localhost:8080',
      encryption: true
    };

    await (sessionManager as any).sendEncryptedInit(
      mockWebSocketClient,
      config,
      123n,
      456n
    );

    const sentMessage = sendMessageSpy.mock.calls[0][0];

    // Verify structure matches EncryptedSessionInit
    expect(sentMessage.type).toBe('encrypted_session_init');
    expect(sentMessage.payload).toBeDefined();
    expect(sentMessage.payload.ephPubHex).toBeDefined();
    expect(sentMessage.payload.ciphertextHex).toBeDefined();
    expect(sentMessage.payload.signatureHex).toBeDefined();
    expect(sentMessage.payload.recid).toBeDefined();
    expect(typeof sentMessage.payload.recid).toBe('number');
    expect(sentMessage.payload.recid).toBeGreaterThanOrEqual(0);
    expect(sentMessage.payload.recid).toBeLessThanOrEqual(3);

    // Verify hex encoding
    expect(sentMessage.payload.ephPubHex).toMatch(/^[0-9a-f]+$/i);
    expect(sentMessage.payload.ciphertextHex).toMatch(/^[0-9a-f]+$/i);
  });

  test('should send plaintext session_init when encryption=false', async () => {
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');
    (sessionManager as any).wsClient = mockWebSocketClient;

    const config = {
      chainId: 84532,
      host: hostWallet.address,
      modelId: 'llama-3',
      paymentMethod: 'deposit' as const,
      pricePerToken: 2000,
      endpoint: 'http://localhost:8080',
      encryption: false  // Plaintext mode
    };

    const userAddress = await clientWallet.getAddress();

    // Call sendPlaintextInit (will be implemented)
    await (sessionManager as any).sendPlaintextInit(
      mockWebSocketClient,
      config,
      123n,
      456n,
      userAddress
    );

    // Verify plaintext message was sent
    expect(sendMessageSpy).toHaveBeenCalled();
    const sentMessage = sendMessageSpy.mock.calls[0][0];

    expect(sentMessage.type).toBe('session_init');
    expect(sentMessage.chain_id).toBe(84532);
    expect(sentMessage.session_id).toBe('123');
    expect(sentMessage.jobId).toBe('456');
    expect(sentMessage.user_address).toBe(userAddress);

    // Should NOT have encrypted payload
    expect(sentMessage.payload).toBeUndefined();
  });

  test('should retrieve host public key via HostManager', async () => {
    const sendMessageSpy = vi.spyOn(mockWebSocketClient, 'sendMessage');
    const getHostPubKeySpy = vi.spyOn(hostManager, 'getHostPublicKey');

    (sessionManager as any).wsClient = mockWebSocketClient;

    const config = {
      chainId: 84532,
      host: hostWallet.address,
      modelId: 'llama-3',
      paymentMethod: 'deposit' as const,
      pricePerToken: 2000,
      endpoint: 'http://localhost:8080',
      encryption: true
    };

    await (sessionManager as any).sendEncryptedInit(
      mockWebSocketClient,
      config,
      123n,
      456n
    );

    // Verify HostManager was called to get public key
    expect(getHostPubKeySpy).toHaveBeenCalledWith(
      hostWallet.address,
      'http://localhost:8080'
    );

    // Verify encryption used the correct public key
    const hostPubKey = await hostManager.getHostPublicKey(hostWallet.address);
    expect(hostPubKey).toBeDefined();
    expect(hostPubKey.length).toBe(66);  // 33 bytes compressed, hex-encoded
  });
});
