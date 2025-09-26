# Integration Checklist

Use this checklist to ensure your Fabstir Auth integration is complete and production-ready.

## ✅ Phase 1: Basic Integration

### Setup
- [ ] Install `fabstir-llm-auth` and `ethers@^5.7.0`
- [ ] Initialize `AuthManager`
- [ ] Register at least one provider (MetaMask or Base Account)
- [ ] Handle provider registration errors

### Authentication
- [ ] Implement `authenticate()` with error handling
- [ ] Handle user rejection (error code 4001)
- [ ] Handle missing wallet scenarios
- [ ] Store authentication state in your app

### Credential Export
- [ ] Call `exportForSDK()` after authentication
- [ ] Pass signer to your SDK correctly
- [ ] Store S5 seed securely
- [ ] Verify credentials work with your SDK

## ✅ Phase 2: Session Management

### Persistence
- [ ] Test session recovery with `recoverSession()`
- [ ] Verify sessions persist across page reloads
- [ ] Handle expired sessions gracefully
- [ ] Implement re-authentication flow

### State Management
- [ ] Track authentication state (`isAuthenticated()`)
- [ ] Store current session data
- [ ] Handle session updates
- [ ] Clean up on logout

## ✅ Phase 3: Multi-Provider Support

### Provider Setup
- [ ] Register multiple providers if needed
- [ ] Implement provider selection UI
- [ ] Handle provider-specific errors
- [ ] Document which providers you support

### Provider-Specific Features
- [ ] Check provider capabilities before using features
- [ ] Handle chain switching (MetaMask only)
- [ ] Handle gas sponsorship (Base testnet only)
- [ ] Document provider limitations

## ✅ Phase 4: Chain Management

### Chain Support
- [ ] Define supported chains for your app
- [ ] Validate chain IDs before operations
- [ ] Handle unsupported chain errors
- [ ] Implement chain switching where supported

### Chain-Specific Logic
- [ ] Adjust gas settings per chain
- [ ] Handle chain-specific contract addresses
- [ ] Update RPC endpoints if needed
- [ ] Test on all target chains

## ✅ Phase 5: Error Handling

### User Errors
- [ ] User rejects connection → Clear message
- [ ] Wrong network → Guide to switch
- [ ] Insufficient funds → Show requirement
- [ ] Locked wallet → Prompt to unlock

### System Errors
- [ ] Network timeout → Retry mechanism
- [ ] RPC errors → Fallback endpoints
- [ ] SDK initialization failure → Recovery flow
- [ ] Provider not available → Alternative options

### Error Messages
- [ ] All errors have user-friendly messages
- [ ] Technical details logged for debugging
- [ ] Action items clear (what user should do)
- [ ] Support contact information provided

## ✅ Phase 6: Event Handling

### Core Events
- [ ] Listen for `authenticated` event
- [ ] Handle `chainChanged` event
- [ ] Respond to `logout` event
- [ ] Monitor `sessionExpired` event

### Event Responses
- [ ] Update UI on authentication
- [ ] Refresh data on chain change
- [ ] Clear state on logout
- [ ] Re-authenticate on expiry

## ✅ Phase 7: Security

### Key Management
- [ ] Never log private keys or seeds
- [ ] S5 seed stored securely
- [ ] No sensitive data in localStorage
- [ ] Clear sensitive data on logout

### Validation
- [ ] Validate all addresses
- [ ] Verify signatures when needed
- [ ] Check transaction parameters
- [ ] Validate chain IDs

### Best Practices
- [ ] Use HTTPS only
- [ ] Implement CSP headers
- [ ] No inline scripts
- [ ] Regular security audits

## ✅ Phase 8: User Experience

### Onboarding
- [ ] Clear wallet selection
- [ ] Helpful error messages
- [ ] Loading states during authentication
- [ ] Success feedback

### Daily Use
- [ ] Fast reconnection
- [ ] Smooth chain switching
- [ ] Clear transaction status
- [ ] Helpful tooltips

### Mobile Support
- [ ] Test on mobile browsers
- [ ] Handle mobile wallet apps
- [ ] Responsive UI
- [ ] Touch-friendly interactions

## ✅ Phase 9: Testing

### Unit Tests
- [ ] Mock provider tests
- [ ] Authentication flow tests
- [ ] Error handling tests
- [ ] Event emission tests

### Integration Tests
- [ ] Test with real MetaMask
- [ ] Test with Base Account
- [ ] Multi-provider switching
- [ ] Session persistence

### E2E Tests
- [ ] Complete user journeys
- [ ] Real wallet interactions
- [ ] Chain switching flows
- [ ] Error recovery paths

### Performance Tests
- [ ] Authentication time < 5s
- [ ] No memory leaks
- [ ] Handles rapid operations
- [ ] Works on slow networks

## ✅ Phase 10: Production Readiness

### Documentation
- [ ] API integration documented
- [ ] Error codes documented
- [ ] Troubleshooting guide created
- [ ] User guide written

### Monitoring
- [ ] Error tracking setup (Sentry, etc.)
- [ ] Analytics for auth success rate
- [ ] Performance monitoring
- [ ] User feedback mechanism

### Support
- [ ] FAQ prepared
- [ ] Support contact ready
- [ ] Known issues documented
- [ ] Update process defined

### Deployment
- [ ] Environment variables set
- [ ] Production RPC endpoints
- [ ] Mainnet chain IDs configured
- [ ] Rate limiting implemented

## 📋 Quick Audit Questions

Answer these to verify your integration:

1. **What happens when MetaMask is not installed?**
   - Should: Show clear message with install link

2. **How do you handle chain switching failures?**
   - Should: Gracefully fall back or guide user

3. **What if session expires during a transaction?**
   - Should: Prompt re-auth, preserve transaction data

4. **How do you handle rapid provider switching?**
   - Should: Cancel pending operations cleanly

5. **What's your mobile wallet strategy?**
   - Should: Base Account for broad support

6. **How do you test with real wallets?**
   - Should: E2E tests with test accounts

7. **What metrics do you track?**
   - Should: Auth success rate, errors, chain usage

8. **How do users recover from errors?**
   - Should: Clear actions, no dead ends

## 🚀 Launch Criteria

Before going live, ensure:

| Criterion | Status | Notes |
|-----------|--------|-------|
| All checklist items complete | ⬜ | |
| E2E tests passing | ⬜ | |
| Error handling tested | ⬜ | |
| Mobile testing done | ⬜ | |
| Security review complete | ⬜ | |
| Documentation ready | ⬜ | |
| Support process defined | ⬜ | |
| Monitoring active | ⬜ | |

## 📝 Integration Sign-off

```
Integration completed by: _______________________
Date: _______________________
Version: fabstir-llm-auth@_______________________
Tested chains: _______________________
Tested wallets: _______________________
Notes: _______________________
```

## Need Help?

- Review [Troubleshooting Guide](./06-TROUBLESHOOTING.md)
- Check [E2E Testing Guide](./04-E2E-TESTING-GUIDE.md)
- Open issue on [GitHub](https://github.com/fabstir/fabstir-llm-auth/issues)