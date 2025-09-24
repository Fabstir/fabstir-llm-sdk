# Gas Cost Calculation for Host Registration Test

## Current Error Analysis
From the test output:
```
"insufficient funds for gas * price + value: have 10000000000000000 want 90000003420000000"
```

Breaking this down:
- Have: 10000000000000000 wei = 0.01 ETH
- Want: 90000003420000000 wei = 0.09 ETH (for just one transaction!)

This seems extremely high for Base Sepolia. Let's investigate.

## Typical Gas Costs on Base Sepolia

Base Sepolia is a testnet with much lower gas prices than mainnet:
- Typical gas price: 1-10 gwei (0.000000001 - 0.00000001 ETH)
- Registration transaction: ~150,000 gas units
- Expected cost: 150,000 × 10 gwei = 0.0015 ETH

## The Problem

The error shows the transaction is trying to use:
- maxFeePerGas: 0x59682f72 = 1,499,999,090 wei = ~1.5 gwei
- Gas estimate seems to be: ~60,000,000 gas units (!!!)

This is abnormally high. A normal contract interaction should be:
- 100,000 - 300,000 gas units
- At 1-10 gwei = 0.0001 - 0.003 ETH per transaction

## Realistic Gas Requirements

For the complete test (5 transactions):
1. Register node: ~200,000 gas = 0.002 ETH
2. Approve FAB: ~50,000 gas = 0.0005 ETH  
3. Stake tokens: ~150,000 gas = 0.0015 ETH
4. Unstake tokens: ~100,000 gas = 0.001 ETH
5. Unregister: ~100,000 gas = 0.001 ETH

**Total: ~0.006 ETH** (about $24 at $4,000/ETH)

## Why the High Estimate?

Possible reasons:
1. **Contract not deployed**: If the contract address is wrong, gas estimation fails
2. **Revert in constructor**: The contract might be reverting during the call
3. **Infinite loop**: A bug causing excessive gas consumption
4. **Wrong network**: Connected to wrong chain with different gas prices

## Debugging Steps

1. Check contract is deployed:
```javascript
const code = await provider.getCode(nodeRegistryAddress);
console.log('Contract code length:', code.length);
```

2. Check network:
```javascript
const network = await provider.getNetwork();
console.log('Network:', network);
```

3. Try with manual gas limit:
```javascript
const tx = await nodeRegistryContract.registerNode(capabilities, pricePerToken, {
  gasLimit: 300000, // Manual limit
  gasPrice: ethers.utils.parseUnits('10', 'gwei')
});
```

## Actual Requirements

For Base Sepolia testnet:
- **Minimum needed**: 0.01 ETH should be plenty
- **Safe amount**: 0.02 ETH for buffer
- **Current balance**: 0.03 ETH should work

The 0.09 ETH requirement seems to be an error in gas estimation, not actual requirement.