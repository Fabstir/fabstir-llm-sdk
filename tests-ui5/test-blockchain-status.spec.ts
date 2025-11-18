/**
 * Phase 8.5: Blockchain Network Status Test
 *
 * Automated test to check Base Sepolia blockchain status including:
 * - Current block number and timestamp
 * - Average block time (last 100 blocks)
 * - Current gas prices (base fee + priority fee)
 * - Network congestion indicator
 *
 * This replaces manual blockchain explorer checks with programmatic verification.
 */

import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

test.describe('Phase 8.5: Blockchain Network Status', () => {
  test('should fetch and validate Base Sepolia network status', async () => {
    console.log('[Test] ========================================');
    console.log('[Test] Phase 8.5: Blockchain Network Status');
    console.log('[Test] ========================================\n');

    // Get RPC URL from environment
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA;
    expect(rpcUrl).toBeDefined();
    console.log('[Test] Using RPC URL:', rpcUrl);

    // Create provider
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    console.log('[Test] ✅ Provider created\n');

    // ========================================
    // STEP 1: Get Current Block
    // ========================================
    console.log('[Test] === STEP 1: Current Block ===');

    const currentBlock = await provider.getBlockNumber();
    console.log('[Test] Current block number:', currentBlock);
    expect(currentBlock).toBeGreaterThan(0);
    console.log('[Test] ✅ Block number valid\n');

    // Get current block details
    const block = await provider.getBlock(currentBlock);
    expect(block).not.toBeNull();

    const blockTimestamp = block!.timestamp;
    const blockDate = new Date(blockTimestamp * 1000);
    console.log('[Test] Block timestamp:', blockTimestamp);
    console.log('[Test] Block date:', blockDate.toISOString());

    // Verify block is recent (within last 5 minutes)
    const now = Date.now() / 1000;
    const blockAge = now - blockTimestamp;
    console.log('[Test] Block age:', blockAge.toFixed(0), 'seconds');
    expect(blockAge).toBeLessThan(300); // Less than 5 minutes old
    console.log('[Test] ✅ Block is recent (< 5 minutes old)\n');

    // ========================================
    // STEP 2: Calculate Average Block Time
    // ========================================
    console.log('[Test] === STEP 2: Average Block Time ===');
    console.log('[Test] Fetching last 100 blocks...');

    const startBlock = currentBlock - 99;
    const startBlockData = await provider.getBlock(startBlock);
    expect(startBlockData).not.toBeNull();

    const startTimestamp = startBlockData!.timestamp;
    const timeDiff = blockTimestamp - startTimestamp;
    const avgBlockTime = timeDiff / 100; // 100 blocks

    console.log('[Test] Start block:', startBlock);
    console.log('[Test] End block:', currentBlock);
    console.log('[Test] Time difference:', timeDiff, 'seconds');
    console.log('[Test] Average block time:', avgBlockTime.toFixed(2), 'seconds');

    // Base Sepolia target is 2 seconds
    expect(avgBlockTime).toBeGreaterThan(1); // At least 1 second
    expect(avgBlockTime).toBeLessThan(5); // No more than 5 seconds (network health check)
    console.log('[Test] ✅ Average block time within expected range (1-5s)\n');

    // ========================================
    // STEP 3: Get Current Gas Prices
    // ========================================
    console.log('[Test] === STEP 3: Gas Prices ===');

    const feeData = await provider.getFeeData();
    console.log('[Test] Fee data:', {
      gasPrice: feeData.gasPrice?.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
    });

    // Verify gas prices are non-zero
    expect(feeData.gasPrice).not.toBeNull();
    expect(feeData.maxFeePerGas).not.toBeNull();

    const gasPriceGwei = Number(ethers.formatUnits(feeData.gasPrice!, 'gwei'));
    const maxFeeGwei = Number(ethers.formatUnits(feeData.maxFeePerGas!, 'gwei'));
    const priorityFeeGwei = feeData.maxPriorityFeePerGas
      ? Number(ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei'))
      : 0;

    console.log('[Test] Gas price (legacy):', gasPriceGwei.toFixed(4), 'gwei');
    console.log('[Test] Max fee per gas (EIP-1559):', maxFeeGwei.toFixed(4), 'gwei');
    console.log('[Test] Max priority fee (EIP-1559):', priorityFeeGwei.toFixed(4), 'gwei');

    // Sanity checks
    expect(gasPriceGwei).toBeGreaterThan(0);
    expect(gasPriceGwei).toBeLessThan(1000); // Shouldn't exceed 1000 gwei on testnet
    console.log('[Test] ✅ Gas prices within expected range\n');

    // ========================================
    // STEP 4: Network Congestion Indicator
    // ========================================
    console.log('[Test] === STEP 4: Network Congestion ===');

    // Check base fee from latest block
    const baseFee = block!.baseFeePerGas;
    if (baseFee) {
      const baseFeeGwei = Number(ethers.formatUnits(baseFee, 'gwei'));
      console.log('[Test] Base fee:', baseFeeGwei.toFixed(4), 'gwei');

      // Categorize congestion
      let congestionLevel: string;
      if (baseFeeGwei < 0.01) {
        congestionLevel = 'Low (< 0.01 gwei)';
      } else if (baseFeeGwei < 0.1) {
        congestionLevel = 'Normal (< 0.1 gwei)';
      } else if (baseFeeGwei < 1) {
        congestionLevel = 'Moderate (< 1 gwei)';
      } else {
        congestionLevel = 'High (>= 1 gwei)';
      }
      console.log('[Test] Network congestion:', congestionLevel);
    } else {
      console.log('[Test] ⚠️  Base fee not available (pre-EIP-1559 block)');
    }

    // Check transactions in latest block
    const txCount = block!.transactions.length;
    console.log('[Test] Transactions in latest block:', txCount);

    if (txCount > 0) {
      console.log('[Test] ✅ Network is active (has transactions)');
    } else {
      console.log('[Test] ⚠️  No transactions in latest block (network may be quiet)');
    }

    // ========================================
    // STEP 5: Test Account Balance Check
    // ========================================
    console.log('\n[Test] === STEP 5: Test Account Status ===');

    const testAccountAddress = process.env.TEST_USER_1_ADDRESS;
    expect(testAccountAddress).toBeDefined();
    console.log('[Test] Test account:', testAccountAddress);

    const balance = await provider.getBalance(testAccountAddress!);
    const balanceEth = Number(ethers.formatEther(balance));
    console.log('[Test] Test account balance:', balanceEth.toFixed(6), 'ETH');

    // Warn if balance is low
    if (balanceEth < 0.01) {
      console.log('[Test] ⚠️  WARNING: Test account balance is low (< 0.01 ETH)');
      console.log('[Test]     Some tests may fail due to insufficient gas fees');
    } else {
      console.log('[Test] ✅ Test account has sufficient balance for testing');
    }

    // ========================================
    // Summary Report
    // ========================================
    console.log('\n[Test] ========================================');
    console.log('[Test] Network Status Summary');
    console.log('[Test] ========================================');
    console.log('[Test] Network: Base Sepolia Testnet');
    console.log('[Test] Current Block:', currentBlock);
    console.log('[Test] Block Age:', blockAge.toFixed(0), 'seconds');
    console.log('[Test] Average Block Time:', avgBlockTime.toFixed(2), 'seconds');
    console.log('[Test] Gas Price:', gasPriceGwei.toFixed(4), 'gwei');
    console.log('[Test] Max Fee:', maxFeeGwei.toFixed(4), 'gwei');
    console.log('[Test] Test Account Balance:', balanceEth.toFixed(6), 'ETH');
    console.log('[Test] Network Health: ✅ Operational');
    console.log('[Test] ========================================\n');

    // All assertions passed
    expect(currentBlock).toBeGreaterThan(0);
    expect(avgBlockTime).toBeGreaterThan(0);
    expect(gasPriceGwei).toBeGreaterThan(0);
  });

  test('should verify RPC endpoint responsiveness', async () => {
    console.log('[Test] === Verifying RPC Responsiveness ===\n');

    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA;
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Measure response time for basic RPC call
    const startTime = Date.now();
    const blockNumber = await provider.getBlockNumber();
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log('[Test] RPC response time:', responseTime, 'ms');
    console.log('[Test] Block number:', blockNumber);

    // RPC should respond in < 5 seconds
    expect(responseTime).toBeLessThan(5000);

    if (responseTime < 500) {
      console.log('[Test] ✅ Excellent response time (< 500ms)');
    } else if (responseTime < 2000) {
      console.log('[Test] ✅ Good response time (< 2s)');
    } else {
      console.log('[Test] ⚠️  Slow response time (> 2s) - network may be congested');
    }

    console.log('[Test] ✅ RPC endpoint is responsive\n');
  });
});
