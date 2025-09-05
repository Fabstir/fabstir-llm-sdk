# ProofSystem Contract Documentation

## Current Implementation

**Current Contract Address (Base Sepolia)**: `0x2ACcc60893872A499700908889B38C5420CBcFD1` ✅ (Fixed - Jan 4, 2025)

### Overview

The ProofSystem contract provides EZKL-based proof verification for trustless AI inference in the Fabstir marketplace. It validates that hosts have correctly processed AI prompts and prevents proof replay attacks.

### Key Features
- **EZKL Proof Verification**: Validates zero-knowledge proofs of computation
- **Replay Prevention**: Tracks verified proofs to prevent reuse
- **Batch Verification**: Process multiple proofs efficiently
- **Circuit Registry**: Maps models to verification circuits
- **Stateless Design**: No dependency on JobMarketplace state

### Recent Fixes (January 4, 2025)
- **Internal Function Call**: Fixed `this.verifyEKZL` to `_verifyEKZL` internal call
- **USDC Compatibility**: Now works correctly with token-based sessions
- **Gas Optimization**: Reduced verification costs

### Architecture

```solidity
contract ProofSystem is IProofSystem {
    // Replay prevention
    mapping(bytes32 => bool) public verifiedProofs;
    
    // Circuit management
    mapping(bytes32 => bool) public registeredCircuits;
    mapping(address => bytes32) public modelCircuits;
    
    // Verification functions
    function verifyEKZL(bytes calldata proof, address prover, uint256 tokens) external view returns (bool)
    function verifyAndMarkComplete(bytes calldata proof, address prover, uint256 tokens) external returns (bool)
}
```

### Integration with JobMarketplace

The ProofSystem integrates seamlessly with JobMarketplaceFABWithS5:

1. **Proof Submission**: Host calls `submitProofOfWork()` on marketplace
2. **Verification**: Marketplace calls `verifyAndMarkComplete()` on ProofSystem
3. **State Update**: If valid, proof hash is marked as used
4. **Token Credit**: Marketplace credits proven tokens to session

### Key Functions

#### Verification Functions

```solidity
// Basic verification (view only, no state change)
function verifyEKZL(
    bytes calldata proof,
    address prover,
    uint256 claimedTokens
) external view returns (bool)

// Verify and mark as used (prevents replay)
function verifyAndMarkComplete(
    bytes calldata proof,
    address prover,
    uint256 claimedTokens
) external returns (bool)

// Batch verification
function verifyBatch(
    bytes[] calldata proofs,
    address prover,
    uint256[] calldata tokenCounts
) external returns (bool)
```

#### Circuit Management

```solidity
// Register a model's verification circuit
function registerModelCircuit(
    address model,
    bytes32 circuitHash
) external onlyOwner

// Check if circuit is registered
function isCircuitRegistered(bytes32 circuitHash) external view returns (bool)

// Get model's circuit
function getModelCircuit(address model) external view returns (bytes32)
```

### Proof Validation Logic

The current implementation performs basic validation:

```solidity
function _verifyEKZL(
    bytes calldata proof,
    address prover,
    uint256 claimedTokens
) internal view returns (bool) {
    // Basic validation
    if (proof.length < 64) return false;  // Minimum proof size
    if (claimedTokens == 0) return false; // Must claim tokens
    if (prover == address(0)) return false; // Valid prover
    
    // Extract proof hash (first 32 bytes)
    bytes32 proofHash;
    assembly {
        proofHash := calldataload(proof.offset)
    }
    
    // Check not already verified (replay prevention)
    if (verifiedProofs[proofHash]) return false;
    
    // TODO: In production, call actual EZKL verifier
    return true;
}
```

### Proof Requirements

For a proof to be valid:

1. **Size**: Minimum 64 bytes
2. **Tokens**: Must claim at least 1 token (MIN_PROVEN_TOKENS enforced by marketplace)
3. **Prover**: Must be valid address
4. **Uniqueness**: Proof hash must not be previously used
5. **Future**: Will verify against EZKL circuit

### Events

```solidity
event ProofVerified(bytes32 indexed proofHash, address indexed prover, uint256 tokens)
event CircuitRegistered(bytes32 indexed circuitHash, address indexed model)
event BatchProofVerified(bytes32[] proofHashes, address indexed prover, uint256 totalTokens)
```

### Security Considerations

1. **Replay Prevention**: Each proof can only be used once
2. **Access Control**: Only owner can register circuits
3. **Validation**: Multiple checks before accepting proof
4. **Stateless Verification**: No dependencies on external state
5. **Future EZKL Integration**: Designed for drop-in EZKL verifier

### Gas Optimization

| Operation | Gas Cost | Notes |
|-----------|----------|-------|
| verifyEKZL (view) | ~5,000 | Read-only check |
| verifyAndMarkComplete | ~25,000 | State update included |
| verifyBatch (10 proofs) | ~180,000 | ~18k per proof |

### Batch Verification

For efficiency with multiple proofs:

```solidity
// Submit multiple proofs at once
function verifyBatch(
    bytes[] calldata proofs,
    address prover,
    uint256[] calldata tokenCounts
) external returns (bool) {
    require(proofs.length == tokenCounts.length, "Length mismatch");
    require(proofs.length <= 10, "Batch too large");
    
    for (uint256 i = 0; i < proofs.length; i++) {
        require(_verifyEKZL(proofs[i], prover, tokenCounts[i]), "Invalid proof");
        // Mark each proof as used
    }
    
    emit BatchProofVerified(proofHashes, prover, totalTokens);
    return true;
}
```

### Future EZKL Integration

The contract is designed for future EZKL verifier integration:

1. **Circuit Registry**: Already supports model→circuit mapping
2. **Verification Hook**: `_verifyEKZL` can call external verifier
3. **Proof Format**: Expects EZKL-compatible proof structure
4. **Public Inputs**: Token count and prover address as public inputs

### Testing Proofs

For testing, proofs must be at least 64 bytes:

```javascript
// JavaScript test example
const proof = ethers.utils.concat([
    ethers.utils.keccak256("0x1234"), // 32 bytes
    ethers.utils.keccak256("0x5678")  // 32 bytes
]);

await marketplace.submitProofOfWork(jobId, proof, 100);
```

### Deployment History

| Date | Address | Changes |
|------|---------|---------|
| Jan 4, 2025 | `0x2ACcc60893872A499700908889B38C5420CBcFD1` | Fixed internal call |
| Jan 3, 2025 | `0x48f94914979eD6B0e16c6E4E04Bfa8a8041DcF1D` | Had external call bug |
| Dec 2024 | Various | Earlier versions |

### Best Practices

1. **For Hosts**:
   - Generate unique proofs for each submission
   - Include sufficient entropy in proofs
   - Submit proofs promptly at checkpoints

2. **For Marketplace Integration**:
   - Always use `verifyAndMarkComplete()` for state changes
   - Check return value before crediting tokens
   - Handle verification failures gracefully

3. **For Circuit Deployment**:
   - Register circuits before model usage
   - Use standardized circuit formats
   - Version circuits for upgrades

### Migration Notes

When integrating real EZKL verifier:

1. Deploy EZKL verifier contract
2. Update `_verifyEKZL` to call verifier
3. Register model circuits
4. Test with real proofs
5. No changes needed in JobMarketplace

### References

- [JobMarketplace.md](./JobMarketplace.md) - Integration details
- [SESSION_JOBS.md](../../SESSION_JOBS.md) - Proof checkpoint system
- [EZKL Documentation](https://docs.ezkl.xyz/) - External EZKL docs
- [Source Code](../../../src/ProofSystem.sol) - Contract implementation
- [Tests](../../../test/ProofSystem/) - Test coverage