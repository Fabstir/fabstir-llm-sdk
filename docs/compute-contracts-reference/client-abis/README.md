# Client ABIs

This directory contains the Application Binary Interfaces (ABIs) for client integration.

## Updated Contracts (Fixed USDC Validation - January 2, 2025)

### JobMarketplaceFABWithS5
- **Address**: 0xC6E3B618E2901b1b2c1beEB4E2BB86fc87d48D2d
- **Network**: Base Sepolia
- **Key Features**:
  - **FIXED**: USDC session validation with host registration checks
  - **FIXED**: Payment distribution using `call{value:}()` instead of `transfer()`
  - **OPTIMIZED**: Contract size reduced to 24,564 bytes (under limit)
  - MIN_DEPOSIT: 0.0002 ETH (~$0.80)
  - MIN_PROVEN_TOKENS: 100 tokens minimum
  - Token-specific minimums via mapping (800000 for USDC)
  - Session jobs with earnings accumulation
  - EZKL proof verification integration

### PaymentEscrowWithEarnings
- **Address**: 0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C
- **Network**: Base Sepolia
- **Purpose**: Payment distribution with earnings accumulation

### HostEarnings
- **Address**: 0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E
- **Network**: Base Sepolia
- **Purpose**: Tracks accumulated earnings for hosts

### ProofSystem
- **Address**: 0xE7dfB24117a525fCEA51718B1D867a2D779A7Bb9
- **Network**: Base Sepolia
- **Purpose**: EZKL proof verification for trustless AI inference

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
  '0xC6E3B618E2901b1b2c1beEB4E2BB86fc87d48D2d', // Fixed USDC validation
  JobMarketplaceABI,
  provider
);

const paymentEscrow = new ethers.Contract(
  '0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C',
  PaymentEscrowABI,
  provider
);

const hostEarnings = new ethers.Contract(
  '0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E',
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

## Emergency Functions (NEW)

For treasury address only:
- `emergencyWithdraw(address token)` - Recover stuck funds
  - Pass `address(0)` for ETH
  - Pass token address for ERC20 tokens

## Constants

- `MIN_DEPOSIT`: 200000000000000 wei (0.0002 ETH)
- `MIN_PROVEN_TOKENS`: 100
- `TREASURY_FEE_PERCENT`: 10
- `MIN_SESSION_DURATION`: 600 seconds
- `ABANDONMENT_TIMEOUT`: 86400 seconds (24 hours)

## Last Updated
January 2, 2025 - Fixed USDC session validation and contract size optimization