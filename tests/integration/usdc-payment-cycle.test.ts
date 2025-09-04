import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ethers } from 'ethers';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.test' });

describe('USDC Payment Integration - Real Base Sepolia', () => {
  let provider: ethers.providers.JsonRpcProvider;
  let userSigner: ethers.Wallet;
  let hostSigner: ethers.Wallet;
  let usdcContract: ethers.Contract;
  let jobMarketplace: ethers.Contract;
  let transactionReport: any[] = [];
  let initialBalances: any = {};
  let currentJobId: string;

  const USDC_DECIMALS = 6;
  const PAYMENT_AMOUNT = ethers.utils.parseUnits('5', USDC_DECIMALS); // 5 USDC
  const PRICE_PER_TOKEN_USDC = ethers.utils.parseUnits('0.005', USDC_DECIMALS); // 0.005 USDC per token
  const TOKENS_TO_PROVE = 1000; // 1000 tokens * 0.005 = 5 USDC total

  beforeAll(async () => {
    provider = new ethers.providers.JsonRpcProvider(
      process.env.RPC_URL_BASE_SEPOLIA,
      { chainId: 84532, name: 'base-sepolia' }
    );
    userSigner = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, provider);
    hostSigner = new ethers.Wallet(process.env.TEST_HOST_1_PRIVATE_KEY!, provider);
    
    // Setup USDC contract
    const erc20Abi = [
      'function balanceOf(address) view returns (uint256)',
      'function approve(address,uint256) returns (bool)',
      'function allowance(address,address) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ];
    
    usdcContract = new ethers.Contract(
      process.env.CONTRACT_USDC_TOKEN!,
      erc20Abi,
      userSigner
    );
    
    // Setup JobMarketplace with correct ABI for USDC payments
    const jobMarketplaceAbi = [
      // Token payment - CORRECT ORDER: host first, then token (per user feedback)
      'function createSessionJobWithToken(address host, address token, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval) returns (uint256)',
      
      // Standard session functions
      'function submitProofOfWork(uint256 jobId, bytes ekzlProof, uint256 tokensInBatch) returns (bool)',
      'function completeSessionJob(uint256 jobId) returns (bool)',
      'function treasuryAddress() view returns (address)',
      
      // Events
      'event SessionJobCreated(uint256 indexed jobId, address indexed user, address indexed host, uint256 deposit, uint256 pricePerToken, uint256 maxDuration)',
      'event SessionJobCompleted(uint256 indexed jobId, uint256 totalPayment)'
    ];
    
    jobMarketplace = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,
      jobMarketplaceAbi,
      userSigner
    );
    
    // Get actual treasury address
    const TREASURY = await jobMarketplace.treasuryAddress();
    
    // Record initial balances
    initialBalances.userUSDC = await usdcContract.balanceOf(userSigner.address);
    initialBalances.hostUSDC = await usdcContract.balanceOf(hostSigner.address);
    initialBalances.treasuryUSDC = await usdcContract.balanceOf(TREASURY);
    
    console.log('\n=== USDC PAYMENT TEST SETUP ===');
    console.log('Contract:', process.env.CONTRACT_JOB_MARKETPLACE);
    console.log('USDC Token:', process.env.CONTRACT_USDC_TOKEN);
    console.log('Treasury:', TREASURY);
    console.log('\nInitial Balances:');
    console.log('  User USDC:', ethers.utils.formatUnits(initialBalances.userUSDC, USDC_DECIMALS));
    console.log('  Host USDC:', ethers.utils.formatUnits(initialBalances.hostUSDC, USDC_DECIMALS));
    console.log('  Treasury USDC:', ethers.utils.formatUnits(initialBalances.treasuryUSDC, USDC_DECIMALS));
  }, 60000);

  it('should verify user has sufficient USDC tokens', async () => {
    const symbol = await usdcContract.symbol();
    const decimals = await usdcContract.decimals();
    
    console.log(`\nToken: ${symbol}, Decimals: ${decimals}`);
    console.log(`Required: ${ethers.utils.formatUnits(PAYMENT_AMOUNT, USDC_DECIMALS)} USDC (for deposit)`);
    console.log(`Max tokens with 1 USDC at price 1000:`, 1000000 / PRICE_PER_TOKEN_USDC);
    console.log(`Available: ${ethers.utils.formatUnits(initialBalances.userUSDC, USDC_DECIMALS)} USDC`);
    
    if (initialBalances.userUSDC.lt(PAYMENT_AMOUNT)) {
      console.warn('⚠️ User has insufficient USDC - test will fail');
      console.warn('User needs at least 5 USDC on Base Sepolia');
    }
    
    expect(initialBalances.userUSDC.gte(PAYMENT_AMOUNT)).toBe(true);
  });

  it('should approve JobMarketplace to spend USDC', async () => {
    // Check current allowance
    const currentAllowance = await usdcContract.allowance(
      userSigner.address,
      jobMarketplace.address
    );
    
    console.log('\nCurrent allowance:', ethers.utils.formatUnits(currentAllowance, USDC_DECIMALS), 'USDC');
    
    // Always approve fresh 10 USDC to avoid stale allowance issues
    const APPROVAL_AMOUNT = ethers.utils.parseUnits('10', USDC_DECIMALS); // 10 USDC for multiple tests
    if (currentAllowance.lt(APPROVAL_AMOUNT)) {
      console.log('Approving', ethers.utils.formatUnits(APPROVAL_AMOUNT, USDC_DECIMALS), 'USDC...');
      
      const approveTx = await usdcContract.approve(
        jobMarketplace.address,
        APPROVAL_AMOUNT,
        { gasLimit: 100000 }
      );
      
      console.log('Approval tx sent:', approveTx.hash);
      const receipt = await approveTx.wait();
      
      expect(receipt.status).toBe(1);
      
      // Verify new allowance
      const newAllowance = await usdcContract.allowance(
        userSigner.address,
        jobMarketplace.address
      );
      
      console.log('✓ New allowance:', ethers.utils.formatUnits(newAllowance, USDC_DECIMALS), 'USDC');
      
      transactionReport.push({
        step: 'USDC Approval',
        txHash: approveTx.hash,
        amount: ethers.utils.formatUnits(PAYMENT_AMOUNT, USDC_DECIMALS) + ' USDC',
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber
      });
    } else {
      console.log('✓ Sufficient allowance already exists');
    }
  }, 60000);

  it('should create session job with USDC payment', async () => {
    console.log('\n=== CREATING USDC SESSION JOB ===');
    console.log('Host:', hostSigner.address);
    console.log('Payment:', ethers.utils.formatUnits(PAYMENT_AMOUNT, USDC_DECIMALS), 'USDC');
    console.log('Price per token:', ethers.utils.formatUnits(PRICE_PER_TOKEN_USDC, USDC_DECIMALS), 'USDC');
    console.log('Tokens to prove:', TOKENS_TO_PROVE);
    
    try {
      // First get job ID using staticCall (RECOMMENDED method)
      console.log('Getting job ID with staticCall...');
      const jobIdFromStatic = await jobMarketplace.callStatic.createSessionJobWithToken(
        hostSigner.address,                // 1. host address (FIRST per user!)
        process.env.CONTRACT_USDC_TOKEN!, // 2. token address
        PAYMENT_AMOUNT,                    // 3. deposit in USDC (1000000 = 1 USDC)
        PRICE_PER_TOKEN_USDC,              // 4. price per token (1000 = 0.001 USDC)
        3600,                              // 5. max duration
        100                                // 6. proof interval (minimum)
      );
      console.log('✓ Job ID from staticCall:', jobIdFromStatic.toString());
      currentJobId = jobIdFromStatic.toString();
      
      // Now execute the actual transaction
      const tx = await jobMarketplace.createSessionJobWithToken(
        hostSigner.address,                // 1. host address (FIRST per user!)
        process.env.CONTRACT_USDC_TOKEN!, // 2. token address
        PAYMENT_AMOUNT,                    // 3. deposit in USDC (1000000 = 1 USDC)
        PRICE_PER_TOKEN_USDC,              // 4. price per token (1000 = 0.001 USDC)
        3600,                              // 5. max duration
        100,                               // 6. proof interval (minimum)
        { gasLimit: 500000 }
      );
      
      console.log('Transaction sent:', tx.hash);
      const receipt = await tx.wait();
      
      expect(receipt.status).toBe(1);
      
      // Also verify via event parsing (alternative method)
      let jobIdFromEvent: string | undefined;
      for (const log of receipt.logs) {
        try {
          const parsed = jobMarketplace.interface.parseLog(log);
          if (parsed.name === 'SessionJobCreated') {
            jobIdFromEvent = parsed.args.jobId.toString();
            console.log('✓ Job ID from event:', jobIdFromEvent);
            break;
          }
        } catch {}
      }
      
      // Verify both methods give same result
      if (jobIdFromEvent && jobIdFromEvent === currentJobId) {
        console.log('✓ Job ID verified by both methods');
      }
      
      // Show what the WRONG method would have given (for education)
      if (receipt.logs[0]?.topics[1]) {
        const wrongJobId = ethers.BigNumber.from(receipt.logs[0].topics[1]).toString();
        const userAddressDecimal = ethers.BigNumber.from(userSigner.address).toString();
        console.log('⚠️  WRONG: topics[1] gives:', wrongJobId);
        console.log('  User address in decimal:', userAddressDecimal);
        console.log('  These match:', wrongJobId === userAddressDecimal ? 'YES - This is the bug!' : 'NO');
      }
      
      transactionReport.push({
        step: 'Session Job (USDC)',
        txHash: tx.hash,
        jobId: currentJobId,
        amount: ethers.utils.formatUnits(PAYMENT_AMOUNT, USDC_DECIMALS) + ' USDC',
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber
      });
      
      console.log('✓ USDC session job created successfully');
      
      // Check USDC was transferred from user
      const userBalanceAfter = await usdcContract.balanceOf(userSigner.address);
      const userSpent = initialBalances.userUSDC.sub(userBalanceAfter);
      console.log('User USDC spent:', ethers.utils.formatUnits(userSpent, USDC_DECIMALS));
      
    } catch (error: any) {
      console.error('Failed to create USDC session:', error.message);
      throw error;
    }
  }, 120000);

  it('should have host submit proof of work', async () => {
    console.log('\n=== HOST SUBMITTING PROOF ===');
    
    const proof = ethers.utils.hexlify(ethers.utils.randomBytes(256));
    
    const hostContract = jobMarketplace.connect(hostSigner);
    
    console.log('Job ID:', currentJobId);
    console.log('Tokens to prove:', TOKENS_TO_PROVE);
    console.log('Expected payment:', (TOKENS_TO_PROVE * PRICE_PER_TOKEN_USDC / 1000000).toFixed(3), 'USDC');
    
    const tx = await hostContract.submitProofOfWork(
      currentJobId,
      proof,
      TOKENS_TO_PROVE,
      { gasLimit: 300000 }
    );
    
    console.log('Proof tx sent:', tx.hash);
    const receipt = await tx.wait();
    
    expect(receipt.status).toBe(1);
    
    transactionReport.push({
      step: 'Proof Submission',
      txHash: tx.hash,
      jobId: currentJobId,
      tokensProcessed: TOKENS_TO_PROVE,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber
    });
    
    console.log('✓ Proof submitted successfully');
  }, 120000);

  it('should complete session and verify USDC payment settlement', async () => {
    console.log('\n=== COMPLETING SESSION FOR USDC PAYMENT ===');
    
    // User completes the session
    const tx = await jobMarketplace.completeSessionJob(currentJobId, { gasLimit: 300000 });
    console.log('Complete tx sent:', tx.hash);
    const receipt = await tx.wait();
    
    expect(receipt.status).toBe(1);
    
    transactionReport.push({
      step: 'Session Completion',
      txHash: tx.hash,
      jobId: currentJobId,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber
    });
    
    // Wait for settlement
    console.log('Waiting for USDC transfers to settle...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get treasury address
    const TREASURY = await jobMarketplace.treasuryAddress();
    
    // Check final balances
    const finalUserUSDC = await usdcContract.balanceOf(userSigner.address);
    const finalHostUSDC = await usdcContract.balanceOf(hostSigner.address);
    const finalTreasuryUSDC = await usdcContract.balanceOf(TREASURY);
    
    // Calculate changes
    const userSpent = initialBalances.userUSDC.sub(finalUserUSDC);
    const hostEarned = finalHostUSDC.sub(initialBalances.hostUSDC);
    const treasuryEarned = finalTreasuryUSDC.sub(initialBalances.treasuryUSDC);
    
    console.log('\n=== USDC PAYMENT DISTRIBUTION ===');
    console.log('User spent:', ethers.utils.formatUnits(userSpent, USDC_DECIMALS), 'USDC');
    console.log('Host received:', ethers.utils.formatUnits(hostEarned, USDC_DECIMALS), 'USDC');
    console.log('Treasury received:', ethers.utils.formatUnits(treasuryEarned, USDC_DECIMALS), 'USDC');
    
    // Calculate expected based on tokens proven (not full deposit)
    const totalPayment = ethers.BigNumber.from(TOKENS_TO_PROVE * PRICE_PER_TOKEN_USDC);
    const expectedHost = totalPayment.mul(90).div(100);
    const expectedTreasury = totalPayment.mul(10).div(100);
    
    console.log('\nExpected Distribution:');
    console.log('  Host (90%):', ethers.utils.formatUnits(expectedHost, USDC_DECIMALS), 'USDC');
    console.log('  Treasury (10%):', ethers.utils.formatUnits(expectedTreasury, USDC_DECIMALS), 'USDC');
    
    // Verify payments
    if (hostEarned.gte(expectedHost.sub(100))) { // Allow small rounding
      console.log('✅ Host received correct USDC payment');
    } else {
      console.log('❌ Host payment incorrect');
    }
    
    if (treasuryEarned.gte(expectedTreasury.sub(100))) {
      console.log('✅ Treasury received correct USDC payment');
    } else {
      console.log('❌ Treasury payment incorrect');
    }
    
    expect(userSpent.eq(PAYMENT_AMOUNT)).toBe(true);
    expect(hostEarned.gt(0)).toBe(true);
    expect(treasuryEarned.gt(0)).toBe(true);
  }, 120000);

  it('should generate transaction report', () => {
    console.log('\n' + '='.repeat(50));
    console.log('USDC PAYMENT TRANSACTION REPORT - BASE SEPOLIA');
    console.log('='.repeat(50));
    console.log(`Network: Base Sepolia (Chain ID: 84532)`);
    console.log(`USDC Token: ${process.env.CONTRACT_USDC_TOKEN}`);
    console.log(`JobMarketplace: ${process.env.CONTRACT_JOB_MARKETPLACE}`);
    console.log(`Session Job ID: ${currentJobId}`);
    console.log(`Total Transactions: ${transactionReport.length}`);
    
    transactionReport.forEach((tx, i) => {
      console.log(`\n${i + 1}. ${tx.step}`);
      if (tx.txHash) {
        console.log(`   Hash: ${tx.txHash}`);
        console.log(`   Block: ${tx.blockNumber}`);
        console.log(`   Gas Used: ${tx.gasUsed}`);
      }
      if (tx.amount) console.log(`   Amount: ${tx.amount}`);
      if (tx.tokensProcessed) console.log(`   Tokens: ${tx.tokensProcessed}`);
    });
    
    console.log('\n📋 Verify on Basescan:');
    transactionReport.filter(tx => tx.txHash).forEach(tx => {
      console.log(`   https://sepolia.basescan.org/tx/${tx.txHash}`);
    });
    
    expect(transactionReport.filter(r => r.txHash).length).toBeGreaterThanOrEqual(3);
  });
});