# Fabstir SDK v1.3.0 - Dual Pricing MVP Release

**Release Date:** January 10, 2025
**Status:** Pre-MVP Complete - Ready for Production UI Integration

## 📦 Deliverables

### 1. SDK Tarball
- **File:** `fabstir-sdk-core-1.3.0.tgz` (812 KB)
- **Location:** `/workspace/fabstir-sdk-core-1.3.0.tgz`
- **Installation:** `npm install ./fabstir-sdk-core-1.3.0.tgz`

### 2. UI Developer Guide
- **File:** `docs/UI_DEVELOPER_GUIDE.md`
- **Contents:**
  - Quick start with dual pricing
  - Complete integration examples for all wallet types
  - Base Account Kit (popup-free) implementation
  - Regular wallet (MetaMask) implementation
  - Host discovery and pricing filters
  - Session creation with USDC/ETH payments
  - Troubleshooting guide

### 3. Working Reference Pages
All test pages verified working with dual pricing:
- `apps/harness/pages/chat-context-popupfree-demo.tsx` - Base Account Kit (popup-free)
- `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx` - USDC with regular wallet
- `apps/harness/pages/eth-mvp-flow-sdk.test.tsx` - ETH with regular wallet

---

## 🎯 What's New in v1.3.0

### Dual Pricing System
- **Two Separate Price Fields:**
  - `minPricePerTokenNative` - ETH/BNB pricing (18 decimals)
  - `minPricePerTokenStable` - USDC pricing (6 decimals)
- **Host-Controlled Pricing:** Hosts set their own prices separately for native tokens and stablecoins
- **Multi-Chain Support:** Base Sepolia (ETH+USDC) and opBNB Testnet (BNB+USDC)

### Key Features
1. **Host Discovery with Price Filtering:**
   - Filter hosts by maximum price
   - Sort by lowest price or random
   - Display both USDC and ETH pricing

2. **Base Account Kit Integration:**
   - Popup-free transactions with Auto Spend Permissions
   - Gasless transactions on Base Sepolia
   - Sub-account management

3. **PaymentManager Updates:**
   - `approveToken()` method supports Base Account Kit
   - Multi-chain token operations
   - Automatic approval handling

### Breaking Changes
- ⚠️ Must use `minPricePerTokenStable` or `minPricePerTokenNative` instead of old `minPricePerToken`
- ⚠️ Always use `PaymentManager.approveToken()` for USDC approval (NOT direct contract calls)
- ⚠️ Session config must include `chainId` parameter

---

## 🚀 Quick Start for UI Developer

### Step 1: Install SDK
```bash
npm install ./fabstir-sdk-core-1.3.0.tgz
```

### Step 2: Review Integration Guide
Read `docs/UI_DEVELOPER_GUIDE.md` for:
- Complete code examples
- Base Account Kit setup
- Host discovery patterns
- Session creation flows
- Troubleshooting

### Step 3: Reference Working Pages
- **Base Account Kit (Smart Wallet):** `apps/harness/pages/chat-context-popupfree-demo.tsx`
  - Best for new users
  - Popup-free UX
  - Lines 509-587: Wallet connection
  - Lines 984-1042: Host discovery
  - Lines 1044-1274: Session creation

- **Regular Wallet (USDC):** `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx`
  - MetaMask and other wallets
  - Lines 490-593: USDC approval
  - Lines 664-865: Session creation

- **Regular Wallet (ETH):** `apps/harness/pages/eth-mvp-flow-sdk.test.tsx`
  - Native token payments
  - No token approval needed

### Step 4: Update Your Code

#### Before (v1.2.1):
```typescript
// OLD - Single pricing field
const price = host.minPricePerToken;
const usdcContract = new ethers.Contract(USDC, [...], signer);
await usdcContract.approve(JOB_MARKETPLACE, amount);
```

#### After (v1.3.0):
```typescript
// NEW - Dual pricing
const priceUSDC = host.minPricePerTokenStable; // For USDC payments
const priceETH = host.minPricePerTokenNative;  // For ETH payments

// NEW - Use PaymentManager for approval
const pm = sdk.getPaymentManager();
await pm.approveToken(JOB_MARKETPLACE, amount, USDC);
```

---

## ✅ Verification

### MVP Flow Tested Successfully
```
✅ Connect Wallet (Base Account Kit - ONE popup)
✅ Deposit USDC to Primary Account ($7.2 USDC)
✅ Discover Hosts (2 active hosts with dual pricing)
✅ Filter by Price (≤ 0.000500 USDC/token)
✅ Select Host & Start Session (popup-free!)
✅ Send Message: "What is the capital of Italy?"
   → Response: "The capital of Italy is Rome." (19 tokens)
✅ Send Message: "Tell me about it"
   → Response: "Rome is the capital city..." (85 tokens)
✅ End Session
✅ Payment Distribution:
   - Host: 0.02844 USDC (90%)
   - Treasury: 10%
   - User Refund: 1.9684 USDC
```

### Blockchain Verification (Base Sepolia)
- Transaction Hash: `0x407d249e174abeb468f9de320b3e14d8f76ec4859870d2e122dd94548e0b6a65`
- Host earnings deposited to HostEarnings contract
- User received refund automatically
- Treasury fee collected

---

## 📋 Environment Variables Required

```bash
# RPC URLs
NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Contract Addresses (Base Sepolia - Jan 28, 2025 Corrected Dual Pricing)
NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE=0xe169A4B57700080725f9553E3Cc69885fea13629
NEXT_PUBLIC_CONTRACT_NODE_REGISTRY=0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6
NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
NEXT_PUBLIC_CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776
NEXT_PUBLIC_CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
NEXT_PUBLIC_CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY=0x92b2De840bB2171203011A6dBA928d855cA8183E

# Base Account Kit (optional - for smart wallets)
BASE_CONTRACT_SPEND_PERMISSION_MANAGER=0xf85210B21cC50302F477BA56686d2019dC9b67Ad
```

---

## 🔧 Integration Checklist

Before deploying production UI:

- [ ] SDK installed from tarball (`fabstir-sdk-core-1.3.0.tgz`)
- [ ] All environment variables configured
- [ ] Dual pricing displayed correctly (separate USDC and ETH prices)
- [ ] USDC approval uses `PaymentManager.approveToken()` (NOT direct contract calls)
- [ ] Session config includes `chainId` parameter
- [ ] Host discovery filters and sorts by pricing
- [ ] Base Account Kit flow tested (if using smart wallets)
- [ ] Regular wallet flow tested (if using MetaMask/other wallets)
- [ ] Error handling for insufficient balance, approval failures
- [ ] Balance updates after session end (with proper blockchain confirmations)

---

## 📚 Documentation

### Primary References
1. **UI Developer Guide:** `docs/UI_DEVELOPER_GUIDE.md`
2. **SDK API Reference:** `docs/SDK_API.md`
3. **Quick Reference:** `docs/SDK_QUICK_REFERENCE.md`

### Working Examples
1. **Base Account Kit:** `apps/harness/pages/chat-context-popupfree-demo.tsx`
2. **Regular Wallet (USDC):** `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx`
3. **Regular Wallet (ETH):** `apps/harness/pages/eth-mvp-flow-sdk.test.tsx`

### Contract Documentation
1. **Current Status:** `docs/compute-contracts-reference/CURRENT_STATUS.md`
2. **Architecture:** `docs/compute-contracts-reference/ARCHITECTURE.md`
3. **JobMarketplace API:** `docs/compute-contracts-reference/JobMarketplace.md`
4. **NodeRegistry API:** `docs/compute-contracts-reference/NodeRegistry.md`
5. **Client ABIs:** `docs/compute-contracts-reference/client-abis/`

---

## 🎉 MVP Complete!

The SDK is now ready for production UI integration with:
- ✅ Dual pricing system working end-to-end
- ✅ Base Account Kit popup-free transactions
- ✅ Multi-chain support (Base Sepolia primary)
- ✅ Complete working examples
- ✅ Comprehensive developer documentation
- ✅ Verified blockchain transactions

Your UI developer has everything needed to build the production user interface! 🚀
