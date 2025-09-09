# USDC Session Creation Guide

## ✅ IMPORTANT: Contract Configuration is CORRECT

**The contract properly handles USDC payments with separate minimum deposits:**
- **ETH Sessions**: `MIN_DEPOSIT = 0.0002 ETH` 
- **USDC Sessions**: `tokenMinDeposits[USDC] = 0.8 USDC`

The contract does NOT incorrectly apply the ETH minimum to USDC. Each token has its own minimum configured.

## Contract Architecture

The JobMarketplaceFABWithS5 contract has two separate functions for session creation:

1. **`createSessionJob()`** - For ETH payments
   - Uses `MIN_DEPOSIT` constant (0.0002 ETH)
   - Requires `msg.value >= deposit`

2. **`createSessionJobWithToken()`** - For token payments
   - Uses `tokenMinDeposits[token]` mapping
   - For USDC: 800000 (0.8 USDC with 6 decimals)
   - Requires ERC20 approval before calling

## Key Validation Requirements

All sessions must meet these requirements regardless of payment token:

1. **Minimum Deposit**
   - ETH: 0.0002 ETH
   - USDC: 0.8 USDC

2. **Token Coverage** 
   - Deposit must cover at least 100 tokens based on `pricePerToken`
   - Formula: `deposit / pricePerToken >= 100`

3. **Proof Interval**
   - Must be between 100 and 1,000,000
   - Cannot exceed maximum tokens covered by deposit

4. **Duration**
   - Must be positive and <= 365 days

5. **Host Requirements**
   - Host must be registered in NodeRegistry
   - Host must be active
   - Host must have sufficient FAB stake (1000 FAB)

## Creating a USDC Session

### Step 1: Calculate Valid Parameters

Use the provided calculator script:
```bash
node scripts/calculate-session-params.js --token USDC --tokens 1000
```

Or manually ensure:
- Deposit >= 0.8 USDC
- Deposit / pricePerToken >= 100
- proofInterval >= 100

### Step 2: Approve USDC Spending

```javascript
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const MARKETPLACE = '0x55A702Ab5034810F5B9720Fe15f83CFcf914F56b';

// Approve exact amount or more
const depositAmount = ethers.utils.parseUnits('2', 6); // 2 USDC
await usdc.approve(MARKETPLACE, depositAmount);
```

### Step 3: Create the Session

```javascript
const jobId = await marketplace.createSessionJobWithToken(
  hostAddress,           // Registered and active host
  USDC,                 // Token address
  depositAmount,        // Min 0.8 USDC (in wei)
  pricePerToken,        // Price per token (in wei)
  86400,                // Duration in seconds
  100                   // Proof interval
);
```

## Example: Valid USDC Session

```javascript
// Parameters that work
const params = {
  deposit: '2 USDC',           // 2000000 in wei (6 decimals)
  pricePerToken: '0.01 USDC',  // 10000 in wei
  maxTokens: 200,              // 2 / 0.01 = 200 tokens
  proofInterval: 100,          // Minimum allowed
  duration: 86400              // 1 day
};

// This passes all validations:
// ✅ Deposit (2 USDC) >= minimum (0.8 USDC)
// ✅ Max tokens (200) >= required (100)
// ✅ Proof interval (100) >= minimum (100)
// ✅ Proof interval (100) <= max tokens (200)
```

## Common Issues & Solutions

### Issue: "Deposit below minimum"
**Cause**: Using less than 0.8 USDC
**Solution**: Use at least 0.8 USDC deposit

### Issue: "Deposit covers less than minimum tokens"  
**Cause**: `deposit / pricePerToken < 100`
**Solution**: Either increase deposit or decrease pricePerToken

### Issue: "Token not accepted"
**Cause**: USDC not configured or wrong address
**Solution**: Verify USDC address is `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### Issue: "Host not registered" or "Host not active"
**Cause**: Invalid host address or host not properly registered
**Solution**: Use a registered and active host address

### Issue: Transaction reverts with no clear error
**Possible Causes**:
1. Insufficient USDC balance
2. Insufficient USDC approval
3. Parameters fail validation
4. Gas limit too low

**Debug Steps**:
1. Check USDC balance: `usdc.balanceOf(yourAddress)`
2. Check approval: `usdc.allowance(yourAddress, marketplaceAddress)`
3. Verify parameters with calculator script
4. Increase gas limit to 500000

## Testing USDC Sessions

Run the test script to verify everything works:

```bash
node scripts/test-usdc-session.js
```

This script will:
1. Check contract configuration
2. Verify host registration
3. Check USDC balance and approval
4. Calculate valid parameters
5. Create a test session
6. Verify the session was created

## For Smart Wallets (Base Account Kit)

When using smart wallets:

1. **Ensure USDC is in the smart wallet**, not the EOA
2. **Approve from the smart wallet** using the wallet's transaction methods
3. **Call createSessionJobWithToken from the smart wallet**
4. Use sufficient gas limits (smart wallet operations use more gas)

Example with smart wallet:
```javascript
// Execute approval through smart wallet
await smartWallet.execute(
  USDC_ADDRESS,
  0,
  usdc.interface.encodeFunctionData('approve', [MARKETPLACE, depositAmount])
);

// Create session through smart wallet
await smartWallet.execute(
  MARKETPLACE,
  0,
  marketplace.interface.encodeFunctionData('createSessionJobWithToken', [
    hostAddress, USDC, deposit, pricePerToken, duration, proofInterval
  ])
);
```

## Summary

The contract is **correctly configured** for USDC payments. The minimum deposit is **0.8 USDC**, not 200 million. If transactions are failing, it's likely due to:

1. Incorrect parameters (not meeting validation requirements)
2. Insufficient USDC balance or approval
3. Invalid host address
4. Smart wallet integration issues

Use the provided scripts to test and debug USDC session creation.