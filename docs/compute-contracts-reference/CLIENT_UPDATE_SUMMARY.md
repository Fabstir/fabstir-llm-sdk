# Client Update Summary - January 14, 2025

## ✅ Updated Files
- `/workspace/client-abis/JobMarketplaceFABWithS5-CLIENT-ABI.json` - Updated with latest ABI from deployed contract

## 🚀 New Contract Deployment

### JobMarketplaceFABWithS5 (Fixed Version)
- **Address**: `0xc5BACFC1d4399c161034bca106657c0e9A528256`
- **Status**: Live on Base Sepolia
- **Deployment Date**: January 14, 2025

### Key Improvements
1. ✅ Proper initialization of `jobs` mapping in session creation functions
2. ✅ USDC payment support with correct minimums (0.8 USDC)
3. ✅ Session completion via `completeSession()` function
4. ✅ Treasury fee accumulation for gas savings
5. ✅ Host earnings accumulation support

## 📝 Client Configuration Update

Update your client application with these contract addresses:

```javascript
const CONTRACTS = {
  // Core Contracts
  jobMarketplace: '0xc5BACFC1d4399c161034bca106657c0e9A528256',  // NEW - Fixed version
  nodeRegistry: '0x039AB5d5e8D5426f9963140202F506A2Ce6988F9',    // Fixed re-registration bug
  hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',    // Accumulation system
  proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',     // Internal verification fixed
  
  // Token Contracts
  usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',       // Base Sepolia USDC
  fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',        // FAB governance token
  
  // Platform
  treasury: '0xbeaBB2a5AEd358aA0bd442dFFd793411519Bdc11',        // Fee recipient
  
  // Network
  chainId: 84532,                                                  // Base Sepolia
  rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY'
};
```

## 🔧 Key Functions for Session Jobs

### Creating Sessions
```javascript
// With USDC
await contract.createSessionJobWithToken(
  hostAddress,      // Registered host
  usdcAddress,      // Token address
  deposit,          // Min 800000 (0.8 USDC)
  pricePerToken,    // Price in token decimals
  maxDuration,      // Seconds
  proofInterval     // Tokens between proofs
);

// With ETH
await contract.createSessionJob(
  hostAddress,
  deposit,          // Min 0.0002 ETH
  pricePerToken,
  maxDuration,
  proofInterval,
  { value: deposit }
);
```

### Completing Sessions
```javascript
// Host marks session complete
await contract.completeSession(jobId);

// Renter finalizes with payment
await contract.completeSessionJob(jobId);

// Host claims with proof
await contract.claimWithProof(jobId);
```

### Submitting Proofs
```javascript
await contract.submitProofOfWork(
  jobId,
  proofBytes,
  tokenCount
);
```

## ⚠️ Important Notes

1. **Session Job Flow**: Create → Submit Proofs (optional) → Complete → Payment
2. **Minimum Deposits**: 
   - ETH: 0.0002 ETH (200000000000000 wei)
   - USDC: 0.8 USDC (800000 with 6 decimals)
3. **Registry Requirement**: Hosts must be registered in NodeRegistry with 1000 FAB staked
4. **No PaymentEscrow**: Session jobs use direct payments, not escrow

## 📄 ABI Location
The updated ABI is available at:
`/workspace/client-abis/JobMarketplaceFABWithS5-CLIENT-ABI.json`

This file contains the complete ABI with all session job functions, events, and error types needed for client integration.