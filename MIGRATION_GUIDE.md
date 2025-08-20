# Fabstir SDK Headless Architecture Migration Guide

## Sub-phase 2.13: Critical Architecture Fix

This guide explains the migration from the old dual-architecture SDK to the new headless SDK that fixes the context isolation issue.

## Problem Solved

The SDK previously had a dual-architecture problem:
- It accepted signer/provider in SDKConfig
- BUT also created its own Web3 provider internally
- This caused context isolation preventing access to the user's wallet
- Result: "WagmiProviderNotFoundError" in fabstir-llm-ui

## Solution: Headless SDK Architecture

The new `FabstirSDKHeadless` class:
- NO internal provider creation
- Accepts signer from external source via `setSigner()`
- Works in Node.js without browser dependencies
- Optional React adapter for convenience

## Migration Steps

### 1. Update Import

**Old:**
```typescript
import { FabstirSDK } from '@fabstir/llm-sdk';
// or
import { FabstirLLMSDK } from '@fabstir/llm-sdk';
```

**New:**
```typescript
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';
```

### 2. SDK Initialization

**Old (Broken):**
```typescript
// SDK creates its own provider - causes context isolation
const provider = new ethers.providers.Web3Provider(window.ethereum);
const sdk = new FabstirSDK(config);
await sdk.connect(provider);
```

**New (Working):**
```typescript
// Option 1: Provide signer explicitly
const sdk = new FabstirSDKHeadless(config);
const signer = provider.getSigner();
await sdk.setSigner(signer);

// Option 2: Update signer when wallet changes
sdk.updateSigner(newSigner);
```

### 3. For React Applications

**Using wagmi/viem directly:**
```typescript
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';
import { useWalletClient } from 'wagmi';
import { ethers } from 'ethers';

function MyComponent() {
  const { data: walletClient } = useWalletClient();
  const [sdk, setSdk] = useState(null);
  
  useEffect(() => {
    if (!walletClient) return;
    
    // Convert wagmi client to ethers signer
    const provider = new ethers.providers.Web3Provider(walletClient);
    const signer = provider.getSigner();
    
    const sdkInstance = new FabstirSDKHeadless(config);
    sdkInstance.setSigner(signer).then(() => {
      setSdk(sdkInstance);
    });
  }, [walletClient]);
  
  // Use sdk...
}
```

**Using the React adapter (convenience):**
```typescript
import { useSDK } from '@fabstir/llm-sdk/adapters/react';

function MyComponent() {
  const { sdk, isConnected, error } = useSDK({
    walletClient,  // From wagmi
    network: 'base-sepolia',
    mode: 'production'
  });
  
  // SDK automatically updates when wallet changes
  if (!isConnected) return <div>Connect wallet...</div>;
  
  // Use sdk...
}
```

### 4. Contract Operations

**Old:**
```typescript
// Signer was internal to SDK
await sdk.postJobWithToken(jobDetails, requirements, token, amount);
```

**New:**
```typescript
// Option 1: Use SDK's current signer
await sdk.postJobWithToken(jobDetails, requirements, token, amount);

// Option 2: Override with specific signer
await sdk.postJobWithToken(jobDetails, requirements, token, amount, customSigner);
```

### 5. P2P Operations (No Changes)

P2P operations don't require a signer:
```typescript
// Works without setSigner()
const nodes = await sdk.discoverNodes({ modelId: 'gpt-4' });
```

## Key Differences

| Feature | Old SDK | Headless SDK |
|---------|---------|--------------|
| Provider Creation | Internal (causes issues) | External only |
| React Dependency | Mixed into core | Optional adapter |
| Signer Management | Hidden/automatic | Explicit control |
| Node.js Support | Limited | Full support |
| Wallet Switching | Problematic | Clean via setSigner() |
| Context Isolation | Yes (bug) | No (fixed) |

## Mock Mode

Mock mode works without any signer:
```typescript
const sdk = new FabstirSDKHeadless({ mode: 'mock' });
// No setSigner() needed for mock operations
await sdk.postJobWithToken(...);  // Returns mock transaction
```

## Error Handling

The SDK now provides clear errors:
```typescript
try {
  await sdk.postJobWithToken(...);
} catch (error) {
  if (error.code === ErrorCode.CONNECTION_ERROR) {
    // No signer available - call setSigner() first
  }
}
```

## Compatibility

- ✅ Works with wagmi v2+
- ✅ Works with ethers v5+
- ✅ Works with viem
- ✅ Works in Node.js
- ✅ Works in browsers
- ✅ Works with MetaMask
- ✅ Works with WalletConnect

## Benefits of New Architecture

1. **No Context Isolation**: SDK uses YOUR wallet connection
2. **Framework Agnostic**: Works with any wallet library
3. **Better Testing**: Can mock signers easily
4. **Server-Side Ready**: Works in Node.js for backend operations
5. **Cleaner Separation**: Business logic separate from UI concerns
6. **Dynamic Updates**: Can switch wallets/signers at runtime

## Example: Complete Flow

```typescript
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

// 1. Create SDK instance
const sdk = new FabstirSDKHeadless({
  network: 'base-sepolia',
  mode: 'production',
  contractAddresses: {
    jobMarketplace: '0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  }
});

// 2. Set signer when wallet connects
async function connectWallet() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  await sdk.setSigner(signer);
  console.log('Connected:', await signer.getAddress());
}

// 3. Submit job with USDC
async function submitJob() {
  // Check and approve USDC
  const amount = ethers.utils.parseUnits('10', 6);
  const allowance = await sdk.checkUSDCAllowance(userAddress);
  
  if (allowance < amount) {
    await sdk.approveUSDC(amount);
  }
  
  // Submit job
  const tx = await sdk.postJobWithToken(
    {
      requester: userAddress,
      model: 'gpt-4',
      prompt: 'Hello world',
      offerPrice: amount,
      maxTokens: 100n,
      seed: 0n
    },
    { trustedExecution: false },
    USDC_ADDRESS,
    amount
  );
  
  await tx.wait();
  console.log('Job submitted!');
}

// 4. Handle wallet changes
window.ethereum.on('accountsChanged', async () => {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  await sdk.updateSigner(signer);
});
```

## Troubleshooting

**Error: "No signer available"**
- Solution: Call `sdk.setSigner(signer)` before contract operations

**Error: "Wrong network"**
- Solution: Ensure signer is connected to Base Sepolia (chain ID 84532)

**Error: "Cannot find module 'react'"**
- Solution: You're importing from `/adapters/react` without React installed
- Use core SDK instead: `import { FabstirSDKHeadless } from '@fabstir/llm-sdk'`

## Summary

The headless SDK architecture fix enables:
- ✅ Proper wallet integration in fabstir-llm-ui
- ✅ No more WagmiProviderNotFoundError
- ✅ Clean separation of concerns
- ✅ Better developer experience
- ✅ Full backward compatibility via adapters