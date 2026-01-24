# UI5 Automated Test Suite

Production SDK tests with real blockchain, S5 storage, and WebSocket connections.

## Overview

This test suite validates UI5 functionality using:
- **Real blockchain**: Base Sepolia testnet transactions (5-15 second confirmations)
- **Real S5 storage**: Decentralized file storage (2-10 second uploads)
- **Real WebSocket**: Live LLM streaming from production nodes (5-15 second responses)
- **Real wallet**: MetaMask or Base Account Kit integration

## Prerequisites

### 1. Start UI5 Application

```bash
cd /workspace/apps/ui5
pnpm dev --port 3002
```

UI5 must be running at `http://localhost:3002` before running tests.

### 2. Configure Environment

Ensure `/workspace/apps/ui5/.env.local` has:
- Contract addresses (from `.env.test`)
- Base Sepolia RPC URL
- S5 portal configuration
- (Optional) Base Account Kit API keys

### 3. Wallet Setup

**For MetaMask**:
- Install MetaMask browser extension
- Import test account with private key from `.env.test`
- Add Base Sepolia network (chain ID: 84532)
- Ensure account has testnet ETH for gas fees

**For Base Account Kit** (when configured):
- Set API keys in `.env.local`
- Wallet will auto-configure on first connection

### 4. Get Testnet Funds

Get testnet ETH from Base Sepolia faucet:
- https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- Need ~0.01 ETH for gas fees

## Running Tests

### Run All Tests

```bash
cd /workspace/tests-ui5
./run-all-tests.sh
```

**Expected duration**: 15-30 minutes (blockchain transactions are slow)

### Run Individual Test

```bash
cd /workspace/tests-ui5
node test-chat-operations.cjs
```

## Test Files

Tests run in this order:

1. **test-vector-db-phase2.cjs** - Create vector database
2. **test-vector-db-phase2-2.cjs** - Upload files to vector database
3. **test-vector-db-phase2-4.cjs** - Search vector database
4. **test-link-database-phase3-4.cjs** - Link vector DB to session group
5. **test-remove-document-phase3-5.cjs** - Remove documents from vector DB
6. **test-chat-operations.cjs** - Chat session creation and messaging
7. **test-navigation-phase5.cjs** - UI navigation and state persistence
8. **test-error-handling-phase6.cjs** - Error handling and recovery

## Test Output

### Screenshots

All screenshots saved to `/workspace/test-screenshots/`

Format: `phase{N}-{step}-{description}.png`

### Console Logs

Tests capture:
- Browser console output (errors, warnings)
- Page errors and exceptions
- Test step progress
- Pass/fail status

### Test Results

```
========================================
Test Summary
========================================
Total tests: 8
Passed: 8
Failed: 0

🎉 All tests passed!
```

## Differences from UI4 Tests

UI5 tests have **increased timeouts** compared to UI4 (mock SDK):

| Operation | UI4 (Mock) | UI5 (Real) | Reason |
|-----------|------------|------------|--------|
| Wallet connect | 1s | 3s | MetaMask prompt |
| Database creation | 1s | 15s | Blockchain transaction |
| File upload | 2s | 10s | S5 upload + IPFS |
| Chat message | 1s | 15s | WebSocket + LLM inference |
| Transaction confirm | Instant | 5-15s | Blockchain mining |

## Troubleshooting

### "UI5 is not running"

**Solution**: Start UI5 first:
```bash
cd /workspace/apps/ui5 && pnpm dev --port 3002
```

### "Wallet not connected"

**Solution**:
1. Open UI5 in browser: `http://localhost:3002`
2. Click "Connect Wallet"
3. Approve connection in MetaMask
4. Re-run test

### "Transaction failed: insufficient funds"

**Solution**: Get testnet ETH from faucet (see Prerequisites section)

### "Timeout waiting for selector"

**Cause**: UI element not appearing (blockchain transaction pending)

**Solution**:
- Increase timeout in test script (already increased to 30-60s)
- Check Base Sepolia network status: https://sepolia.basescan.org/
- Verify contract addresses in `.env.local` match `.env.test`

### "WebSocket connection failed"

**Cause**: Production node offline or network issue

**Solution**:
1. Verify node URL in `.env.local`: `NEXT_PUBLIC_DEFAULT_HOST_URL`
2. Test node health: `curl http://81.150.166.91:8080/health`
3. Try alternative node if available

### "S5 upload failed"

**Cause**: S5 portal unavailable or file too large

**Solution**:
1. Verify S5 portal: `curl https://s5.platformlessai.ai`
2. Check file size (limit: 10MB)
3. Increase `UPLOAD_TIMEOUT` in test script

## Expected Test Coverage

### Wallet Operations
- [x] Connect MetaMask wallet
- [x] Connect Base Account Kit (when configured)
- [x] Create sub-account with spend permissions
- [x] Display wallet address
- [x] SDK initialization after connection

### Vector Database Operations
- [x] Create vector database
- [x] Upload documents to database
- [x] Search vectors with query
- [x] Delete vector database
- [x] Link database to session group
- [x] Unlink database from session group

### Session Group Operations
- [x] Create session group
- [x] List session groups
- [x] Open session group detail
- [x] Upload document to group
- [x] Link vector database to group
- [x] Delete session group

### Chat Operations
- [x] Create new chat session
- [x] Send text message
- [x] Receive AI response (streaming)
- [x] Send follow-up message
- [x] View conversation history
- [x] Delete chat session

### Navigation & UI
- [x] Navigate between pages
- [x] State persistence after refresh
- [x] Breadcrumb navigation
- [x] Back button functionality

### Error Handling
- [x] Network error display
- [x] Transaction failure recovery
- [x] Invalid input validation
- [x] Graceful degradation

## Performance Benchmarks

Expected performance with real blockchain:

- **Page load**: < 3 seconds
- **Wallet connection**: 2-5 seconds
- **Database creation**: 5-15 seconds (blockchain tx)
- **File upload**: 2-10 seconds (S5 storage)
- **Chat message**: 5-15 seconds (WebSocket + LLM)
- **Navigation**: < 1 second (client-side)

## Success Criteria

All tests must pass with:
- ✅ Real blockchain transactions confirmed
- ✅ Real S5 storage persisting data
- ✅ Real WebSocket streaming LLM responses
- ✅ No console errors during normal operations
- ✅ UI matches UI4 behavior (with longer wait times)

## Notes

1. **Tests are sequential** - Each test depends on previous state
2. **Blockchain is slow** - 15-30 minute total runtime is expected
3. **Network required** - Tests will fail without internet connection
4. **Testnet required** - Do NOT run on mainnet (will cost real money)
5. **Screenshots generated** - Check `/workspace/test-screenshots/` for visual confirmation

## Related Documentation

- **Migration Plan**: `/workspace/docs/ui5-reference/UI5_MIGRATION_PLAN.md`
- **UI4 Testing Summary**: `/workspace/docs/UI4_TESTING_SUMMARY.md`
- **SDK API**: `/workspace/docs/SDK_API.md`
- **Base Account Kit**: `/workspace/docs/ui5-reference/BASE_ACCOUNT_KIT_INTEGRATION.md`
