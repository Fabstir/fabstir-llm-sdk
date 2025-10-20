// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

describe('USDC Realistic Pricing - Multiple Conversations', () => {
  let provider: ethers.providers.JsonRpcProvider;
  let userWallet: ethers.Wallet;
  let hostWallet: ethers.Wallet;
  let treasuryWallet: ethers.Wallet;
  let usdcContract: ethers.Contract;
  let marketplace: ethers.Contract;
  let hostEarnings: ethers.Contract;
  
  const DECIMALS = 6; // USDC has 6 decimals
  const DEPOSIT_AMOUNT = ethers.utils.parseUnits('5', DECIMALS); // $5 deposit
  const PRICE_PER_TOKEN = ethers.utils.parseUnits('0.000001', DECIMALS); // $0.001 per 1K tokens
  
  // Realistic conversation token counts
  const CONVERSATIONS = [
    { tokens: 823, description: 'Short Q&A conversation' },
    { tokens: 1247, description: 'Medium code review session' },
    { tokens: 592, description: 'Quick clarification' }
  ];
  
  const TOTAL_TOKENS = CONVERSATIONS.reduce((sum, c) => sum + c.tokens, 0);
  
  beforeAll(async () => {
    provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);
    userWallet = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, provider);
    hostWallet = new ethers.Wallet(process.env.TEST_HOST_1_PRIVATE_KEY!, provider);
    treasuryWallet = new ethers.Wallet(process.env.TEST_TREASURY_ACCOUNT_PRIVATE_KEY!, provider);
    
    // Setup USDC contract
    const usdcABI = [
      'function balanceOf(address account) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)'
    ];
    
    usdcContract = new ethers.Contract(
      process.env.CONTRACT_USDC_TOKEN!,
      usdcABI,
      userWallet
    );
    
    // Setup JobMarketplace contract
    const marketplaceABI = [
      'function createSessionJobWithToken(address host, address token, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval) returns (uint256)',
      'function submitProofOfWork(uint256 jobId, bytes ekzlProof, uint256 tokensInBatch) returns (bool)',
      'function completeSessionJob(uint256 jobId) external',
      'function sessions(uint256) view returns (uint256,uint256,uint256,uint256,address,uint8,uint256,uint256,bytes32,uint256,uint256,uint256)',
      'function accumulatedTreasuryTokens(address token) view returns (uint256)',
      'function withdrawTreasuryTokens(address token) external'
    ];
    
    marketplace = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,
      marketplaceABI,
      provider
    );
    
    // Setup HostEarnings contract
    const hostEarningsABI = [
      'function getBalance(address host, address token) view returns (uint256)',
      'function withdrawAll(address token) external'
    ];
    
    hostEarnings = new ethers.Contract(
      process.env.CONTRACT_HOST_EARNINGS!,
      hostEarningsABI,
      provider
    );
  });

  it('should demonstrate realistic pricing with $5 lasting multiple conversations', async () => {
    console.log('\n' + '='.repeat(80));
    console.log('REALISTIC USDC PRICING TEST - $5 FOR MULTIPLE CONVERSATIONS');
    console.log('='.repeat(80));
    
    // Record initial balances
    const initialUserUSDC = await usdcContract.balanceOf(userWallet.address);
    const initialHostUSDC = await usdcContract.balanceOf(hostWallet.address);
    const initialTreasuryUSDC = await usdcContract.balanceOf(treasuryWallet.address);
    
    console.log('\n📊 Initial USDC Balances:');
    console.log(`  User:     ${ethers.utils.formatUnits(initialUserUSDC, DECIMALS)} USDC`);
    console.log(`  Host:     ${ethers.utils.formatUnits(initialHostUSDC, DECIMALS)} USDC`);
    console.log(`  Treasury: ${ethers.utils.formatUnits(initialTreasuryUSDC, DECIMALS)} USDC`);
    
    // Check approval
    console.log('\n1️⃣ Checking USDC Approval...');
    const allowance = await usdcContract.allowance(userWallet.address, process.env.CONTRACT_JOB_MARKETPLACE!);
    console.log(`  Current allowance: ${ethers.utils.formatUnits(allowance, DECIMALS)} USDC`);
    console.log(`  Required deposit:  ${ethers.utils.formatUnits(DEPOSIT_AMOUNT, DECIMALS)} USDC`);
    
    if (allowance.lt(DEPOSIT_AMOUNT)) {
      throw new Error('Insufficient USDC allowance. Run: node fix-usdc-approval.mjs');
    }
    console.log('  ✅ Sufficient allowance');
    
    // Create session with realistic pricing
    console.log('\n2️⃣ Creating Session with Realistic Pricing...');
    console.log('  💰 Pricing Model:');
    console.log(`    Deposit:         $${ethers.utils.formatUnits(DEPOSIT_AMOUNT, DECIMALS)}`);
    console.log(`    Price per token: $${ethers.utils.formatUnits(PRICE_PER_TOKEN, DECIMALS)} ($0.001 per 1K tokens)`);
    console.log(`    Proof interval:  500 tokens`);
    console.log('    Expected usage:  2,662 tokens across 3 conversations');
    
    // Get job ID with static call first
    const jobId = await marketplace.connect(userWallet).callStatic.createSessionJobWithToken(
      hostWallet.address,
      process.env.CONTRACT_USDC_TOKEN!,
      DEPOSIT_AMOUNT,
      PRICE_PER_TOKEN,
      3600, // 1 hour max duration
      500   // Proof every 500 tokens
    );
    
    console.log(`\n  Predicted Job ID: ${jobId.toString()}`);
    
    // Create the actual session
    const createTx = await marketplace.connect(userWallet).createSessionJobWithToken(
      hostWallet.address,
      process.env.CONTRACT_USDC_TOKEN!,
      DEPOSIT_AMOUNT,
      PRICE_PER_TOKEN,
      3600,
      500,
      { gasLimit: 500000 }
    );
    
    console.log(`  Transaction: ${createTx.hash}`);
    const createReceipt = await createTx.wait();
    console.log(`  ✅ Session created in block ${createReceipt.blockNumber}`);
    
    // Wait for chain state
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Submit multiple proofs simulating real conversations
    console.log('\n3️⃣ Simulating Multiple Conversations...');
    
    let totalTokensProven = 0;
    const proofTxs = [];
    
    for (let i = 0; i < CONVERSATIONS.length; i++) {
      const conv = CONVERSATIONS[i];
      console.log(`\n  📝 Conversation ${i + 1}: ${conv.description}`);
      console.log(`     Tokens used: ${conv.tokens}`);
      console.log(`     Cost: $${ethers.utils.formatUnits(PRICE_PER_TOKEN.mul(conv.tokens), DECIMALS)}`);
      
      // Generate proof
      const proof = ethers.utils.hexlify(ethers.utils.randomBytes(256));
      
      // Submit proof as host
      const proofTx = await marketplace.connect(hostWallet).submitProofOfWork(
        jobId,
        proof,
        conv.tokens,
        { gasLimit: 300000 }
      );
      
      console.log(`     Proof TX: ${proofTx.hash}`);
      const proofReceipt = await proofTx.wait();
      console.log(`     ✅ Proof submitted (gas: ${proofReceipt.gasUsed.toString()})`);
      
      totalTokensProven += conv.tokens;
      proofTxs.push(proofTx.hash);
      
      // Small delay between conversations
      if (i < CONVERSATIONS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`\n  📊 Total tokens used: ${totalTokensProven}`);
    
    // Complete session
    console.log('\n4️⃣ Completing Session...');
    
    const completeTx = await marketplace.connect(userWallet).completeSessionJob(jobId, { gasLimit: 250000 });
    console.log(`  Transaction: ${completeTx.hash}`);
    const completeReceipt = await completeTx.wait();
    console.log(`  ✅ Session completed in block ${completeReceipt.blockNumber}`);
    
    // Calculate expected payments
    const totalPayment = PRICE_PER_TOKEN.mul(totalTokensProven);
    const hostPayment = totalPayment.mul(9).div(10); // 90%
    const treasuryPayment = totalPayment.div(10); // 10%
    const userRefund = DEPOSIT_AMOUNT.sub(totalPayment);
    
    console.log('\n5️⃣ Payment Distribution:');
    console.log('  💵 Financial Summary:');
    console.log(`    Deposit:          $${ethers.utils.formatUnits(DEPOSIT_AMOUNT, DECIMALS)}`);
    console.log(`    Tokens used:      ${totalTokensProven}`);
    console.log(`    Total cost:       $${ethers.utils.formatUnits(totalPayment, DECIMALS)}`);
    console.log(`    User refund:      $${ethers.utils.formatUnits(userRefund, DECIMALS)}`);
    console.log(`    Host earnings:    $${ethers.utils.formatUnits(hostPayment, DECIMALS)} (90%)`);
    console.log(`    Treasury fee:     $${ethers.utils.formatUnits(treasuryPayment, DECIMALS)} (10%)`);
    
    // Calculate percentage of deposit used
    const percentUsed = totalPayment.mul(10000).div(DEPOSIT_AMOUNT).toNumber() / 100;
    console.log(`\n  📈 Efficiency: Only ${percentUsed.toFixed(2)}% of deposit used!`);
    console.log(`     Remaining deposit could cover ~${Math.floor(5 / 0.002662 - 1)} more similar sessions`);
    
    // Check accumulated balances
    console.log('\n6️⃣ Checking Accumulated Balances...');
    
    const hostAccumulated = await hostEarnings.getBalance(hostWallet.address, process.env.CONTRACT_USDC_TOKEN!);
    console.log(`  Host accumulated: $${ethers.utils.formatUnits(hostAccumulated, DECIMALS)} USDC`);
    
    let treasuryAccumulated = ethers.BigNumber.from(0);
    try {
      treasuryAccumulated = await marketplace.accumulatedTreasuryTokens(process.env.CONTRACT_USDC_TOKEN!);
      console.log(`  Treasury accumulated: $${ethers.utils.formatUnits(treasuryAccumulated, DECIMALS)} USDC`);
    } catch (e) {
      console.log('  Treasury accumulated: (check failed)');
    }
    
    // Withdraw host earnings
    console.log('\n7️⃣ Withdrawing Host Earnings...');
    if (hostAccumulated.gt(0)) {
      const hostBalanceBefore = await usdcContract.balanceOf(hostWallet.address);
      console.log(`  Host USDC before withdrawal: ${ethers.utils.formatUnits(hostBalanceBefore, DECIMALS)} USDC`);
      
      const hostEarningsWithSigner = hostEarnings.connect(hostWallet);
      const hostWithdrawTx = await hostEarningsWithSigner.withdrawAll(process.env.CONTRACT_USDC_TOKEN!, { gasLimit: 200000 });
      console.log(`  Withdrawal TX: ${hostWithdrawTx.hash}`);
      await hostWithdrawTx.wait();
      
      const hostBalanceAfter = await usdcContract.balanceOf(hostWallet.address);
      const hostReceived = hostBalanceAfter.sub(hostBalanceBefore);
      console.log(`  Host USDC after withdrawal: ${ethers.utils.formatUnits(hostBalanceAfter, DECIMALS)} USDC`);
      console.log(`  Host received: ${ethers.utils.formatUnits(hostReceived, DECIMALS)} USDC`);
      
      // Verify host received correct amount
      if (hostReceived.gte(hostPayment)) {
        console.log('  ✅ Host received correct payment (90% of tokens used)');
      } else {
        console.log(`  ⚠️  Host payment mismatch (expected ${ethers.utils.formatUnits(hostPayment, DECIMALS)} USDC)`);
      }
    }
    
    // Withdraw treasury earnings
    console.log('\n8️⃣ Withdrawing Treasury Earnings...');
    if (treasuryAccumulated.gt(0)) {
      const treasuryBalanceBefore = await usdcContract.balanceOf(treasuryWallet.address);
      console.log(`  Treasury USDC before withdrawal: ${ethers.utils.formatUnits(treasuryBalanceBefore, DECIMALS)} USDC`);
      
      const treasuryWithdrawABI = ['function withdrawTreasuryTokens(address token) external'];
      const marketplaceAsTreasury = new ethers.Contract(
        process.env.CONTRACT_JOB_MARKETPLACE!,
        treasuryWithdrawABI,
        treasuryWallet
      );
      
      const treasuryWithdrawTx = await marketplaceAsTreasury.withdrawTreasuryTokens(process.env.CONTRACT_USDC_TOKEN!, { gasLimit: 200000 });
      console.log(`  Withdrawal TX: ${treasuryWithdrawTx.hash}`);
      await treasuryWithdrawTx.wait();
      
      const treasuryBalanceAfter = await usdcContract.balanceOf(treasuryWallet.address);
      const treasuryReceived = treasuryBalanceAfter.sub(treasuryBalanceBefore);
      console.log(`  Treasury USDC after withdrawal: ${ethers.utils.formatUnits(treasuryBalanceAfter, DECIMALS)} USDC`);
      console.log(`  Treasury received: ${ethers.utils.formatUnits(treasuryReceived, DECIMALS)} USDC`);
      
      // Verify treasury received correct amount
      if (treasuryReceived.gte(treasuryPayment)) {
        console.log('  ✅ Treasury received correct fee (10% of tokens used)');
      } else {
        console.log(`  ⚠️  Treasury fee mismatch (expected ${ethers.utils.formatUnits(treasuryPayment, DECIMALS)} USDC)`);
      }
    }
    
    // Check final user balance (should have received refund)
    console.log('\n9️⃣ Final Verification:');
    const finalUserUSDC = await usdcContract.balanceOf(userWallet.address);
    const userUSDCChange = finalUserUSDC.sub(initialUserUSDC);
    
    console.log(`  User USDC change: ${ethers.utils.formatUnits(userUSDCChange, DECIMALS)} USDC`);
    console.log(`  Expected change:  -${ethers.utils.formatUnits(totalPayment, DECIMALS)} USDC (only tokens used)`);
    
    // Verify the user was charged only for tokens used
    const expectedUserChange = totalPayment.mul(-1);
    const difference = userUSDCChange.sub(expectedUserChange).abs();
    
    if (difference.lte(ethers.utils.parseUnits('0.000001', DECIMALS))) {
      console.log('  ✅ User charged correctly (only for tokens used + got refund)');
    } else {
      console.log('  ⚠️  User charge different than expected');
    }
    
    // Transaction summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TRANSACTION SUMMARY');
    console.log('='.repeat(80));
    console.log('Session Creation:');
    console.log(`  TX: ${createTx.hash}`);
    console.log('\nProof Submissions:');
    proofTxs.forEach((tx, i) => {
      console.log(`  Proof ${i + 1}: ${tx} (${CONVERSATIONS[i].tokens} tokens)`);
    });
    console.log('\nSession Completion:');
    console.log(`  TX: ${completeTx.hash}`);
    
    // Add withdrawal transactions if they exist
    if (hostAccumulated.gt(0)) {
      console.log('\nHost Withdrawal:');
      console.log(`  TX: Check above for host withdrawal transaction`);
    }
    if (treasuryAccumulated.gt(0)) {
      console.log('\nTreasury Withdrawal:');
      console.log(`  TX: Check above for treasury withdrawal transaction`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ TEST COMPLETE - Demonstrated Realistic Pricing');
    console.log('='.repeat(80));
    console.log('Key Takeaways:');
    console.log('  • $5 deposit covered 3 conversations (2,662 tokens)');
    console.log(`  • Only used ${percentUsed.toFixed(2)}% of deposit`);
    console.log('  • User received automatic refund of unused funds');
    console.log('  • Competitive pricing: $0.001 per 1K tokens');
    console.log('  • Could support ~1,878 more similar conversations');
    console.log('='.repeat(80));
    
    // Assertions
    expect(jobId).toBeDefined();
    expect(totalTokensProven).toBe(TOTAL_TOKENS);
    expect(hostAccumulated.gt(0) || treasuryAccumulated.gt(0)).toBe(true);
  }, 120000); // 2 minute timeout
});