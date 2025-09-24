# Base Account Wallet Implementation Plan

## Goal
Implement true gasless transactions on Base Sepolia using Base Account Kit with EIP-5792 `wallet_sendCalls`, leveraging Coinbase's default sponsorship for smart wallets on testnet.

## Current Problem
Our existing `BaseAccountIntegration.ts` does NOT use Base Account Kit properly:
- Imports `@base-org/account` but never uses it
- Makes direct smart contract calls via `execute()` 
- Requires ETH for gas (not truly gasless)
- Uses `eth_sendTransaction` instead of UserOperations

## Solution Architecture

### 1. Create BaseAccountWallet.ts

Location: `src/managers/BaseAccountWallet.ts`

**Purpose**: Provide a proper Base Account Kit integration using EIP-5792 for gasless transactions.

**Key Components**:
```typescript
import { createBaseAccountSDK, base } from '@base-org/account'
import { numberToHex, encodeFunctionData, type Hex } from 'viem'

// SDK initialization with Base Sepolia
const sdk = createBaseAccountSDK({
  appName: 'Fabstir SDK',
  appChainIds: [base.constants.CHAIN_IDS.base_sepolia], // 84532
})

// Get provider for wallet operations
const provider = sdk.getProvider()
```

**Main Function - sendSponsoredCalls**:
```typescript
// Minimal ERC20 ABI (included in module to avoid import drift)
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  }
] as const;

export async function sendSponsoredCalls(
  from: string,  // MUST be smart account address, not EOA
  calls: Array<{
    to: `0x${string}`;
    data: `0x${string}`;
    value?: `0x${string}`;
  }>
): Promise<{ id: string; [key: string]: any }> {
  const chainId = numberToHex(base.constants.CHAIN_IDS.base_sepolia); // 0x14a34
  
  // Guard rail: Only allow Base Sepolia without paymaster
  if (chainId !== '0x14a34') {
    throw new Error('Only Base Sepolia supported without paymaster configuration');
  }
  
  // Check wallet capabilities (handle v1/v2 shapes)
  const caps = await provider.request({ 
    method: 'wallet_getCapabilities', 
    params: [['0x14A34']]  // Base Sepolia
  })
  
  const baseCaps = caps?.['0x14A34'] ?? {};
  const atomicSupported = 
    baseCaps?.atomic?.status === 'supported' ||  // v2 shape
    baseCaps?.atomicBatch?.supported === true;    // v1 fallback
  
  if (!atomicSupported) {
    console.warn('Wallet does not support atomic batching');
  }
  
  // Send sponsored user operation (EIP-5792 v2 format)
  const result = await provider.request({
    method: 'wallet_sendCalls',
    params: [{
      version: '2.0.0',  // REQUIRED for v2
      chainId,
      from,  // Smart account address
      calls,
      capabilities: {  // v2 structure (not atomicRequired)
        atomic: { required: true }
      }
    }]
  })
  
  // v2 returns object with id, not just string
  return result as { id: string; [key: string]: any };
}
```

**Additional Helper Functions**:
```typescript
// Check transaction status (v2 returns numeric codes)
export async function getCallsStatus(id: string) {
  const status = await provider.request({
    method: 'wallet_getCallsStatus',
    params: [id]
  })
  
  // v2 status codes: 200 = success, 100 = pending, etc.
  return status;
}

// Ensure we're using the smart account (not EOA)
export async function getSmartAccountAddress(): Promise<string> {
  const accounts = await provider.request({
    method: 'eth_requestAccounts',
    params: []
  })
  
  // Smart account is typically the second account (index 1)
  // EOA is at index 0
  if (accounts.length < 2) {
    throw new Error('Smart account not available. Connect Coinbase Smart Wallet.');
  }
  
  return accounts[1]; // Return smart account, not EOA
}

// Helper to encode ERC20 operations
export function encodeERC20Call(
  tokenAddress: string,
  operation: 'approve' | 'transfer',
  args: any[]
): { to: `0x${string}`, data: `0x${string}` } {
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: operation,
    args
  })
  
  return {
    to: tokenAddress as `0x${string}`,
    data: data as `0x${string}`
  }
}
```

### 2. Update Test File

Location: `tests/e2e/base-usdc-mvp-flow-v2.test.ts`

**Key Changes**:

#### Remove ETH Dependencies
- Delete all ETH balance checks
- Remove ETH funding logic
- Remove minimum ETH requirements
- Delete references to `fund-eoa.cjs`

#### Replace Direct Contract Calls
```typescript
// OLD (requires ETH):
const approveTx = await smartAccount.execute(
  usdcAddress,
  ethers.BigNumber.from(0),
  approveData,
  { gasLimit: 200000 }
);

// NEW (gasless):
import { sendSponsoredCalls, encodeERC20Call } from '../../src/managers/BaseAccountWallet';

const approveCall = encodeERC20Call(
  usdcAddress,
  'approve',
  [jobMarketplaceAddress, depositAmount]
);

const result = await sendSponsoredCalls(
  smartAccountAddress,  // Smart account, not EOA!
  [approveCall]
);

// Extract the transaction ID from v2 response
const txId = result.id;

// Check status (optional)
const status = await getCallsStatus(txId);
console.log('Transaction status:', status);
```

#### Batch Operations
```typescript
// Batch approve + create session in one sponsored transaction
const calls = [
  // 1. Approve USDC spending
  encodeERC20Call(usdcAddress, 'approve', [jobMarketplace, amount]),
  
  // 2. Create session job
  {
    to: jobMarketplaceAddress as `0x${string}`,
    data: encodeFunctionData({
      abi: JobMarketplaceABI,
      functionName: 'createSessionJobWithToken',
      args: [host, token, deposit, price, duration, interval]
    }) as `0x${string}`
  }
];

const result = await sendSponsoredCalls(smartAccountAddress, calls);
```

### 3. Test Flow Changes

#### Setup Phase
```typescript
// Initialize Base Account SDK
const baseWallet = new BaseAccountWallet();

// Get smart account address (ensure it's not the EOA)
const smartAccountAddress = await baseWallet.getSmartAccountAddress();
// This returns accounts[1], not accounts[0] (EOA)

// Assert EOA has 0 ETH (and stays that way)
const eoaBalance = await provider.getBalance(eoaAddress);
expect(eoaBalance.toString()).toBe('0'); // Must be 0

// NO ETH FUNDING REQUIRED!
```

#### Transaction Flow
1. **Fund smart account with USDC** (from EOA if needed)
2. **Send batched sponsored calls**:
   - Approve USDC
   - Create session
   - All in one gasless transaction
3. **Host claims payment** (still uses their EOA with ETH)
4. **Withdraw USDC back to EOA** (via sponsored call)

### 4. Expected Outcomes

#### What Works on Base Sepolia
- ✅ Zero ETH needed in EOA
- ✅ All smart account operations sponsored
- ✅ Batched transactions in single UserOp
- ✅ Automatic sponsorship (no CDP setup)
- ✅ Full USDC payment flow

#### What Doesn't Work (Yet)
- ❌ USDC-as-gas (needs token paymaster)
- ❌ Mainnet sponsorship (needs CDP/paymaster)
- ❌ Non-Coinbase wallets (no sponsorship)

### 5. Migration Path

#### Phase 1: Base Sepolia (Current)
- Use default Coinbase sponsorship
- No paymaster configuration
- Test with real gasless transactions

#### Phase 2: Mainnet Ready
- Add CDP account and API key
- Configure paymaster URL
- Update capabilities to include paymaster

#### Phase 3: USDC-as-Gas
- Integrate ERC-7677 token paymaster
- Allow USDC to pay for gas
- Full token-based gas abstraction

### 6. Error Handling

```typescript
try {
  const result = await sendSponsoredCalls(smartAccount, calls);
  // Extract ID from v2 response
  const txId = result.id;
  
  // Poll for status
  let status;
  do {
    status = await getCallsStatus(txId);
    if (status.status === 200) break; // Success
    if (status.status >= 400) throw new Error(`Transaction failed: ${status.status}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (status.status < 200);
  
} catch (error) {
  if (error.code === 4200) {
    // Wallet doesn't support EIP-5792
    console.error('Wallet does not support wallet_sendCalls');
    // Fallback to direct transactions (requires ETH)
  } else if (error.code === -32000) {
    // Sponsorship failed
    console.error('Transaction sponsorship failed');
  }
}
```

### 6.1 Batch Pattern (Canonical Approach)

**Always prefer batching operations** to minimize user interactions and leverage atomic execution:

```typescript
// PREFERRED: Single atomic batch
const batchResult = await sendSponsoredCalls(smartAccount, [
  encodeERC20Call(usdcAddress, 'approve', [spender, amount]),
  { to: contractAddress, data: businessLogicCalldata }
]);

// AVOID: Multiple separate calls
// const approve = await sendSponsoredCalls(smartAccount, [approveCall]);
// const business = await sendSponsoredCalls(smartAccount, [businessCall]);
```

This pattern is the core value proposition of EIP-5792 - atomic multi-call execution.

### 7. Testing Strategy

#### Unit Tests
- Mock provider responses
- Test call encoding
- Verify EIP-5792 request format

#### Integration Tests (Node.js)
- Use mock wallet provider
- Simulate sponsored responses
- Test full transaction flow

#### E2E Tests (Browser)
- Real Coinbase Smart Wallet
- Actual Base Sepolia network
- Verify zero ETH usage

### 8. Key Requirements

#### MUST Have
- Smart account address as `from` (not EOA)
- Chain ID = 0x14a34 (Base Sepolia)
- Version = "2.0.0" for EIP-5792 v2
- Capabilities object (not atomicRequired)

#### MUST NOT Have
- ETH in EOA for gas
- Direct `execute()` calls
- CDP configuration (on testnet)
- Paymaster setup (on testnet)

### 9. Verification Checklist

- [ ] EOA has 0 ETH at start
- [ ] EOA still has 0 ETH after all operations
- [ ] Smart account address !== EOA address
- [ ] All transactions succeed
- [ ] `getCallsStatus(id).status` returns 200 (success)
- [ ] Transaction receipts show "Sponsored"
- [ ] No gas costs incurred by user
- [ ] Batch operations complete atomically
- [ ] USDC approve + session creation in single UO
- [ ] Full USDC flow completes without ETH

### 10. Code Organization

```
src/
├── managers/
│   ├── BaseAccountIntegration.ts  (keep for reference)
│   └── BaseAccountWallet.ts       (NEW - EIP-5792)
tests/
└── e2e/
    ├── base-usdc-mvp-flow.test.ts    (original with ETH)
    └── base-usdc-mvp-flow-v2.test.ts (NEW - gasless)
```

## Implementation Timeline

1. **Step 1**: Create BaseAccountWallet.ts with core functionality
2. **Step 2**: Update test to use new wallet implementation
3. **Step 3**: Remove all ETH-related code from v2 test
4. **Step 4**: Run test with 0 ETH to verify gasless
5. **Step 5**: Document results and prepare for mainnet

## Success Criteria

The implementation is successful when:
1. Test runs with EOA having 0 ETH
2. All USDC operations complete successfully
3. Transaction logs show sponsorship active
4. No gas fees paid by user
5. Code is ready for mainnet paymaster integration