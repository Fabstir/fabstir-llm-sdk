# Session Job Completion Guide

**Last Updated**: October 14, 2025

## Current Contract Information

- **JobMarketplaceWithModels**: `0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E` ✅ S5 Proof Storage
- **NodeRegistryWithModels**: `0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6` ✅ Dual Pricing
- **ProofSystem**: `0x2ACcc60893872A499700908889B38C5420CBcFD1` (Configured, standby mode)
- **HostEarnings**: `0x908962e8c6CE72610021586f85ebDE09aAc97776`
- **ModelRegistry**: `0x92b2De840bB2171203011A6dBA928d855cA8183E`
- **Network**: Base Sepolia

## ⚠️ CRITICAL UPDATE: S5 Proof Storage (October 14, 2025)

**Breaking Change**: Proof submission now uses S5 off-chain storage.

**OLD** (Deprecated):
```javascript
await marketplace.submitProofOfWork(jobId, proofBytes, tokensInBatch);
```

**NEW** (Current):
```javascript
// 1. Upload proof to S5
const proofCID = await s5.uploadBlob(proofBytes);

// 2. Calculate hash
const proofHash = '0x' + crypto.createHash('sha256').update(proofBytes).digest('hex');

// 3. Submit hash + CID (NOT full proof)
await marketplace.submitProofOfWork(jobId, tokensClaimed, proofHash, proofCID);
```

See [S5_NODE_INTEGRATION_GUIDE.md](S5_NODE_INTEGRATION_GUIDE.md) for node integration details.

## Key Architecture Points

### 1. Method Naming Confusion
- ❌ **WRONG**: `getSessionJob()` - This method does NOT exist
- ❌ **WRONG**: `sessions(jobId)` - Old mapping name
- ✅ **CORRECT**: Use `sessionJobs(jobId)` public mapping to read session data

### 2. Current Contract Architecture
The deployed contract at `0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E` (JobMarketplaceWithModels) uses session-based architecture with S5 proof storage:
- Session jobs stored in `sessionJobs` mapping
- Proofs stored off-chain in S5 (only hash + CID on-chain)
- Legacy `jobs` mapping exists but not used for sessions
- All session operations work through dedicated session functions

### 3. Correct Completion Flow

## Session Completion Methods

### Method 1: Anyone-Can-Complete Pattern (RECOMMENDED)

```javascript
// Anyone can call this - user, host, or third party
await marketplace.completeSessionJob(
    jobId,
    conversationCID  // IPFS/S5 CID of conversation history
);
```

**Requirements**:
- Session must be active
- Can be called by anyone (gasless UX for renters)
- Automatically distributes payments based on `tokensConsumed`

**What happens**:
- Calculates payment: `tokensConsumed * pricePerToken`
- Deducts 10% treasury fee (accumulated for batch withdrawal)
- Sends 90% to host (via HostEarnings accumulation)
- Marks session as completed
- Refunds unused deposit to renter

### Method 2: Timeout/Abandonment

```javascript
// If session expires
await marketplace.triggerSessionTimeout(jobId);

// If renter abandons (no activity for timeout period)
await marketplace.claimAbandonedSession(jobId);
```

## Reading Session Data

### Correct Way to Read Sessions

```javascript
// Read from sessionJobs mapping directly
const session = await marketplace.sessionJobs(jobId);

// Destructure the response (18 fields total)
const {
  depositor,          // address - who created and funded the session
  host,               // address - assigned host
  deposit,            // uint256 - total deposit amount
  pricePerToken,      // uint256 - price per AI token
  maxDuration,        // uint256 - session timeout
  proofInterval,      // uint256 - tokens between proofs
  tokensConsumed,     // uint256 - total tokens consumed
  createdAt,          // uint256 - creation timestamp
  active,             // bool - session status
  conversationCID,    // string - IPFS/S5 CID after completion
  paymentToken,       // address - payment token (0x0 for ETH)
  lastProofTimestamp, // uint256 - last proof submission time
  totalPayment,       // uint256 - total paid to host
  hostEarnings,       // uint256 - host's earnings from session
  treasuryFee,        // uint256 - treasury fee from session
  modelHash,          // bytes32 - approved model identifier
  lastProofHash,      // bytes32 - SHA256 hash of most recent proof (NEW)
  lastProofCID        // string - S5 CID for proof retrieval (NEW)
} = session;
```

### Helper Methods That Work

```javascript
// Check session details
const session = await marketplace.sessionJobs(jobId);
console.log(`Tokens consumed: ${session.tokensConsumed}`);
console.log(`Active: ${session.active}`);
console.log(`Last proof CID: ${session.lastProofCID}`); // NEW: S5 proof storage
```

## Complete Working Example

```javascript
import { ethers } from 'ethers';
import { S5Client } from '@lumeweb/s5-js';
import crypto from 'crypto';

async function completeSessionWorkflow(jobId) {
    const marketplace = new ethers.Contract(
        '0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E',
        JobMarketplaceABI,
        signer
    );

    // 1. Check session status
    const session = await marketplace.sessionJobs(jobId);
    if (!session.active) {
        throw new Error('Session not active');
    }

    console.log(`Tokens consumed: ${session.tokensConsumed}`);
    console.log(`Last proof hash: ${session.lastProofHash}`);
    console.log(`Last proof CID: ${session.lastProofCID}`);

    // 2. Complete session (anyone can call - gasless UX)
    const conversationCID = "QmXxxx..."; // Your conversation history CID
    const tx = await marketplace.completeSessionJob(jobId, conversationCID);
    const receipt = await tx.wait();

    // 3. Verify completion
    const updatedSession = await marketplace.sessionJobs(jobId);
    console.log('Session completed:', !updatedSession.active);
    console.log('Conversation CID:', updatedSession.conversationCID);

    return receipt;
}

// Example: Host submits proof with S5 storage
async function submitProofWithS5(jobId, proofBytes, tokensClaimed) {
    const s5 = new S5Client('https://s5.lumeweb.com');

    // 1. Upload proof to S5
    console.log('📤 Uploading proof to S5...');
    const proofCID = await s5.uploadBlob(proofBytes);
    console.log(`✅ Proof uploaded: CID=${proofCID}`);

    // 2. Calculate SHA256 hash
    const proofHash = '0x' + crypto
        .createHash('sha256')
        .update(proofBytes)
        .digest('hex');
    console.log(`📊 Proof hash: ${proofHash}`);

    // 3. Submit hash + CID to blockchain
    const marketplace = new ethers.Contract(
        '0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E',
        JobMarketplaceABI,
        signer
    );

    const tx = await marketplace.submitProofOfWork(
        jobId,
        tokensClaimed,
        proofHash,  // bytes32
        proofCID    // string
    );

    await tx.wait();
    console.log('✅ Proof submitted successfully');
}
```

## Common Errors and Solutions

### Error: "Execution reverted" when calling getJob()
**Cause**: Session jobs use `sessionJobs` mapping, not `jobs` mapping
**Solution**: Use `sessionJobs(jobId)` to read session data

### Error: "Function not found" when calling submitProofOfWork()
**Cause**: Using old ABI with old function signature (3 parameters instead of 4)
**Solution**:
1. Download new ABI from `client-abis/JobMarketplaceWithModels-CLIENT-ABI.json`
2. Update function call to include hash + CID: `submitProofOfWork(jobId, tokens, hash, cid)`

### Error: "Host not assigned to model"
**Cause**: Host doesn't support the required model
**Solution**: Register host with approved models from ModelRegistry

### Error: "Host not active"
**Cause**: Wrong NodeRegistry or host not registered
**Solution**: Verify host is registered in NodeRegistryWithModels at `0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6` with supported models

### Error: "Price below host minimum (native)" or "(stable)"
**Cause**: Session creation with price below host's minimum pricing
**Solution**: Query host dual pricing first using `nodeRegistry.getNodePricing(host)` and ensure your price >= minimum

## Session Structure (18 Fields)

The `sessionJobs` mapping returns an 18-field struct:

| Field | Type | Description |
|-------|------|-------------|
| `depositor` | address | User who created and funded the session |
| `host` | address | Assigned host address |
| `deposit` | uint256 | Total deposit amount |
| `pricePerToken` | uint256 | Price per inference token |
| `maxDuration` | uint256 | Maximum session duration |
| `proofInterval` | uint256 | Required proof submission interval |
| `tokensConsumed` | uint256 | Total tokens consumed |
| `createdAt` | uint256 | Session creation timestamp |
| `active` | bool | Session status |
| `conversationCID` | string | IPFS/S5 CID after completion |
| `paymentToken` | address | Token address (0x0 for ETH) |
| `lastProofTimestamp` | uint256 | Last proof submission timestamp |
| `totalPayment` | uint256 | Total paid to host |
| `hostEarnings` | uint256 | Host's earnings from session |
| `treasuryFee` | uint256 | Treasury fee from session |
| `modelHash` | bytes32 | Approved model identifier |
| `lastProofHash` | bytes32 | **NEW**: SHA256 hash of most recent proof |
| `lastProofCID` | string | **NEW**: S5 CID for proof retrieval |

## Best Practices

1. **For Hosts**:
   - Submit proofs regularly using S5 off-chain storage
   - Upload proof to S5 first, then submit hash + CID
   - Complete sessions promptly to claim payment
   - Monitor S5 upload success rate

2. **For Renters**:
   - Monitor session progress via events
   - Call `completeSessionJob()` when conversation ends
   - Store conversation history in IPFS/S5

3. **For SDK/Client**:
   - Always use `sessionJobs()` mapping for session data
   - Use updated ABI with S5 proof storage support
   - Handle 18-field struct (includes lastProofHash and lastProofCID)
   - Integrate S5 client for proof verification

4. **For Testing**:
   - Verify host has supported models before creating sessions
   - Query host dual pricing before session creation
   - Test S5 proof upload/retrieval flow
   - Verify proof hash matches on-chain stored hash

## Payment Distribution

All session payments follow this split:
- **Host**: 90% of payment (accumulated in HostEarnings for batch withdrawal)
- **Treasury**: 10% of payment (accumulated for batch withdrawal)
- **User**: Refund of (deposit - totalPayment)

Example:
```
Tokens consumed: 2500
Price per token: 0.002 ETH
Total payment: 5 ETH

Distribution:
- Host receives: 4.5 ETH (90%) → accumulated in HostEarnings
- Treasury receives: 0.5 ETH (10%) → accumulated for batch withdrawal
- User refund: (deposit - 5 ETH)
```

## Proof Verification

With S5 storage, proof verification works differently:

**Normal Flow** (no verification needed):
- Host submits hash + CID
- Payment processed based on trust

**Dispute Flow** (full verification):
1. Retrieve proof from S5 using CID
2. Calculate SHA256 hash of retrieved proof
3. Verify hash matches on-chain stored hash
4. Verify proof validity using ProofSystem (if needed)

```javascript
// Verify proof integrity
const s5 = new S5Client('https://s5.lumeweb.com');

// 1. Get proof CID from session
const session = await marketplace.sessionJobs(jobId);
const storedCID = session.lastProofCID;
const storedHash = session.lastProofHash;

// 2. Retrieve proof from S5
const retrievedProof = await s5.downloadBlob(storedCID);

// 3. Calculate hash
const calculatedHash = '0x' + crypto
    .createHash('sha256')
    .update(retrievedProof)
    .digest('hex');

// 4. Verify integrity
if (calculatedHash !== storedHash) {
    throw new Error('Proof integrity check failed!');
}

console.log('✅ Proof integrity verified');
```

## References

- [S5 Proof Storage Deployment](S5_PROOF_STORAGE_DEPLOYMENT.md) - S5 deployment guide
- [S5 Node Integration Guide](S5_NODE_INTEGRATION_GUIDE.md) - Node developer integration
- [Session Jobs Guide](SESSION_JOBS.md) - Comprehensive session jobs documentation
- [Architecture](ARCHITECTURE.md) - System architecture with S5 storage
- [Contract Addresses](../CONTRACT_ADDRESSES.md) - Latest deployed contracts
- [BaseScan](https://sepolia.basescan.org/address/0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E) - Verify contract on-chain
