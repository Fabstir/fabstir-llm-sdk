# Fabstir LLM SDK - Auth Module Integration Guide

## Overview

This document defines how external authentication modules integrate with the Fabstir LLM SDK's AuthManager and the manager-based architecture.

## AuthManager Interface

The SDK provides a built-in AuthManager that handles wallet authentication and S5 seed generation.

### Core AuthManager API

```typescript
class AuthManager {
  // Authenticate with different providers
  authenticate(
    provider: 'base' | 'metamask' | 'private-key',
    options?: AuthOptions
  ): Promise<AuthResult>
  
  // Get authenticated signer
  getSigner(): ethers.Signer
  
  // Get S5 seed for storage
  getS5Seed(): string
  
  // Get user address
  getUserAddress(): string
  
  // Check authentication status
  isAuthenticated(): boolean
}
```

### Authentication Options

```typescript
interface AuthOptions {
  privateKey?: string;  // For 'private-key' provider
  rpcUrl?: string;      // Optional RPC URL override
}

interface AuthResult {
  signer: ethers.Signer;
  userAddress: string;
  s5Seed: string;
  network?: {
    chainId: number;
    name: string;
  };
}
```

## SDK Integration Pattern

### Using FabstirSDK with Authentication

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';

// Initialize SDK
const sdk = new FabstirSDKCore({
  rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/your-key',
  s5PortalUrl: 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p',
  contractAddresses: {
    jobMarketplace: '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944',
    nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
    proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
    hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
    modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E',
    usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62'
  }
});

// Authenticate with private key
const authResult = await sdk.authenticate('0x1234567890abcdef...');

// Now all managers are available
const authManager = sdk.getAuthManager();
const paymentManager = sdk.getPaymentManager();
const storageManager = await sdk.getStorageManager();
const discoveryManager = sdk.getDiscoveryManager();
const sessionManager = await sdk.getSessionManager();
```

## Custom Auth Module Integration

If you're building a custom authentication module for the SDK:

### 1. Implement Auth Provider

```typescript
import { ethers } from 'ethers';
import { AuthManager } from '@fabstir/sdk-core';

export class CustomAuthProvider {
  private authManager: AuthManager;
  
  constructor() {
    this.authManager = new AuthManager();
  }
  
  async authenticateWithCustomMethod(customCredentials: any): Promise<AuthResult> {
    // Your custom auth logic here
    const privateKey = await this.derivePrivateKey(customCredentials);
    
    // Use AuthManager to complete authentication
    return this.authManager.authenticate('private-key', {
      privateKey,
      rpcUrl: customCredentials.rpcUrl
    });
  }
  
  private async derivePrivateKey(credentials: any): Promise<string> {
    // Custom logic to derive private key
    // e.g., from mnemonic, hardware wallet, etc.
    return '0x...';
  }
}
```

### 2. Generate S5 Seed

The S5 seed is critical for storage operations. AuthManager generates it automatically:

```typescript
// S5 seed generation (internal to AuthManager)
const SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM';

async generateS5Seed(signer: ethers.Signer): Promise<string> {
  // Sign message to generate deterministic seed
  const signature = await signer.signMessage(SEED_MESSAGE);
  const hash = ethers.utils.keccak256(signature);
  
  // Convert to 12-word mnemonic
  const entropy = hash.slice(0, 34); // 16 bytes + checksum
  const mnemonic = ethers.utils.entropyToMnemonic(entropy);
  
  return mnemonic;
}
```

### 3. Manager Dependencies

All managers require AuthManager to be authenticated before use:

```typescript
// Managers check authentication internally
class PaymentManager {
  constructor(jobMarketplace: Contract, authManager: AuthManager) {
    if (!authManager.isAuthenticated()) {
      throw new Error('AuthManager must be authenticated');
    }
    this.authManager = authManager;
    this.signer = authManager.getSigner();
  }
}
```

## Authentication Flows

### 1. Private Key Authentication

```typescript
await sdk.authenticate('0x1234567890abcdef...');
```

### 2. MetaMask Integration (Browser)

```typescript
// In browser environment
const provider = new ethers.providers.Web3Provider(window.ethereum);
await provider.send("eth_requestAccounts", []);
const signer = provider.getSigner();

// Custom integration needed - AuthManager expects private key
// Consider using a wallet adapter pattern
```

### 3. Hardware Wallet

```typescript
// Hardware wallets require custom adapter
class HardwareWalletAdapter {
  async authenticate(sdk: FabstirSDK): Promise<AuthResult> {
    // Get signer from hardware wallet
    const signer = await this.connectHardwareWallet();
    
    // Generate S5 seed using message signing
    const s5Seed = await this.generateS5SeedFromHardware(signer);
    
    // Return auth result matching AuthResult interface
    return {
      signer,
      userAddress: await signer.getAddress(),
      s5Seed,
      network: { chainId: 84532, name: 'base-sepolia' }
    };
  }
}
```

## S5 Storage Integration

The S5 seed from AuthManager is used by StorageManager:

```typescript
class StorageManager {
  async initialize(authManager: AuthManager): Promise<void> {
    const s5Seed = authManager.getS5Seed();
    
    // Initialize S5 client with seed
    this.s5Client = await S5.create({
      seed: s5Seed,
      initialPeers: [this.s5PortalUrl]
    });
  }
}
```

## Security Considerations

1. **Private Key Handling**
   - Never store private keys in plain text
   - Use secure key management solutions
   - Clear sensitive data from memory after use

2. **S5 Seed Security**
   - S5 seed is derived from wallet signature
   - Deterministic but unique per wallet
   - Should be treated as sensitive data

3. **Session Management**
   - Authentication persists for SDK instance lifetime
   - No automatic session expiry
   - Clear authentication when done: `sdk = null`

## Error Handling

```typescript
try {
  await sdk.authenticate(privateKey);
} catch (error: any) {
  switch (error.code) {
    case 'AUTH_FAILED':
      // Invalid private key or auth failure
      break;
    case 'NETWORK_ERROR':
      // RPC connection issues
      break;
    case 'INVALID_CHAIN':
      // Wrong network
      break;
  }
}
```

## Testing Authentication

```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';

describe('Authentication', () => {
  it('should authenticate with private key', async () => {
    const sdk = new FabstirSDK();
    const result = await sdk.authenticate(TEST_PRIVATE_KEY);
    
    expect(result.userAddress).toBeDefined();
    expect(result.s5Seed).toBeDefined();
    expect(result.signer).toBeDefined();
    
    const authManager = sdk.getAuthManager();
    expect(authManager.isAuthenticated()).toBe(true);
  });
});
```

## Migration from Legacy Auth

If migrating from older SDK versions:

```typescript
// Old pattern (direct signer)
const sdk = new FabstirSDK(config, signer);

// New pattern (authenticate method)
const sdk = new FabstirSDK(config);
await sdk.authenticate(privateKey);
```

## See Also

- [AuthManager API Reference](SDK_API.md#authmanager)
- [Full SDK Documentation](SDK_API.md)
- [Quick Reference](SDK_QUICK_REFERENCE.md)
- [Auth Module Reference](auth-reference/API.md)