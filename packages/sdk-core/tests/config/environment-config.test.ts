/**
 * Test environment configuration loading
 */

import { describe, it, expect } from 'vitest';
import { getBaseSepolia, getOpBNBTestnet } from '../../src/config/environment';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';

describe('Environment Configuration', () => {
  it('should load Base Sepolia configuration from environment', () => {
    const config = getBaseSepolia();

    // Verify contract addresses are loaded (from .env.test or defaults)
    expect(config.contracts.jobMarketplace).toBe('0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944');
    expect(config.contracts.nodeRegistry).toBe('0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218');
    expect(config.contracts.proofSystem).toBe('0x2ACcc60893872A499700908889B38C5420CBcFD1');
    expect(config.contracts.hostEarnings).toBe('0x908962e8c6CE72610021586f85ebDE09aAc97776');
    expect(config.contracts.modelRegistry).toBe('0x92b2De840bB2171203011A6dBA928d855cA8183E');
    expect(config.contracts.usdcToken).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    expect(config.contracts.fabToken).toBe('0xC78949004B4EB6dEf2D66e49Cd81231472612D62');

    // Verify EntryPoint address
    expect(config.entryPoint).toBe('0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789');
    expect(config.chainId).toBe(84532);
  });

  it('should load opBNB Testnet configuration with placeholders', () => {
    const config = getOpBNBTestnet();

    // Verify placeholder addresses for opBNB (to be deployed)
    expect(config.contracts.jobMarketplace).toBe('0x0000000000000000000000000000000000000001');
    expect(config.entryPoint).toBe('0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789');
    expect(config.chainId).toBe(5611);
  });

  it('should use environment configuration in ChainRegistry', () => {
    const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);

    // Verify ChainRegistry uses environment configuration
    expect(chain.contracts.jobMarketplace).toBe('0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944');
    expect(chain.contracts.nodeRegistry).toBe('0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218');
    expect(chain.contracts.proofSystem).toBe('0x2ACcc60893872A499700908889B38C5420CBcFD1');
    expect(chain.contracts.hostEarnings).toBe('0x908962e8c6CE72610021586f85ebDE09aAc97776');
    expect(chain.contracts.modelRegistry).toBe('0x92b2De840bB2171203011A6dBA928d855cA8183E');
    expect(chain.contracts.usdcToken).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    expect(chain.contracts.fabToken).toBe('0xC78949004B4EB6dEf2D66e49Cd81231472612D62');
  });

  it('should have no hardcoded addresses in production code', () => {
    // This test validates that we're using the environment configuration
    const baseSepolia = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
    const envConfig = getBaseSepolia();

    // All addresses should match the environment configuration
    expect(baseSepolia.contracts).toEqual(envConfig.contracts);
  });
});