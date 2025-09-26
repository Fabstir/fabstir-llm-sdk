# Fabstir Auth SDK Developer Documentation

Welcome to the Fabstir Authentication Library integration guide. This documentation will help you integrate multi-chain, multi-wallet authentication into your SDK.

## 📚 Documentation Structure

### Essential Reading (Start Here)
1. **[Getting Started](./01-GETTING-STARTED.md)** - Quick integration guide
2. **[Provider Comparison](./02-PROVIDER-COMPARISON.md)** - Choose the right wallet provider
3. **[Integration Checklist](./03-INTEGRATION-CHECKLIST.md)** - Ensure nothing is missed

### Testing & Quality
4. **[E2E Testing Guide](./04-E2E-TESTING-GUIDE.md)** - Test with real wallets
5. **[Test Environment Setup](./05-TEST-ENVIRONMENT-SETUP.md)** - Configure test wallets and chains

### Support & Troubleshooting
6. **[Troubleshooting Guide](./06-TROUBLESHOOTING.md)** - Common issues and solutions
7. **[Error Handling](./07-ERROR-HANDLING.md)** - Graceful error recovery

## 🚀 Quick Start

```bash
npm install fabstir-llm-auth
```

```typescript
import { AuthManager, MetaMaskProvider, BaseAccountProvider } from 'fabstir-llm-auth';

// Initialize
const authManager = new AuthManager();

// Register providers
authManager.registerProvider(new MetaMaskProvider());
authManager.registerProvider(new BaseAccountProvider({
  appName: 'Your App',
  chainId: 84532 // Base Sepolia
}));

// Authenticate
const session = await authManager.authenticate('metamask');

// Export for SDK
const credentials = await authManager.exportForSDK();
```

## ⚠️ Critical Integration Points

Before integrating, understand these key aspects:

1. **Mocks vs Real SDKs** - The library uses mocks in test environments and real SDKs in production
2. **Chain Support** - Different providers support different chains
3. **Capabilities** - Providers have different features (gas sponsorship, passkeys, etc.)
4. **Error Handling** - Real wallets have many failure modes not present in mocks

## 🧪 Testing Philosophy

**IMPORTANT**: While the auth library has comprehensive unit tests with mocks, you MUST test with real wallets in your integration. Mocks can't capture all real-world edge cases.

See [E2E Testing Guide](./04-E2E-TESTING-GUIDE.md) for complete testing strategy.

## 📊 Provider Feature Matrix

| Provider | Multi-Chain | Gas Sponsorship | Passkey Auth | Smart Wallet |
|----------|------------|-----------------|--------------|--------------|
| MetaMask | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Base Account | ❌ No (Base only) | ✅ Testnet | ✅ Yes | ✅ Yes |

## 🔗 Quick Links

- [API Reference](../API.md)
- [Examples](../../examples/)
- [GitHub Issues](https://github.com/fabstir/fabstir-llm-auth/issues)
- [Chain Configuration](../../src/config/chains.ts)

## 🎯 Success Criteria

Your integration is complete when:
- ✅ Users can authenticate with multiple wallet types
- ✅ Credentials export correctly to your SDK
- ✅ Chain switching works (where supported)
- ✅ E2E tests pass with real wallets
- ✅ Error handling is graceful
- ✅ Session persistence works

---

**Next Step**: Start with [Getting Started Guide](./01-GETTING-STARTED.md)