import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120000, // Increased for wallet interactions
  fullyParallel: false, // Run tests sequentially for wallet state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for wallet interactions
  reporter: 'html',
  
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3000',
    headless: true, // Run headless in Docker
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    permissions: ['clipboard-read', 'clipboard-write'],
    // Critical launch options for Smart Wallet
    launchOptions: {
      args: [
        '--disable-features=BlockThirdPartyCookies,ThirdPartyStoragePartitioning', // CRITICAL for Smart Wallet
        '--enable-features=WebAuthenticationAPI',
        '--disable-dev-shm-usage',       // avoids tiny /dev/shm issues
        '--no-sandbox'                   // required in Docker
      ]
    }
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'NODE_PATH=./node_modules npx next@14.2.0 dev -p 3001',
    port: 3001,
    reuseExistingServer: true,
    timeout: 120000,
  },
});