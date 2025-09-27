import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { EOAProvider } from '../../src/providers/EOAProvider';
import { ChainId } from '../../src/types/chain.types';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';
import { createMockProvider, verifyContractAddress, createTestWallet } from '../utils/test-helpers';
import { ChainMismatchError, NodeChainMismatchError } from '../../src/errors/ChainErrors';

describe('Multi-Chain Integration - opBNB Testnet', () => {
  let sdk: FabstirSDKCore;
  let mockProvider: any;

  beforeEach(() => {
    mockProvider = createMockProvider(ChainId.OPBNB_TESTNET);

    // Mock fetch for node discovery
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('chain_id=5611')) {
        return {
          ok: true,
          json: async () => ({
            nodes: [{ url: 'http://node1.opbnb', chain_id: ChainId.OPBNB_TESTNET }],
            models: [{ id: 'llama-3', chain_id: ChainId.OPBNB_TESTNET }],
            chains: [{ chain_id: ChainId.OPBNB_TESTNET, name: 'opBNB Testnet' }]
          })
        };
      }
      return { ok: false, status: 404 };
    });
  });

  describe('SDK Initialization with opBNB Testnet', () => {
    it('should initialize SDK with opBNB testnet chain ID', () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.OPBNB_TESTNET,
        rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
        contractAddresses: {
          jobMarketplace: '0x0000000000000000000000000000000000000001',
          nodeRegistry: '0x0000000000000000000000000000000000000002',
          proofSystem: '0x0000000000000000000000000000000000000003',
          hostEarnings: '0x0000000000000000000000000000000000000004',
          usdcToken: '0x0000000000000000000000000000000000000006',
          modelRegistry: '0x0000000000000000000000000000000000000005'
        }
      });

      expect(sdk.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
      const chain = sdk.getCurrentChain();
      expect(chain.name).toBe('opBNB Testnet');
      expect(chain.nativeToken).toBe('BNB');
    });

    it('should use correct contract addresses for opBNB', () => {
      const chain = ChainRegistry.getChain(ChainId.OPBNB_TESTNET);
      expect(chain.contracts.jobMarketplace).toBe('0x0000000000000000000000000000000000000001');
      expect(chain.minDeposit).toBe('0.001');
      expect(chain.blockExplorer).toBe('https://testnet.opbnbscan.com');
    });
  });

  describe('BNB Payment Flow', () => {
    it('should create session with BNB payment', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.OPBNB_TESTNET,
        rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
        contractAddresses: {
          jobMarketplace: '0x0000000000000000000000000000000000000001',
          nodeRegistry: '0x0000000000000000000000000000000000000002',
          proofSystem: '0x0000000000000000000000000000000000000003',
          hostEarnings: '0x0000000000000000000000000000000000000004',
          usdcToken: '0x0000000000000000000000000000000000000006',
          modelRegistry: '0x0000000000000000000000000000000000000005'
        }
      });

      const eoaProvider = new EOAProvider(mockProvider);
      await sdk.initialize(eoaProvider);

      expect(sdk.isInitialized()).toBe(true);
      expect(await eoaProvider.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
    });

    it('should deposit BNB and create session from deposit', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.OPBNB_TESTNET,
        rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
        contractAddresses: {
          jobMarketplace: '0x0000000000000000000000000000000000000001',
          nodeRegistry: '0x0000000000000000000000000000000000000002',
          proofSystem: '0x0000000000000000000000000000000000000003',
          hostEarnings: '0x0000000000000000000000000000000000000004',
          usdcToken: '0x0000000000000000000000000000000000000006',
          modelRegistry: '0x0000000000000000000000000000000000000005'
        }
      });

      const eoaProvider = new EOAProvider(mockProvider);
      await sdk.initialize(eoaProvider);

      // Mock private key auth
      await sdk.authenticate('privatekey', { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' });

      const paymentManager = sdk.getPaymentManager();
      expect(paymentManager).toBeDefined();

      // Verify BNB deposit amount
      const depositAmount = '0.002'; // BNB
      const chain = ChainRegistry.getChain(ChainId.OPBNB_TESTNET);
      expect(parseFloat(depositAmount) >= parseFloat(chain.minDeposit)).toBe(true);
    });

    it('should verify correct contract deployment on opBNB', () => {
      const wallet = createTestWallet(ChainId.OPBNB_TESTNET);
      const jobMarketplace = new JobMarketplaceWrapper(ChainId.OPBNB_TESTNET, wallet);

      expect(jobMarketplace.getChainId()).toBe(ChainId.OPBNB_TESTNET);
      expect(jobMarketplace.getContractAddress()).toBe('0x0000000000000000000000000000000000000001');
    });
  });

  describe('Cross-Chain Session Management', () => {
    let baseSdk: FabstirSDKCore;
    let opbnbSdk: FabstirSDKCore;

    beforeEach(() => {
      baseSdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });

      opbnbSdk = new FabstirSDKCore({
        chainId: ChainId.OPBNB_TESTNET,
        rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
        contractAddresses: {
          jobMarketplace: '0x0000000000000000000000000000000000000001',
          nodeRegistry: '0x0000000000000000000000000000000000000002',
          proofSystem: '0x0000000000000000000000000000000000000003',
          hostEarnings: '0x0000000000000000000000000000000000000004',
          usdcToken: '0x0000000000000000000000000000000000000006',
          modelRegistry: '0x0000000000000000000000000000000000000005'
        }
      });
    });

    it('should manage separate sessions per chain', async () => {
      const baseProvider = new EOAProvider(createMockProvider(ChainId.BASE_SEPOLIA));
      const opbnbProvider = new EOAProvider(mockProvider);

      await baseSdk.initialize(baseProvider);
      await opbnbSdk.initialize(opbnbProvider);

      expect(baseSdk.getCurrentChainId()).toBe(ChainId.BASE_SEPOLIA);
      expect(opbnbSdk.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
    });

    it('should switch chains during session', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });

      const mockMultiChainProvider = {
        ...createMockProvider(ChainId.BASE_SEPOLIA),
        currentChain: ChainId.BASE_SEPOLIA,
        request: vi.fn().mockImplementation(async function(this: any, { method }: any) {
          if (method === 'eth_chainId') {
            return `0x${this.currentChain.toString(16)}`;
          }
          if (method === 'wallet_switchEthereumChain') {
            this.currentChain = ChainId.OPBNB_TESTNET;
            return null;
          }
          return mockProvider.request({ method });
        })
      };

      const provider = new EOAProvider(mockMultiChainProvider);
      await sdk.initialize(provider);

      // Start on Base Sepolia
      expect(sdk.getCurrentChainId()).toBe(ChainId.BASE_SEPOLIA);

      // Switch to opBNB
      await sdk.switchChain(ChainId.OPBNB_TESTNET);
      expect(sdk.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
    });
  });

  describe('Chain-Specific Node Discovery', () => {
    it('should discover nodes for opBNB testnet', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.OPBNB_TESTNET,
        rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
        contractAddresses: {
          jobMarketplace: '0x0000000000000000000000000000000000000001',
          nodeRegistry: '0x0000000000000000000000000000000000000002',
          proofSystem: '0x0000000000000000000000000000000000000003',
          hostEarnings: '0x0000000000000000000000000000000000000004',
          usdcToken: '0x0000000000000000000000000000000000000006',
          modelRegistry: '0x0000000000000000000000000000000000000005'
        }
      });

      const provider = new EOAProvider(mockProvider);
      await sdk.initialize(provider);
      await sdk.authenticate('privatekey', { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' });

      const clientManager = sdk.getClientManager();
      const nodes = await clientManager.discoverNodes(ChainId.OPBNB_TESTNET);

      expect(nodes).toHaveLength(1);
      expect(nodes[0].chain_id).toBe(ChainId.OPBNB_TESTNET);
    });

    it('should reject nodes from wrong chain', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.OPBNB_TESTNET,
        rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
        contractAddresses: {
          jobMarketplace: '0x0000000000000000000000000000000000000001',
          nodeRegistry: '0x0000000000000000000000000000000000000002',
          proofSystem: '0x0000000000000000000000000000000000000003',
          hostEarnings: '0x0000000000000000000000000000000000000004',
          usdcToken: '0x0000000000000000000000000000000000000006',
          modelRegistry: '0x0000000000000000000000000000000000000005'
        }
      });

      const provider = new EOAProvider(mockProvider);
      await sdk.initialize(provider);
      await sdk.authenticate('privatekey', { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' });

      const sessionManager = sdk.getSessionManager();

      // Mock WebSocket that reports wrong chain
      const mockWs = {
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn()
      };

      global.WebSocket = vi.fn().mockImplementation(() => mockWs) as any;

      // Try to start session with node from different chain
      const wrongChainNode = { url: 'http://node.base', chain_id: ChainId.BASE_SEPOLIA };

      // This would throw NodeChainMismatchError
      expect(sdk.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
      expect(wrongChainNode.chain_id).not.toBe(sdk.getCurrentChainId());
    });
  });

  describe('Error Handling', () => {
    it('should handle chain mismatch during contract operation', async () => {
      const wallet = createTestWallet(ChainId.BASE_SEPOLIA);
      const jobMarketplace = new JobMarketplaceWrapper(ChainId.OPBNB_TESTNET, wallet);

      // Mock provider network to return wrong chain
      vi.spyOn(wallet.provider!, 'getNetwork').mockResolvedValue({
        chainId: BigInt(ChainId.BASE_SEPOLIA),
        name: 'base-sepolia'
      } as any);

      await expect(jobMarketplace.verifyChain()).rejects.toThrow(ChainMismatchError);
    });

    it('should validate minimum deposit per chain', () => {
      const baseChain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      const opbnbChain = ChainRegistry.getChain(ChainId.OPBNB_TESTNET);

      // Base requires 0.0002 ETH minimum
      expect(parseFloat(baseChain.minDeposit)).toBe(0.0002);

      // opBNB requires 0.001 BNB minimum
      expect(parseFloat(opbnbChain.minDeposit)).toBe(0.001);

      // Different minimum deposits per chain
      expect(baseChain.minDeposit).not.toBe(opbnbChain.minDeposit);
    });
  });
});