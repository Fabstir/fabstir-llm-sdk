# Tests for CI/CD Pipeline

## Overview

This document outlines the recommended test suite for GitHub Actions CI/CD pipeline to ensure code quality and prevent broken deployments. All tests listed here interact with real smart contracts on Base Sepolia testnet - no mocks are used.

## Test Categories

### 1. Critical Tests (MUST PASS for Deployment)

These tests validate core SDK functionality and must pass before any deployment.

#### Core SDK Integration Tests
```bash
# Validate complete payment flows with real contracts
tests/integration/fabstir-sdk-eth-payment.test.ts    # ETH payment flow
tests/integration/fabstir-sdk-usdc-payment.test.ts   # USDC payment flow
tests/integration/stress-test.test.ts                # Combined workflow test
```

#### Manager Unit Tests
```bash
# Ensure each manager works correctly
tests/managers/SessionManager.test.ts                # Session lifecycle management
tests/managers/PaymentManager.test.ts                # Payment handling (ETH & USDC)
tests/managers/ModelManager.test.ts                  # Model governance & validation
tests/managers/ClientManager.test.ts                 # Host discovery & selection
tests/managers/HostManagerEnhanced.test.ts           # Host registration & operations
```

#### Contract Interaction Tests
```bash
# Verify smart contract interactions
tests/contracts/session-contract.test.ts             # Session job contracts
tests/contracts/model-governance.test.ts             # Model registry operations
tests/contracts/treasury.test.ts                     # Treasury fee distribution
```

### 2. Important Tests (RECOMMENDED for Full Validation)

#### Storage Integration Tests
```bash
tests/integration/s5-storage.test.ts                 # S5 decentralized storage
tests/storage/StorageManager.test.ts                 # Storage manager operations
```

#### Authentication Tests
```bash
tests/managers/AuthManager.test.ts                   # Wallet authentication
```

#### Treasury Tests
```bash
tests/managers/TreasuryManager.test.ts              # Treasury operations
```

### 3. Optional Tests (For Extended Coverage)

#### P2P and WebSocket Tests
```bash
# Include if using P2P features
tests/p2p/WebSocketClient.test.ts                   # WebSocket client functionality
tests/integration/p2p-discovery.test.ts             # P2P node discovery
tests/p2p/HostDiscovery.test.ts                     # Host discovery service
```

#### Configuration Tests
```bash
tests/unit/FabstirSDKCore.test.ts                   # SDK core configuration
tests/config/sdk-config.test.ts                     # Configuration validation
```

### 4. Tests to EXCLUDE from CI/CD

```bash
# Do NOT include these in CI/CD pipeline
tests/integration/report-generator.test.ts          # Analysis tool, not validation
scripts/tests/**/*                                   # Ad-hoc development tests
tests/**/*.skip.ts                                  # Explicitly skipped tests
tests/**/*.manual.ts                                # Manual intervention required
```

## GitHub Actions Workflow Configuration

### Basic Workflow (.github/workflows/test.yml)

```yaml
name: Test and Deploy

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '22'

    - name: Install pnpm
      run: npm install -g pnpm

    - name: Cache dependencies
      uses: actions/cache@v3
      with:
        path: ~/.pnpm-store
        key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Build SDK
      run: pnpm build

    - name: Run Critical Tests
      env:
        # Contract addresses (from .env.test)
        RPC_URL_BASE_SEPOLIA: ${{ secrets.RPC_URL_BASE_SEPOLIA }}
        CONTRACT_JOB_MARKETPLACE: '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944'
        CONTRACT_NODE_REGISTRY: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218'
        CONTRACT_PROOF_SYSTEM: '0x2ACcc60893872A499700908889B38C5420CBcFD1'
        CONTRACT_HOST_EARNINGS: '0x908962e8c6CE72610021586f85ebDE09aAc97776'
        CONTRACT_MODEL_REGISTRY: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        CONTRACT_USDC_TOKEN: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        CONTRACT_FAB_TOKEN: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62'

        # Test accounts (store as secrets)
        TEST_USER_1_PRIVATE_KEY: ${{ secrets.TEST_USER_1_PRIVATE_KEY }}
        TEST_USER_1_ADDRESS: ${{ secrets.TEST_USER_1_ADDRESS }}
        TEST_HOST_1_PRIVATE_KEY: ${{ secrets.TEST_HOST_1_PRIVATE_KEY }}
        TEST_HOST_1_ADDRESS: ${{ secrets.TEST_HOST_1_ADDRESS }}

        # S5 Storage
        S5_SEED_PHRASE: ${{ secrets.S5_SEED_PHRASE }}

        # Payment configuration
        TREASURY_FEE_PERCENTAGE: '10'
        HOST_EARNINGS_PERCENTAGE: '90'

      run: |
        echo "Running critical integration tests..."
        pnpm test tests/integration/fabstir-sdk-eth-payment.test.ts
        pnpm test tests/integration/fabstir-sdk-usdc-payment.test.ts

        echo "Running manager tests..."
        pnpm test tests/managers/SessionManager.test.ts
        pnpm test tests/managers/PaymentManager.test.ts
        pnpm test tests/managers/ModelManager.test.ts
        pnpm test tests/managers/ClientManager.test.ts

        echo "Running contract tests..."
        pnpm test tests/contracts/

    - name: Run Extended Tests (Main Branch Only)
      if: github.ref == 'refs/heads/main'
      run: |
        echo "Running full test suite..."
        pnpm test --exclude tests/integration/report-generator.test.ts

    - name: Upload Test Results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: test-results
        path: coverage/

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
    - name: Deploy to Production
      run: echo "Deployment logic here"
```

## Test Execution Strategies

### 1. Fast CI (Pull Requests) - ~2-3 minutes

Run only the most critical tests to provide quick feedback:

```bash
# Minimal test set for PRs
pnpm test tests/integration/fabstir-sdk-eth-payment.test.ts
pnpm test tests/integration/fabstir-sdk-usdc-payment.test.ts
pnpm test tests/managers/SessionManager.test.ts
pnpm test tests/managers/PaymentManager.test.ts
```

### 2. Standard CI (Develop Branch) - ~5 minutes

Run core tests plus important validations:

```bash
# Standard test suite
pnpm test tests/integration/
pnpm test tests/managers/
pnpm test tests/contracts/
```

### 3. Full CI (Main Branch) - ~10 minutes

Run complete test suite excluding manual tests:

```bash
# Full test suite
pnpm test --exclude scripts/tests --exclude tests/integration/report-generator.test.ts
```

### 4. Smoke Tests (Post-Deployment) - ~1 minute

Quick validation that deployment succeeded:

```bash
# Smoke test
pnpm test tests/integration/stress-test.test.ts
```

## Environment Variables Required

### Essential Variables (MUST HAVE)

```bash
# RPC Endpoint
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# All 7 Contract Addresses (from .env.test)
CONTRACT_JOB_MARKETPLACE=0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944
CONTRACT_NODE_REGISTRY=0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218
CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776
CONTRACT_MODEL_REGISTRY=0x92b2De840bB2171203011A6dBA928d855cA8183E
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62

# Test Accounts (with funds)
TEST_USER_1_PRIVATE_KEY=0x...
TEST_USER_1_ADDRESS=0x...
TEST_HOST_1_PRIVATE_KEY=0x...
TEST_HOST_1_ADDRESS=0x...

# Payment Distribution
TREASURY_FEE_PERCENTAGE=10
HOST_EARNINGS_PERCENTAGE=90
```

### Optional Variables

```bash
# S5 Storage
S5_SEED_PHRASE="your seed phrase here"

# Treasury Account
TEST_TREASURY_ACCOUNT=0x...

# Debugging
DEBUG=fabstir:*
```

## Test Requirements

### 1. Test Account Setup

Test accounts must have:
- Minimum 0.1 ETH for gas fees
- Minimum 100 USDC for payment tests
- Minimum 1000 FAB tokens for staking tests (host account)

### 2. RPC Configuration

- Use dedicated API keys for CI to avoid rate limits
- Consider using different endpoints for parallel test runs
- Alchemy/Infura recommended for reliability

### 3. Timeout Configuration

Some tests may need extended timeouts:

```javascript
// vitest.config.ts
export default {
  test: {
    testTimeout: 60000,  // 60 seconds for blockchain operations
    hookTimeout: 30000,  // 30 seconds for setup/teardown
  }
}
```

## Parallel Execution

To speed up test execution, run test categories in parallel:

```yaml
- name: Run Tests in Parallel
  run: |
    pnpm test tests/integration/ &
    pnpm test tests/managers/ &
    pnpm test tests/contracts/ &
    wait
```

## Test Result Reporting

### Coverage Reports

```yaml
- name: Generate Coverage Report
  run: pnpm test:coverage

- name: Upload Coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

### Test Status Badge

Add to README.md:
```markdown
[![Tests](https://github.com/your-org/fabstir-sdk/actions/workflows/test.yml/badge.svg)](https://github.com/your-org/fabstir-sdk/actions)
```

## Common Issues and Solutions

### Issue 1: Insufficient Funds
**Solution**: Ensure test accounts are funded. Consider using a faucet script in CI.

### Issue 2: RPC Rate Limiting
**Solution**: Use dedicated API keys, implement retry logic, or use multiple RPC endpoints.

### Issue 3: Flaky Tests
**Solution**: Add retry logic for blockchain operations, increase timeouts, ensure proper test isolation.

### Issue 4: Contract Address Changes
**Solution**: Use environment variables for all contract addresses, never hardcode.

## Maintenance

1. **Weekly**: Review test execution times, optimize slow tests
2. **Monthly**: Update test account balances, rotate API keys
3. **Quarterly**: Review and update test coverage requirements
4. **On Contract Deployment**: Update all contract addresses in CI secrets

## Contact

For questions about CI/CD testing:
- Review test files in `/workspace/tests/`
- Check `.env.test` for latest configuration
- Consult `docs/SDK_API.md` for SDK documentation

---

*Last Updated: January 2025*
*SDK Version: 1.0.10*
*Contracts: Base Sepolia Testnet*