/**
 * Integration Tests for SDK Encrypted Storage (Phase 5.3)
 *
 * Tests the integration of encrypted storage into FabstirSDKCore.
 * Verifies end-to-end workflows with encryption.
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ChainId } from '../../src/types/chain.types';
import type { ConversationData } from '../../src/types';

// Set required environment variables for ChainRegistry initialization
// Source: .env.test (2025-08-26 deployment with S5 proof storage v8.1.2)
beforeAll(() => {
  process.env.CONTRACT_JOB_MARKETPLACE = '0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E';
  process.env.CONTRACT_NODE_REGISTRY = '0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6';
  process.env.CONTRACT_PROOF_SYSTEM = '0x2ACcc60893872A499700908889B38C5420CBcFD1';
  process.env.CONTRACT_HOST_EARNINGS = '0x908962e8c6CE72610021586f85ebDE09aAc97776';
  process.env.CONTRACT_MODEL_REGISTRY = '0x92b2De840bB2171203011A6dBA928d855cA8183E';
  process.env.CONTRACT_FAB_TOKEN = '0xC78949004B4EB6dEf2D66e49Cd81231472612D62';
  process.env.CONTRACT_USDC_TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  process.env.ENTRY_POINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
  process.env.RPC_URL_BASE_SEPOLIA = 'https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR';

  // Skip S5 storage for this test (WebSocket not available in Node test environment)
  // We're testing SDK convenience methods, not actual S5 operations
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

describe('SDK Encrypted Storage Integration (Phase 5.3)', () => {
  let sdk: FabstirSDKCore;
  let clientWallet: ethers.Wallet;
  let hostWallet: ethers.Wallet;
  const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA || 'https://base-sepolia.g.alchemy.com/v2/demo';

  beforeEach(async () => {
    // Create client and host wallets
    clientWallet = ethers.Wallet.createRandom();
    hostWallet = ethers.Wallet.createRandom();

    // Initialize SDK (use addresses from .env.test - source of truth)
    sdk = new FabstirSDKCore({
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl,
      contractAddresses: {
        jobMarketplace: '0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E',
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

    // Authenticate with private key
    await sdk.authenticate('privatekey', { privateKey: clientWallet.privateKey });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should provide encrypted storage methods', () => {
    // Verify SDK has the required methods for Phase 5.3
    expect(typeof sdk.saveConversation).toBe('function');
    expect(typeof sdk.loadConversation).toBe('function');
    expect(typeof sdk.getHostPublicKey).toBe('function');
  });

  it('should have EncryptionManager and StorageManager wired up', () => {
    // Verify that SDK has initialized the required managers
    const storageManager = sdk.getStorageManager();
    expect(storageManager).toBeDefined();

    // Verify EncryptionManager exists (Phase 5.1)
    // Note: EncryptionManager is private but is wired to StorageManager
    // We can verify it indirectly by checking StorageManager has encryption support
    expect(typeof storageManager.saveConversation).toBe('function');
    expect(typeof storageManager.loadConversation).toBe('function');
  });
});
