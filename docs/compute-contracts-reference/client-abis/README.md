# Client ABIs

This directory contains the Application Binary Interfaces (ABIs) for client integration.

## Updated Contracts (with Economic Minimums)

### JobMarketplaceFABWithS5
- **Address**: 0x9DE1fCABb9e3E903229B47bA737B23fc473173A1
- **Network**: Base Sepolia
- **Key Features**:
  - MIN_DEPOSIT: 0.0002 ETH (~$0.80)
  - MIN_PROVEN_TOKENS: 100 tokens minimum
  - Token-specific minimums via mapping (800000 for USDC)
  - Session jobs with direct payments
  - EZKL proof verification integration

### ProofSystem
- **Address**: 0x02868C63A9F2740311fb04a0e4093D47975f09ca
- **Network**: Base Sepolia
- **Purpose**: EZKL proof verification for trustless AI inference

### NodeRegistryFAB
- **Address**: 0x87516C13Ea2f99de598665e14cab64E191A0f8c4
- **Network**: Base Sepolia
- **Stake Required**: 1000 FAB tokens

### HostEarnings
- **Purpose**: Tracks accumulated earnings for hosts (legacy support)

### PaymentEscrowWithEarnings
- **Purpose**: Legacy payment escrow for single-prompt jobs

## Usage Example

```javascript
import JobMarketplaceABI from './JobMarketplaceFABWithS5-CLIENT-ABI.json';
import ProofSystemABI from './ProofSystem-CLIENT-ABI.json';
import { ethers } from 'ethers';

// Initialize provider
const provider = new ethers.providers.JsonRpcProvider('https://base-sepolia.g.alchemy.com/v2/YOUR_KEY');

// Create contract instances
const marketplace = new ethers.Contract(
  '0x9DE1fCABb9e3E903229B47bA737B23fc473173A1',
  JobMarketplaceABI,
  provider
);

// Check economic minimums
const minDeposit = await marketplace.MIN_DEPOSIT(); // 0.0002 ETH
const minTokens = await marketplace.MIN_PROVEN_TOKENS(); // 100

// Create session job (with signer)
const signer = provider.getSigner();
const marketplaceWithSigner = marketplace.connect(signer);

await marketplaceWithSigner.createSessionJob(
  hostAddress,
  ethers.utils.parseEther("0.001"), // deposit
  ethers.utils.parseUnits("1", "gwei"), // price per token
  3600, // max duration (1 hour)
  300, // proof interval
  { value: ethers.utils.parseEther("0.001") }
);
```

## Session Job Functions

Key functions for session jobs:
- `createSessionJob()` - Create ETH-based session
- `createSessionJobWithToken()` - Create token-based session
- `submitProofOfWork()` - Submit proof with minimum 100 tokens
- `completeSessionJob()` - Complete and settle payments
- `triggerSessionTimeout()` - Handle timeout scenarios

## Constants

- `MIN_DEPOSIT`: 200000000000000 wei (0.0002 ETH)
- `MIN_PROVEN_TOKENS`: 100
- `TREASURY_FEE_PERCENT`: 10
- `MIN_SESSION_DURATION`: 600 seconds
- `ABANDONMENT_TIMEOUT`: 86400 seconds (24 hours)

## Last Updated
December 2024 - With economic minimums implementation for Base L2