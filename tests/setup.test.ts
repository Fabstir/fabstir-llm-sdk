import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FabstirSDK } from '../src';
import { ethers } from 'ethers';

describe('SDK Setup and Initialization', () => {
  let sdk: FabstirSDK;

  it('should create SDK instance with default config', () => {
    sdk = new FabstirSDK();
    expect(sdk).toBeDefined();
    expect(sdk.config.network).toBe('base-sepolia');
  });

  it('should initialize with custom config', () => {
    sdk = new FabstirSDK({
      network: 'base-mainnet',
      rpcUrl: 'https://mainnet.base.org',
      debug: true
    });
    expect(sdk.config.network).toBe('base-mainnet');
    expect(sdk.config.debug).toBe(true);
  });

  it('should connect wallet provider', async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    
    // Create a mock provider
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    };

    await sdk.connect(mockProvider as any);
    expect(sdk.isConnected).toBe(true);
    expect(sdk.provider).toBeDefined();
  });

  it('should get current account address', async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    
    // Create a mock provider with signer
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    };

    await sdk.connect(mockProvider as any);
    const address = await sdk.getAddress();
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should validate network is Base', async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    };

    await sdk.connect(mockProvider as any);
    const chainId = await sdk.getChainId();
    expect([84532, 8453]).toContain(chainId);
  });

  it('should throw error on wrong network', async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    
    // Mock provider with wrong chain ID
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 1, name: 'mainnet' }), // Ethereum mainnet
    };

    await expect(sdk.connect(mockProvider as any)).rejects.toThrow('Wrong network');
    expect(sdk.isConnected).toBe(false);
  });
});
