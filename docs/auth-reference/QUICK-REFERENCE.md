# Quick Reference Card

## 🚀 Instant Setup

```typescript
import { AuthManager, MetaMaskProvider, BaseAccountProvider } from 'fabstir-llm-auth';

const auth = new AuthManager();
auth.registerProvider(new MetaMaskProvider());
auth.registerProvider(new BaseAccountProvider({
  appName: 'MyApp',
  chainId: 84532
}));

// Authenticate
const session = await auth.authenticate('metamask');
// OR
const session = await auth.authenticate('base', 'username');

// Get credentials for SDK
const creds = await auth.exportForSDK();
```

## 🔧 Common Operations

```typescript
// Check authentication
auth.isAuthenticated() // boolean

// Get current session
auth.getCurrentSession() // AuthSession | undefined

// Switch chain (MetaMask only)
await auth.switchChain(84532)

// Logout
auth.logout()

// Recover session after reload
auth.recoverSession()

// Get signer for transactions
const signer = await auth.getSigner()
```

## 🔗 Chain IDs

```typescript
BASE_SEPOLIA_CHAIN_ID = 84532    // Testnet with gas sponsorship
BASE_MAINNET_CHAIN_ID = 8453
OPBNB_TESTNET_CHAIN_ID = 5611
OPBNB_MAINNET_CHAIN_ID = 204
ETHEREUM_MAINNET_CHAIN_ID = 1
```

## ❌ Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 4001 | User rejected | Offer alternative |
| 4902 | Chain not added | Add chain to wallet |
| 4900 | Disconnected | Reconnect |
| 4100 | Unauthorized | Request permission |

## 🧪 E2E Test Commands

```bash
# Generate test wallets
npm run test:setup

# Run all E2E tests
npm run test:e2e

# Debug specific test
npm run test:e2e -- --debug 01-authentication.spec.ts

# View test report
npm run test:report
```

## 🏃 Provider Quick Compare

| Feature | MetaMask | Base Account |
|---------|----------|--------------|
| Install | Extension needed | Nothing needed |
| Auth | Wallet password | Passkey/FaceID |
| Chains | Multiple | Base only |
| Gas | User pays | FREE on testnet |
| Mobile | App required | Works anywhere |

## 🆘 Troubleshooting

```javascript
// MetaMask not found
if (!window.ethereum) {
  // Use Base Account instead
}

// Session lost
const session = auth.recoverSession();

// Wrong network
await auth.switchChain(requiredChainId);

// User rejected
catch (e) {
  if (e.code === 4001) {
    // Offer passkey login
  }
}
```

## 📋 Integration Checklist

- [ ] Install dependencies
- [ ] Register providers
- [ ] Handle authentication
- [ ] Export credentials
- [ ] Test with real wallets
- [ ] Handle errors
- [ ] Test on mobile
- [ ] Monitor production

## 🔑 Key Decisions

1. **Which provider?** → See [Provider Comparison](./02-PROVIDER-COMPARISON.md)
2. **How to test?** → See [E2E Testing Guide](./04-E2E-TESTING-GUIDE.md)
3. **Something broken?** → See [Troubleshooting](./06-TROUBLESHOOTING.md)
4. **Production ready?** → See [Integration Checklist](./03-INTEGRATION-CHECKLIST.md)

## 📞 Getting Help

1. Check [examples/](../../examples/)
2. Read [docs/](../)
3. Search [GitHub Issues](https://github.com/fabstir/fabstir-llm-auth/issues)
4. Create minimal repro
5. Open issue with details

---

**Remember**: Always test with real wallets before production!