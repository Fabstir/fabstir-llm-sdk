# Payment Accumulation Pattern in Fabstir LLM Marketplace

## Overview
The Fabstir LLM marketplace uses a **two-step accumulation pattern** for distributing payments to hosts and treasury fees. This design saves approximately 80% in gas costs by batching transfers instead of making individual transfers for each transaction.

## How It Works

### 1. Payment Flow
When a session completes and `claimWithProof` is called:
- **User Refund**: Sent directly to the user (immediate transfer)
- **Host Payment**: Accumulated in the HostEarnings contract
- **Treasury Fee**: Accumulated in the JobMarketplace contract

### 2. Withdrawal Process
Both hosts and treasury must explicitly withdraw their accumulated earnings:

#### For Hosts:
```typescript
// Check accumulated earnings
const hostManager = sdk.getHostManager();
const earnings = await hostManager.checkAccumulatedEarnings(tokenAddress);

// Withdraw earnings
if (earnings && earnings.gt(0)) {
  await hostManager.withdrawEarnings(tokenAddress);
}
```

#### For Treasury:
```typescript
// Check accumulated fees
const treasuryManager = sdk.getTreasuryManager();
const fees = await treasuryManager.getTreasuryBalance(tokenAddress);

// Withdraw fees
if (fees && fees.gt(0)) {
  await treasuryManager.withdrawTreasuryFees(tokenAddress);
}
```

## Why This Pattern?

### Gas Efficiency
- **Without accumulation**: 3 transfers per claim = ~150,000 gas
- **With accumulation**: 1 transfer (refund) + 2 accumulations = ~30,000 gas
- **Savings**: ~80% reduction in gas costs

### Benefits
1. **Lower transaction costs** for users
2. **Batched withdrawals** - hosts/treasury can withdraw multiple payments at once
3. **Simplified accounting** - accumulated balances are easier to track
4. **Reduced blockchain congestion** - fewer total transactions

## Testing Considerations

When testing payment flows, remember:

1. **Treasury fees don't appear immediately** in the treasury balance
2. **Host payments don't appear immediately** in the host balance
3. **Both need explicit withdrawal transactions**

### Example Test Pattern:
```typescript
// After claim
const treasuryManager = sdk.getTreasuryManager();
const accumulatedFees = await treasuryManager.getTreasuryBalance(usdcAddress);

// Check if fees are accumulated (not in wallet yet)
if (accumulatedFees.gt(0)) {
  console.log('Treasury fees accumulated:', ethers.utils.formatUnits(accumulatedFees, 6));
  
  // Withdraw to wallet
  await treasuryManager.withdrawTreasuryFees(usdcAddress);
}
```

## SDK Methods

### FabstirSDK
- `hostClaimAndWithdraw(jobId)`: Claims payment and withdraws host earnings
- `treasuryWithdraw(tokenAddress)`: Withdraws accumulated treasury fees

### HostManager
- `checkAccumulatedEarnings(tokenAddress)`: Check accumulated balance
- `withdrawEarnings(tokenAddress)`: Withdraw accumulated earnings

### TreasuryManager
- `getTreasuryBalance(tokenAddress)`: Check accumulated fees
- `withdrawTreasuryFees(tokenAddress)`: Withdraw accumulated fees
- `hasWithdrawableBalance(tokenAddress)`: Check if withdrawal available

## Contract Addresses (Base Sepolia)
- **JobMarketplace**: `0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0`
- **HostEarnings**: `0x908962e8c6CE72610021586f85ebDE09aAc97776`
- **USDC Token**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Important Notes

1. **Minimum withdrawal amounts** may apply to prevent dust transactions
2. **Gas costs for withdrawal** should be considered when accumulating small amounts
3. **Regular withdrawals** are recommended to maintain cash flow
4. **Treasury withdrawals** require treasury account authentication

## Example: Complete USDC Payment Flow

```typescript
// 1. User creates session with 2.0 USDC deposit
const session = await sdk.completeUSDCFlow({
  hostAddress: host,
  amount: '2.0',
  pricePerToken: 2000,
  duration: 86400
});

// 2. Host submits proof for 100 tokens
// ... proof submission ...

// 3. Host claims payment (accumulates 0.18 USDC)
await sdk.hostClaimAndWithdraw(session.jobId);

// 4. User automatically receives 1.8 USDC refund
// 5. Treasury accumulates 0.02 USDC fee

// 6. Treasury withdraws accumulated fees (may batch multiple jobs)
await sdk.treasuryWithdraw(usdcAddress);
```

## Troubleshooting

### "No treasury fees to withdraw"
- Fees are still accumulating
- Check accumulated balance with `getTreasuryBalance()`
- May need to wait for more fees to accumulate

### "No host earnings to withdraw"
- Earnings are still accumulating
- Check accumulated balance with `checkAccumulatedEarnings()`
- Ensure claim was successful first

### Balance not increasing after claim
- This is expected behavior
- Check accumulated balances instead of wallet balances
- Perform explicit withdrawal to move funds to wallet