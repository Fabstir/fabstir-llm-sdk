import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WalletProviderFactory } from '../../src/factories/WalletProviderFactory';
import { WalletProviderType } from '../../src/types/wallet.types';
import { EOAProvider } from '../../src/providers/EOAProvider';
import { SmartAccountProvider } from '../../src/providers/SmartAccountProvider';

// Mock window.ethereum
const mockEthereum = {
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  isMetaMask: true
};

// Mock Base Account SDK availability
vi.mock('@base-org/account', () => ({
  createBaseAccountSDK: vi.fn()
}));

describe('WalletProviderFactory', () => {
  let originalWindow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWindow = global.window;
    // Setup default window mock
    global.window = {
      ethereum: mockEthereum
    } as any;
    // Reset factory cache
    WalletProviderFactory.resetAvailabilityCache();
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.restoreAllMocks();
    WalletProviderFactory.resetAvailabilityCache();
  });

  describe('Auto Detection', () => {
    it('should detect MetaMask when window.ethereum.isMetaMask is true', () => {
      const detected = WalletProviderFactory.detectAvailableProviders();
      expect(detected).toContain(WalletProviderType.METAMASK);
    });

    it('should detect Rainbow when window.ethereum.isRainbow is true', () => {
      global.window = {
        ethereum: { ...mockEthereum, isRainbow: true, isMetaMask: false }
      } as any;

      const detected = WalletProviderFactory.detectAvailableProviders();
      expect(detected).toContain(WalletProviderType.RAINBOW);
    });

    it('should detect generic EOA when window.ethereum exists', () => {
      global.window = {
        ethereum: { ...mockEthereum, isMetaMask: false }
      } as any;

      const detected = WalletProviderFactory.detectAvailableProviders();
      expect(detected).toContain(WalletProviderType.EOA);
    });

    it('should detect Base Account Kit availability', () => {
      const detected = WalletProviderFactory.detectAvailableProviders();
      expect(detected).toContain(WalletProviderType.BASE_ACCOUNT_KIT);
    });

    it('should return empty array when no providers available', () => {
      global.window = {} as any;
      // Mock Base Account Kit as not available
      vi.spyOn(WalletProviderFactory, 'isBaseAccountKitAvailable').mockReturnValue(false);

      const detected = WalletProviderFactory.detectAvailableProviders();
      expect(detected).toEqual([]);
    });
  });

  describe('Provider Creation', () => {
    it('should create MetaMask provider when requested', async () => {
      const provider = await WalletProviderFactory.createProvider(WalletProviderType.METAMASK);
      expect(provider).toBeInstanceOf(EOAProvider);
    });

    it('should create Rainbow provider when requested', async () => {
      global.window = {
        ethereum: { ...mockEthereum, isRainbow: true }
      } as any;

      const provider = await WalletProviderFactory.createProvider(WalletProviderType.RAINBOW);
      expect(provider).toBeInstanceOf(EOAProvider);
    });

    it('should create Base Account Kit provider when requested', async () => {
      const provider = await WalletProviderFactory.createProvider(WalletProviderType.BASE_ACCOUNT_KIT);
      expect(provider).toBeInstanceOf(SmartAccountProvider);
    });

    it('should throw error when requested provider not available', async () => {
      global.window = {} as any;

      await expect(
        WalletProviderFactory.createProvider(WalletProviderType.METAMASK)
      ).rejects.toThrow('MetaMask provider not available');
    });

    it('should create provider with custom config', async () => {
      const config = { bundlerUrl: 'https://bundler.test', paymasterUrl: 'https://paymaster.test' };
      const provider = await WalletProviderFactory.createProvider(
        WalletProviderType.BASE_ACCOUNT_KIT,
        config
      );
      expect(provider).toBeInstanceOf(SmartAccountProvider);
    });
  });

  describe('Auto Selection', () => {
    it('should auto-select MetaMask if available', async () => {
      const provider = await WalletProviderFactory.getProvider();
      expect(provider).toBeInstanceOf(EOAProvider);
    });

    it('should prefer smart account when preferGasless is true', async () => {
      const provider = await WalletProviderFactory.getProvider({ preferGasless: true });
      expect(provider).toBeInstanceOf(SmartAccountProvider);
    });

    it('should fallback to EOA if smart account not available when preferGasless', async () => {
      // Mock Base Account Kit as not available
      vi.spyOn(WalletProviderFactory, 'isBaseAccountKitAvailable').mockReturnValue(false);

      const provider = await WalletProviderFactory.getProvider({ preferGasless: true });
      expect(provider).toBeInstanceOf(EOAProvider);
    });

    it('should throw error when no providers available', async () => {
      global.window = {} as any;
      // Mock Base Account Kit as not available
      vi.spyOn(WalletProviderFactory, 'isBaseAccountKitAvailable').mockReturnValue(false);

      await expect(WalletProviderFactory.getProvider()).rejects.toThrow('No wallet providers available');
    });

    it('should respect priority order in options', async () => {
      const provider = await WalletProviderFactory.getProvider({
        priority: [WalletProviderType.RAINBOW, WalletProviderType.METAMASK]
      });
      expect(provider).toBeInstanceOf(EOAProvider); // Should pick first available
    });
  });
});