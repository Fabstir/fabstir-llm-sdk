# JobMarketplace Contract Documentation

## Current Implementation: JobMarketplaceWithModels

**Contract Address**: `0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944`
**Network**: Base Sepolia
**Status**: ✅ ACTIVE - FULLY WORKING with creditEarnings and model governance
**Last Updated**: January 13, 2025

### Key Features
- **Model Governance**: Integration with ModelRegistry for approved models only
- **Session-Based Jobs**: Uses `sessionJobs` mapping (NOT `jobs` mapping)
- **Treasury Fee Accumulation**: Treasury fees accumulate for batch withdrawals
- **Host Earnings Accumulation**: Via HostEarnings contract with proper creditEarnings
- **Streaming Payments**: Proof-of-work based token consumption model
- **Multi-Token Support**: ETH and USDC (Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e)
- **EZKL Proof Verification**: Integration with ProofSystem contract
- **Economic Minimums**: MIN_DEPOSIT (0.0002 ETH), MIN_PROVEN_TOKENS (100)
- **Gas Savings**: ~80% reduction through dual accumulation

### Contract Architecture

```solidity
contract JobMarketplaceWithModels {
    // Core components
    NodeRegistryWithModels public nodeRegistry;
    IProofSystem public proofSystem;
    HostEarnings public hostEarnings;
    ModelRegistry public modelRegistry;

    // Treasury accumulation
    uint256 public accumulatedTreasuryETH;
    mapping(address => uint256) public accumulatedTreasuryTokens;
    
    // Session management
    mapping(uint256 => Session) public sessions;
    mapping(uint256 => Job) public jobs;
}
```

### Session Job Lifecycle

1. **Creation**: User creates session with deposit
2. **Active**: Host submits periodic proofs of work
3. **Completion**: User or host completes, payments distributed
4. **Settlement**: 90% to host (accumulated), 10% to treasury (accumulated)

### Key Functions

#### Session Management
```solidity
// Create ETH-based session
function createSessionJob(
    address host,
    uint256 deposit,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external payable returns (uint256 jobId)

// Create token-based session
function createSessionJobWithToken(
    address host,
    address token,
    uint256 deposit,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external returns (uint256 jobId)

// Submit proof of work
function submitProofOfWork(
    uint256 jobId,
    bytes calldata ekzlProof,
    uint256 tokensInBatch
) external returns (bool verified)

// Complete session
function completeSessionJob(uint256 jobId) external
```

#### Treasury Functions (NEW - January 5, 2025)
```solidity
// Withdraw accumulated ETH fees
function withdrawTreasuryETH() external onlyTreasury nonReentrant

// Withdraw accumulated token fees
function withdrawTreasuryTokens(address token) external onlyTreasury nonReentrant

// Batch withdraw all fees
function withdrawAllTreasuryFees(address[] calldata tokens) external onlyTreasury nonReentrant

// View accumulated fees
function accumulatedTreasuryETH() external view returns (uint256)
function accumulatedTreasuryTokens(address token) external view returns (uint256)
```

### Economic Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| MIN_DEPOSIT | 0.0002 ETH | Minimum session deposit |
| MIN_PROVEN_TOKENS | 100 | Minimum tokens per proof |
| TREASURY_FEE_PERCENT | 10% | Platform fee |
| MIN_SESSION_DURATION | 600 seconds | Minimum session length |
| ABANDONMENT_TIMEOUT | 24 hours | Timeout for inactive sessions |
| DISPUTE_WINDOW | 1 hour | Time to dispute after completion |

### Gas Optimization

The dual accumulation pattern provides significant gas savings:

| Operation | Direct Transfer | With Accumulation | Savings |
|-----------|----------------|-------------------|---------|
| Job Completion | ~70,000 gas | ~14,000 gas | 80% |
| 10 Jobs (Host) | ~700,000 gas | ~140,000 gas | 80% |
| 10 Jobs (Treasury) | ~250,000 gas | ~140,000 gas | 44% |

### Integration with Other Contracts

#### NodeRegistryFAB
- Validates host registration
- Checks FAB token stake (1000 FAB minimum)
- Address: `0x87516C13Ea2f99de598665e14cab64E191A0f8c4`

#### ProofSystem
- Verifies EZKL proofs
- Prevents proof replay attacks
- Address: `0x2ACcc60893872A499700908889B38C5420CBcFD1`

#### HostEarnings
- Accumulates host payments
- Enables batch withdrawals
- Address: `0x908962e8c6CE72610021586f85ebDE09aAc97776`

### Events

```solidity
// Session lifecycle
event SessionJobCreated(uint256 indexed jobId, address indexed user, address indexed host, uint256 deposit, uint256 pricePerToken, uint256 maxDuration)
event ProofSubmitted(uint256 indexed jobId, address indexed host, uint256 tokensClaimed, bytes32 proofHash, bool verified)
event SessionCompleted(uint256 indexed jobId, address indexed completedBy, uint256 tokensPaid, uint256 paymentAmount, uint256 refundAmount)

// Treasury accumulation
event TreasuryFeesAccumulated(uint256 amount, address token)
event TreasuryFeesWithdrawn(uint256 amount, address token)

// Host earnings
event EarningsCredited(address indexed host, uint256 amount, address token)
```

### Security Considerations

1. **ReentrancyGuard**: All state-changing functions protected
2. **Proof Verification**: Integration with ProofSystem prevents fraud
3. **Timeout Protection**: Automatic refunds for abandoned sessions
4. **Access Control**: Treasury-only functions for fee withdrawal
5. **Emergency Withdrawal**: Respects accumulated amounts

### Deployment History

| Date | Address | Features |
|------|---------|----------|
| Jan 5, 2025 | `0x55A702Ab5034810F5B9720Fe15f83CFcf914F56b` | Treasury accumulation added |
| Jan 4, 2025 | `0x9A945fFBe786881AaD92C462Ad0bd8aC177A8069` | Host accumulation only |
| Jan 4, 2025 | `0xD937c594682Fe74E6e3d06239719805C04BE804A` | USDC fixes, no accumulation |
| Dec 2024 | Various | Earlier versions with bugs |

### Migration from Old Contracts

If migrating from non-accumulation contracts:

1. Deploy new JobMarketplaceFABWithS5
2. Deploy new HostEarnings
3. Configure treasury address
4. Update ProofSystem reference
5. No migration of existing jobs needed (clean slate)

### Best Practices

1. **For Users**:
   - Create sessions with sufficient deposit for expected usage
   - Complete sessions promptly to release unused funds
   - Monitor proof submissions for quality

2. **For Hosts**:
   - Submit proofs regularly at checkpoint intervals
   - Withdraw accumulated earnings periodically
   - Maintain sufficient FAB stake

3. **For Treasury**:
   - Use `withdrawAllTreasuryFees()` for batch withdrawals
   - Monitor accumulated fees regularly
   - Consider automatic withdrawal triggers

### References

- [SESSION_JOBS.md](../../SESSION_JOBS.md) - Comprehensive session job guide
- [CURRENT_STATUS.md](../../CURRENT_STATUS.md) - Latest deployment info
- [Source Code](../../../src/JobMarketplaceFABWithS5.sol) - Contract implementation
- [Tests](../../../test/JobMarketplace/SessionJobs/) - 340+ test cases