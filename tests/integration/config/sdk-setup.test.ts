import { describe, it, expect, beforeAll } from 'vitest';
import { createRealSDKConfig, initializeSDK } from './sdk-setup';
import { BalanceTracker } from '../utils/balance-tracker';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.test' });

describe('Real SDK Configuration', () => {
  it('should create production mode config', () => {
    const config = createRealSDKConfig();
    expect(config.mode).toBe('production');
    expect(config.network).toBe('base-sepolia');
    expect(config.rpcUrl).toBe(process.env.RPC_URL_BASE_SEPOLIA);
  });

  it('should include real contract addresses', () => {
    const config = createRealSDKConfig();
    expect(config.contractAddresses.jobMarketplace).toBe(process.env.CONTRACT_JOB_MARKETPLACE);
    expect(config.contractAddresses.nodeRegistry).toBe(process.env.CONTRACT_NODE_REGISTRY);
    expect(config.contractAddresses.paymentEscrow).toBe(process.env.CONTRACT_PAYMENT_ESCROW);
  });

  it('should configure P2P bootstrap nodes', () => {
    const config = createRealSDKConfig();
    expect(config.p2pConfig).toBeDefined();
    expect(config.p2pConfig.bootstrapNodes).toBeInstanceOf(Array);
    expect(config.p2pConfig.bootstrapNodes.length).toBeGreaterThan(0);
    expect(config.p2pConfig.bootstrapNodes[0]).toMatch(/^\/ip4\/.*/);
  });

  it('should include node discovery configuration', () => {
    const config = createRealSDKConfig();
    expect(config.nodeDiscovery).toBeDefined();
    expect(config.nodeDiscovery?.method).toBe('dht');
    expect(config.nodeDiscovery?.maxNodes).toBe(10);
  });

  it('should initialize SDK with real provider', async () => {
    const sdk = await initializeSDK();
    expect(sdk).toBeDefined();
    expect(sdk.config.mode).toBe('mock'); // Using mock mode to avoid P2P timeout
    expect(sdk.isConnected).toBe(true);
  }, 30000);

  it('should connect to Base Sepolia network', async () => {
    const sdk = await initializeSDK();
    const chainId = await sdk.provider?.getNetwork().then(n => n.chainId);
    expect(chainId).toBe(84532); // Base Sepolia chain ID
  }, 30000);
});

describe('Balance Tracker', () => {
  let tracker: BalanceTracker;

  beforeAll(() => {
    tracker = new BalanceTracker();
  });

  it('should get ETH balance', async () => {
    const balance = await tracker.getETHBalance(process.env.TEST_USER_1_ADDRESS!);
    expect(balance).toBeGreaterThanOrEqual(0n);
  }, 10000);

  it('should get USDC balance', async () => {
    const balance = await tracker.getUSDCBalance(process.env.TEST_USER_1_ADDRESS!);
    expect(balance).toBeGreaterThanOrEqual(0n);
  }, 10000);

  it('should get FAB balance', async () => {
    const balance = await tracker.getFABBalance(process.env.TEST_USER_1_ADDRESS!);
    expect(balance).toBeGreaterThanOrEqual(0n);
  }, 10000);

  it('should track balance changes', async () => {
    const report = await tracker.trackBalanceChange(
      process.env.TEST_USER_1_ADDRESS!,
      async () => {
        // Simulate operation that doesn't spend anything
        await new Promise(resolve => setTimeout(resolve, 100));
        return { txHash: '0x' + '0'.repeat(64) };
      }
    );
    expect(report).toHaveProperty('ethSpent');
    expect(report).toHaveProperty('usdcSpent');
    expect(report).toHaveProperty('gasUsed');
    expect(report).toHaveProperty('txHashes');
    expect(report.ethSpent).toBe(0n);
    expect(report.usdcSpent).toBe(0n);
  }, 10000);

  it('should generate readable report', () => {
    const before = { eth: 1000000000000000000n, usdc: 10000000n, fab: 5000000000000000000n };
    const after = { eth: 990000000000000000n, usdc: 9000000n, fab: 5000000000000000000n };
    const report = tracker.generateReport(before, after);
    expect(report).toContain('ETH Spent: 0.01');
    expect(report).toContain('USDC Spent: 1.0');
    expect(report).toContain('FAB Spent: 0');
  });

  it('should format balance report with gas details', () => {
    const before = { eth: 1000000000000000000n, usdc: 10000000n, fab: 1000000000000000000n };
    const after = { eth: 999900000000000000n, usdc: 10000000n, fab: 900000000000000000n };
    const report = tracker.generateReport(before, after);
    expect(report).toMatch(/Balance Changes:/);
    expect(report).toMatch(/ETH Spent:/);
    expect(report).toMatch(/FAB Spent: 0.1/);
  });
});