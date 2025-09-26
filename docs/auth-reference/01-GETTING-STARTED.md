# Getting Started with Fabstir Auth

This guide will walk you through integrating Fabstir's multi-chain, multi-wallet authentication into your SDK.

## Installation

```bash
npm install fabstir-llm-auth ethers@^5.7.0
```

> **Note**: This library requires ethers v5. Ethers v6 support is planned for a future release.

## Basic Integration

### 1. Initialize AuthManager

```typescript
import { AuthManager } from 'fabstir-llm-auth';

const authManager = new AuthManager();
```

### 2. Register Wallet Providers

You can register multiple providers to give users choice:

```typescript
import { MetaMaskProvider, BaseAccountProvider } from 'fabstir-llm-auth';
import { BASE_SEPOLIA_CHAIN_ID } from 'fabstir-llm-auth/config/chains';

// MetaMask - Traditional browser wallet
const metamaskProvider = new MetaMaskProvider();
authManager.registerProvider(metamaskProvider);

// Base Account - Passkey authentication with smart wallets
const baseProvider = new BaseAccountProvider({
  appName: 'Your App Name',
  appLogoUrl: 'https://yourapp.com/logo.png',
  chainId: BASE_SEPOLIA_CHAIN_ID // 84532
});
authManager.registerProvider(baseProvider);
```

### 3. Authenticate Users

```typescript
// For returning users with MetaMask
try {
  const session = await authManager.authenticate('metamask');
  console.log('Connected:', session.address);
  console.log('Chain ID:', session.chainId);
} catch (error) {
  if (error.code === 4001) {
    console.log('User rejected connection');
  } else if (error.message.includes('MetaMask is not installed')) {
    console.log('Please install MetaMask');
  }
}

// For new users with passkey (Base Account)
try {
  const session = await authManager.authenticate('base', 'username');
  console.log('Smart wallet created:', session.address);
} catch (error) {
  console.error('Authentication failed:', error);
}
```

### 4. Export Credentials for Your SDK

This is the critical integration point where auth credentials are passed to your SDK:

```typescript
// After successful authentication
const credentials = await authManager.exportForSDK();

// Credentials structure:
{
  signer: ethers.Signer,      // For blockchain transactions
  s5Seed: string,              // Deterministic seed for S5 network
  userId: string,              // User identifier
  address: string,             // Wallet address
  chainId: number,             // Current chain ID
  supportedChains: number[],   // All supported chains
  capabilities: {
    gasSponsorship: boolean,   // True for Base testnet
    passkey: boolean,          // True for Base Account
    smartWallet: boolean,      // True for Base Account
    multiChain: boolean,       // True for MetaMask
    chainSwitching: boolean    // True for MetaMask
  }
}

// Use in your SDK
const mySDK = new YourFabstirSDK({
  signer: credentials.signer,
  s5Seed: credentials.s5Seed,
  // ... other config
});
```

## Chain Management

### Check Current Chain

```typescript
const currentChain = authManager.getCurrentChain();
console.log('Current chain:', currentChain);
```

### Switch Chains (MetaMask only)

```typescript
import { OPBNB_TESTNET_CHAIN_ID } from 'fabstir-llm-auth/config/chains';

try {
  await authManager.switchChain(OPBNB_TESTNET_CHAIN_ID);
  console.log('Switched to opBNB testnet');
} catch (error) {
  if (error.code === 'UNSUPPORTED_CHAIN') {
    console.log('Provider doesn\'t support this chain');
  }
}
```

### Available Chains

```typescript
// Built-in chain constants
import {
  BASE_SEPOLIA_CHAIN_ID,    // 84532
  BASE_MAINNET_CHAIN_ID,     // 8453
  OPBNB_TESTNET_CHAIN_ID,    // 5611
  OPBNB_MAINNET_CHAIN_ID,    // 204
  ETHEREUM_MAINNET_CHAIN_ID  // 1
} from 'fabstir-llm-auth/config/chains';
```

## Session Management

### Persist Sessions

Sessions are automatically saved to localStorage:

```typescript
// On page reload, recover session
const recoveredSession = authManager.recoverSession();
if (recoveredSession) {
  console.log('Welcome back:', recoveredSession.userId);

  // Re-export credentials if needed
  const credentials = await authManager.exportForSDK();
}
```

### Logout

```typescript
authManager.logout();
// Session is cleared from storage
```

## Event Handling

Listen for important auth events:

```typescript
// Authentication success
authManager.on('authenticated', (event) => {
  console.log('User authenticated:', event.session.userId);
  console.log('Provider:', event.provider);
});

// Chain changes
authManager.on('chainChanged', (event) => {
  console.log('Chain changed:', event.previousChainId, '->', event.newChainId);
  // You may need to update your SDK configuration
});

// Session updates
authManager.on('sessionUpdated', (event) => {
  console.log('Session updated:', event.updates);
});

// Logout
authManager.on('logout', (event) => {
  console.log('User logged out:', event.reason);
  // Clean up your SDK state
});

// Session expiry
authManager.on('sessionExpired', () => {
  console.log('Session expired, please re-authenticate');
});
```

## Complete Example

```typescript
import {
  AuthManager,
  MetaMaskProvider,
  BaseAccountProvider
} from 'fabstir-llm-auth';
import { BASE_SEPOLIA_CHAIN_ID } from 'fabstir-llm-auth/config/chains';

class FabstirSDKWithAuth {
  private authManager: AuthManager;
  private sdkInstance?: YourFabstirSDK;

  constructor() {
    this.authManager = new AuthManager();
    this.setupProviders();
    this.setupEventListeners();
  }

  private setupProviders() {
    // Add both providers for maximum flexibility
    this.authManager.registerProvider(new MetaMaskProvider());
    this.authManager.registerProvider(new BaseAccountProvider({
      appName: 'Fabstir Marketplace',
      appLogoUrl: 'https://fabstir.com/logo.png',
      chainId: BASE_SEPOLIA_CHAIN_ID
    }));
  }

  private setupEventListeners() {
    this.authManager.on('chainChanged', async (event) => {
      // Re-initialize SDK with new chain
      await this.reinitializeSDK();
    });

    this.authManager.on('logout', () => {
      this.sdkInstance = undefined;
    });
  }

  async connect(provider: 'metamask' | 'base', username?: string) {
    try {
      // Authenticate
      const session = await this.authManager.authenticate(provider, username);

      // Export credentials
      const credentials = await this.authManager.exportForSDK();

      // Initialize your SDK
      this.sdkInstance = new YourFabstirSDK({
        signer: credentials.signer,
        s5Seed: credentials.s5Seed,
        chainId: credentials.chainId,
        // ... other configuration
      });

      return {
        success: true,
        session,
        sdk: this.sdkInstance
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async reinitializeSDK() {
    if (!this.authManager.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const credentials = await this.authManager.exportForSDK();
    this.sdkInstance = new YourFabstirSDK({
      signer: credentials.signer,
      s5Seed: credentials.s5Seed,
      chainId: credentials.chainId,
    });
  }

  async disconnect() {
    this.authManager.logout();
    this.sdkInstance = undefined;
  }
}

// Usage
const fabstir = new FabstirSDKWithAuth();

// Let user choose their preferred wallet
const result = await fabstir.connect('metamask');
// OR for new users
const result = await fabstir.connect('base', 'alice');

if (result.success) {
  // Use the SDK
  const sdk = result.sdk;
  // ... perform operations
}
```

## Environment Considerations

### Development vs Production

The library automatically detects the environment:
- **Test Environment**: Uses mocks (when `process.env.VITEST === 'true'`)
- **Production**: Uses real Coinbase Wallet SDK and MetaMask

### Browser Requirements

- **MetaMask**: Requires MetaMask browser extension
- **Base Account**: Works in any modern browser (uses Coinbase Wallet SDK)
- **Mobile**: Base Account works on mobile, MetaMask requires mobile app

## Next Steps

1. Review [Provider Comparison](./02-PROVIDER-COMPARISON.md) to choose the right providers
2. Follow the [Integration Checklist](./03-INTEGRATION-CHECKLIST.md)
3. Set up [E2E Testing](./04-E2E-TESTING-GUIDE.md) with real wallets
4. Review [Error Handling](./07-ERROR-HANDLING.md) best practices

## Common Issues

See [Troubleshooting Guide](./06-TROUBLESHOOTING.md) for solutions to:
- MetaMask not detected
- Chain switching failures
- Session persistence issues
- Signature verification problems