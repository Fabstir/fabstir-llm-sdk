import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FabstirSDK } from '../src';
import { ethers } from 'ethers';

describe('Contract Connection and Loading', () => {
  let sdk: FabstirSDK;
  
  beforeAll(async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    
    // Mock provider
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      }),
      getCode: vi.fn().mockResolvedValue('0x608060405234801561001057600080fd5b50') // Mock contract bytecode
    };
    
    await sdk.connect(mockProvider as any);
  });

  it('should load JobMarketplace contract', async () => {
    const jobMarketplace = await sdk.contracts.getJobMarketplace();
    expect(jobMarketplace.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(jobMarketplace.interface).toBeDefined();
  });

  it('should load PaymentEscrow contract', async () => {
    const paymentEscrow = await sdk.contracts.getPaymentEscrow();
    expect(paymentEscrow.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should load NodeRegistry contract', async () => {
    const nodeRegistry = await sdk.contracts.getNodeRegistry();
    expect(nodeRegistry.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should verify contract deployment on correct network', async () => {
    const jobMarketplace = await sdk.contracts.getJobMarketplace();
    const deployedCode = await sdk.provider.getCode(jobMarketplace.address);
    expect(deployedCode).not.toBe('0x');
    expect(deployedCode.length).toBeGreaterThan(10);
  });

  it('should get contract version', async () => {
    const version = await sdk.contracts.getContractVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should use correct addresses for Base Sepolia', async () => {
    const sepoliaSdk = new FabstirSDK({ network: 'base-sepolia' });
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    };
    
    await sepoliaSdk.connect(mockProvider as any);
    const marketplace = await sepoliaSdk.contracts.getJobMarketplace();
    
    // Should use Sepolia-specific address
    expect(marketplace.address).toBeDefined();
    expect(marketplace.address).not.toBe('0x0000000000000000000000000000000000000000');
  });

  it('should use correct addresses for Base Mainnet', async () => {
    const mainnetSdk = new FabstirSDK({ network: 'base-mainnet' });
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 8453, name: 'base-mainnet' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    };
    
    await mainnetSdk.connect(mockProvider as any);
    const marketplace = await mainnetSdk.contracts.getJobMarketplace();
    
    // Should use Mainnet-specific address
    expect(marketplace.address).toBeDefined();
    expect(marketplace.address).not.toBe('0x0000000000000000000000000000000000000000');
  });
});
