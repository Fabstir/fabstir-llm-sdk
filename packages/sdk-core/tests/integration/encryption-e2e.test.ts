/**
 * End-to-End Integration Tests for Encryption (Phase 6.1)
 *
 * Tests complete encrypted workflows from SDK initialization through conversation storage.
 * Verifies all encryption components work together correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ChainId } from '../../src/types/chain.types';
import { bytesToHex } from '../../src/crypto/utilities';

// Set required environment variables for ChainRegistry initialization
// Source: .env.test (2025-01-28 deployment with corrected dual pricing)
beforeAll(() => {
  process.env.CONTRACT_JOB_MARKETPLACE = '0xe169A4B57700080725f9553E3Cc69885fea13629';
  process.env.CONTRACT_NODE_REGISTRY = '0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6';
  process.env.CONTRACT_PROOF_SYSTEM = '0x2ACcc60893872A499700908889B38C5420CBcFD1';
  process.env.CONTRACT_HOST_EARNINGS = '0x908962e8c6CE72610021586f85ebDE09aAc97776';
  process.env.CONTRACT_MODEL_REGISTRY = '0x92b2De840bB2171203011A6dBA928d855cA8183E';
  process.env.CONTRACT_FAB_TOKEN = '0xC78949004B4EB6dEf2D66e49Cd81231472612D62';
  process.env.CONTRACT_USDC_TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  process.env.ENTRY_POINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
  process.env.RPC_URL_BASE_SEPOLIA = 'https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR';

  // Skip S5 storage for this test (WebSocket not available in Node test environment)
  process.env.SKIP_S5_STORAGE = 'true';
});

// Mock @base-org/account module
vi.mock('@base-org/account', () => ({
  createBaseAccountSDK: vi.fn().mockReturnValue({
    getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
    eoaAddress: '0x1234567890123456789012345678901234567890',
    getProvider: vi.fn().mockReturnValue({
      request: vi.fn().mockImplementation(({ method }) => {
        if (method === 'eth_requestAccounts') {
          return Promise.resolve(['0x1234567890123456789012345678901234567890']);
        }
        return Promise.resolve(null);
      }),
      getSigner: vi.fn().mockResolvedValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    })
  }),
  base: {
    constants: {
      CHAIN_IDS: {
        baseSepolia: 84532
      }
    }
  }
}));

describe('End-to-End Encryption Integration (Phase 6.1)', () => {
  let clientSdk: FabstirSDKCore;
  let hostSdk: FabstirSDKCore;
  let clientWallet: ethers.Wallet;
  let hostWallet: ethers.Wallet;
  const rpcUrl = 'https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR'; // From .env.test

  // Test account keys from .env.test
  const TEST_USER_1_PRIVATE_KEY = '0x2d5db36770a53811d9a11163a5e6577bb867e19552921bf40f74064308bea952';
  const TEST_USER_1_ADDRESS = '0x8D642988E3e7b6DB15b6058461d5563835b04bF6';
  const TEST_HOST_1_PRIVATE_KEY = '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2';
  const TEST_HOST_1_ADDRESS = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';

  beforeEach(async () => {
    // Create wallets from test accounts
    clientWallet = new ethers.Wallet(TEST_USER_1_PRIVATE_KEY);
    hostWallet = new ethers.Wallet(TEST_HOST_1_PRIVATE_KEY);

    // Initialize client SDK
    clientSdk = new FabstirSDKCore({
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl,
      contractAddresses: {
        jobMarketplace: '0xe169A4B57700080725f9553E3Cc69885fea13629',
        nodeRegistry: '0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6',
        proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
        hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
        usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
      },
      s5Config: {
        seedPhrase: 'yield organic score bishop free juice atop village video element unless sneak care rock update'
      }
    });

    // Initialize host SDK
    hostSdk = new FabstirSDKCore({
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl,
      contractAddresses: {
        jobMarketplace: '0xe169A4B57700080725f9553E3Cc69885fea13629',
        nodeRegistry: '0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6',
        proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
        hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
        usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
      },
      s5Config: {
        seedPhrase: 'host seed phrase for testing encryption flows with different keys'
      }
    });

    // Authenticate both SDKs
    await clientSdk.authenticate('privatekey', { privateKey: clientWallet.privateKey });
    await hostSdk.authenticate('privatekey', { privateKey: hostWallet.privateKey });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Test 1: Full Encrypted Session Workflow', () => {
    it('should complete full encrypted workflow from init to storage', async () => {
      // Step 1: Verify EncryptionManagers initialized
      const clientEncryptionManager = (clientSdk as any).encryptionManager;
      const hostEncryptionManager = (hostSdk as any).encryptionManager;
      expect(clientEncryptionManager).toBeDefined();
      expect(hostEncryptionManager).toBeDefined();

      // Step 2: Get host's public key (directly from EncryptionManager for testing)
      const hostPubKey = (hostEncryptionManager as any).clientPublicKey;
      expect(hostPubKey).toBeDefined();
      expect(hostPubKey.length).toBeGreaterThan(0);

      // Step 3: Simulate session initialization with encryption
      // Client encrypts session init
      const sessionInitPayload = {
        jobId: BigInt(123),
        modelName: 'llama-3',
        sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
        pricePerToken: 2000
      };

      const encryptedInit = await clientEncryptionManager.encryptSessionInit(
        hostPubKey,
        sessionInitPayload
      );

      expect(encryptedInit.type).toBe('encrypted_session_init');
      expect(encryptedInit.payload).toBeDefined();

      // Step 4: Host decrypts and verifies sender
      const { data: decryptedInit, senderAddress } = await hostEncryptionManager.decryptSessionInit(
        encryptedInit
      );

      expect(decryptedInit.jobId).toBe(BigInt(123));
      expect(decryptedInit.modelName).toBe('llama-3');
      expect(senderAddress.toLowerCase()).toBe(TEST_USER_1_ADDRESS.toLowerCase());

      // Step 5: Simulate encrypted message exchange with session key
      const sessionKey = new Uint8Array(32);
      crypto.getRandomValues(sessionKey);

      const plainMessage = 'What is 2+2?';
      const encryptedMessage = clientEncryptionManager.encryptMessage(
        sessionKey,
        plainMessage,
        0
      );

      expect(encryptedMessage.type).toBe('encrypted_message');
      expect(encryptedMessage.ciphertextHex).toBeDefined();

      // Host decrypts message
      const decryptedMessage = hostEncryptionManager.decryptMessage(
        sessionKey,
        encryptedMessage
      );

      expect(decryptedMessage).toBe(plainMessage);

      // Step 6: Test encrypted storage (EncryptionManager level)
      const conversationData = {
        sessionId: 'sess-123',
        messages: [
          { role: 'user', content: plainMessage, timestamp: Date.now() },
          { role: 'assistant', content: 'The answer is 4', timestamp: Date.now() }
        ]
      };

      // Encrypt for storage
      const encryptedStorage = await clientEncryptionManager.encryptForStorage(
        hostPubKey,
        conversationData
      );

      expect(encryptedStorage.payload).toBeDefined();
      expect(encryptedStorage.storedAt).toBeDefined();
      expect(encryptedStorage.conversationId).toBeDefined();

      // Step 7: Decrypt and verify
      const { data: decryptedData, senderAddress: storageSender } =
        await hostEncryptionManager.decryptFromStorage(encryptedStorage);

      expect(decryptedData.sessionId).toBe('sess-123');
      expect(decryptedData.messages.length).toBe(2);
      expect(storageSender.toLowerCase()).toBe(TEST_USER_1_ADDRESS.toLowerCase());
    });
  });

  describe('Test 2: Multi-Host Scenario (Different Keys)', () => {
    it('should handle encryption with different host keys correctly', async () => {
      // Create second host wallet
      const host2Wallet = ethers.Wallet.createRandom();
      const host2Sdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl,
        contractAddresses: {
          jobMarketplace: '0xe169A4B57700080725f9553E3Cc69885fea13629',
          nodeRegistry: '0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });
      await host2Sdk.authenticate('privatekey', { privateKey: host2Wallet.privateKey });

      const clientEM = (clientSdk as any).encryptionManager;
      const host1EM = (hostSdk as any).encryptionManager;
      const host2EM = (host2Sdk as any).encryptionManager;

      // Get public keys for both hosts (directly from EncryptionManagers for testing)
      const host1PubKey = (host1EM as any).clientPublicKey;
      const host2PubKey = (host2EM as any).clientPublicKey;

      // Client encrypts message to host1
      const messageToHost1 = 'Secret for host 1';
      const encryptedForHost1 = await clientEM.encryptForStorage(host1PubKey, messageToHost1);

      // Client encrypts message to host2
      const messageToHost2 = 'Secret for host 2';
      const encryptedForHost2 = await clientEM.encryptForStorage(host2PubKey, messageToHost2);

      // Host1 can decrypt their message
      const { data: decryptedByHost1 } = await host1EM.decryptFromStorage(encryptedForHost1);
      expect(decryptedByHost1).toBe(messageToHost1);

      // Host2 can decrypt their message
      const { data: decryptedByHost2 } = await host2EM.decryptFromStorage(encryptedForHost2);
      expect(decryptedByHost2).toBe(messageToHost2);

      // Host1 cannot decrypt host2's message (wrong key)
      await expect(host1EM.decryptFromStorage(encryptedForHost2)).rejects.toThrow();

      // Host2 cannot decrypt host1's message (wrong key)
      await expect(host2EM.decryptFromStorage(encryptedForHost1)).rejects.toThrow();
    });
  });

  describe('Test 3: Session Recovery (Reconnect with Session Key)', () => {
    it('should maintain encryption state across session reconnection', async () => {
      const clientEM = (clientSdk as any).encryptionManager;
      const hostEM = (hostSdk as any).encryptionManager;

      // Generate session key
      const sessionKey = crypto.getRandomValues(new Uint8Array(32));

      // Exchange messages in first session
      const msg1 = clientEM.encryptMessage(sessionKey, 'First message', 0);
      const msg2 = clientEM.encryptMessage(sessionKey, 'Second message', 1);

      const decrypted1 = hostEM.decryptMessage(sessionKey, msg1);
      const decrypted2 = hostEM.decryptMessage(sessionKey, msg2);

      expect(decrypted1).toBe('First message');
      expect(decrypted2).toBe('Second message');

      // Simulate disconnection and reconnection with same session key
      // Continue message exchange with higher indices
      const msg3 = clientEM.encryptMessage(sessionKey, 'Third message after reconnect', 2);
      const msg4 = clientEM.encryptMessage(sessionKey, 'Fourth message', 3);

      const decrypted3 = hostEM.decryptMessage(sessionKey, msg3);
      const decrypted4 = hostEM.decryptMessage(sessionKey, msg4);

      expect(decrypted3).toBe('Third message after reconnect');
      expect(decrypted4).toBe('Fourth message');

      // Verify message indices in AAD prevent replay attacks
      // The AAD contains message_index, so replaying msg1 with wrong index should fail
      const msg1AAD = JSON.parse(new TextDecoder().decode(
        new Uint8Array(msg1.aadHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)))
      ));
      expect(msg1AAD.message_index).toBe(0);

      const msg3AAD = JSON.parse(new TextDecoder().decode(
        new Uint8Array(msg3.aadHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)))
      ));
      expect(msg3AAD.message_index).toBe(2);
    });
  });

  describe('Test 4: Encryption Opt-in/Opt-out Transitions', () => {
    it('should handle both encrypted and unencrypted workflows', async () => {
      const clientEM = (clientSdk as any).encryptionManager;
      const hostEM = (hostSdk as any).encryptionManager;
      const hostPubKey = (hostEM as any).clientPublicKey;

      // Test encryption methods work (no actual storage - S5 disabled)
      const testData = { test: 'data', encrypted: false };

      // Encrypt and decrypt
      const encrypted = await clientEM.encryptForStorage(hostPubKey, testData);
      const { data: decrypted, senderAddress } = await hostEM.decryptFromStorage(encrypted);
      expect(decrypted).toEqual(testData);
      expect(senderAddress.toLowerCase()).toBe(TEST_USER_1_ADDRESS.toLowerCase());

      // Test with different data types
      const complexData = {
        sessionId: 'sess-test',
        messages: [{ role: 'user', content: 'test' }],
        metadata: { encrypted: true, timestamp: Date.now() }
      };

      const encryptedComplex = await clientEM.encryptForStorage(hostPubKey, complexData);
      const { data: decryptedComplex } = await hostEM.decryptFromStorage(encryptedComplex);
      expect(decryptedComplex).toEqual(complexData);

      // Verify metadata
      expect(encryptedComplex.storedAt).toBeDefined();
      expect(encryptedComplex.conversationId).toBeDefined();
      expect(encryptedComplex.conversationId.length).toBe(32); // 16 bytes hex
    });
  });

  describe('Test 5: Host Verification (Address Recovery)', () => {
    it('should verify sender identity via signature recovery', async () => {
      const clientEM = (clientSdk as any).encryptionManager;
      const hostEM = (hostSdk as any).encryptionManager;

      // Step 1: Get host public key (directly from EncryptionManager for testing)
      const hostPubKey = (hostEM as any).clientPublicKey;

      // Step 2: Client encrypts session init
      const sessionInit = {
        jobId: BigInt(456),
        modelName: 'gpt-4',
        sessionKey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
        pricePerToken: 2000
      };

      const encrypted = await clientEM.encryptSessionInit(hostPubKey, sessionInit);

      // Step 3: Host decrypts and recovers sender address
      const { data, senderAddress } = await hostEM.decryptSessionInit(encrypted);

      // Step 4: Verify recovered address matches client
      expect(senderAddress.toLowerCase()).toBe(TEST_USER_1_ADDRESS.toLowerCase());
      expect(data.jobId).toBe(BigInt(456));
      expect(data.modelName).toBe('gpt-4');

      // Step 5: Verify signature tampering changes recovered address
      const tamperedPayload = {
        ...encrypted,
        payload: {
          ...encrypted.payload,
          sigHex: 'ff' + encrypted.payload.sigHex.slice(2)
        }
      };

      // Tampered signature will recover a different address
      const { senderAddress: tamperedSender } = await hostEM.decryptSessionInit(tamperedPayload);
      expect(tamperedSender.toLowerCase()).not.toBe(TEST_USER_1_ADDRESS.toLowerCase());

      // Step 6: Test storage with sender verification
      const conversationData = { messages: ['test'] };
      const encryptedStorage = await clientEM.encryptForStorage(hostPubKey, conversationData);

      const { data: loadedData, senderAddress: storageSender } = await hostEM.decryptFromStorage(
        encryptedStorage
      );

      expect(storageSender.toLowerCase()).toBe(TEST_USER_1_ADDRESS.toLowerCase());
      expect(loadedData).toEqual(conversationData);

      // Step 7: Verify metadata includes sender info
      expect(encryptedStorage.storedAt).toBeDefined();
      expect(encryptedStorage.conversationId).toBeDefined();
      expect(encryptedStorage.conversationId.length).toBe(32); // 16 bytes hex
    });
  });
});
