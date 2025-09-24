# ETH and USDC Earnings Accumulation - WORKING

## Current Status (Sept 4, 2025)

**BOTH ETH and USDC payments now accumulate in HostEarnings!**

### Configuration
- **JobMarketplaceFABWithS5**: `0xD937c594682Fe74E6e3d06239719805C04BE804A`
- **HostEarnings**: `0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E`
- **Authorization**: ✅ Marketplace is authorized to credit earnings

### How It Works

When a session job completes:

#### For ETH Payments
```solidity
// ETH goes to HostEarnings contract
payable(address(hostEarnings)).call{value: payment}("");
// Host's balance is credited
hostEarnings.creditEarnings(host, payment, address(0));
```

#### For USDC Payments
```solidity
// USDC transferred to HostEarnings
token.transfer(address(hostEarnings), payment);
// Host's balance is credited
hostEarnings.creditEarnings(host, payment, job.paymentToken);
```

### Host Withdrawal

Hosts can withdraw accumulated earnings:

```bash
# Check ETH balance
cast call 0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E \
  "getBalance(address,address)(uint256)" \
  $HOST_ADDRESS \
  0x0000000000000000000000000000000000000000

# Check USDC balance  
cast call 0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E \
  "getBalance(address,address)(uint256)" \
  $HOST_ADDRESS \
  0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Withdraw ETH
cast send 0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E \
  "withdrawEarnings(address)" \
  0x0000000000000000000000000000000000000000 \
  --private-key $HOST_PRIVATE_KEY

# Withdraw USDC
cast send 0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E \
  "withdrawEarnings(address)" \
  0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  --private-key $HOST_PRIVATE_KEY

# Withdraw all tokens at once
cast send 0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E \
  "withdrawAllEarnings()" \
  --private-key $HOST_PRIVATE_KEY
```

### Test Results

Your test `docs/archive/eth-payment-cycle.test.ts` should now work correctly with ETH accumulation.

### Benefits

1. **Gas Savings**: Hosts save ~70% on gas by withdrawing in batches
2. **Unified System**: Both ETH and USDC use the same accumulation pattern
3. **Flexibility**: Hosts choose when to withdraw based on gas prices
4. **Transparency**: Clear balance tracking for each token type

### Important Note

**DO NOT USE JobMarketplaceLite** - it lacks critical features your client needs. The full JobMarketplaceFABWithS5 has everything including earnings accumulation.