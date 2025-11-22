import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

test('Verify cleanup effect and payment settlement', async ({ page }) => {
  console.log('=== Starting Cleanup and Payment Settlement Test ===');

  // Array to capture console logs
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log(`[Browser Console] ${text}`);
  });

  // Navigate to home page
  console.log('Step 1: Navigating to home page...');
  await page.goto('http://localhost:3002', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Connect wallet
  console.log('Step 2: Connecting wallet...');
  const connectButton = page.getByRole('button', { name: /connect wallet/i });
  if (await connectButton.isVisible()) {
    await connectButton.click();
    await page.waitForTimeout(2000);
  }

  // Navigate to existing session
  console.log('Step 3: Navigating to existing chat session...');
  await page.goto('http://localhost:3002/session-groups/sg-1763499035587-h5pip52/sess-1763528019302-87qk9rx', {
    waitUntil: 'networkidle'
  });
  await page.waitForTimeout(3000);

  // Check for cleanup effect mounted log
  console.log('Step 4: Checking for cleanup effect mounted log...');
  const mountedLog = consoleLogs.find(log => log.includes('🔍 Cleanup effect mounted'));
  if (mountedLog) {
    console.log('✅ Found cleanup effect mounted log:', mountedLog);
  } else {
    console.log('❌ No cleanup effect mounted log found');
    console.log('All console logs:', consoleLogs);
  }

  // Send a message
  console.log('Step 5: Sending a test message...');
  const textarea = page.locator('textarea[placeholder*="Type your message"]').first();
  await textarea.fill('Explain blockchain technology in detail, covering consensus mechanisms, cryptographic principles, and real-world applications. Make it comprehensive.');

  const sendButton = page.getByRole('button', { name: /send/i }).first();
  await sendButton.click();

  console.log('Step 6: Waiting for AI response...');
  await page.waitForTimeout(15000); // Wait for response

  // Check max_tokens fix - response should be longer than 50 tokens
  console.log('Step 7: Checking response length...');
  const messages = await page.locator('[data-role="assistant"]').all();
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    const text = await lastMessage.textContent();
    const wordCount = text?.split(/\s+/).length || 0;
    console.log(`Response word count: ${wordCount} (should be >50 words)`);
    if (wordCount > 50) {
      console.log('✅ max_tokens fix working - response is comprehensive');
    } else {
      console.log('❌ max_tokens still truncating at ~50 tokens');
    }
  }

  // Clear console logs before navigation
  consoleLogs.length = 0;

  // Navigate away to trigger cleanup
  console.log('Step 8: Navigating away to trigger cleanup...');
  await page.goto('http://localhost:3002', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Check for cleanup logs
  console.log('Step 9: Checking for cleanup logs...');
  const cleanupCalledLog = consoleLogs.find(log => log.includes('🔍 Cleanup function called'));
  const cleanupEndSessionLog = consoleLogs.find(log => log.includes('🧹 Cleanup: Ending WebSocket'));
  const cleanupSkippedLog = consoleLogs.find(log => log.includes('❌ Cleanup skipped'));

  if (cleanupCalledLog) {
    console.log('✅ Cleanup function was called:', cleanupCalledLog);
  } else {
    console.log('❌ Cleanup function was NOT called');
  }

  if (cleanupEndSessionLog) {
    console.log('✅ WebSocket session ended:', cleanupEndSessionLog);
  } else if (cleanupSkippedLog) {
    console.log('⚠️ Cleanup was skipped:', cleanupSkippedLog);
  } else {
    console.log('❌ No cleanup execution log found');
  }

  // Wait for settlement (30s dispute window + 5s buffer)
  console.log('Step 10: Waiting 35 seconds for payment settlement...');
  await page.waitForTimeout(35000);

  console.log('=== Test Complete ===');
  console.log('\nConsole Logs Summary:');
  console.log('- Cleanup mounted:', !!mountedLog);
  console.log('- Cleanup called:', !!cleanupCalledLog);
  console.log('- WebSocket ended:', !!cleanupEndSessionLog);
  console.log('- Cleanup skipped:', !!cleanupSkippedLog);

  // Save console logs to file
  const fs = require('fs');
  fs.writeFileSync('/tmp/cleanup-test-console.log', consoleLogs.join('\n'));
  console.log('\nFull console logs saved to: /tmp/cleanup-test-console.log');

  // Test assertions
  expect(mountedLog, 'Cleanup effect should be mounted').toBeTruthy();
  expect(cleanupCalledLog, 'Cleanup function should be called on navigation').toBeTruthy();

  if (!cleanupEndSessionLog && !cleanupSkippedLog) {
    throw new Error('No cleanup execution log found - neither success nor skip');
  }
});

test('Check blockchain payment settlement', async () => {
  console.log('=== Checking Blockchain Payment ===');

  const ethers = require('ethers');

  // Load environment variables
  require('dotenv').config({ path: '/workspace/.env.test' });

  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA);
  const hostEarningsAddress = process.env.CONTRACT_HOST_EARNINGS;
  const testHost1Address = process.env.TEST_HOST_1_ADDRESS;
  const usdcTokenAddress = process.env.CONTRACT_USDC_TOKEN;

  console.log('Contract addresses:');
  console.log('- HostEarnings:', hostEarningsAddress);
  console.log('- Test Host 1:', testHost1Address);
  console.log('- USDC Token:', usdcTokenAddress);

  // HostEarnings ABI (getBalance function)
  const abi = [
    'function getBalance(address host, address token) view returns (uint256)'
  ];

  const contract = new ethers.Contract(hostEarningsAddress, abi, provider);

  console.log('\nQuerying host USDC balance from HostEarnings contract...');
  const balance = await contract.getBalance(testHost1Address, usdcTokenAddress);
  const balanceFormatted = ethers.formatUnits(balance, 6); // USDC has 6 decimals

  console.log(`\nHost Accumulated Balance: ${balanceFormatted} USDC`);
  console.log(`Raw balance: ${balance.toString()}`);

  // Check Base Sepolia scanner link
  console.log(`\nView on BaseScan: https://sepolia.basescan.org/address/${hostEarningsAddress}#tokentxns`);

  if (parseFloat(balanceFormatted) > 0) {
    console.log('✅ Host has received payments');
  } else {
    console.log('⚠️ Host balance is 0 - either no payment yet or already withdrawn');
  }
});
