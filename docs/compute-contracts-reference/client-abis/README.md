# Client ABIs

This directory contains the Application Binary Interfaces (ABIs) for client integration.

## Current Deployed Contracts (January 5, 2025)

### JobMarketplaceFABWithS5
- **Address**: 0x55A702Ab5034810F5B9720Fe15f83CFcf914F56b
- **Network**: Base Sepolia
- **Status**: ✅ TREASURY + HOST ACCUMULATION ENABLED
- **Key Features**:
  - Treasury fee accumulation for batch withdrawals (NEW)
  - Host earnings accumulation (70% gas savings)
  - USDC payment settlement with 90% host / 10% treasury distribution
  - ETH and USDC payment support fully functional
  - Direct payment distribution (no external escrow)
  - Session jobs with proof checkpoints
  - EZKL proof verification integration
  - MIN_DEPOSIT: 0.0002 ETH or 0.80 USDC minimum
  - MIN_PROVEN_TOKENS: 100 tokens minimum
  - Total gas savings: ~80%

### ProofSystem
- **Address**: 0x2ACcc60893872A499700908889B38C5420CBcFD1
- **Network**: Base Sepolia
- **Purpose**: EZKL proof verification for trustless AI inference
- **Fixed**: Internal verification function call for USDC sessions

### PaymentEscrowWithEarnings
- **Address**: 0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C
- **Network**: Base Sepolia
- **Purpose**: Payment distribution with earnings accumulation (not used for session jobs)

### HostEarnings
- **Address**: 0x908962e8c6CE72610021586f85ebDE09aAc97776
- **Network**: Base Sepolia
- **Purpose**: Tracks accumulated earnings for hosts with batch withdrawal support

### NodeRegistryFAB
- **Address**: 0x87516C13Ea2f99de598665e14cab64E191A0f8c4
- **Network**: Base Sepolia
- **Stake Required**: 1000 FAB tokens

## Usage Example

```javascript
import JobMarketplaceABI from './JobMarketplaceFABWithS5-CLIENT-ABI.json';
import PaymentEscrowABI from './PaymentEscrowWithEarnings-CLIENT-ABI.json';
import HostEarningsABI from './HostEarnings-CLIENT-ABI.json';
import { ethers } from 'ethers';

// Initialize provider
const provider = new ethers.providers.JsonRpcProvider('https://base-sepolia.g.alchemy.com/v2/YOUR_KEY');

// Create contract instances
const marketplace = new ethers.Contract(
  '0x55A702Ab5034810F5B9720Fe15f83CFcf914F56b', // Treasury + Host accumulation
  JobMarketplaceABI,
  provider
);

const paymentEscrow = new ethers.Contract(
  '0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C',
  PaymentEscrowABI,
  provider
);

const hostEarnings = new ethers.Contract(
  '0x908962e8c6CE72610021586f85ebDE09aAc97776',
  HostEarningsABI,
  provider
);

// Create USDC session job (with signer)
const signer = provider.getSigner();
const marketplaceWithSigner = marketplace.connect(signer);

// First approve USDC
const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const usdcContract = new ethers.Contract(usdcAddress, ['function approve(address,uint256)'], signer);
await usdcContract.approve(marketplace.address, ethers.utils.parseUnits("10", 6)); // 10 USDC

// Create session with USDC
await marketplaceWithSigner.createSessionJobWithToken(
  usdcAddress,
  hostAddress,
  ethers.utils.parseUnits("10", 6), // 10 USDC deposit
  ethers.utils.parseUnits("0.001", 6), // price per token in USDC
  3600, // max duration (1 hour)
  300 // proof interval
);
```

## Session Job Functions

Key functions for session jobs:
- `createSessionJob()` - Create ETH-based session
- `createSessionJobWithToken()` - Create token-based session
- `submitProofOfWork()` - Submit proof with minimum 100 tokens
- `completeSessionJob()` - Complete and settle payments
- `triggerSessionTimeout()` - Handle timeout scenarios

## Treasury Functions (NEW - January 5, 2025)

For treasury address only:
- `withdrawTreasuryETH()` - Withdraw accumulated ETH fees
- `withdrawTreasuryTokens(address token)` - Withdraw accumulated token fees
- `withdrawAllTreasuryFees(address[] tokens)` - Batch withdraw ETH + multiple tokens
- `accumulatedTreasuryETH()` - View accumulated ETH fees
- `accumulatedTreasuryTokens(address token)` - View accumulated token fees
- `emergencyWithdraw(address token)` - Recover stuck funds (respects accumulation)
  - Pass `address(0)` for ETH
  - Pass token address for ERC20 tokens

## Constants

- `MIN_DEPOSIT`: 200000000000000 wei (0.0002 ETH)
- `MIN_PROVEN_TOKENS`: 100
- `TREASURY_FEE_PERCENT`: 10
- `MIN_SESSION_DURATION`: 600 seconds
- `ABANDONMENT_TIMEOUT`: 86400 seconds (24 hours)

## Last Updated
January 5, 2025 - Treasury accumulation added for maximum gas savings (~80% reduction)