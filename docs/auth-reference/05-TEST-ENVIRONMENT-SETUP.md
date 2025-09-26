# Test Environment Setup Guide

This guide helps you set up a robust testing environment for real wallet integration testing.

## Prerequisites

### Required Software
- Node.js 18+
- Chrome/Chromium browser
- MetaMask extension (for manual testing)
- Git

### Required Accounts
- GitHub account (for Playwright)
- Testnet faucet access
- Test email accounts (for notifications)

## Step 1: Install Testing Dependencies

```bash
# Core testing framework
npm install --save-dev @playwright/test

# MetaMask automation (Synpress)
npm install --save-dev @synthetixio/synpress

# Additional utilities
npm install --save-dev dotenv
npm install --save-dev cross-env

# Reporting tools
npm install --save-dev @playwright/test-reporter
npm install --save-dev allure-playwright
```

## Step 2: Create Test Wallet Infrastructure

### Generate Test Wallets

```javascript
// scripts/generate-test-wallets.js
const { ethers } = require('ethers');

function generateTestWallets(count = 3) {
  const wallets = [];

  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom();
    wallets.push({
      index: i,
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic.phrase
    });
  }

  return wallets;
}

// Generate and save to .env.test
const wallets = generateTestWallets();
console.log('Test Wallets Generated:');
wallets.forEach((w, i) => {
  console.log(`\n# Wallet ${i + 1}`);
  console.log(`TEST_WALLET_${i + 1}_ADDRESS=${w.address}`);
  console.log(`TEST_WALLET_${i + 1}_KEY=${w.privateKey}`);
  if (i === 0) {
    console.log(`TEST_METAMASK_SEED="${w.mnemonic}"`);
  }
});
```

### Set Up Environment Variables

```bash
# .env.test
# MetaMask Test Account
TEST_METAMASK_SEED="your twelve word test seed phrase goes here for testing only"
TEST_METAMASK_PASSWORD="TestPassword123!"

# Test Wallet Addresses (derived from seed)
TEST_WALLET_1_ADDRESS=0x1234567890123456789012345678901234567890
TEST_WALLET_1_KEY=0xabcdef...

# Chain RPC Endpoints
BASE_SEPOLIA_RPC=https://sepolia.base.org
OPBNB_TESTNET_RPC=https://opbnb-testnet-rpc.bnbchain.org

# Test Configuration
TEST_TIMEOUT=30000
TEST_RETRIES=3
HEADLESS_MODE=false

# API Keys (if needed)
INFURA_KEY=your_infura_key
ALCHEMY_KEY=your_alchemy_key
```

## Step 3: Configure Playwright

### Main Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';

// Load test environment
dotenvConfig({ path: '.env.test' });

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false, // MetaMask tests must run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for wallet tests
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list']
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,

    // Custom test context
    testIdAttribute: 'data-testid',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### Synpress Configuration (MetaMask)

```javascript
// synpress.config.js
const { defineConfig } = require('@synthetixio/synpress/playwright');

export default defineConfig({
  use: {
    headless: false, // MetaMask requires headed mode
    slowMo: 100, // Slow down for stability
    launchOptions: {
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
  },

  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },

  // MetaMask specific
  metamask: {
    version: 'latest',
    seed: process.env.TEST_METAMASK_SEED,
    password: process.env.TEST_METAMASK_PASSWORD,
    showTestNets: true,
  },
});
```

## Step 4: Fund Test Wallets

### Automated Faucet Script

```javascript
// scripts/fund-test-wallets.js
const axios = require('axios');
const { ethers } = require('ethers');

const FAUCETS = {
  baseSepolia: {
    url: 'https://faucet.base.org/api/claim',
    chainId: 84532,
    amount: '0.1'
  },
  opBNBTestnet: {
    url: 'https://testnet.bnbchain.org/faucet-smart/api/claim',
    chainId: 5611,
    amount: '0.5'
  }
};

async function fundWallet(address, chain) {
  const faucet = FAUCETS[chain];

  try {
    const response = await axios.post(faucet.url, {
      address: address,
      chainId: faucet.chainId
    });

    if (response.data.success) {
      console.log(`✅ Funded ${address} on ${chain} with ${faucet.amount} ETH`);
    } else {
      console.log(`❌ Failed to fund ${address} on ${chain}: ${response.data.error}`);
    }
  } catch (error) {
    console.error(`❌ Error funding wallet: ${error.message}`);
  }
}

// Fund all test wallets
async function fundAllTestWallets() {
  const addresses = [
    process.env.TEST_WALLET_1_ADDRESS,
    process.env.TEST_WALLET_2_ADDRESS,
    process.env.TEST_WALLET_3_ADDRESS
  ];

  for (const address of addresses) {
    await fundWallet(address, 'baseSepolia');
    await fundWallet(address, 'opBNBTestnet');
    // Wait between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

fundAllTestWallets().catch(console.error);
```

### Manual Faucet Links

- **Base Sepolia**: https://faucet.base.org
- **opBNB Testnet**: https://testnet.bnbchain.org/faucet-smart
- **Ethereum Sepolia**: https://sepoliafaucet.com

## Step 5: Create Test Helpers

### Wallet Manager

```typescript
// e2e/helpers/wallet-manager.ts
import { Page } from '@playwright/test';
import { Metamask } from '@synthetixio/synpress';

export class WalletManager {
  private metamask?: Metamask;
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async setupMetaMask() {
    // Initialize MetaMask with test seed
    this.metamask = await Metamask.init({
      seed: process.env.TEST_METAMASK_SEED,
      password: process.env.TEST_METAMASK_PASSWORD,
    });

    // Add custom networks
    await this.addTestNetworks();

    // Switch to Base Sepolia by default
    await this.metamask.switchNetwork('Base Sepolia');

    return this.metamask;
  }

  private async addTestNetworks() {
    const networks = [
      {
        name: 'Base Sepolia',
        rpcUrl: 'https://sepolia.base.org',
        chainId: 84532,
        symbol: 'ETH'
      },
      {
        name: 'opBNB Testnet',
        rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
        chainId: 5611,
        symbol: 'tBNB'
      }
    ];

    for (const network of networks) {
      await this.metamask.addNetwork(network);
    }
  }

  async connectWallet() {
    await this.page.click('[data-testid="connect-wallet"]');
    await this.metamask.acceptAccess();
  }

  async signMessage(message: string) {
    await this.metamask.signMessage(message);
  }

  async switchAccount(index: number) {
    await this.metamask.switchAccount(index);
  }

  async getBalance(): Promise<string> {
    return await this.page.evaluate(async () => {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const balance = await signer.getBalance();
      return ethers.utils.formatEther(balance);
    });
  }
}
```

### Test Data Factory

```typescript
// e2e/helpers/test-data.ts
export class TestDataFactory {
  static generateUsername(): string {
    return `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static generateMessage(): string {
    return `Test message ${Date.now()}`;
  }

  static getTestChains() {
    return [
      { id: 84532, name: 'Base Sepolia' },
      { id: 5611, name: 'opBNB Testnet' },
      { id: 1, name: 'Ethereum Mainnet' }
    ];
  }

  static getTestAddresses() {
    return {
      valid: '0x742d35Cc6634C0532925a3b844Bc9e7595f0fA01',
      invalid: '0xinvalid',
      zero: '0x0000000000000000000000000000000000000000'
    };
  }

  static getErrorCodes() {
    return {
      userRejected: 4001,
      unauthorized: 4100,
      unsupportedChain: 4902,
      disconnected: 4900
    };
  }
}
```

## Step 6: Docker Setup (Optional)

### Docker Compose for Isolated Testing

```yaml
# docker-compose.test.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=test
      - PORT=3000
    volumes:
      - .:/app
      - /app/node_modules

  test-runner:
    image: mcr.microsoft.com/playwright:v1.40.0
    working_dir: /work
    volumes:
      - .:/work
    environment:
      - TEST_METAMASK_SEED=${TEST_METAMASK_SEED}
      - TEST_METAMASK_PASSWORD=${TEST_METAMASK_PASSWORD}
    command: npm run test:e2e
    depends_on:
      - app

  local-chain:
    image: foundry:latest
    ports:
      - '8545:8545'
    command: anvil --fork-url ${BASE_SEPOLIA_RPC}
```

## Step 7: Test Scripts

### Package.json Scripts

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:specific": "playwright test -g",
    "test:metamask": "synpress test",
    "test:mobile": "playwright test --project=mobile",
    "test:setup": "node scripts/generate-test-wallets.js && node scripts/fund-test-wallets.js",
    "test:report": "playwright show-report"
  }
}
```

## Step 8: CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
  schedule:
    - cron: '0 0 * * *' # Daily tests

jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.40.0

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Run E2E tests
        env:
          TEST_METAMASK_SEED: ${{ secrets.TEST_METAMASK_SEED }}
          TEST_METAMASK_PASSWORD: ${{ secrets.TEST_METAMASK_PASSWORD }}
        run: npm run test:e2e

      - name: Upload test artifacts
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: |
            test-results/
            playwright-report/
            videos/
            screenshots/
```

## Step 9: Monitoring & Alerts

### Test Result Dashboard

```javascript
// scripts/test-monitor.js
const fs = require('fs');
const path = require('path');

function parseTestResults() {
  const resultsPath = path.join(__dirname, '../test-results/results.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

  const summary = {
    total: results.tests.length,
    passed: results.tests.filter(t => t.status === 'passed').length,
    failed: results.tests.filter(t => t.status === 'failed').length,
    flaky: results.tests.filter(t => t.status === 'flaky').length,
    duration: results.duration,
    timestamp: new Date().toISOString()
  };

  // Send to monitoring service
  sendToMonitoring(summary);

  // Alert on failures
  if (summary.failed > 0) {
    sendAlert(`E2E Tests Failed: ${summary.failed}/${summary.total}`);
  }

  return summary;
}
```

## Step 10: Troubleshooting

### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| MetaMask popup not appearing | Ensure headless=false, check extension loaded |
| Timeouts during wallet connection | Increase timeout, add retries |
| Flaky tests | Add explicit waits, use test.slow() |
| Out of testnet funds | Run funding script, check faucet limits |
| Port conflicts | Change port in config, kill existing processes |

## Maintenance Checklist

- [ ] Weekly: Check test wallet balances
- [ ] Weekly: Update MetaMask to latest version
- [ ] Monthly: Rotate test seeds
- [ ] Monthly: Clean up test data
- [ ] Quarterly: Review and update test scenarios

## Security Notes

⚠️ **Never use real funds or production wallets for testing!**

- Store test seeds in secrets management
- Rotate test credentials regularly
- Use separate test environments
- Never commit .env.test to repository
- Monitor test wallet activity

## Next Steps

1. Run `npm run test:setup` to generate wallets
2. Fund wallets using faucets
3. Configure your IDE for debugging
4. Run first test: `npm run test:e2e`
5. View results: `npm run test:report`