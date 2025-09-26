# Fabstir Auth API Reference

## Table of Contents
- [AuthManager](#authmanager)
- [Providers](#providers)
  - [MetaMaskProvider](#metamaskprovider)
  - [BaseAccountProvider](#baseaccountprovider)
- [Types](#types)
- [Chain Configuration](#chain-configuration)
- [Signature Service](#signature-service)
- [Session Storage](#session-storage)
- [Events](#events)
- [Error Codes](#error-codes)

---

## AuthManager

Central orchestrator for authentication and session management with multi-chain support.

### Constructor

```typescript
new AuthManager()
```

Creates a new AuthManager instance.

### Methods

#### `registerProvider(provider: AuthProvider): void`

Registers an authentication provider.

```typescript
const authManager = new AuthManager();
authManager.registerProvider(new MetaMaskProvider());
authManager.registerProvider(new BaseAccountProvider({
  appName: 'My App',
  chainId: 84532
}));
```

#### `authenticate(providerName: string, username?: string, chainId?: number): Promise<AuthSession>`

Authenticates a user with the specified provider.

**Parameters:**
- `providerName` - Name of the provider ('metamask', 'base')
- `username` - Optional username for account creation (Base Account only)
- `chainId` - Optional preferred chain ID

**Returns:** `AuthSession` with user details and capabilities

```typescript
// MetaMask
const session = await authManager.authenticate('metamask');

// Base Account with username
const session = await authManager.authenticate('base', 'alice');

// With preferred chain
const session = await authManager.authenticate('metamask', undefined, 84532);
```

#### `exportForSDK(): Promise<SDKCredentials>`

Exports credentials for SDK integration.

**Returns:** `SDKCredentials` object containing:
- `signer`: ethers.Signer instance
- `s5Seed`: Deterministic seed for S5 network
- `userId`: User identifier
- `address`: Wallet address
- `chainId`: Current chain ID
- `supportedChains`: Array of supported chain IDs
- `capabilities`: Provider capabilities

```typescript
const credentials = await authManager.exportForSDK();
// Use with your SDK
const sdk = new YourSDK({
  signer: credentials.signer,
  s5Seed: credentials.s5Seed,
  chainId: credentials.chainId
});
```

#### `getSigner(): Promise<ethers.Signer>`

Gets the current signer for blockchain transactions.

```typescript
const signer = await authManager.getSigner();
const tx = await signer.sendTransaction({...});
```

#### `getCurrentSession(): AuthSession | undefined`

Returns the current authentication session.

```typescript
const session = authManager.getCurrentSession();
if (session) {
  console.log('User:', session.userId);
  console.log('Chain:', session.chainId);
}
```

#### `isAuthenticated(): boolean`

Checks if a user is currently authenticated.

```typescript
if (authManager.isAuthenticated()) {
  // User is logged in
}
```

#### `logout(reason?: string): void`

Logs out the current user and clears session.

```typescript
authManager.logout();
// Or with reason
authManager.logout('Session expired');
```

#### `recoverSession(): AuthSession | null`

Recovers a session from storage after page reload.

```typescript
const recoveredSession = authManager.recoverSession();
if (recoveredSession) {
  console.log('Welcome back:', recoveredSession.userId);
}
```

### Chain Management Methods

#### `getCurrentChain(): number | undefined`

Gets the current chain ID.

```typescript
const chainId = authManager.getCurrentChain();
console.log('Current chain:', chainId);
```

#### `switchChain(chainId: number): Promise<void>`

Switches to a different blockchain network (provider must support chain switching).

**Parameters:**
- `chainId` - Target chain ID

**Throws:** Error if provider doesn't support chain switching or chain is unsupported

```typescript
try {
  await authManager.switchChain(84532); // Switch to Base Sepolia
} catch (error) {
  if (error.code === 'UNSUPPORTED_CHAIN') {
    console.log('Provider does not support this chain');
  }
}
```

#### `getSupportedChains(): number[]`

Gets list of chains supported by the current provider.

```typescript
const chains = authManager.getSupportedChains();
console.log('Supported chains:', chains);
// [1, 8453, 84532, 204, 5611]
```

#### `isChainSupported(chainId: number): boolean`

Checks if a chain is supported by the library.

```typescript
if (authManager.isChainSupported(84532)) {
  // Base Sepolia is supported
}
```

#### `getAvailableProviders(): string[]`

Gets list of registered provider names.

```typescript
const providers = authManager.getAvailableProviders();
console.log('Available:', providers);
// ['metamask', 'base']
```

### Event Methods

#### `on(event: string, handler: Function): void`

Subscribes to authentication events.

```typescript
authManager.on('authenticated', (event) => {
  console.log('User authenticated:', event.session);
});

authManager.on('chainChanged', (event) => {
  console.log('Chain changed from', event.previousChainId, 'to', event.newChainId);
});
```

#### `off(event: string, handler: Function): void`

Unsubscribes from events.

```typescript
authManager.off('authenticated', handler);
```

---

## Providers

### MetaMaskProvider

Provider for MetaMask browser extension wallet with multi-chain support.

#### Constructor

```typescript
new MetaMaskProvider()
```

#### Capabilities

```typescript
{
  gasSponsorship: false,
  passkey: false,
  smartWallet: false,
  multiChain: true,
  chainSwitching: true
}
```

#### Supported Chains

- Ethereum Mainnet (1)
- Base Mainnet (8453)
- Base Sepolia (84532)
- opBNB Mainnet (204)
- opBNB Testnet (5611)
- Additional chains can be added by user

#### Example

```typescript
const provider = new MetaMaskProvider();
authManager.registerProvider(provider);

const session = await authManager.authenticate('metamask');
// MetaMask popup appears for user approval

// Switch chains
if (session.capabilities.chainSwitching) {
  await authManager.switchChain(84532);
}
```

### BaseAccountProvider

Provider for Coinbase Smart Wallet with passkey authentication.

#### Constructor

```typescript
new BaseAccountProvider(config?: BaseAccountConfig)
```

**Config Options:**
- `appName`: Application name (default: 'Fabstir DApp')
- `appLogoUrl`: Logo URL for wallet display
- `chainId`: Target chain ID (default: 84532 - Base Sepolia)
- `testnet`: Deprecated, use chainId instead

#### Capabilities

```typescript
{
  gasSponsorship: true,  // Only on testnet (84532)
  passkey: true,
  smartWallet: true,
  multiChain: false,
  chainSwitching: false
}
```

#### Supported Chains

- Base Sepolia (84532) - with gas sponsorship
- Base Mainnet (8453) - no gas sponsorship

#### Example

```typescript
const provider = new BaseAccountProvider({
  appName: 'My DApp',
  appLogoUrl: 'https://mydapp.com/logo.png',
  chainId: 84532 // Base Sepolia with gas sponsorship
});
authManager.registerProvider(provider);

// Create new account with passkey
const session = await authManager.authenticate('base', 'username');
```

---

## Types

### AuthSession

Represents an authenticated session with chain context.

```typescript
interface AuthSession {
  provider: string;        // Provider name ('metamask', 'base')
  address: string;         // Wallet address
  userId: string;          // User identifier
  chainId?: number;        // Current chain ID
  capabilities: AuthCapabilities;
  expiresAt?: number;      // Session expiry timestamp
}
```

### AuthCapabilities

Provider feature flags including multi-chain support.

```typescript
interface AuthCapabilities {
  gasSponsorship: boolean;  // Free transactions (Base testnet)
  passkey: boolean;         // Passkey authentication
  smartWallet: boolean;     // Smart contract wallet
  multiChain: boolean;      // Multiple chain support
  chainSwitching: boolean;  // Can switch chains dynamically
}
```

### SDKCredentials

Credentials exported for SDK integration with chain information.

```typescript
interface SDKCredentials {
  signer: ethers.Signer;     // Transaction signer
  s5Seed?: string;           // S5 network seed
  userId?: string;           // User identifier
  address: string;           // Wallet address
  chainId: number;           // Current chain
  supportedChains?: number[]; // All supported chains
  capabilities: AuthCapabilities;
}
```

### BaseAccountConfig

Configuration for Base Account provider with chain specification.

```typescript
interface BaseAccountConfig {
  appName?: string;      // App name for display
  appLogoUrl?: string;   // Logo URL
  chainId?: number;      // Target chain (84532 or 8453)
  testnet?: boolean;     // Deprecated, use chainId
  supportedChains?: number[]; // Optional: additional chains
}
```

### AuthProvider (Extended)

```typescript
interface AuthProvider {
  name: string;
  createAccount(username: string): Promise<AuthSession>;
  login(): Promise<AuthSession>;
  getSigner(): Promise<ethers.Signer>;
  deriveSeeds(): Promise<DerivedSeeds>;

  // Chain-aware methods
  getDefaultChainId?(): number;
  getSupportedChains?(): number[];
  getCurrentChainId?(): number;
  switchChain?(chainId: number): Promise<void>;
  supportsChain?(chainId: number): boolean;
  getChainCapabilities?(chainId: number): AuthCapabilities;
}
```

---

## Chain Configuration

### Supported Chains

```typescript
import {
  BASE_SEPOLIA_CHAIN_ID,    // 84532
  BASE_MAINNET_CHAIN_ID,     // 8453
  OPBNB_TESTNET_CHAIN_ID,    // 5611
  OPBNB_MAINNET_CHAIN_ID,    // 204
  ETHEREUM_MAINNET_CHAIN_ID  // 1
} from 'fabstir-llm-auth/config/chains';
```

### Chain Configuration Format

```typescript
interface ChainConfig {
  chainId: number;
  name: string;
  network: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorers: {
    default: {
      name: string;
      url: string;
    };
  };
  testnet: boolean;
  gasSponsorship?: boolean;
}
```

### Getting Chain Configuration

```typescript
import { CHAIN_CONFIGS } from 'fabstir-llm-auth/config/chains';

const baseSepoliaConfig = CHAIN_CONFIGS[84532];
console.log(baseSepoliaConfig.name); // "Base Sepolia"
console.log(baseSepoliaConfig.gasSponsorship); // true
```

---

## Signature Service

Service for creating and verifying blockchain signatures with chain awareness.

### SignatureService

#### `createTypedSignature(signer, domain, types, value)`

Creates an EIP-712 typed signature.

```typescript
import { SignatureService } from 'fabstir-llm-auth/services/SignatureService';

const domain = {
  name: 'MyApp',
  version: '1',
  chainId: 84532,
  verifyingContract: '0x...'
};

const types = {
  Message: [
    { name: 'content', type: 'string' },
    { name: 'timestamp', type: 'uint256' }
  ]
};

const value = {
  content: 'Hello',
  timestamp: Date.now()
};

const signature = await SignatureService.createTypedSignature(
  signer,
  domain,
  types,
  value
);
```

#### `verifyTypedSignature(domain, types, value, signature, expectedSigner)`

Verifies an EIP-712 signature.

```typescript
const isValid = SignatureService.verifyTypedSignature(
  domain,
  types,
  value,
  signature,
  expectedAddress
);
```

#### `createChainAwareSignature(signer, message, chainId)`

Creates a signature with chain context for replay protection.

```typescript
const signature = await SignatureService.createChainAwareSignature(
  signer,
  'Sign this message',
  84532
);
```

#### `verifyChainAwareSignature(message, signature, expectedSigner, chainId)`

Verifies a chain-aware signature.

```typescript
const isValid = await SignatureService.verifyChainAwareSignature(
  message,
  signature,
  expectedAddress,
  84532
);
```

---

## Session Storage

Service for persisting authentication sessions with chain state.

### SessionStorage

#### `saveSession(session: AuthSession): void`

Saves session to localStorage with chain information.

```typescript
import { SessionStorage } from 'fabstir-llm-auth/services/SessionStorage';

SessionStorage.saveSession(session);
```

#### `loadSession(): AuthSession | null`

Loads session from localStorage.

```typescript
const session = SessionStorage.loadSession();
if (session && !SessionStorage.isExpired(session)) {
  // Valid session exists
}
```

#### `clearSession(): void`

Removes session from storage.

```typescript
SessionStorage.clearSession();
```

#### `isExpired(session: AuthSession): boolean`

Checks if session has expired (24 hour default).

```typescript
if (SessionStorage.isExpired(session)) {
  // Need to re-authenticate
}
```

---

## Events

### Event Types

#### authenticated

Fired when user successfully authenticates.

```typescript
authManager.on('authenticated', (event: AuthenticatedEvent) => {
  console.log('Provider:', event.provider);
  console.log('Session:', event.session);
  console.log('Chain:', event.session.chainId);
  console.log('Timestamp:', event.timestamp);
});
```

#### chainChanged

Fired when blockchain network changes.

```typescript
authManager.on('chainChanged', (event: ChainChangedEvent) => {
  console.log('Previous chain:', event.previousChainId);
  console.log('New chain:', event.newChainId);
  console.log('Provider:', event.provider);
});
```

#### sessionUpdated

Fired when session properties change.

```typescript
authManager.on('sessionUpdated', (event: SessionUpdatedEvent) => {
  console.log('Session:', event.session);
  console.log('Updates:', event.updates);
});
```

#### sessionExpired

Fired when session expires.

```typescript
authManager.on('sessionExpired', (event: SessionExpiredEvent) => {
  console.log('Expired session:', event.session);
  console.log('Expired at:', event.expiredAt);
});
```

#### capabilitiesChanged

Fired when provider capabilities change.

```typescript
authManager.on('capabilitiesChanged', (event: CapabilitiesChangedEvent) => {
  console.log('Previous:', event.previousCapabilities);
  console.log('New:', event.newCapabilities);
});
```

#### logout

Fired when user logs out.

```typescript
authManager.on('logout', (event: LogoutEvent) => {
  console.log('Session ended:', event.session);
  console.log('Reason:', event.reason);
});
```

---

## Error Codes

### Wallet Errors

| Code | Description | Solution |
|------|-------------|----------|
| 4001 | User rejected request | Show friendly message, offer alternatives |
| 4100 | Unauthorized | Request authorization first |
| 4200 | Unsupported method | Check provider capabilities |
| 4900 | Disconnected | Prompt to reconnect |
| 4902 | Chain not added | Add chain using wallet_addEthereumChain |

### Library Errors

| Code | Description | Solution |
|------|-------------|----------|
| UNSUPPORTED_CHAIN | Chain not supported by provider | Use different provider or chain |
| NO_SESSION | No active session | Authenticate first |
| PROVIDER_NOT_FOUND | Provider not registered | Register provider first |
| INVALID_CHAIN_ID | Invalid chain ID format | Use valid chain ID number |
| CHAIN_SWITCH_UNSUPPORTED | Provider can't switch chains | Use provider that supports switching |

### Network Errors

| Code | Description | Solution |
|------|-------------|----------|
| TIMEOUT | Request timed out | Retry with backoff |
| NETWORK_ERROR | Network request failed | Check connectivity |
| RPC_ERROR | RPC endpoint error | Try alternative endpoint |

---

## Provider Capabilities Comparison

| Provider | Gas Sponsorship | Passkey | Smart Wallet | Multi-Chain | Chain Switching |
|----------|----------------|---------|--------------|-------------|-----------------|
| Base | ✅ (testnet only) | ✅ | ✅ | ❌ | ❌ |
| MetaMask | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## Examples

### Complete Multi-Chain Authentication Flow

```typescript
import {
  AuthManager,
  MetaMaskProvider,
  BaseAccountProvider
} from 'fabstir-llm-auth';

// Setup
const authManager = new AuthManager();
authManager.registerProvider(new MetaMaskProvider());
authManager.registerProvider(new BaseAccountProvider({
  appName: 'MyApp',
  chainId: 84532 // Base Sepolia
}));

// Listen for events
authManager.on('authenticated', (event) => {
  console.log('Authenticated on chain:', event.session.chainId);
});

authManager.on('chainChanged', (event) => {
  console.log('Chain changed:', event.previousChainId, '->', event.newChainId);
});

// Authenticate with chain preference
try {
  const session = await authManager.authenticate('metamask', undefined, 84532);
  console.log('Authenticated:', session.address);
  console.log('Chain:', session.chainId);

  // Export for SDK
  const credentials = await authManager.exportForSDK();
  console.log('Supported chains:', credentials.supportedChains);

  // Use signer
  const signer = credentials.signer;
  const message = await signer.signMessage('Hello');

  // Switch chain if needed
  if (session.capabilities.chainSwitching) {
    await authManager.switchChain(5611); // opBNB testnet
  }

} catch (error) {
  if (error.code === 4001) {
    console.log('User rejected');
  } else if (error.code === 'UNSUPPORTED_CHAIN') {
    console.log('Chain not supported');
  }
}
```

### Session Persistence with Chain State

```typescript
// On app load
const authManager = new AuthManager();
authManager.registerProvider(new MetaMaskProvider());

// Try to recover session
const session = authManager.recoverSession();
if (session) {
  console.log('Welcome back:', session.userId);
  console.log('Last chain:', session.chainId);

  // Verify chain is still valid
  if (authManager.isChainSupported(session.chainId)) {
    console.log('Chain still supported');
  }
} else {
  // Need to authenticate
  await authManager.authenticate('metamask');
}
```

### Chain-Aware Signatures

```typescript
const authManager = new AuthManager();
// ... authenticate ...

const signer = await authManager.getSigner();
const chainId = authManager.getCurrentChain();

// Create chain-aware signature
const signature = await SignatureService.createChainAwareSignature(
  signer,
  'Authorize action',
  chainId
);

// Verify on same chain
const isValid = await SignatureService.verifyChainAwareSignature(
  'Authorize action',
  signature,
  await signer.getAddress(),
  chainId
);
```

### Provider Feature Detection

```typescript
const session = await authManager.authenticate('metamask');

// Check capabilities before using features
if (session.capabilities.chainSwitching) {
  // Can switch chains
  const chains = authManager.getSupportedChains();
  console.log('Can switch to:', chains);
}

if (session.capabilities.gasSponsorship) {
  // Transactions are free
  console.log('Gas is sponsored');
}

if (session.capabilities.passkey) {
  // Uses passkey authentication
  console.log('Passkey authenticated');
}
```