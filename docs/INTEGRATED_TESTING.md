# Fabstir LLM SDK - Integration Testing Guide

## Overview

This document covers the integration tests in the `tests/integration/` directory. These tests demonstrate real-world usage patterns and verify end-to-end functionality of the SDK with actual blockchain and P2P interactions.

## Test Files

### 1. eth-payment-cycle.test.ts
**Purpose**: Tests complete ETH payment flow with session jobs on Base Sepolia testnet.

**Key Features Tested**:
- ETH session job creation and payment
- Balance tracking (user, host, treasury)
- Host registration on NodeRegistry contract
- Job completion and payment distribution
- Gas usage tracking and reporting

**Test Flow**:
1. Initialize provider and wallets
2. Register host on NodeRegistry
3. Create ETH-funded session job
4. Track balance changes
5. Complete job and verify payment distribution
6. Generate transaction report

**Environment Variables Required**:
```bash
RPC_URL_BASE_SEPOLIA
TEST_USER_1_PRIVATE_KEY
TEST_HOST_1_PRIVATE_KEY
CONTRACT_JOB_MARKETPLACE
CONTRACT_NODE_REGISTRY
```

### 2. usdc-payment-cycle.test.ts
**Purpose**: Tests USDC payment flow with token approvals on Base Sepolia.

**Key Features Tested**:
- USDC token approval mechanism
- USDC session job creation
- Token balance tracking
- Payment distribution in USDC
- Gas costs for token operations

**Test Flow**:
1. Check USDC balances
2. Approve USDC spending for marketplace
3. Create USDC-funded session job
4. Track token transfers
5. Complete job and verify USDC distribution
6. Compare gas costs vs ETH payments

**Additional Requirements**:
- User must have USDC tokens on Base Sepolia
- USDC token contract address configured

### 3. p2p-discovery.test.ts
**Purpose**: Tests P2P node discovery and messaging capabilities.

**Key Features Tested**:
- P2P node creation with libp2p
- Node discovery via DHT
- Peer connection establishment
- Message passing between peers
- Node registry integration

**Test Scenarios**:
1. Create P2P node with custom configuration
2. Register node in DHT
3. Discover nodes by capabilities
4. Connect to discovered peers
5. Exchange messages
6. Handle connection failures

**Configuration**:
```typescript
{
  listen: ['/ip4/127.0.0.1/tcp/0'],
  bootstrap: [...],
  enableDHT: true,
  enableMDNS: true
}
```

### 4. s5-storage.test.ts
**Purpose**: Comprehensive S5 storage integration testing.

**Key Features Tested**:
- S5 client initialization with seed
- Data storage and retrieval
- Conversation persistence
- Metadata handling
- Large data handling
- Data listing and management

**Test Cases**:
1. Initialize S5 client with wallet-derived seed
2. Store conversation data
3. Retrieve by CID
4. Update registry entries
5. List user's stored data
6. Handle large JSON objects
7. Test data persistence

**S5 Configuration**:
```typescript
{
  seed: authManager.getS5Seed(),
  initialPeers: ['wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p']
}
```

### 5. s5-storage-minimal.test.ts
**Purpose**: Minimal S5 storage test for quick validation.

**Key Features Tested**:
- Basic S5 connectivity
- Simple store/retrieve operations
- Seed generation from wallet

**Use Case**: Quick smoke test for S5 integration without full test suite.

### 6. stress-test.test.ts
**Purpose**: Combined stress test of all SDK components.

**Key Features Tested**:
- Concurrent manager operations
- Multiple session creation
- Parallel P2P connections
- Storage under load
- Payment processing queue
- Error recovery mechanisms

**Stress Scenarios**:
1. Create multiple sessions concurrently
2. Store large amounts of data
3. Handle P2P node failures
4. Process payment queue
5. Test rate limiting
6. Verify data integrity

**Performance Metrics**:
- Transaction throughput
- Storage latency
- P2P connection time
- Payment processing time
- Error recovery time

### 7. report-generator.test.ts
**Purpose**: Generate comprehensive test reports and analytics.

**Features**:
- Aggregate test results
- Calculate success rates
- Track performance metrics
- Generate HTML/JSON reports
- Identify patterns and issues

**Report Sections**:
1. Test execution summary
2. Performance metrics
3. Error analysis
4. Gas usage analysis
5. Balance change tracking
6. Recommendations

### 8. report-generator.ts
**Purpose**: Utility module for report generation (not a test file).

**Exports**:
```typescript
class ReportGenerator {
  generateReport(testResults: TestResult[]): Report
  saveReport(report: Report, format: 'html' | 'json'): void
  analyzeGasUsage(transactions: Transaction[]): GasAnalysis
  trackBalances(addresses: string[]): BalanceReport
}
```

### 9. simple-eth-test.ts
**Purpose**: Simple ETH transaction test for basic validation.

**Use Case**: Quick test to verify:
- RPC connection
- Wallet functionality
- Basic ETH transfers
- Contract interaction

## Running Integration Tests

### Run All Integration Tests
```bash
npm test tests/integration/
```

### Run Specific Test
```bash
npm test tests/integration/eth-payment-cycle.test.ts
```

### Run with Coverage
```bash
npm run test:coverage -- tests/integration/
```

### Generate Test Report
```bash
npm test tests/integration/report-generator.test.ts
```

## Test Environment Setup

### Required Environment Variables (.env.test)
```bash
# RPC Endpoint
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/your-key

# Test Accounts
TEST_USER_1_PRIVATE_KEY=0x...
TEST_USER_1_ADDRESS=0x...
TEST_HOST_1_PRIVATE_KEY=0x...
TEST_HOST_1_ADDRESS=0x...
TEST_TREASURY_ACCOUNT=0x...

# Contract Addresses
CONTRACT_JOB_MARKETPLACE=0xD937c594682Fe74E6e3d06239719805C04BE804A
CONTRACT_NODE_REGISTRY=0x87516C13Ea2f99de598665e14cab64E191A0f8c4
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# S5 Configuration
S5_SEED_PHRASE="twelve word mnemonic seed phrase here"
S5_PORTAL_URL=wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p
```

### Test Account Requirements

1. **User Account**: Needs ETH and USDC for payments
2. **Host Account**: Needs ETH for gas to register
3. **Treasury Account**: Receives platform fees

### Funding Test Accounts

Base Sepolia Faucets:
- [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet)
- [Alchemy Faucet](https://basesepolia-faucet.com)

USDC on Base Sepolia:
- Use DEX to swap ETH for USDC
- Or use test USDC faucet if available

## Test Patterns and Best Practices

### 1. Balance Tracking Pattern
```typescript
const tracker = new BalanceTracker(provider);
await tracker.snapshot('before', [userAddress, hostAddress]);
// ... perform operations ...
await tracker.snapshot('after', [userAddress, hostAddress]);
const changes = tracker.getChanges('before', 'after');
```

### 2. Transaction Reporting
```typescript
const report = {
  jobId,
  txHash,
  gasUsed,
  gasPrice,
  totalCost: gasUsed * gasPrice,
  timestamp: Date.now()
};
transactionReport.push(report);
```

### 3. Error Handling
```typescript
try {
  await sessionManager.createSession(options);
} catch (error) {
  if (error.code === 'INSUFFICIENT_BALANCE') {
    // Handle insufficient balance
  }
  throw error; // Re-throw for test failure
}
```

### 4. Cleanup
```typescript
afterAll(async () => {
  // Stop P2P nodes
  await discoveryManager?.stop();
  
  // Clear storage
  await storageManager?.clear();
  
  // Generate final report
  await generateTestReport(transactionReport);
});
```

## Common Issues and Solutions

### Issue: "Insufficient Balance"
**Solution**: Ensure test accounts are funded with ETH/USDC

### Issue: "Contract Not Found"
**Solution**: Verify contract addresses in .env.test match deployment

### Issue: "P2P Connection Failed"
**Solution**: Check firewall settings and bootstrap nodes

### Issue: "S5 Storage Timeout"
**Solution**: Verify S5 portal URL and network connectivity

### Issue: "Gas Estimation Failed"
**Solution**: Ensure correct network configuration and RPC endpoint

## Performance Benchmarks

Expected performance on Base Sepolia:

| Operation | Expected Time | Gas Cost |
|-----------|--------------|----------|
| ETH Job Creation | 3-5 seconds | ~200k gas |
| USDC Approval | 2-4 seconds | ~50k gas |
| USDC Job Creation | 4-6 seconds | ~250k gas |
| Job Completion | 2-4 seconds | ~100k gas |
| S5 Store (1KB) | 1-2 seconds | N/A |
| S5 Retrieve | 0.5-1 second | N/A |
| P2P Discovery | 2-5 seconds | N/A |

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Integration Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test tests/integration/
    env:
      RPC_URL_BASE_SEPOLIA: ${{ secrets.RPC_URL }}
      TEST_USER_1_PRIVATE_KEY: ${{ secrets.USER_KEY }}
      # ... other secrets
```

## See Also

- [SDK API Reference](SDK_API.md)
- [Quick Reference](SDK_QUICK_REFERENCE.md)
- [Architecture](ARCHITECTURE.md)
- [Setup Guide](SETUP_GUIDE.md)