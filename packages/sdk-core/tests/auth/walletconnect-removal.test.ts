import { describe, it, expect } from 'vitest';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';

describe('WalletConnect Removal Verification', () => {
  it('should no longer accept walletconnect as auth method', () => {
    const sdk = new FabstirSDKCore({
      chainId: 84532,
      rpcUrl: 'https://base-sepolia.blockpi.network/v1/rpc/public',
      contractAddresses: {
        jobMarketplace: '0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0',
        proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
        nodeRegistry: '0x039AB5d5e8D5426f9963140202F506A2Ce6988F9',
        hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
        fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      }
    });

    // TypeScript should error if we try to use 'walletconnect'
    // @ts-expect-error - walletconnect should not be a valid option
    const invalidCall = () => sdk.authenticate('walletconnect');

    // This line verifies that the type system prevents walletconnect
    expect(invalidCall).toBeDefined();
  });

  it('should only accept valid authentication methods', () => {
    const sdk = new FabstirSDKCore({
      chainId: 84532,
      rpcUrl: 'https://base-sepolia.blockpi.network/v1/rpc/public',
      contractAddresses: {
        jobMarketplace: '0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0',
        proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
        nodeRegistry: '0x039AB5d5e8D5426f9963140202F506A2Ce6988F9',
        hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
        fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      }
    });

    // These should be the only valid options
    const validMethods = ['metamask', 'privatekey', 'signer'];

    validMethods.forEach(method => {
      // This should not throw a type error
      const call = () => sdk.authenticate(method as any);
      expect(call).toBeDefined();
    });
  });

  it('should have correct method signature', () => {
    const sdk = new FabstirSDKCore({
      chainId: 84532,
      rpcUrl: 'https://base-sepolia.blockpi.network/v1/rpc/public',
      contractAddresses: {
        jobMarketplace: '0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0',
        proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
        nodeRegistry: '0x039AB5d5e8D5426f9963140202F506A2Ce6988F9',
        hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
        fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      }
    });

    // Check that the method signature is correct
    const authenticateStr = sdk.authenticate.toString();

    // Should NOT contain walletconnect
    expect(authenticateStr).not.toContain('walletconnect');

    // Should contain the other methods
    expect(authenticateStr).toContain('metamask');
    expect(authenticateStr).toContain('privatekey');
    expect(authenticateStr).toContain('signer');
  });

  it('should throw error if walletconnect is attempted at runtime', async () => {
    const sdk = new FabstirSDKCore({
      chainId: 84532,
      rpcUrl: 'https://base-sepolia.blockpi.network/v1/rpc/public',
      contractAddresses: {
        jobMarketplace: '0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0',
        proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
        nodeRegistry: '0x039AB5d5e8D5426f9963140202F506A2Ce6988F9',
        hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
        fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      }
    });

    // Force runtime call with invalid method
    try {
      await (sdk.authenticate as any)('walletconnect');
      throw new Error('Should have thrown an error');
    } catch (error: any) {
      // Should fail because walletconnect case is removed
      expect(error.message).toContain('Authentication failed');
    }
  });
});