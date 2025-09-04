# Fresh Test Environment Deployment Guide

## Overview

When testing on testnet, you may want to deploy fresh contract instances to get a clean state with:
- Job IDs starting from 1
- No existing jobs from previous tests
- Clean earnings balances
- Predictable test conditions

This guide explains how to deploy a fresh test environment while reusing existing infrastructure contracts.

## Quick Start

### Method 1: Bash Script (Recommended)
```bash
# From project root
./scripts/deploy-fresh-test.sh
```

### Method 2: Forge Script
```bash
forge script script/DeployFreshTestEnv.s.sol:DeployFreshTestEnv \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify
```

### Method 3: JavaScript
```bash
node scripts/deploy-fresh-test.js
```

## What Gets Deployed

### New Contracts (Fresh Instances)
- **JobMarketplaceFABWithS5** - Fresh job counter starting from 1
  - **USDC Payment Settlement Working** (as of Jan 4, 2025):
    - Verified 90% host / 10% treasury distribution
    - Fixed ProofSystem internal verification
    - Proper job struct storage for token payments
    - Moves token transfers after validations to save gas
    - Contract size optimized to 24,564 bytes (under limit)
  - **Fixed Payment Distribution** (as of Dec 2, 2024):
    - Uses `call{value:}()` instead of `transfer()` for reliable ETH payments
    - Includes `emergencyWithdraw()` function for stuck funds recovery
  - **Economic Minimums Enforced:**
    - MIN_DEPOSIT: 0.0002 ETH (prevents spam)
    - MIN_PROVEN_TOKENS: 100 (ensures meaningful work)
    - Token minimums: 800000 for USDC (0.80 USDC)
- **PaymentEscrowWithEarnings** - Payment distribution with earnings
- **HostEarnings** - Host earnings accumulation
- **ProofSystem** - Clean proof verification state

### Reused Contracts (Existing)
- **NodeRegistry** (`0x87516C13Ea2f99de598665e14cab64E191A0f8c4`) - Keep existing host registrations
- **FAB Token** (`0xC78949004B4EB6dEf2D66e49Cd81231472612D62`) - Same token contract
- **USDC** (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) - Same stablecoin
- **Treasury Address** (`0x4e770e723B95A0d8923Db006E49A8a3cb0BAA078`) - Same fee recipient

### Note on Architecture
The JobMarketplaceFABWithS5 contract uses a **hybrid payment model**:
- **Session Jobs**: Direct, self-contained payments (gas-efficient)
- **Legacy Jobs**: May reference external contracts if needed
- This reduces gas costs by ~30% for session job payments

## Prerequisites

### 1. Environment Setup
Create a `.env` file with:
```env
PRIVATE_KEY=your_private_key_here
RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
```

### 2. Balance Requirements
- Minimum 0.01 ETH for deployment gas costs
- No FAB or USDC needed (using existing tokens)

### 3. Build Contracts
```bash
forge build
```

## Deployment Process

### Step 1: Run Deployment

Using the bash script:
```bash
./scripts/deploy-fresh-test.sh
```

The script will:
1. Deploy new contract instances
2. Configure all relationships
3. Save addresses to `deployments/test-env-latest.json`
4. Create timestamped backup
5. Display addresses for client update

### Step 2: Update Your Client

After deployment, update your client app with the new addresses:

#### JavaScript/TypeScript
```javascript
// Update your config file or environment
const contracts = {
  marketplace: "0xD937c594682Fe74E6e3d06239719805C04BE804A", // USDC payments verified
  proofSystem: "0x2ACcc60893872A499700908889B38C5420CBcFD1", // Fixed internal verification
  paymentEscrow: "0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C", // Not used for sessions
  hostEarnings: "0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E", // Not used for sessions
  nodeRegistry: "0x87516C13Ea2f99de598665e14cab64E191A0f8c4", // Same
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" // Same
};
```

#### Environment Variables
```bash
export JOB_MARKETPLACE_FAB="0xD937c594682Fe74E6e3d06239719805C04BE804A" # USDC working
export PROOF_SYSTEM="0x2ACcc60893872A499700908889B38C5420CBcFD1" # Fixed
export PAYMENT_ESCROW="0x7abC91AF9E5aaFdc954Ec7a02238d0796Bbf9a3C"
export HOST_EARNINGS="0xcbD91249cC8A7634a88d437Eaa083496C459Ef4E"
export PROOF_SYSTEM="0xE7dfB24117a525fCEA51718B1D867a2D779A7Bb9"
```

### Step 3: Verify Deployment

Test the fresh environment:
```javascript
// Job IDs now start from 1
const firstJobId = 1; // Not 47 or whatever it was before

// No existing jobs
const job = await marketplace.getJob(0);
// Returns zero values (empty job)

// Clean earnings
const earnings = await hostEarnings.getBalance(hostAddress, USDC);
// Returns 0
```

## Output Files

The deployment creates:
- `deployments/test-env-latest.json` - Latest deployment addresses
- `deployments/test-env-YYYYMMDD_HHMMSS.json` - Timestamped backup

Example output:
```json
{
  "marketplace": "0x...",
  "proofSystem": "0x...",
  "treasury": "0x...",
  "nodeRegistry": "0x87516C13Ea2f99de598665e14cab64E191A0f8c4",
  "fab": "0xC78949004B4EB6dEf2D66e49Cd81231472612D62",
  "usdc": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "deployer": "0x...",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "network": "base-sepolia",
  "chainId": 84532
}
```

## Integration with Test Suites

### Automated Testing
```javascript
const { deployFreshTestEnvironment } = require('./scripts/deploy-fresh-test.js');

describe('Job Marketplace Tests', () => {
  let contracts;
  
  before(async () => {
    // Deploy fresh environment for tests
    contracts = await deployFreshTestEnvironment();
  });
  
  it('should start with job ID 1', async () => {
    // Your tests with clean state
  });
});
```

### CI/CD Pipeline
```yaml
# .github/workflows/test.yml
test:
  steps:
    - name: Deploy Test Environment
      run: ./scripts/deploy-fresh-test.sh
    
    - name: Run Tests
      run: npm test
      env:
        USE_FRESH_CONTRACTS: true
```

## Benefits of Fresh Deployment

### 1. **Predictable State**
- Job IDs always start from 1
- No leftover test data
- Clean earnings balances

### 2. **Isolated Testing**
- Your tests don't interfere with others
- No conflicts with parallel testing
- Can test edge cases safely

### 3. **Easy Reset**
- Just redeploy for a clean slate
- No manual cleanup needed
- Fast iteration during development

### 4. **Cost Effective**
- Testnet deployment is free (just gas)
- Reuses existing token contracts
- Keeps host registrations intact

## Troubleshooting

### Deployment Fails
```
Error: insufficient funds for gas
```
**Solution**: Add more testnet ETH to your deployer account

### Contract Not Verified
```
Error: contract verification failed
```
**Solution**: Ensure Etherscan API key is set if using `--verify` flag

### Address Not Updated in Client
```
Error: Job does not exist
```
**Solution**: Make sure you updated client with new contract addresses

### Can't Find Compiled Contracts
```
Error: artifacts not found
```
**Solution**: Run `forge build` before deployment

## Best Practices

1. **Keep Track of Deployments**
   - Save deployment addresses for reference
   - Use timestamped backups
   - Document which addresses are for which test

2. **Automate Client Updates**
   ```javascript
   // Load addresses dynamically
   const addresses = require('./deployments/test-env-latest.json');
   ```

3. **Use for Development Only**
   - Fresh deployments are for testing
   - Production should use stable addresses
   - Don't deploy fresh contracts on mainnet

4. **Clean Up Old Deployments**
   - Remove old test files periodically
   - Keep only recent deployments
   - Document active test environments

## Summary

Fresh test deployments give you:
- ✅ Clean state for testing
- ✅ Predictable job IDs (starting from 1)
- ✅ No interference from previous tests
- ✅ Easy reset between test runs
- ✅ Maintained host registrations
- ✅ Same token contracts

Perfect for development and testing workflows!