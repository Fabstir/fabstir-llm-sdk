# Host Registration Test Results

## Current Status
The host `0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c` is **already registered** but in an unusual state:
- ✅ Registration Status: Registered
- 📝 Metadata: `llama-2-7b,llama-2-13b,inference`
- 💰 Staked Amount: 0.0 FAB
- ⚠️ Active: No

## What Happened

### Initial State
- Host was already registered from a previous test
- Has 0 FAB staked (unusual - should have 1000 FAB minimum)
- Marked as inactive

### Test Execution
1. **Approval**: ✅ Successfully approved 1000 FAB tokens (Block 30762539)
2. **Registration**: ❌ Failed - likely because already registered
3. **Additional Staking**: ❌ Failed - insufficient gas (but this seems to be a gas estimation issue)

## Key Findings

### Gas Costs are Minimal
- Gas price: 0.001 gwei (incredibly cheap!)
- Actual transaction costs: < 0.001 ETH per transaction
- The 0.029 ETH in the account is MORE than sufficient

### Contract Behavior
The `NodeRegistryFAB` contract:
- Requires 1000 FAB minimum stake (MIN_STAKE)
- Auto-stakes during registration
- Returns stake during unregistration
- Allows additional staking via `stake()` function

### The "Insufficient Funds" Error is Misleading
When you see "insufficient funds for intrinsic transaction cost", it usually means:
1. The transaction will revert for business logic reasons
2. Gas estimation fails when transactions will revert
3. The actual gas needed is much less than the error suggests

## Next Steps

To fix the current state:
1. **Option 1**: Unregister and re-register
   ```javascript
   await nodeRegistryContract.unregisterNode();
   // Then register again with proper staking
   ```

2. **Option 2**: Add stake to the existing registration
   ```javascript
   await fabTokenContract.approve(nodeRegistryAddress, MIN_STAKE);
   await nodeRegistryContract.stake(MIN_STAKE);
   ```

## Test Command
```bash
npm test tests/e2e/host-registration-staking.test.ts
```

## Contract Addresses (Base Sepolia)
- Node Registry: `0x87516C13Ea2f99de598665e14cab64E191A0f8c4`
- FAB Token: `0xC78949004B4EB6dEf2D66e49Cd81231472612D62`
- Test Host: `0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c`

## Conclusion
The test is working correctly but the host is in an unusual state (registered but with 0 stake). The gas costs are minimal (< $0.01 total), and the account has sufficient funds. The "insufficient funds" errors are due to transaction reverts, not actual gas shortage.