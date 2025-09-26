# Session Job Completion Guide

## Current Contract Information

- **JobMarketplaceWithModels**: `0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944`
- **NodeRegistryWithModels**: `0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218`
- **ProofSystem**: `0x2ACcc60893872A499700908889B38C5420CBcFD1`
- **HostEarnings**: `0x908962e8c6CE72610021586f85ebDE09aAc97776`
- **Network**: Base Sepolia

## Key Architecture Points

### 1. Method Naming Confusion
- ❌ **WRONG**: `getSessionJob()` - This method does NOT exist
- ❌ **WRONG**: `sessions(jobId)` - Old mapping name
- ✅ **CORRECT**: Use `sessionJobs(jobId)` public mapping to read session data

### 2. Current Contract Architecture
The deployed contract at `0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944` (JobMarketplaceWithModels) uses session-based architecture:
- Session jobs stored in `sessionJobs` mapping
- Legacy `jobs` mapping exists but not used for sessions
- All session operations work through dedicated session functions

### 3. Correct Completion Flow

## Session Completion Methods

### Method 1: Host Claims With Proof (When Proofs Submitted)
```javascript
// For sessions where proofs have been submitted
// Host gets paid based on proven tokens
await marketplace.claimWithProof(jobId);
```

**Requirements**:
- Must be called by the assigned host
- Session must be active
- Proven tokens must be > 0

**What happens**:
- Calculates payment: `provenTokens * pricePerToken`
- Deducts TREASURY_FEE_PERCENTAGE treasury fee (configurable via env)
- Sends payment to host (via HostEarnings or direct)
- Marks session as completed
- Refunds unused deposit to renter

### Method 2: Standard Completion (No Proofs)
```javascript
// Step 1: Host marks session complete (no payment yet)
await marketplace.completeSession(jobId);

// Step 2: Renter finalizes and triggers payment
await marketplace.completeSessionJob(jobId);
```

**Requirements for completeSession()**:
- Must be called by assigned host
- Session must be active
- Simply changes status to Completed

**Requirements for completeSessionJob()**:
- Must be called by renter (job creator)
- Session must be active
- Triggers payment calculation and distribution

### Method 3: Timeout/Abandonment
```javascript
// If session expires
await marketplace.triggerSessionTimeout(jobId);

// If renter abandons (no activity for 7 days)
await marketplace.claimAbandonedSession(jobId);
```

## Reading Session Data

### Correct Way to Read Sessions
```javascript
// Read from sessionJobs mapping directly
const session = await marketplace.sessionJobs(jobId);

// Destructure the response
const [
  depositAmount,      // uint256
  pricePerToken,      // uint256
  maxDuration,        // uint256
  sessionStartTime,   // uint256
  assignedHost,       // address
  status,             // uint8 (0=Active, 1=Completed, 2=Cancelled)
  provenTokens,       // uint256
  lastProofSubmission,// uint256
  aggregateProofHash, // bytes32
  checkpointInterval, // uint256
  lastActivity,       // uint256
  disputeDeadline     // uint256
] = session;
```

### Helper Methods That Work
```javascript
// Get proven tokens count
const tokens = await marketplace.getProvenTokens(jobId);

// Get proof submissions
const proofs = await marketplace.getProofSubmissions(jobId);

// Check if uses token payment
const isToken = await marketplace.isTokenJob(jobId);
```

## Complete Working Example

```javascript
async function completeSessionWithProofs(jobId) {
    // 1. Check session status
    const session = await marketplace.sessionJobs(jobId);
    if (session.status !== 0) {
        throw new Error('Session not active');
    }
    
    // 2. Check if proofs were submitted
    const provenTokens = await marketplace.getProvenTokens(jobId);
    if (provenTokens === 0) {
        throw new Error('No proofs submitted');
    }
    
    // 3. Host claims payment
    const hostSigner = new ethers.Wallet(HOST_KEY, provider);
    const marketplaceAsHost = marketplace.connect(hostSigner);
    
    const tx = await marketplaceAsHost.claimWithProof(jobId);
    const receipt = await tx.wait();
    
    // 4. Verify completion
    const updatedSession = await marketplace.sessionJobs(jobId);
    console.log('Session completed:', updatedSession.status === 1);
    
    return receipt;
}
```

## Common Errors and Solutions

### Error: "Execution reverted" when calling getJob()
**Cause**: Session jobs use `sessionJobs` mapping, not `jobs` mapping
**Solution**: Use `sessionJobs(jobId)` to read session data

### Error: "Host not assigned to model"
**Cause**: Host doesn't support the required model
**Solution**: Register host with approved models from ModelRegistry

### Error: "Host not active"
**Cause**: Wrong NodeRegistry or host not registered
**Solution**: Verify host is registered in NodeRegistryWithModels at `0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218` with supported models

## Session Structure

The `sessionJobs` mapping returns:
- `id`: Session ID (same as job ID)
- `requester`: Address that created the session
- `host`: Assigned host address
- `paymentToken`: Token address (0x0 for ETH)
- `deposit`: Total deposit amount
- `pricePerToken`: Price per inference token
- `provenTokens`: Tokens proven via EZKL
- `status`: SessionStatus enum (Active=0, Completed=1, Abandoned=2, Disputed=3)
- `startTime`: Session start timestamp
- `maxDuration`: Maximum session duration
- `lastProofTime`: Last proof submission timestamp
- `proofInterval`: Required proof submission interval

## Best Practices

1. **For Hosts**: Submit proofs regularly and use `submitProofOfWork()` before claiming
2. **For Renters**: Monitor session progress and call appropriate completion method
3. **For SDK/Client**: Always use `sessionJobs()` mapping for session data
4. **For Testing**: Verify host has supported models before creating sessions