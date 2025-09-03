# SDK Integration Guide

## Overview

The Fabstir authentication module provides a unified interface for SDKs to integrate with multiple wallet providers. This guide explains how to integrate the auth module with your SDK or application.

## Installation

```bash
npm install @fabstir/llm-auth ethers
```

Required peer dependencies:
- `ethers` (v5.x)
- `@base-org/account` (v2.x) - Only if using Base provider

## Basic Integration

### 1. Initialize Authentication Manager

```typescript
import { AuthManager, BaseAccountProvider, MetaMaskProvider } from '@fabstir/llm-auth';

// Create auth manager
const authManager = new AuthManager();

// Register providers you want to support
const baseProvider = new BaseAccountProvider({
  appName: 'Your App Name',
  testnet: true  // Enable gas sponsorship
});
authManager.registerProvider(baseProvider);

const metamaskProvider = new MetaMaskProvider();
authManager.registerProvider(metamaskProvider);
```

### 2. Authenticate User

```typescript
// Let user choose provider
const providers = authManager.getAvailableProviders();
console.log('Available providers:', providers);

// Authenticate with chosen provider
const session = await authManager.authenticate('base');
console.log('Authenticated:', session.userId);
```

### 3. Export Credentials for SDK

```typescript
// Get credentials for SDK operations
const credentials = await authManager.exportForSDK();

// Use in your SDK
const mySDK = new MySDK({
  signer: credentials.signer,
  seed: credentials.s5Seed,
  userId: credentials.userId
});
```

## SDK Credential Usage

### Using the Signer

The exported signer is an ethers.js Signer instance for blockchain transactions:

```typescript
const credentials = await authManager.exportForSDK();
const { signer } = credentials;

// Sign messages
const signature = await signer.signMessage('Hello World');

// Get address
const address = await signer.getAddress();

// Send transactions
const tx = await signer.sendTransaction({
  to: '0x...',
  value: ethers.utils.parseEther('0.1')
});
```

### Using the S5 Seed

The S5 seed is a deterministic 12-word mnemonic for decentralized storage:

```typescript
const { s5Seed } = credentials;

// Use with S5 storage client
const s5Client = new S5Client({
  seed: s5Seed
});

// Same passkey always generates same seed
// User can recover their data across sessions
```

### Using Capabilities

Check provider capabilities to enable/disable features:

```typescript
const { capabilities } = credentials;

if (capabilities.gasSponsorship) {
  // Provider sponsors gas - no ETH needed
  console.log('Free transactions enabled!');
} else {
  // User pays gas - ensure they have ETH
  console.log('Please ensure you have ETH for gas');
}

if (capabilities.smartWallet) {
  // Advanced features available
  enableBatchTransactions();
  enableSessionKeys();
}

if (capabilities.passkey) {
  // Passwordless authentication
  console.log('Using secure passkey authentication');
}
```

## Provider-Specific Integration

### Base Account Kit Integration

```typescript
// Base provider with custom SDK factory
const baseProvider = new BaseAccountProvider({
  appName: 'My DApp',
  testnet: true,
  sdkFactory: () => new CustomBaseSDK()  // Optional custom SDK
});

// After authentication
const session = await authManager.authenticate('base', 'username');
// session.capabilities.gasSponsorship = true (on testnet)
// session.capabilities.smartWallet = true
// session.capabilities.passkey = true
```

### MetaMask Integration

```typescript
// MetaMask requires window.ethereum
if (!window.ethereum?.isMetaMask) {
  console.error('MetaMask not installed');
  return;
}

const metamaskProvider = new MetaMaskProvider();
authManager.registerProvider(metamaskProvider);

// User must have ETH for gas
const session = await authManager.authenticate('metamask');
// session.capabilities.gasSponsorship = false
// session.capabilities.smartWallet = false
// session.capabilities.passkey = false
```

## Testing Integration

### Using Mock Providers

```typescript
import { MockBaseSDK, MockMetaMask } from '@fabstir/llm-auth/mocks';

// Mock Base provider
const mockSDK = new MockBaseSDK();
const baseProvider = new BaseAccountProvider({
  appName: 'Test App',
  testnet: true,
  sdkFactory: () => mockSDK
});

// Mock MetaMask
const mockMetaMask = new MockMetaMask();
mockMetaMask.setAccounts(['0x123...']);
(global as any).window = { 
  ethereum: mockMetaMask.getProvider() 
};
```

### Integration Test Example

```typescript
describe('SDK Integration', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager();
    
    // Register mock providers
    const baseProvider = new BaseAccountProvider({
      appName: 'Test',
      testnet: true,
      sdkFactory: () => new MockBaseSDK()
    });
    authManager.registerProvider(baseProvider);
  });

  it('should export valid SDK credentials', async () => {
    await authManager.authenticate('base', 'testuser');
    
    const credentials = await authManager.exportForSDK();
    
    expect(credentials.signer).toBeDefined();
    expect(credentials.s5Seed).toMatch(/^[a-z\s]+$/);
    expect(credentials.userId).toContain('testuser');
    expect(credentials.capabilities.gasSponsorship).toBe(true);
    
    // Verify signer works
    const signature = await credentials.signer.signMessage('test');
    expect(signature).toBeDefined();
  });
});
```

## Session Management

### Persistent Sessions

```typescript
// Save session info
const session = authManager.getCurrentSession();
if (session) {
  localStorage.setItem('authSession', JSON.stringify({
    provider: session.provider,
    userId: session.userId
  }));
}

// Restore session
const saved = localStorage.getItem('authSession');
if (saved) {
  const { provider, userId } = JSON.parse(saved);
  try {
    await authManager.authenticate(provider);
  } catch (error) {
    // Session expired or invalid
    localStorage.removeItem('authSession');
  }
}
```

### Provider Switching

```typescript
// Start with Base (gas sponsored)
await authManager.authenticate('base', 'alice');
let creds = await authManager.exportForSDK();
console.log('Gas sponsored:', creds.capabilities.gasSponsorship); // true

// Switch to MetaMask (user pays gas)
await authManager.authenticate('metamask');
creds = await authManager.exportForSDK();
console.log('Gas sponsored:', creds.capabilities.gasSponsorship); // false
```

## Error Handling

### Comprehensive Error Handling

```typescript
async function authenticateUser(provider: string): Promise<void> {
  try {
    const session = await authManager.authenticate(provider);
    console.log('Success:', session.userId);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      // Provider not registered
      console.error('Unknown provider:', provider);
      console.log('Available:', authManager.getAvailableProviders());
    } else if (error.message.includes('rejected')) {
      // User cancelled
      console.log('User cancelled authentication');
    } else if (error.message.includes('not installed')) {
      // Extension missing
      console.error('Please install', provider);
    } else {
      // Unexpected error
      console.error('Authentication failed:', error);
    }
  }
}
```

## Best Practices

1. **Always check capabilities** before using features
2. **Handle provider-specific errors** gracefully
3. **Test with mocks** to avoid external dependencies
4. **Save minimal session data** for security
5. **Validate signatures** when critical
6. **Use testnet mode** during development
7. **Implement logout** for session cleanup
8. **Check authentication** before SDK operations

## Migration Guide

### From Direct Wallet Connection

```typescript
// Before: Direct MetaMask connection
const accounts = await window.ethereum.request({ 
  method: 'eth_requestAccounts' 
});
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();

// After: Using auth module
const authManager = new AuthManager();
authManager.registerProvider(new MetaMaskProvider());
await authManager.authenticate('metamask');
const { signer } = await authManager.exportForSDK();
```

### From Standalone Passkeys

```typescript
// Before: Custom passkey implementation
const credential = await navigator.credentials.create({
  publicKey: { /* complex config */ }
});
// Complex key derivation...

// After: Using auth module
const authManager = new AuthManager();
authManager.registerProvider(new BaseAccountProvider({
  appName: 'My App',
  testnet: true
}));
await authManager.authenticate('base', 'username');
const { signer, s5Seed } = await authManager.exportForSDK();
```