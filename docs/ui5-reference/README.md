# UI5 Reference Documentation

**Project**: fabstir-llm-sdk - UI5 (Production SDK Integration)
**Purpose**: Comprehensive guides for migrating UI4 to production-ready UI5

---

## Quick Start

**Start Here** 👉 [UI5_MIGRATION_PLAN.md](./UI5_MIGRATION_PLAN.md)

---

## Documents Overview

### 1. UI5 Migration Plan (Main Document)

**[UI5_MIGRATION_PLAN.md](./UI5_MIGRATION_PLAN.md)** (~25 KB)

**Who should read**: Developers implementing UI5 migration

**Contents**:
- 7 detailed phases with checkboxes for progress tracking
- Phase 0: Copy UI4 to UI5
- Phase 1: Dependency updates (swap mock for real SDK)
- Phase 2: Configuration setup (.env.local, contract addresses)
- Phase 3: SDK Core integration (FabstirSDKCore)
- Phase 4: Base Account Kit integration (5 hours of work)
- Phase 5: Testing & validation (6-8 hours)
- Phase 6: Production preparation
- Phase 7: Deployment

**Time Estimate**: 18-24 hours total

**Key Features**:
- ✅ Step-by-step instructions with code examples
- ✅ Checkboxes for tracking progress
- ✅ Verification steps after each phase
- ✅ Troubleshooting guide
- ✅ Timeline estimates

---

### 2. Base Account Kit Integration Guide

**[BASE_ACCOUNT_KIT_INTEGRATION.md](./BASE_ACCOUNT_KIT_INTEGRATION.md)** (~12 KB)

**Who should read**: Developers implementing account abstraction

**Contents**:
- Overview of Base Account Kit architecture
- Sub-account creation with spend permissions
- Gasless transaction implementation
- Configuration and setup
- Complete code examples
- Security considerations
- Testing strategies
- Troubleshooting guide

**Key Features**:
- ✅ Detailed explanation of sub-accounts
- ✅ Spend permission configuration
- ✅ Error handling patterns
- ✅ Monitoring and analytics
- ✅ Debug mode instructions

---

## Project Goals

### UI5 Features
1. **Real SDK Integration**: Use `@fabstir/sdk-core` (not mock)
2. **Real Blockchain**: Transactions on Base Sepolia testnet
3. **Real Storage**: S5 decentralized storage for conversations
4. **Real Nodes**: WebSocket connections to production LLM nodes
5. **Account Abstraction**: Base Account Kit for smart wallets
6. **Gasless Transactions**: No MetaMask popups for USDC operations

### Success Criteria
- All 61 UI4 tests pass with real SDK
- Wallet connection via Base Account Kit
- Sub-accounts created automatically
- Gasless USDC transactions working
- Zero console errors
- Identical UX to UI4 (just with real blockchain)

---

## Getting Started

### Prerequisites

Before starting UI5 migration:
- ✅ UI4 fully tested (61/61 tests passing)
- ✅ All UI4 documentation reviewed
- ✅ Access to `.env.test` file (contract addresses)
- ✅ Base Sepolia testnet ETH (for gas fees)
- ✅ Base Account Kit API credentials (from Coinbase)

### Setup Checklist

1. **Review Documentation**
   - [ ] Read [UI5_MIGRATION_PLAN.md](./UI5_MIGRATION_PLAN.md) completely
   - [ ] Read [BASE_ACCOUNT_KIT_INTEGRATION.md](./BASE_ACCOUNT_KIT_INTEGRATION.md)
   - [ ] Review UI4 testing results: `/workspace/docs/UI4_TESTING_SUMMARY.md`

2. **Get Credentials**
   - [ ] Create Coinbase Developer account
   - [ ] Get Base Account Kit API key
   - [ ] Get Base Account Kit Project ID
   - [ ] Save credentials securely

3. **Prepare Environment**
   - [ ] Install dependencies on local machine
   - [ ] Get testnet ETH from Base Sepolia faucet
   - [ ] Verify access to production nodes
   - [ ] Test RPC endpoints are accessible

4. **Start Migration**
   - [ ] Begin with Phase 0: Copy UI4 to UI5
   - [ ] Follow checklist in migration plan
   - [ ] Mark checkboxes as you complete each step
   - [ ] Test after each phase before proceeding

---

## Architecture Overview

### UI4 (Mock SDK)
```
UI4 Components
    ↓
@fabstir/sdk-core-mock
    ↓
localStorage (mock storage)
    ↓
No real blockchain
No real storage
No real nodes
```

### UI5 (Production SDK)
```
UI5 Components
    ↓
@fabstir/sdk-core
    ├─→ Base Sepolia (real blockchain)
    ├─→ S5 Network (real storage)
    └─→ Production Nodes (real LLM inference)
         ↓
    WebSocket streams
    Real AI responses
```

### Base Account Kit Flow
```
User
  ↓
Base Account Kit UI
  ↓
Primary Smart Wallet (0xPRIMARY...)
  ↓
Sub-account (0xSUB...)
  ↓
Spend Permission (1M USDC, 365 days)
  ↓
Gasless Transactions (no popups!)
```

---

## Key Differences: UI4 vs UI5

| Feature | UI4 (Mock) | UI5 (Production) |
|---------|-----------|------------------|
| SDK | @fabstir/sdk-core-mock | @fabstir/sdk-core |
| Blockchain | None (localStorage) | Base Sepolia testnet |
| Transactions | Instant | 5-15 seconds |
| Storage | localStorage | S5 network |
| Nodes | Mock responses | Real LLM nodes |
| Wallet | Mock wallet | Base Account Kit |
| Gas Fees | None | Real ETH (or gasless) |
| Sub-accounts | N/A | Per-origin isolation |
| Spend Permissions | N/A | 1M USDC allowance |

---

## Timeline Estimate

| Phase | Time | Difficulty |
|-------|------|------------|
| 0: Setup | 15 min | Easy |
| 1: Dependencies | 20 min | Easy |
| 2: Configuration | 30 min | Medium |
| 3: SDK Integration | 1.5 hours | Medium |
| 4: Base Account Kit | 5 hours | Hard |
| 5: Testing | 6-8 hours | Medium |
| 6: Production Prep | 3-4 hours | Medium |
| 7: Deployment | 2-3 hours | Easy |
| **Total** | **18-24 hours** | **Medium-Hard** |

**Breakdown by Difficulty**:
- Easy: 6 hours (35%)
- Medium: 11 hours (50%)
- Hard: 5 hours (15%)

---

## Common Pitfalls

### 1. Hardcoded Contract Addresses
**Problem**: Copying addresses from docs instead of `.env.test`
**Solution**: Always use environment variables

### 2. Missing API Credentials
**Problem**: Trying to use Base Account Kit without credentials
**Solution**: Get API key from Coinbase Developer Portal first

### 3. Insufficient Testnet ETH
**Problem**: Transactions fail with "insufficient funds"
**Solution**: Get ETH from Base Sepolia faucet before testing

### 4. Wrong SpendPermissionManager Address
**Problem**: Using Fabstir contract instead of Base protocol contract
**Solution**: Copy from `.env.test`, verify on Base Sepolia explorer

### 5. Skipping Phases
**Problem**: Jumping ahead without completing earlier phases
**Solution**: Follow checklist sequentially, verify after each phase

### 6. Not Testing After Changes
**Problem**: Making multiple changes without testing
**Solution**: Test after each phase to catch issues early

### 7. Ignoring Console Errors
**Problem**: Proceeding despite errors in browser console
**Solution**: Fix all console errors before moving to next phase

---

## Testing Strategy

### Automated Tests
1. Copy UI4 test scripts to `/workspace/tests-ui5/`
2. Update for longer timeouts (real blockchain is slower)
3. Run after Phase 5 completion
4. Expected: 61/61 tests passing (may take 30 minutes)

### Manual Tests
1. Test after every phase
2. Verify all checkboxes in migration plan
3. Check browser console for errors
4. Test on multiple browsers
5. Test on mobile devices

### Integration Tests
1. End-to-end wallet connection flow
2. Complete user journey (connect → deposit → chat → withdraw)
3. Error scenarios (network offline, insufficient funds, etc.)
4. Performance benchmarks (transaction times, page loads)

---

## Troubleshooting Resources

### Documentation
- **Migration Plan**: [UI5_MIGRATION_PLAN.md](./UI5_MIGRATION_PLAN.md) (Phase-specific issues)
- **Base Account Kit**: [BASE_ACCOUNT_KIT_INTEGRATION.md](./BASE_ACCOUNT_KIT_INTEGRATION.md) (Account Kit issues)
- **SDK API**: `/workspace/docs/SDK_API.md` (SDK usage)
- **Bug Tracking**: `/workspace/docs/BUG_TRACKING_UI4.md` (Lessons from UI4)

### Example Code
- **Base Account Kit Example**: `/workspace/apps/harness/pages/base-usdc-mvp-flow-sdk.test.tsx`
- **SDK Initialization**: `/workspace/packages/sdk-core/src/FabstirSDKCore.ts`
- **UI4 Components**: `/workspace/apps/ui4/` (reference implementation)

### External Resources
- **Base Docs**: https://docs.base.org/
- **Account Kit Docs**: https://docs.base.org/account-kit
- **Coinbase Portal**: https://portal.cdp.coinbase.com/
- **Base Explorer**: https://sepolia.basescan.org/

---

## Progress Tracking

### Recommended Workflow

1. **Create Progress Document**
   ```bash
   cp UI5_MIGRATION_PLAN.md UI5_MIGRATION_PROGRESS.md
   ```

2. **Mark Checkboxes as Complete**
   ```markdown
   - [x] Completed step
   - [ ] Not yet completed
   ```

3. **Add Notes for Issues**
   ```markdown
   - [x] Phase 1: Dependencies
     - Note: Had to update viem to v2.1.0 for compatibility
   ```

4. **Commit Progress Regularly**
   ```bash
   git add docs/ui5-reference/UI5_MIGRATION_PROGRESS.md
   git commit -m "docs: UI5 migration Phase X complete"
   ```

5. **Review at End of Each Day**
   - What was completed?
   - What blockers encountered?
   - What's next priority?

---

## FAQ

### Q: Can I skip Base Account Kit and use MetaMask?
**A**: Yes, but you lose gasless transactions. See migration plan Phase 4 for alternatives.

### Q: How long does sub-account creation take?
**A**: 10-15 seconds (one-time blockchain transaction during first connection).

### Q: Do users need to approve every transaction?
**A**: No! Transactions within spend permission limits are automatic (gasless).

### Q: What happens if spend permission expires?
**A**: User must recreate permission (automatic prompt in UI).

### Q: Can I test on mainnet?
**A**: Not recommended until full testnet validation. Use Base Sepolia first.

### Q: How much does migration cost?
**A**: Testnet ETH is free from faucet. Mainnet costs ~$5-10 for sub-account creation per user.

### Q: Is UI5 production-ready after migration?
**A**: After Phase 6 completion and testing, yes! Phase 7 handles deployment.

---

## Success Checklist

Before considering UI5 complete:

### Technical
- [ ] All 61 automated tests pass
- [ ] Zero console errors during normal use
- [ ] All UI4 features work in UI5
- [ ] Wallet connects successfully
- [ ] Sub-account created automatically
- [ ] Gasless transactions working
- [ ] Real blockchain transactions confirmed
- [ ] S5 storage persisting data
- [ ] WebSocket connections streaming responses

### User Experience
- [ ] Connection flow smooth (< 30 seconds)
- [ ] No unexpected MetaMask popups
- [ ] Clear loading states for transactions
- [ ] Error messages helpful and actionable
- [ ] Mobile responsive (if UI4 was)
- [ ] Performance acceptable (< 15s for transactions)

### Documentation
- [ ] All checkboxes in migration plan marked
- [ ] Troubleshooting notes documented
- [ ] Lessons learned captured
- [ ] Known issues documented
- [ ] Production deployment guide ready

### Production Readiness
- [ ] Security audit passed
- [ ] Environment variables configured
- [ ] Monitoring/analytics set up
- [ ] Staging deployment tested
- [ ] Rollback plan prepared
- [ ] User documentation complete

---

## Next Steps

After completing UI5 migration:

1. **Staging Deployment** - Deploy to staging environment for stakeholder review
2. **User Testing** - Get feedback from real users on testnet
3. **Performance Optimization** - Optimize based on real usage patterns
4. **Mainnet Preparation** - Update config for mainnet contracts
5. **Production Deployment** - Deploy to production with monitoring

---

## Support

### Internal Resources
- **Project Documentation**: `/workspace/docs/`
- **Test Scripts**: `/workspace/test-*.cjs`
- **Example Code**: `/workspace/apps/harness/`

### External Support
- **Base Discord**: https://discord.gg/buildonbase
- **Coinbase Support**: https://help.coinbase.com/
- **GitHub Issues**: https://github.com/anthropics/claude-code/issues (for Claude Code)

---

**Documentation Created**: January 13, 2025
**Status**: Ready for use
**Next**: Start with Phase 0 of migration plan
