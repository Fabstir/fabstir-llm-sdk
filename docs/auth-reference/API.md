# Authentication Module API Reference

## Core Classes

### AuthManager

Central orchestrator for authentication providers and sessions.

```typescript
import { AuthManager } from '@fabstir/llm-auth';
```

#### Methods

##### `registerProvider(provider: AuthProvider): void`
Register an authentication provider with the manager.

```typescript
const authManager = new AuthManager();
const baseProvider = new BaseAccountProvider(config);
authManager.registerProvider(baseProvider);
```

##### `authenticate(providerName: string, username?: string): Promise<AuthSession>`
Authenticate using a registered provider. Username is optional and used for account creation.

```typescript
// Login to existing account
const session = await authManager.authenticate('base');

// Create new account
const session = await authManager.authenticate('base', 'alice123');
```

##### `getSigner(): Promise<ethers.Signer>`
Get the Ethereum signer from the current authenticated session.

```typescript
const signer = await authManager.getSigner();
const signature = await signer.signMessage('Hello');
```

##### `exportForSDK(): Promise<SDKCredentials>`
Export credentials for SDK integration, including signer and S5 seed.

```typescript
const credentials = await authManager.exportForSDK();
// credentials.signer - Ethereum signer
// credentials.s5Seed - Deterministic seed phrase
// credentials.userId - User identifier
// credentials.capabilities - Feature flags
```

##### `isAuthenticated(): boolean`
Check if there's an active authentication session.

```typescript
if (authManager.isAuthenticated()) {
  // User is logged in
}
```

##### `getCurrentSession(): AuthSession | undefined`
Get the current authentication session details.

```typescript
const session = authManager.getCurrentSession();
if (session) {
  console.log(`Logged in as ${session.userId}`);
  console.log(`Provider: ${session.provider}`);
  console.log(`Address: ${session.address}`);
}
```

##### `logout(): Promise<void>`
Clear the current authentication session.

```typescript
await authManager.logout();
```

##### `getAvailableProviders(): string[]`
Get list of registered provider names.

```typescript
const providers = authManager.getAvailableProviders();
// ['base', 'metamask', 'particle', 'fabstir']
```

## Provider Adapters

### BaseAccountProvider

Passkey-based authentication with gas sponsorship on testnets.

```typescript
import { BaseAccountProvider } from '@fabstir/llm-auth';

const provider = new BaseAccountProvider({
  appName: 'My App',
  appLogo: 'https://example.com/logo.png',
  chainId: 8453,  // Base mainnet
  testnet: false,
  sdkFactory?: () => BaseSDK  // Optional SDK factory for testing
});
```

#### Configuration
- `appName` (required): Application name shown during passkey creation
- `appLogo` (optional): Logo URL for passkey UI
- `chainId` (optional): Blockchain chain ID (default: 8453)
- `testnet` (optional): Enable testnet mode with gas sponsorship
- `sdkFactory` (optional): Factory function for SDK injection (testing)

### MetaMaskProvider

Traditional wallet authentication without gas sponsorship.

```typescript
import { MetaMaskProvider } from '@fabstir/llm-auth';

const provider = new MetaMaskProvider();
// No configuration required
```

### ParticleProvider

Social login authentication with smart wallets.

```typescript
import { ParticleProvider } from '@fabstir/llm-auth';

const provider = new ParticleProvider({
  projectId: 'your-project-id',
  clientKey: 'your-client-key',
  appId: 'your-app-id',
  testnet: true
});
```

### FabstirProvider

Native Fabstir platform authentication.

```typescript
import { FabstirProvider } from '@fabstir/llm-auth';

const provider = new FabstirProvider({
  apiEndpoint: 'https://api.fabstir.com',
  apiKey: 'your-api-key'
});
```

## Type Definitions

### AuthSession
```typescript
interface AuthSession {
  userId: string;           // Unique user identifier
  address: string;          // Ethereum address
  provider: 'base' | 'metamask' | 'particle' | 'fabstir';
  capabilities: AuthCapabilities;
}
```

### AuthCapabilities
```typescript
interface AuthCapabilities {
  gasSponsorship: boolean;  // Provider sponsors gas fees
  passkey: boolean;         // Uses passkeys for auth
  smartWallet: boolean;     // Uses smart contract wallet
}
```

### SDKCredentials
```typescript
interface SDKCredentials {
  signer: ethers.Signer;    // Ethereum transaction signer
  s5Seed: string;           // 12-word mnemonic seed
  userId: string;           // Formatted user ID
  capabilities: AuthCapabilities;
}
```

### AuthProvider
```typescript
interface AuthProvider {
  name: string;
  createAccount(username: string): Promise<AuthSession>;
  login(): Promise<AuthSession>;
  getSigner(): Promise<ethers.Signer>;
  deriveSeeds(): Promise<DerivedSeeds>;
}
```

### DerivedSeeds
```typescript
interface DerivedSeeds {
  s5Seed: string;           // 12-word mnemonic phrase
}
```

## Error Handling

### Common Errors

#### Provider Not Found
```typescript
try {
  await authManager.authenticate('invalid');
} catch (error) {
  // Error: Provider 'invalid' not found. Available providers: [base, metamask]
}
```

#### Not Authenticated
```typescript
try {
  const signer = await authManager.getSigner();
} catch (error) {
  // Error: Not authenticated. Please call authenticate() first.
}
```

#### User Rejection
```typescript
try {
  await authManager.authenticate('metamask');
} catch (error) {
  // Error: User rejected MetaMask connection
}
```

#### MetaMask Not Installed
```typescript
try {
  const provider = new MetaMaskProvider();
  await provider.login();
} catch (error) {
  // Error: MetaMask is not installed
}
```

## Provider Capabilities

| Provider | Gas Sponsorship | Passkey | Smart Wallet |
|----------|----------------|---------|--------------|
| Base | ✅ (testnet only) | ✅ | ✅ |
| MetaMask | ❌ | ❌ | ❌ |
| Particle | ✅ | ❌ | ✅ |
| Fabstir | ✅ | ✅ | ✅ |