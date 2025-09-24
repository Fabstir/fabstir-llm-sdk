# Development Scripts

This directory contains various development and testing scripts that were previously in the project root. These are ad-hoc scripts used during development and debugging, separate from the formal test suite in `/workspace/tests/`.

## Directory Structure

### `/tests/`
Ad-hoc test scripts for various SDK features and contract interactions. These are development/debugging scripts, not part of the formal test suite.

- `test-*.js` - Various test scenarios for SDK functionality
- `simple-*.js` - Simplified test cases

**Note**: Many of these are outdated and superseded by the formal test suite in `/workspace/tests/`

### `/debug/`
Debugging and inspection utilities for contracts and transactions.

- `check-*.js` - Contract state inspection utilities
- `debug-*.js` - Debugging scripts for specific issues
- `decode-*.js` - Transaction decoding utilities

### `/contract-ops/`
Scripts for contract operations and fixes.

- `register-*.js` - Host registration scripts
- `fix-*.js` - Scripts to fix specific contract issues
- `activate-*.js` - Host activation scripts
- `submit-*.js` - Proof submission utilities

### `/utils/`
General utility scripts.

- `compile*.js` - Solidity compilation utilities
- `mock-*.js` - Mock services for testing
- `verify-*.js` - Verification utilities

## Important Notes

1. These scripts are **NOT** part of the production SDK
2. Most are development/debugging tools from earlier phases
3. The formal test suite is in `/workspace/tests/`
4. Many scripts may be outdated or no longer functional
5. Use with caution - these were quick debugging scripts

## Recommended Usage

For production testing, use the formal test suite:
```bash
pnpm test
```

These scripts should only be referenced for historical debugging context or specific troubleshooting scenarios.