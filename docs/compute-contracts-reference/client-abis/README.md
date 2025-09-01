# Client ABI Files

This directory contains minimal ABI files for client applications to interact with the Fabstir smart contracts on Base Sepolia.

## Current Contract Addresses (Session Jobs Enabled)

```javascript
const contractAddresses = {
  // Core contracts - SESSION JOBS ENABLED
  jobMarketplace: "0x445882e14b22E921c7d4Fe32a7736a32197578AF", // ✅ CURRENT with session jobs
  proofSystem: "0x707B775933C4C4c89894EC516edad83b2De77A05",    // EZKL proof verification
  nodeRegistry: "0x87516C13Ea2f99de598665e14cab64E191A0f8c4",    // Node registration
  treasury: "0xbeaBB2a5AEd358aA0bd442dFFd793411519Bdc11",        // Platform fees
  
  // Tokens
  fabToken: "0xC78949004B4EB6dEf2D66e49Cd81231472612D62",        // Governance/staking
  usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",       // Base Sepolia USDC
  
  // DEPRECATED - Not used for session jobs
  // paymentEscrow: "0xa4C5599Ea3617060ce86Ff0916409e1fb4a0d2c6", // OLD - not needed
  // hostEarnings: "0xbFfCd6BAaCCa205d471bC52Bd37e1957B1A43d4a",  // OLD - not needed
}
```

## Available ABIs

### Current (Session Jobs Enabled)
- **JobMarketplaceFABWithS5-CLIENT-ABI.json** - Session jobs and single-prompt jobs with direct payments
- **ProofSystem-CLIENT-ABI.json** - EZKL proof verification for AI model outputs
- **NodeRegistryFAB-CLIENT-ABI.json** - Node registration and management

### Legacy (Not used for session jobs)
- **PaymentEscrowWithEarnings-CLIENT-ABI.json** - OLD: External escrow (session jobs use direct payments)
- **HostEarnings-CLIENT-ABI.json** - OLD: Earnings accumulation (session jobs transfer directly)
- **PaymentSplitter-CLIENT-ABI.json** - Utility contract for payment splitting

## Usage Example

```javascript
import { ethers } from 'ethers';
import JobMarketplaceABI from './JobMarketplaceFABWithS5-CLIENT-ABI.json';
import ProofSystemABI from './ProofSystem-CLIENT-ABI.json';
import NodeRegistryABI from './NodeRegistryFAB-CLIENT-ABI.json';

// Initialize provider (use Alchemy for better reliability)
const provider = new ethers.JsonRpcProvider('https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY');
const signer = provider.getSigner();

const contracts = {
  jobMarketplace: new ethers.Contract(
    contractAddresses.jobMarketplace,
    JobMarketplaceABI,
    signer
  ),
  proofSystem: new ethers.Contract(
    contractAddresses.proofSystem,
    ProofSystemABI,
    signer
  ),
  nodeRegistry: new ethers.Contract(
    contractAddresses.nodeRegistry,
    NodeRegistryABI,
    signer
  )
};
```

## Key Functions

### JobMarketplace (Session Jobs)
- `createSessionJob()` - Create a continuous AI inference session with ETH
- `createSessionJobWithToken()` - Create session with USDC or other tokens
- `submitProofOfWork()` - Submit EZKL proof at checkpoint intervals
- `completeSessionJob()` - User completes satisfied session
- `claimWithProof()` - Host claims payment based on proofs
- `triggerSessionTimeout()` - Handle expired sessions
- `claimAbandonedSession()` - Host claims after user abandonment

### JobMarketplace (Legacy Single-Prompt)
- `postJobWithToken()` - Post a single-prompt job with S5 CID
- `claimJob()` - Host claims a job
- `completeJob()` - Complete job with S5 CID for response
- `getJob()` - Get job details including CIDs

### ProofSystem
- `verifyProof()` - Verify EZKL proof for AI output
- `verifyAndMarkComplete()` - Verify and record proof completion
- `isProofVerified()` - Check if proof was verified

### NodeRegistry
- `registerNode()` - Register as a host with FAB stake
- `unregisterNode()` - Unregister and withdraw stake
- `isHostActive()` - Check if host is active
- `getNodeInfo()` - Get host details

## Notes

### Session Jobs (Recommended)
- **85-95% reduction** in transaction costs vs per-prompt model
- Checkpoint-based proof system (proofs every N tokens, not per prompt)
- Direct payments without external escrow contracts
- Automatic refunds for unused deposits
- Protection against abandonment with timeout mechanisms

### General
- Treasury receives 10% platform fee (1000 basis points)
- Minimum stake for node registration: 1000 FAB tokens
- S5 CID storage used for single-prompt jobs
- Session jobs handle prompts/responses off-chain

### Migration from Old Contracts
If upgrading from the old contracts (0x7ce861CC... JobMarketplace):
1. Use the new JobMarketplace at 0x445882e14b22E921c7d4Fe32a7736a32197578AF
2. Session jobs don't need PaymentEscrow or HostEarnings contracts
3. Use `createSessionJob()` for continuous AI inference
4. See [docs/SESSION_JOBS.md](../docs/SESSION_JOBS.md) for details