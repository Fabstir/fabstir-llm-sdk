# Client ABIs

This directory contains the Application Binary Interfaces (ABIs) for client integration.

## Current Deployed Contracts (January 12, 2025)

### JobMarketplaceFABWithS5Deploy
- **Address**: 0x3B632813c3e31D94Fd552b4aE387DD321eec67Ba
- **Previous**: 0x55A702Ab5034810F5B9720Fe15f83CFcf914F56b
- **Network**: Base Sepolia
- **Status**: ✅ API DISCOVERY COMPATIBLE + TREASURY ACCUMULATION
- **Key Features**:
  - Compatible with 5-field Node struct from updated NodeRegistry (NEW)
  - User refunds fixed for session jobs
  - Treasury fee accumulation for batch withdrawals
  - Host earnings accumulation (70% gas savings)
  - USDC payment settlement with 97.5% host / 2.5% treasury distribution
  - ETH and USDC payment support fully functional
  - Direct payment distribution (no external escrow)
  - Session jobs with proof checkpoints
  - EZKL proof verification integration
  - MIN_DEPOSIT: 0.0002 ETH or 0.80 USDC minimum
  - MIN_PROVEN_TOKENS: 100 tokens minimum
  - Total gas savings: ~80%

### NodeRegistryFAB (with API Discovery)
- **Address**: 0x2B745E45818e1dE570f253259dc46b91A82E3204
- **Previous**: 0x87516C13Ea2f99de598665e14cab64E191A0f8c4
- **Network**: Base Sepolia
- **Status**: ✅ API ENDPOINT DISCOVERY ENABLED
- **Stake Required**: 1000 FAB tokens
- **New Features**:
  - API endpoint discovery for automatic host URL resolution
  - `registerNodeWithUrl()` - Register with API endpoint
  - `updateApiUrl()` - Update host's API endpoint
  - `getNodeApiUrl()` - Get host's API URL
  - `getNodeFullInfo()` - Get all host info including API URL

### ProofSystem
- **Address**: 0x2ACcc60893872A499700908889B38C5420CBcFD1
- **Network**: Base Sepolia
- **Purpose**: EZKL proof verification for trustless AI inference
- **Fixed**: Internal verification function call for USDC sessions
- **Requirement**: Minimum 64-byte proofs

### HostEarnings
- **Address**: 0x908962e8c6CE72610021586f85ebDE09aAc97776
- **Network**: Base Sepolia
- **Purpose**: Tracks accumulated earnings for hosts with batch withdrawal support
- **Authorized Marketplace**: 0x3B632813c3e31D94Fd552b4aE387DD321eec67Ba

## API Discovery Usage (NEW)

```javascript
import NodeRegistryABI from './NodeRegistryFAB-CLIENT-ABI.json';
import { ethers } from 'ethers';

const provider = new ethers.providers.JsonRpcProvider('https://base-sepolia.g.alchemy.com/v2/YOUR_KEY');
const nodeRegistry = new ethers.Contract(
  '0x2B745E45818e1dE570f253259dc46b91A82E3204',
  NodeRegistryABI,
  provider
);

// For hosts - register with API URL
const signer = provider.getSigner();
const registryWithSigner = nodeRegistry.connect(signer);
await registryWithSigner.registerNodeWithUrl(
  'llama-2-7b,gpt-4,inference',
  'http://your-host.com:8080'
);

// For hosts - update API URL
await registryWithSigner.updateApiUrl('https://new-host.com:8443');

// For clients - discover host endpoints
const apiUrl = await nodeRegistry.getNodeApiUrl(hostAddress);
console.log(`Host API endpoint: ${apiUrl}`);

// Get full host information
const [operator, stakedAmount, active, metadata, apiUrl] = await nodeRegistry.getNodeFullInfo(hostAddress);
```

## Usage Example

```javascript
import JobMarketplaceABI from './JobMarketplaceFABWithS5Deploy-CLIENT-ABI.json';
import NodeRegistryABI from './NodeRegistryFAB-CLIENT-ABI.json';
import HostEarningsABI from './HostEarnings-CLIENT-ABI.json';
import { ethers } from 'ethers';

// Initialize provider
const provider = new ethers.providers.JsonRpcProvider('https://base-sepolia.g.alchemy.com/v2/YOUR_KEY');

// Create contract instances
const marketplace = new ethers.Contract(
  '0x3B632813c3e31D94Fd552b4aE387DD321eec67Ba', // NEW deployment with API discovery
  JobMarketplaceABI,
  provider
);

const nodeRegistry = new ethers.Contract(
  '0x2B745E45818e1dE570f253259dc46b91A82E3204', // NEW with API discovery
  NodeRegistryABI,
  provider
);

const hostEarnings = new ethers.Contract(
  '0x908962e8c6CE72610021586f85ebDE09aAc97776',
  HostEarningsABI,
  provider
);

// Discover host API endpoint
const hostApiUrl = await nodeRegistry.getNodeApiUrl(hostAddress);
if (!hostApiUrl) {
  throw new Error('Host has not set API URL');
}

// Create USDC session job (with signer)
const signer = provider.getSigner();
const marketplaceWithSigner = marketplace.connect(signer);

// First approve USDC
const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const usdcContract = new ethers.Contract(usdcAddress, ['function approve(address,uint256)'], signer);
await usdcContract.approve(marketplace.address, ethers.utils.parseUnits("10", 6)); // 10 USDC

// Create session with USDC
await marketplaceWithSigner.createSessionJobWithToken(
  hostAddress,
  usdcAddress,
  ethers.utils.parseUnits("10", 6), // 10 USDC deposit
  ethers.utils.parseUnits("0.001", 6), // price per token in USDC
  3600, // max duration (1 hour)
  300 // proof interval
);

// Now connect to host using discovered API URL
const response = await fetch(`${hostApiUrl}/api/v1/inference`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'llama-2-7b',
    prompt: 'Hello, world!',
    jobId: jobId
  })
});
```

## Session Job Functions

Key functions for session jobs:
- `createSessionJob()` - Create ETH-based session
- `createSessionJobWithToken()` - Create token-based session
- `submitProofOfWork()` - Submit proof with minimum 100 tokens
- `completeSessionJob()` - Complete and settle payments
- `triggerSessionTimeout()` - Handle timeout scenarios

## Treasury Functions

For treasury address only:
- `withdrawTreasuryETH()` - Withdraw accumulated ETH fees
- `withdrawTreasuryTokens(address token)` - Withdraw accumulated token fees
- `withdrawAllTreasuryFees(address[] tokens)` - Batch withdraw ETH + multiple tokens
- `accumulatedTreasuryETH()` - View accumulated ETH fees
- `accumulatedTreasuryTokens(address token)` - View accumulated token fees

## Constants

- `MIN_DEPOSIT`: 200000000000000 wei (0.0002 ETH)
- `MIN_PROVEN_TOKENS`: 100
- `TREASURY_FEE_PERCENT`: 2.5
- `MIN_SESSION_DURATION`: 1 hour
- `ABANDONMENT_TIMEOUT`: 24 hours
- `DISPUTE_WINDOW`: 1 hour

## Migration Notes

### Breaking Changes
- NodeRegistry `nodes()` now returns 5 fields instead of 4 (added `apiUrl`)
- JobMarketplace contracts must handle the 5-field struct

### For Existing Hosts
If you're already registered, add your API URL:
```javascript
await nodeRegistry.updateApiUrl('http://your-host.com:8080');
```

### For SDK Developers
Update contract addresses and use the new discovery functions:
```javascript
const NODE_REGISTRY = '0x2B745E45818e1dE570f253259dc46b91A82E3204';
const JOB_MARKETPLACE = '0x3B632813c3e31D94Fd552b4aE387DD321eec67Ba';
```

## Last Updated
January 12, 2025 - API endpoint discovery added for automatic host URL resolution