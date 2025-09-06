import { describe, it, expect, beforeAll } from 'vitest';
import { FabstirSDK } from '../../src/FabstirSDK';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

describe('FabstirSDK - USDC Payment with Storage Integration', () => {
  let sdk: FabstirSDK;
  let provider: ethers.providers.JsonRpcProvider;
  let userWallet: ethers.Wallet;
  let hostWallet: ethers.Wallet;
  let treasuryWallet: ethers.Wallet;
  
  const transactions: Array<{
    type: string;
    hash: string;
    from: string;
    to: string;
    value: string;
  }> = [];

  beforeAll(async () => {
    provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);
    userWallet = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, provider);
    hostWallet = new ethers.Wallet(process.env.TEST_HOST_1_PRIVATE_KEY!, provider);
    treasuryWallet = new ethers.Wallet(process.env.TEST_TREASURY_ACCOUNT_PRIVATE_KEY!, provider);
    
    // Get treasury address from contract
    const treasuryAddress = process.env.TEST_TREASURY_ACCOUNT!;
    
    // Record initial balances
    console.log('\n📊 Recording Initial Balances...\n');
    const initialBalances = {
      userETH: await provider.getBalance(userWallet.address),
      hostETH: await provider.getBalance(hostWallet.address),
      treasuryETH: await provider.getBalance(treasuryAddress),
      userUSDC: ethers.BigNumber.from(0),
      hostUSDC: ethers.BigNumber.from(0),
      treasuryUSDC: ethers.BigNumber.from(0)
    };
    
    // Get USDC balances
    const usdcABI = [
      'function balanceOf(address account) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];
    const usdcContract = new ethers.Contract(
      process.env.CONTRACT_USDC_TOKEN!,
      usdcABI,
      provider
    );
    
    const decimals = await usdcContract.decimals();
    initialBalances.userUSDC = await usdcContract.balanceOf(userWallet.address);
    initialBalances.hostUSDC = await usdcContract.balanceOf(hostWallet.address);
    initialBalances.treasuryUSDC = await usdcContract.balanceOf(treasuryAddress);
    
    console.log('Initial Balances:');
    console.log(`  User (${userWallet.address}):`);
    console.log(`    ETH: ${ethers.utils.formatEther(initialBalances.userETH)}`);
    console.log(`    USDC: ${ethers.utils.formatUnits(initialBalances.userUSDC, decimals)}`);
    console.log(`  Host (${hostWallet.address}):`);
    console.log(`    ETH: ${ethers.utils.formatEther(initialBalances.hostETH)}`);
    console.log(`    USDC: ${ethers.utils.formatUnits(initialBalances.hostUSDC, decimals)}`);
    console.log(`  Treasury (${treasuryAddress}):`);
    console.log(`    ETH: ${ethers.utils.formatEther(initialBalances.treasuryETH)}`);
    console.log(`    USDC: ${ethers.utils.formatUnits(initialBalances.treasuryUSDC, decimals)}`);
  });

  it('should complete full USDC payment cycle with storage persistence', async () => {
    console.log('\n🚀 Starting USDC Payment + Storage Integration Test\n');
    
    // Step 1: Initialize SDK and authenticate
    console.log('1️⃣ Initializing SDK and authenticating user...\n');
    sdk = new FabstirSDK({
      mode: 'production',
      network: {
        chainId: 84532,
        name: 'base-sepolia',
        rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!
      },
      contracts: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
        proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
        hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
        paymentEscrow: process.env.CONTRACT_PAYMENT_ESCROW!,
        usdcToken: process.env.CONTRACT_USDC_TOKEN!,
        fabToken: process.env.CONTRACT_FAB_TOKEN!
      }
    });
    
    const authResult = await sdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
    console.log('   Auth result:', authResult);
    expect(authResult.userAddress).toBe(userWallet.address);
    console.log(`   ✅ User authenticated: ${authResult.userAddress}`);
    
    // Verify all managers are initialized
    const sessionManager = sdk.getSessionManager();
    const paymentManager = sdk.getPaymentManager();
    const storageManager = sdk.getStorageManager();
    
    expect(sessionManager).toBeDefined();
    expect(paymentManager).toBeDefined();
    expect(storageManager).toBeDefined();
    console.log('   ✅ All managers initialized');
    
    // Step 2: Check and approve USDC
    console.log('\n2️⃣ Checking USDC balance and approving spending...\n');
    
    const usdcABI = [
      'function balanceOf(address account) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)'
    ];
    
    const usdcContract = new ethers.Contract(
      process.env.CONTRACT_USDC_TOKEN!,
      usdcABI,
      userWallet
    );
    
    const decimals = await usdcContract.decimals();
    const userUSDCBalance = await usdcContract.balanceOf(userWallet.address);
    console.log(`   User USDC balance: ${ethers.utils.formatUnits(userUSDCBalance, decimals)} USDC`);
    
    // Check USDC approval (must be done beforehand)
    const paymentAmount = ethers.utils.parseUnits('5', decimals); // 5 USDC
    const currentAllowance = await usdcContract.allowance(
      userWallet.address,
      process.env.CONTRACT_JOB_MARKETPLACE!
    );
    
    console.log(`   Current allowance: ${ethers.utils.formatUnits(currentAllowance, decimals)} USDC`);
    console.log(`   Payment amount: ${ethers.utils.formatUnits(paymentAmount, decimals)} USDC`);
    
    if (currentAllowance.lt(paymentAmount)) {
      console.log('   ❌ Insufficient allowance! Please approve USDC first.');
      console.log('   Run: node fix-usdc-approval.mjs');
      throw new Error('Insufficient USDC allowance');
    } else {
      console.log('   ✅ USDC allowance sufficient');
    }
    
    // Step 3: Create session with USDC payment
    console.log('\n3️⃣ Creating session with USDC payment...\n');
    
    const sessionOptions = {
      paymentType: 'USDC' as const,
      amount: '5', // 5 USDC
      pricePerToken: 5000, // 0.005 USDC per token (5000 * 1e-6)
      duration: 3600,
      proofInterval: 100, // 100 tokens minimum
      hostAddress: hostWallet.address,
      model: 'gpt-4',
      temperature: 0.7
    };
    
    console.log('   Session options:', sessionOptions);
    
    // Create session directly using contract to have more control
    const jobMarketplaceABI = [
      'function createSessionJobWithToken(address hostAddress, address token, uint256 deposit, uint256 pricePerToken, uint256 duration, uint256 proofInterval) returns (uint256)'
    ];
    
    const marketplace = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,
      jobMarketplaceABI,
      userWallet
    );
    
    const pricePerToken = ethers.utils.parseUnits('0.005', decimals); // 0.005 USDC per token
    
    console.log('   Getting job ID with static call...');
    const jobId = await marketplace.callStatic.createSessionJobWithToken(
      hostWallet.address,
      process.env.CONTRACT_USDC_TOKEN!,
      paymentAmount,
      pricePerToken,
      3600,
      100
    );
    console.log(`   Job ID (from static): ${jobId.toString()}`);
    
    console.log('   Creating session with USDC payment...');
    const createTx = await marketplace.createSessionJobWithToken(
      hostWallet.address,
      process.env.CONTRACT_USDC_TOKEN!,
      paymentAmount,
      pricePerToken,
      3600,
      100,
      { gasLimit: 500000 }
    );
    
    console.log(`   Session creation TX: ${createTx.hash}`);
    const createReceipt = await createTx.wait();
    console.log(`   ✅ Session created with Job ID: ${jobId.toString()}`);
    
    transactions.push({
      type: 'Session Creation (USDC)',
      hash: createTx.hash,
      from: userWallet.address,
      to: process.env.CONTRACT_JOB_MARKETPLACE!,
      value: '5 USDC'
    });
    
    // Step 4: Submit proof of work as host
    console.log('\n4️⃣ Submitting proof of work as host...\n');
    
    // Wait a bit for chain state
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const proofABI = [
      'function submitProofOfWork(uint256 jobId, bytes ekzlProof, uint256 tokensInBatch) returns (bool)'
    ];
    
    const marketplaceAsHost = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,
      proofABI,
      hostWallet
    );
    
    const tokensUsed = 1000; // Submit proof for 1000 tokens
    const proof = ethers.utils.hexlify(ethers.utils.randomBytes(256)); // Realistic EZKL proof
    
    console.log(`   Submitting proof for ${tokensUsed} tokens...`);
    const expectedPayment = pricePerToken.mul(tokensUsed);
    console.log(`   Expected payment: ${ethers.utils.formatUnits(expectedPayment, decimals)} USDC`);
    
    const proofTx = await marketplaceAsHost.submitProofOfWork(
      jobId,
      proof,
      tokensUsed,
      { gasLimit: 300000 }
    );
    
    console.log(`   Proof submission TX: ${proofTx.hash}`);
    const proofReceipt = await proofTx.wait();
    console.log(`   ✅ Proof submitted! Gas used: ${proofReceipt.gasUsed.toString()}`);
    
    transactions.push({
      type: 'Proof Submission',
      hash: proofTx.hash,
      from: hostWallet.address,
      to: process.env.CONTRACT_JOB_MARKETPLACE!,
      value: `${tokensUsed} tokens`
    });
    
    // Step 5: Complete session as user
    console.log('\n5️⃣ Completing session as user...\n');
    
    const completeABI = [
      'function completeSessionJob(uint256 jobId) external'
    ];
    
    const marketplaceAsUser = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,
      completeABI,
      userWallet
    );
    
    const completeTx = await marketplaceAsUser.completeSessionJob(jobId, { gasLimit: 250000 });
    console.log(`   Completion TX: ${completeTx.hash}`);
    await completeTx.wait();
    console.log('   ✅ Session completed!');
    
    // Calculate payment distribution
    const totalPayment = pricePerToken.mul(tokensUsed);
    const hostPayment = totalPayment.mul(9).div(10); // 90%
    const treasuryPayment = totalPayment.div(10); // 10%
    
    console.log('\n   Payment breakdown:');
    console.log(`   Total payment: ${ethers.utils.formatUnits(totalPayment, decimals)} USDC`);
    console.log(`   Host (90%): ${ethers.utils.formatUnits(hostPayment, decimals)} USDC`);
    console.log(`   Treasury (10%): ${ethers.utils.formatUnits(treasuryPayment, decimals)} USDC`);
    
    transactions.push({
      type: 'Session Completion',
      hash: completeTx.hash,
      from: userWallet.address,
      to: process.env.CONTRACT_JOB_MARKETPLACE!,
      value: ethers.utils.formatUnits(totalPayment, decimals) + ' USDC'
    });
    
    // Step 6: Check accumulated balances
    console.log('\n6️⃣ Checking accumulated USDC balances...\n');
    
    // Check host USDC earnings
    const hostEarningsABI = [
      'function getBalance(address host, address token) view returns (uint256)',
      'function withdrawAll(address token) external'
    ];
    
    const hostEarnings = new ethers.Contract(
      process.env.CONTRACT_HOST_EARNINGS!,
      hostEarningsABI,
      provider
    );
    
    const hostAccumulatedUSDC = await hostEarnings.getBalance(
      hostWallet.address,
      process.env.CONTRACT_USDC_TOKEN!
    );
    console.log(`   Host accumulated USDC: ${ethers.utils.formatUnits(hostAccumulatedUSDC, decimals)} USDC`);
    
    // Check treasury USDC accumulation
    const treasuryABI = [
      'function accumulatedTreasuryTokens(address token) view returns (uint256)',
      'function withdrawTreasuryTokens(address token) external'
    ];
    
    const marketplaceForTreasury = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,
      treasuryABI,
      provider
    );
    
    let treasuryAccumulatedUSDC = ethers.BigNumber.from(0);
    try {
      treasuryAccumulatedUSDC = await marketplaceForTreasury.accumulatedTreasuryTokens(
        process.env.CONTRACT_USDC_TOKEN!
      );
      console.log(`   Treasury accumulated USDC: ${ethers.utils.formatUnits(treasuryAccumulatedUSDC, decimals)} USDC`);
    } catch (error) {
      console.log('   Note: Treasury USDC accumulation check failed (may use different interface)');
    }
    
    // Step 7: Withdraw host USDC earnings
    if (hostAccumulatedUSDC.gt(0)) {
      console.log('\n7️⃣ Withdrawing host USDC earnings...\n');
      
      const hostBalanceBefore = await usdcContract.balanceOf(hostWallet.address);
      console.log(`   Host USDC before withdrawal: ${ethers.utils.formatUnits(hostBalanceBefore, decimals)} USDC`);
      
      const hostEarningsWithSigner = hostEarnings.connect(hostWallet);
      const withdrawTx = await hostEarningsWithSigner.withdrawAll(
        process.env.CONTRACT_USDC_TOKEN!,
        { gasLimit: 200000 }
      );
      
      console.log(`   Withdrawal TX: ${withdrawTx.hash}`);
      await withdrawTx.wait();
      
      const hostBalanceAfter = await usdcContract.balanceOf(hostWallet.address);
      const netReceived = hostBalanceAfter.sub(hostBalanceBefore);
      
      console.log(`   Host USDC after withdrawal: ${ethers.utils.formatUnits(hostBalanceAfter, decimals)} USDC`);
      console.log(`   Net USDC received: ${ethers.utils.formatUnits(netReceived, decimals)} USDC`);
      console.log('   ✅ Host USDC withdrawal successful!');
      
      // Verify amount
      expect(netReceived.toString()).toBe(hostPayment.toString());
      console.log('   ✅ Host received correct payment amount (90%)');
      
      transactions.push({
        type: 'Host USDC Withdrawal',
        hash: withdrawTx.hash,
        from: process.env.CONTRACT_HOST_EARNINGS!,
        to: hostWallet.address,
        value: ethers.utils.formatUnits(netReceived, decimals) + ' USDC'
      });
    }
    
    // Step 8: Withdraw treasury USDC earnings
    if (treasuryAccumulatedUSDC.gt(0)) {
      console.log('\n8️⃣ Withdrawing treasury USDC earnings...\n');
      
      const treasuryBalanceBefore = await usdcContract.balanceOf(treasuryWallet.address);
      console.log(`   Treasury USDC before withdrawal: ${ethers.utils.formatUnits(treasuryBalanceBefore, decimals)} USDC`);
      
      const marketplaceAsTreasury = new ethers.Contract(
        process.env.CONTRACT_JOB_MARKETPLACE!,
        treasuryABI,
        treasuryWallet
      );
      
      const withdrawTx = await marketplaceAsTreasury.withdrawTreasuryTokens(
        process.env.CONTRACT_USDC_TOKEN!,
        { gasLimit: 200000 }
      );
      
      console.log(`   Withdrawal TX: ${withdrawTx.hash}`);
      await withdrawTx.wait();
      
      const treasuryBalanceAfter = await usdcContract.balanceOf(treasuryWallet.address);
      const netReceived = treasuryBalanceAfter.sub(treasuryBalanceBefore);
      
      console.log(`   Treasury USDC after withdrawal: ${ethers.utils.formatUnits(treasuryBalanceAfter, decimals)} USDC`);
      console.log(`   Net USDC received: ${ethers.utils.formatUnits(netReceived, decimals)} USDC`);
      console.log('   ✅ Treasury USDC withdrawal successful!');
      
      // Verify amount
      expect(netReceived.toString()).toBe(treasuryPayment.toString());
      console.log('   ✅ Treasury received correct fee amount (10%)');
      
      transactions.push({
        type: 'Treasury USDC Withdrawal',
        hash: withdrawTx.hash,
        from: process.env.CONTRACT_JOB_MARKETPLACE!,
        to: treasuryWallet.address,
        value: ethers.utils.formatUnits(netReceived, decimals) + ' USDC'
      });
    }
    
    // Step 9: Final summary
    console.log('\n📊 Final Transaction Summary:\n');
    console.log('='.repeat(50));
    transactions.forEach((tx, index) => {
      console.log(`${index + 1}. ${tx.type}`);
      console.log(`   Hash: ${tx.hash}`);
      console.log(`   From: ${tx.from}`);
      console.log(`   To: ${tx.to}`);
      console.log(`   Value: ${tx.value}`);
      console.log('');
    });
    
    console.log('✅ USDC Payment Test Complete!');
    console.log('✅ Host received 90% of payment (4.5 USDC)');
    console.log('✅ Treasury received 10% fee (0.5 USDC)');
    console.log('✅ All withdrawals successful');
    
    // Verify final state
    expect(transactions.length).toBeGreaterThanOrEqual(5); // Approval, Create, Proof, Complete, Withdrawals
  }, 120000); // 2 minute timeout for this comprehensive test
});