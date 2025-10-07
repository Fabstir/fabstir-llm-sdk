# Installation Guide

This guide covers installing the Fabstir Host CLI from source. This is a **pre-MVP** monorepo package - no npm package is published yet.

## Table of Contents
- [System Requirements](#system-requirements)
- [Installation from Source](#installation-from-source)
- [Environment Setup](#environment-setup)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Uninstallation](#uninstallation)

## System Requirements

### Minimum Requirements

- **Operating System**: Linux, macOS, or Windows 10/11 (with WSL2)
- **Node.js**: Version 18.0.0 or higher
- **pnpm**: Version 8.0.0 or higher (REQUIRED - npm causes dependency issues)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free space for dependencies
- **Network**: Stable internet connection

### Blockchain Requirements

- **Wallet**: Ethereum-compatible wallet with private key
- **ETH Balance**: Minimum 0.01 ETH on Base Sepolia (for gas fees)
- **FAB Tokens**: Minimum 1000 FAB for staking (testnet)
- **RPC Access**: Base Sepolia RPC endpoint
  - Free tier available from Alchemy, Infura, or public RPC
  - Recommended: Alchemy (https://www.alchemy.com)

### Development Tools

- **Git**: For cloning the repository
- **TypeScript**: Included in dependencies
- **Build Tools**: Included in monorepo

## Installation from Source

### Step 1: Install pnpm

**IMPORTANT**: Do not use npm! It causes dependency hoisting issues in this monorepo.

```bash
# Install pnpm globally (if not already installed)
npm install -g pnpm

# Verify pnpm installation
pnpm --version
# Should show 8.x.x or higher
```

### Step 2: Clone Repository

```bash
# Clone the fabstir-llm-sdk monorepo
git clone https://github.com/fabstir/fabstir-llm-sdk.git
cd fabstir-llm-sdk
```

### Step 3: Install Dependencies

```bash
# Install all monorepo dependencies
pnpm install
```

This installs dependencies for:
- `packages/sdk-core` (required dependency)
- `packages/host-cli` (the CLI you're installing)
- Other monorepo packages

### Step 4: Build SDK Core

The Host CLI depends on `@fabstir/sdk-core`, so build it first:

```bash
cd packages/sdk-core
pnpm build
cd ../..
```

Expected output:
```
> @fabstir/sdk-core@1.0.0 build
> pnpm run build:clean && pnpm run build:esm && pnpm run build:cjs && pnpm run build:types

✓ dist/ cleaned
✓ ES modules built
✓ CommonJS built
✓ Type definitions generated
```

### Step 5: Build Host CLI

```bash
cd packages/host-cli
pnpm build
```

Expected output:
```
> @fabstir/host-cli@1.0.0 build
> tsc

✓ TypeScript compiled successfully
```

### Step 6: Link CLI (Optional)

To use `pnpm host` from anywhere:

```bash
# While in packages/host-cli
pnpm link --global

# Now you can use from any directory
pnpm host --help
```

**Alternative**: Run directly without linking:

```bash
# From /workspace/packages/host-cli
pnpm host <command>

# Or from repository root
cd /workspace
pnpm --filter @fabstir/host-cli host <command>
```

## Environment Setup

### Create .env.test (If Not Exists)

**Note**: If you're working in the existing repository, `.env.test` should already exist at the root. **DO NOT create or modify it** - it's managed by the project owner.

If setting up a fresh development environment, you'll need access to the `.env.test` file with these variables:

```bash
# Contract Addresses (Base Sepolia Testnet)
CONTRACT_JOB_MARKETPLACE=0x...
CONTRACT_NODE_REGISTRY=0x...
CONTRACT_PROOF_SYSTEM=0x...
CONTRACT_HOST_EARNINGS=0x...
CONTRACT_MODEL_REGISTRY=0x...
CONTRACT_FAB_TOKEN=0x...
CONTRACT_USDC_TOKEN=0x...

# Network Configuration
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
CHAIN_ID=84532

# Test Accounts (for development)
TEST_HOST_1_PRIVATE_KEY=0x...
TEST_HOST_1_ADDRESS=0x...
```

**Security**: Never commit `.env.test` to Git!

### Get RPC URL

If you don't have an RPC URL:

1. Sign up for Alchemy (free tier): https://www.alchemy.com
2. Create a new app for "Base Sepolia"
3. Copy the HTTPS URL
4. Add to `.env.test` as `RPC_URL_BASE_SEPOLIA`

## Verification

### Verify Installation

```bash
# From packages/host-cli or repository root
pnpm host --help
```

Expected output:
```
Usage: fabstir-host [options] [command]

CLI tool for managing Fabstir host nodes

Options:
  -V, --version      output the version number
  -h, --help         display help for command

Commands:
  init [options]
  config <subcommand>
  wallet <subcommand>
  register [options]
  unregister [options]
  info [options]
  update-url <url> [options]
  update-models <models> [options]
  add-stake <amount> [options]
  update-metadata [options]
  status [options]
  withdraw [options]
  start [options]
  stop [options]
  logs [options]
  help [command]      display help for command
```

### Verify SDK Integration

```bash
# Test SDK initialization
cd packages/host-cli
node -e "
const { initializeSDK } = require('./dist/sdk/client.js');
initializeSDK('base-sepolia')
  .then(() => console.log('✓ SDK initialized successfully'))
  .catch(err => console.error('✗ SDK initialization failed:', err.message));
"
```

Expected output:
```
✓ SDK initialized successfully
```

### Run Tests

```bash
# From packages/host-cli
pnpm test
```

Expected output:
```
✓ tests/commands/register.test.ts (7 tests)
✓ tests/commands/unregister.test.ts (7 tests)
✓ tests/commands/update-url.test.ts (7 tests)
✓ tests/commands/update-models.test.ts (7 tests)
✓ tests/proof/submitter.test.ts (8 tests)

Test Files  5 passed (5)
     Tests  36 passed (36)
```

## Post-Installation

### First-Time Setup

1. **Verify you have FAB tokens** on Base Sepolia
2. **Get some ETH** for gas fees (from Base Sepolia faucet)
3. **Test connection**:

```bash
pnpm host info \
  --private-key 0xYOUR_PRIVATE_KEY \
  --rpc-url https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
```

4. **Register as a host**:

```bash
pnpm host register \
  --private-key 0xYOUR_PRIVATE_KEY \
  --rpc-url https://... \
  --stake 1000 \
  --url http://localhost:8083
```

### Development Workflow

```bash
# Make changes to source code
vim packages/host-cli/src/commands/your-command.ts

# Rebuild
cd packages/host-cli
pnpm build

# Test
pnpm test

# Run command
pnpm host your-command --options
```

### Watch Mode for Development

```bash
# Terminal 1: Watch and rebuild on changes
cd packages/host-cli
pnpm dev

# Terminal 2: Run commands
pnpm host <command>
```

## Troubleshooting

### Error: "command not found: pnpm"

**Problem**: pnpm not installed

**Solution**:
```bash
npm install -g pnpm
```

### Error: "Cannot find module '@fabstir/sdk-core'"

**Problem**: SDK core not built

**Solution**:
```bash
cd packages/sdk-core
pnpm build
cd ../host-cli
pnpm build
```

### Error: "Missing required environment variable: CONTRACT_JOB_MARKETPLACE"

**Problem**: `.env.test` not found or incomplete

**Solution**:
1. Verify `.env.test` exists at repository root: `ls -la /workspace/.env.test`
2. Check it contains all `CONTRACT_*` variables
3. Contact project owner for correct addresses if missing

### Error: "ENOENT: no such file or directory"

**Problem**: Dependencies not installed

**Solution**:
```bash
# From repository root
pnpm install

# Rebuild everything
cd packages/sdk-core && pnpm build && cd ../..
cd packages/host-cli && pnpm build && cd ../..
```

### Error: "pnpm: command not found" on Windows

**Problem**: pnpm not in PATH

**Solution**:
```bash
# Option 1: Use WSL2 (recommended for development)
wsl
npm install -g pnpm

# Option 2: Windows PowerShell
npm install -g pnpm
# Restart terminal
```

### Build Fails with TypeScript Errors

**Problem**: TypeScript compilation issues

**Solution**:
```bash
# Clean and rebuild
cd packages/host-cli
rm -rf dist node_modules
pnpm install
pnpm build

# If still failing, rebuild SDK core first
cd ../sdk-core
rm -rf dist node_modules
pnpm install
pnpm build
```

### Tests Fail

**Problem**: SDK or contract integration issues

**Solution**:
```bash
# Ensure SDK is built
cd packages/sdk-core && pnpm build && cd ../host-cli

# Run specific test to see details
npx vitest run tests/commands/register.test.ts --reporter=verbose

# Check .env.test has correct contract addresses
cat ../../.env.test | grep CONTRACT_
```

## Upgrading

### Update to Latest Version

```bash
# From repository root
git pull origin main

# Reinstall dependencies
pnpm install

# Rebuild SDK core
cd packages/sdk-core
pnpm build

# Rebuild host-cli
cd ../host-cli
pnpm build

# Run tests to verify
pnpm test
```

### Breaking Changes

Since this is pre-MVP, breaking changes may occur. After updating:

1. Check [CHANGELOG.md](../../CHANGELOG.md) for breaking changes
2. Review [SDK-INTEGRATION.md](SDK-INTEGRATION.md) for API changes
3. Run full test suite: `pnpm test`
4. Update your commands if API changed

## Uninstallation

### Remove Global Link

```bash
# If you linked globally
cd packages/host-cli
pnpm unlink --global
```

### Remove Repository

```bash
# From parent directory
rm -rf fabstir-llm-sdk
```

### Clean pnpm Cache (Optional)

```bash
pnpm store prune
```

## Additional Resources

### Package Scripts

```bash
# From packages/host-cli

# Build TypeScript
pnpm build

# Run tests
pnpm test

# Watch mode (auto-rebuild)
pnpm dev

# Type check (no build)
npx tsc --noEmit

# Clean dist/
rm -rf dist && pnpm build
```

### Monorepo Structure

```
fabstir-llm-sdk/
├── .env.test                    # Environment config (DO NOT COMMIT)
├── packages/
│   ├── sdk-core/                # Core SDK (dependency)
│   │   ├── src/
│   │   ├── dist/                # Built output
│   │   └── package.json
│   ├── host-cli/                # Host CLI (this package)
│   │   ├── src/
│   │   ├── dist/                # Built output
│   │   ├── tests/
│   │   └── package.json
│   └── sdk-node/                # Node.js features (future)
├── apps/
│   └── harness/                 # Next.js test harness
├── pnpm-workspace.yaml
└── package.json
```

### Build Order

Always build in this order:
1. `sdk-core` (dependency of host-cli)
2. `host-cli` (depends on sdk-core)

### Testing in Monorepo

```bash
# Test single package
cd packages/host-cli
pnpm test

# Test all packages
cd /workspace
pnpm -r test

# Test specific file
cd packages/host-cli
npx vitest run tests/commands/register.test.ts
```

## Next Steps

After installation:

1. Read [README.md](../README.md) for quick start
2. Review [COMMANDS.md](COMMANDS.md) for available commands
3. Check [CONFIGURATION.md](CONFIGURATION.md) for environment setup
4. Study [SDK-INTEGRATION.md](SDK-INTEGRATION.md) for architecture

---

**Pre-MVP Note**: This installation guide reflects the current pre-MVP monorepo structure. Post-MVP, the package will be published to npm and installation will be simpler (`npm install -g @fabstir/host-cli`).

Last Updated: October 2024 (Pre-MVP Source Installation)
