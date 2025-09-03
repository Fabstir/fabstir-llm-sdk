# E2E Testing Documentation

## Overview

The Fabstir LLM SDK includes comprehensive end-to-end tests that validate the complete user journey from authentication through payment settlement. This test suite ensures all components work together correctly in realistic scenarios.

### Test Coverage

The E2E test suite consists of 79 tests across 6 main areas:

| Sub-phase | Focus Area | Tests | Description |
|-----------|------------|-------|-------------|
| 8.1 | Infrastructure | 14 | Test accounts, mock hosts, helpers |
| 8.2 | Authentication | 16 | Auth flows, S5 seed generation |
| 8.3 | Session Creation | 10 | Host discovery, session setup |
| 8.4 | Message Exchange | 10 | Prompts, responses, S5 storage |
| 8.5 | Payment Settlement | 16 | Balance updates, fee distribution |
| 8.6 | Full Cycle | 13 | Complete integration scenarios |

### Architecture

```
┌─────────────────┐
│   Test Runner   │
│    (Vitest)     │
└────────┬────────┘
         │
    ┌────▼────┐
    │  Tests  │
    └────┬────┘
         │
┌────────▼────────────────────────┐
│        Test Infrastructure       │
├──────────────┬──────────────────┤
│ Test Accounts│  Mock Services   │
│ • User       │  • Mock LLM Host │
│ • Host       │  • Mock S5       │
│ • Treasury   │  • Mock Chain    │
└──────────────┴──────────────────┘
```

## Test Account Setup

### Account Types

1. **User Account** (Base Provider)
   - Uses Base Account Kit with passkeys
   - Gets unique S5 seed from authentication
   - Has gas sponsorship on testnet
   ```typescript
   const user = await getTestUser();
   // Returns: { address, signer, s5Seed, capabilities }
   ```

2. **Host Account** (MetaMask Provider)
   - Uses MetaMask authentication
   - No gas sponsorship
   - Can stake and receive payments
   ```typescript
   const host = await getTestHost();
   ```

3. **Treasury Account**
   - Receives platform fees (5%)
   - No authentication needed
   ```typescript
   const treasury = getTreasury();
   ```

### S5 Seed Generation

Each user gets a deterministic S5 seed:
- Unique per user (different users → different seeds)
- Consistent across sessions (same user → same seed)
- Used for encrypting conversation storage
- Format: 12-word mnemonic phrase

Example:
```
User A seed: "apple banana cherry date elder fig grape honey iron jazz kite lemon"
User B seed: "mango neon ocean piano quilt radar stone tiger umbrella voice whale xray"
```

## Funding Requirements

### Initial Balances

Test accounts need funding for operations:

| Account | Initial Amount | Purpose |
|---------|---------------|---------|
| User | 10 ETH | Session deposits & payments |
| Host | 1 ETH | Staking requirement |
| Treasury | 0 ETH | Starts empty, receives fees |

### Funding Utility

```typescript
await fundAccount(account, amount);
// Example: Fund user with 10 ETH worth of Wei
await fundAccount(userAccount, BigInt(10000000));
```

### Balance Flow

```
Session Start:
User: 10 ETH → Escrow: 0.1 ETH

Session End (100 tokens used at 0.0001 ETH/token):
Escrow → Host: 0.0095 ETH (95%)
Escrow → Treasury: 0.0005 ETH (5%)
User Balance: 9.99 ETH (minus gas)
```

## Running Tests

### Local Development

```bash
# Run all E2E tests
npm test tests/e2e/

# Run specific sub-phase
npm test tests/e2e/02-session-creation.test.ts

# Run with coverage
npm run test:coverage tests/e2e/

# Generate test report
node -e "require('./tests/e2e/test-report').generateTestReport([])"
```

### Expected Output

Successful test run:
```
✓ tests/e2e/setup/mock-llm-host.test.ts (4 tests) 110ms
✓ tests/e2e/setup/test-accounts.test.ts (5 tests) 122ms
✓ tests/e2e/setup/test-helpers.test.ts (5 tests) 202ms
✓ tests/e2e/auth-flow.test.ts (6 tests) 543ms
✓ tests/e2e/02-session-creation.test.ts (10 tests) 834ms
✓ tests/e2e/03-message-exchange.test.ts (10 tests) 921ms
✓ tests/e2e/04-payment-settlement.test.ts (16 tests) 1330ms
✓ tests/e2e/05-full-cycle.test.ts (13 tests) 1451ms

Test Files  11 passed (11)
     Tests  79 passed (79)
  Duration  4.23s
```

### Test Report

The test report generator creates:
1. Transaction summary with timestamps
2. Balance flow diagram showing money movement
3. Test metrics including pass rates

Example report output:
```
=== E2E Test Transaction Summary ===

1. auth: {"step":"auth","user":"test-user"}...
2. session: {"step":"session","jobId":1234}...
3. payment: {"step":"payment","cost":100000,"txHash":"0xaa..."}...

Total Payments: 100000
Total Transactions: 3

=== Balance Flow Diagram ===

User Account        Host Account       Treasury
     |                   |                |
  10 ETH                1 ETH            0 ETH
     |                   |                |
     |---[Payment]------>|                |
     |                   |--[5% Fee]----->|
     |                   |                |
  9.9 ETH            1.095 ETH        0.005 ETH

[→ Money Flow Direction]
```

## Troubleshooting

### Common Issues

#### 1. Module Not Found Errors
**Problem**: `Cannot find module '@fabstir/llm-auth'`

**Solution**: 
```bash
# Ensure auth module is linked
cd /fabstir-llm-auth && npm link
cd /workspace && npm link @fabstir/llm-auth
```

#### 2. S5 Connection Failures
**Problem**: S5ConversationStore connection errors

**Solution**: Tests use mocked S5 - check mock implementation
```typescript
// Mock is defined in test file
vi.mock('../../src/storage/S5ConversationStore')
```

#### 3. Insufficient Balance Errors
**Problem**: Tests fail with "insufficient funds"

**Solution**: Increase initial funding amounts
```typescript
setMockBalance(userAccount.address, BigInt(20000000)); // Double funding
```

#### 4. Test Timeout Errors
**Problem**: Tests timeout waiting for responses

**Solution**: Increase timeout or check mock delays
```typescript
// Increase wait time
await new Promise(resolve => setTimeout(resolve, 200));

// Or adjust vitest timeout
// vitest.config.ts: testTimeout: 60000
```

### Debug Commands

```bash
# Check test file syntax
npx tsc --noEmit tests/e2e/*.ts
# Run single test with verbose output
npx vitest run --reporter=verbose tests/e2e/05-full-cycle.test.ts
# Check mock implementations
grep -r "vi.mock" tests/e2e/
# List all test files
find tests/e2e -name "*.test.ts" -type f | sort
```

### Environment Variables

```bash
export TEST_TIMEOUT=30000      # Test timeout in ms
export MOCK_DELAY=100          # Mock response delay
export TEST_NETWORK=sepolia    # Test network name
```

## CI/CD Integration

Tests run automatically via GitHub Actions:
- **Schedule**: Daily at 00:00 UTC
- **Trigger**: On push to main, PR updates
- **Manual**: Via workflow_dispatch
- **Reports**: Stored as artifacts for 30 days

Workflow configuration: `.github/workflows/e2e.yml`

### GitHub Actions Setup

The workflow performs:
1. Environment setup (Node.js, dependencies)
2. Test execution with JSON output
3. Report generation and artifact upload
4. PR commenting with results
5. Status check enforcement

## Test Writing Guidelines

When adding new E2E tests:

1. **Use Test Infrastructure**: Import from `./setup/test-accounts`, `./setup/mock-llm-host`, `./setup/test-helpers`
2. **Mock External Dependencies**: Use `vi.mock()` for SessionManager, S5ConversationStore, etc.
3. **Keep Tests Deterministic**: Use fixed values (jobId: 1234) instead of random
4. **Clean Up Resources**: Always cleanup SDK and stop mocks in `afterEach()`
5. **Test Both Paths**: Include success cases and error handling

## Performance Targets
- Individual tests: < 500ms
- Test suites: < 2s  
- Full E2E run: < 5s

## Support

For issues or questions:
- Check troubleshooting section above
- Review existing test examples
- Open an issue on GitHub with:
  - Test output/error message
  - Steps to reproduce
  - Environment details