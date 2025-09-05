# Current Documentation Status

**Last Updated: January 5, 2025**

This document helps you navigate the Fabstir documentation and identify which files reflect the current architecture vs historical implementations.

## 🚀 Current Architecture

The project now uses **JobMarketplaceFABWithS5** with treasury accumulation AND host earnings accumulation:
- **Treasury Accumulation**: ✅ NEW - Treasury fees accumulate for batch withdrawals
- **USDC Payments**: ✅ VERIFIED WORKING with 90% host / 10% treasury distribution
- **ETH Payments**: ✅ WORKING with dual accumulation (treasury + host)
- **Host Earnings**: ✅ Both ETH and USDC accumulate for batch withdrawals
- **Session Jobs**: Direct, self-contained payments with MIN_DEPOSIT and MIN_PROVEN_TOKENS
- **Gas Savings**: ~80% reduction through dual accumulation (treasury + host)

### Active Contracts (Base Sepolia - LATEST January 5, 2025)

| Contract | Address | Status |
|----------|---------|--------|
| **JobMarketplaceFABWithS5** | `0x55A702Ab5034810F5B9720Fe15f83CFcf914F56b` | ✅ TREASURY + HOST ACCUMULATION |
| **HostEarnings** | `0x908962e8c6CE72610021586f85ebDE09aAc97776` | ✅ ACCUMULATION WORKING |
| **ProofSystem** | `0x2ACcc60893872A499700908889B38C5420CBcFD1` | ✅ FIXED INTERNAL VERIFICATION |
| **NodeRegistry** | `0x87516C13Ea2f99de598665e14cab64E191A0f8c4` | ✅ CURRENT |
| **Treasury** | `0xbeaBB2a5AEd358aA0bd442dFFd793411519Bdc11` | ✅ CURRENT |
| **FAB Token** | `0xC78949004B4EB6dEf2D66e49Cd81231472612D62` | ✅ STABLE |
| **USDC (Base Sepolia)** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | ✅ STABLE |
| **USDC (Base Mainnet)** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | ✅ STABLE |

### Deprecated Contracts (DO NOT USE)

| Contract | Old Address | Issue |
|----------|-------------|-------|
| JobMarketplaceFABWithS5 (no treasury accumulation) | `0x9A945fFBe786881AaD92C462Ad0bd8aC177A8069` | Treasury direct transfer, no accumulation |
| JobMarketplaceFABWithS5 (direct payments) | `0xD937c594682Fe74E6e3d06239719805C04BE804A` | Higher gas costs, no accumulation |
| JobMarketplaceFABWithS5 (storage issue) | `0x6135dfbe0fB50Bc3AF7e9bFD137c5b10ce6D5Dd4` | Job struct storage problem |
| JobMarketplaceFABWithS5 (missing USDC validation) | `0xebD3bbc24355d05184C7Af753d9d631E2b3aAF7A` | No host validation for USDC |
| JobMarketplaceFABWithS5 (payment bug) | `0x445882e14b22E921c7d4Fe32a7736a32197578AF` | transfer() fails silently |
| ProofSystem (external call bug) | `0x48f94914979eD6B0e16c6E4E04Bfa8a8041DcF1D` | Incorrect external call |
| JobMarketplaceFABWithS5 (oldest) | `0x7ce861CC0188c260f3Ba58eb9a4d33e17Eb62304` | No session support |
| JobMarketplaceFABWithEarnings | `0xEB646BF2323a441698B256623F858c8787d70f9F` | JobMarketplaceFABWithS5 |
| PaymentEscrowWithEarnings | `0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C` | Internal payments |
| HostEarnings | `0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E` | Direct transfers |
| PaymentEscrow (old) | `0xa4C5599Ea3617060ce86Ff0916409e1fb4a0d2c6` | Internal payments |
| HostEarnings (old) | `0xbFfCd6BAaCCa205d471bC52Bd37e1957B1A43d4a` | Direct transfers |

## ✅ Current Documentation

These documents reflect the current architecture and should be your primary reference:

### Essential Reading
- **[ETH_ACCUMULATION_STATUS.md](./ETH_ACCUMULATION_STATUS.md)** - ETH and USDC earnings accumulation guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Current system architecture with session jobs
- **[SESSION_JOBS.md](./SESSION_JOBS.md)** - Comprehensive guide to session-based AI inference
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Latest deployment info with all contract addresses
- **[IMPLEMENTATION2.md](./IMPLEMENTATION2.md)** - Session jobs implementation details
- **[TEST_DEPLOYMENT.md](./TEST_DEPLOYMENT.md)** - Fresh deployment guide

### Code References
- `/src/JobMarketplaceFABWithS5.sol` - Current implementation
- `/src/ProofSystem.sol` - EZKL proof verification
- `/test/JobMarketplace/SessionJobs/` - Session job tests (340+ passing)
- `/script/DeploySessionJobs.s.sol` - Deployment script

## ⚠️ Outdated Documentation

These documents contain historical information or old contract addresses:

### Historical/Legacy
- **DEPLOYMENT.md** - Contains old contract addresses (JobMarketplaceFABWithEarnings)
- **SUMMARY.md** - Predates session jobs entirely (Aug 7)
- **IMPLEMENTATION.md** - Phase 1-3 is historical, Phase 4-5 differs from actual implementation

### Technical Docs (Partially Outdated)
Many files in `/docs/technical/contracts/` describe the old architecture:
- `HostEarnings.md` - References deprecated contract
- `PaymentEscrow.md` - Describes external escrow (not used for sessions)
- `JobMarketplace.md` - Missing session job functions

## 📚 Partially Current Documentation

These documents contain valid concepts but may have outdated examples:

### Conceptually Valid (Check Addresses)
- `/docs/best-practices/` - Principles apply, update contract addresses
- `/docs/guides/` - Concepts valid, verify contract references
- `/docs/examples/` - Patterns useful, update addresses and functions

### Still Accurate
- Gas optimization strategies
- Security best practices
- Node operation basics
- Governance mechanisms

## 🔄 Key Architecture Changes

### Old Model (Pre-Session)
```
User → JobMarketplace → PaymentEscrow → HostEarnings → Host
```
- Multiple external contract calls
- Higher gas costs
- Complex error handling

### Current Model (Session Jobs)
```
User → JobMarketplaceFABWithS5 → Host (direct)
```
- Direct payments via `_sendPayments()`
- 30% gas reduction
- Simplified error recovery

## 📋 Migration Notes

If you're migrating from the old architecture:

1. **Contract Updates**
   - Deploy new JobMarketplaceFABWithS5
   - Deploy new ProofSystem
   - No need for separate PaymentEscrow/HostEarnings

2. **Function Changes**
   - Use `createSessionJob()` for continuous AI inference
   - Use `submitProofOfWork()` for checkpoint proofs
   - Payments handled internally, not through escrow

3. **Transaction Model**
   - Session jobs: 5-10 transactions for 50 prompts
   - Old model: 50+ transactions for 50 prompts
   - 85-95% reduction in gas costs

## 🎯 Quick Start

For new developers:
1. Read [SESSION_JOBS.md](./SESSION_JOBS.md) first
2. Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview
3. Check [DEPLOYMENT.md](./DEPLOYMENT.md) for current addresses
4. Use `/test/JobMarketplace/SessionJobs/` for implementation examples

## ⚡ Important Notes

- **Session jobs** are the recommended approach for AI inference
- **Direct payments** are more gas-efficient than external escrow
- **Proof checkpoints** replace per-prompt transactions
- **USDC support** is built-in for both ETH and token payments

## 📞 Getting Help

If you're unsure about documentation currency:
1. Check the file modification date
2. Look for contract addresses - current ones are listed above
3. Reference the test files for actual implementation
4. When in doubt, use SESSION_JOBS.md as the source of truth

---

*This status document is maintained to help navigate the evolving architecture. Always verify contract addresses before mainnet deployment.*