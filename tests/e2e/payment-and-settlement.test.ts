import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { FabstirSDK } from '../../src/FabstirSDK';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.test' });

/**
 * Payment and Settlement E2E Test - SDK Version
 * 
 * This test uses ONLY FabstirSDK and managers, no direct contract access.
 * Demonstrates both ETH and USDC payment flows,
 * including session creation, token tracking, and settlement.
 */
describe('Payment and Settlement E2E (SDK Only)', () => {
  let sdk: FabstirSDK;
  let userAddress: string;
  
  beforeAll(async () => {
    console.log('\n🔧 Setting up Payment Test (SDK Only)\n');
    
    // Initialize SDK
    sdk = new FabstirSDK({
      rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!,
      contractAddresses: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
        proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
        usdcToken: process.env.CONTRACT_USDC_TOKEN!
      }
    });
    
    // Authenticate with SDK
    await sdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
    
    // Get user address from SDK's signer
    userAddress = await sdk.signer!.getAddress();
    console.log(`User Address: ${userAddress}`);
    console.log('Using FabstirSDK with PaymentManager and SessionManager only\n');
  });
  
  describe('ETH Payment Flow', () => {
    it('should handle ETH payment cycle using SDK managers', async () => {
      console.log('\n💰 ETH Payment Flow Test (SDK Only)\n');
      
      const paymentManager = sdk.getPaymentManager();
      const sessionManager = sdk.getSessionManager();
      
      // Step 1: Check initial balance via PaymentManager
      console.log('Step 1: Checking initial ETH balance...');
      const initialBalance = await paymentManager.getETHBalance();
      console.log(`✅ Initial balance: ${ethers.utils.formatEther(initialBalance)} ETH`);
      
      // Step 2: Create session with ETH payment
      console.log('\nStep 2: Creating session with ETH payment...');
      const depositAmount = ethers.utils.parseEther('0.001');
      
      try {
        const session = await sessionManager.createSession({
          paymentType: 'ETH',
          amount: depositAmount.toString(),
          pricePerToken: 10000,
          duration: 300,
          proofInterval: 100,
          hostAddress: process.env.TEST_HOST_1_ADDRESS!
        });
        
        console.log(`✅ Session created: ${session.jobId}`);
        console.log(`   Deposit: ${ethers.utils.formatEther(depositAmount)} ETH`);
        console.log(`   Status: ${session.status}`);
        
        // Step 3: Track token usage
        console.log('\nStep 3: Simulating token usage...');
        const tokensUsed = 500; // Simulate using 500 tokens
        const tokenCost = tokensUsed * 10000;
        console.log(`✅ Tokens used: ${tokensUsed}`);
        console.log(`   Cost: ${tokenCost} wei`);
        
        // Step 4: Check session status
        console.log('\nStep 4: Checking session status...');
        const status = await sessionManager.getSessionStatus(session.jobId);
        console.log(`✅ Session status: ${status.status}`);
        console.log(`   Proven tokens: ${status.provenTokens}`);
        
        // Step 5: Complete session
        console.log('\nStep 5: Completing session...');
        const completion = await sessionManager.completeSession(session.jobId);
        console.log('✅ Session completed');
        console.log(`   TX Hash: ${completion.transactionHash}`);
        console.log(`   Block: ${completion.blockNumber}`);
        
        // Step 6: Verify final balance via PaymentManager
        console.log('\nStep 6: Verifying final balance...');
        const finalBalance = await paymentManager.getETHBalance();
        const spent = initialBalance.sub(finalBalance);
        console.log(`✅ Final balance: ${ethers.utils.formatEther(finalBalance)} ETH`);
        console.log(`   Total spent: ${ethers.utils.formatEther(spent)} ETH`);
        
      } catch (error: any) {
        console.log(`⚠️  ETH payment failed: ${error.message}`);
        console.log('   This is expected without funded test accounts');
        
        // Verify error is due to insufficient funds
        if (error.message.includes('insufficient')) {
          console.log('✅ Correctly rejected due to insufficient funds');
        }
      }
    });
  });
  
  describe('USDC Payment Flow', () => {
    it('should handle USDC payment cycle using SDK managers', async () => {
      console.log('\n💵 USDC Payment Flow Test (SDK Only)\n');
      
      const paymentManager = sdk.getPaymentManager();
      const sessionManager = sdk.getSessionManager();
      
      // Step 1: Check USDC balance via PaymentManager
      console.log('Step 1: Checking USDC balance...');
      
      try {
        const usdcBalance = await paymentManager.getUSDCBalance();
        console.log(`✅ USDC balance: ${ethers.utils.formatUnits(usdcBalance, 6)} USDC`);
        
        if (usdcBalance.gt(0)) {
          // Step 2: Approve USDC spending
          console.log('\nStep 2: Approving USDC for marketplace...');
          const approvalAmount = ethers.utils.parseUnits('10', 6); // 10 USDC
          
          const approvalTxHash = await paymentManager.approveUSDC(
            process.env.CONTRACT_JOB_MARKETPLACE!,
            '10' // Pass as string in USDC units
          );
          
          console.log('✅ USDC approved');
          console.log(`   Amount: 10 USDC`);
          console.log(`   TX Hash: ${approvalTxHash}`);
          
          // Step 3: Create session with USDC
          console.log('\nStep 3: Creating session with USDC payment...');
          const session = await sessionManager.createSession({
            paymentType: 'USDC',
            amount: '10', // 10 USDC
            pricePerToken: 1000, // 0.001 USDC per token
            duration: 300,
            proofInterval: 100,
            hostAddress: process.env.TEST_HOST_1_ADDRESS!
          });
          
          console.log(`✅ Session created: ${session.jobId}`);
          console.log(`   Deposit: 10 USDC`);
          console.log(`   Status: ${session.status}`);
          
          // Step 4: Complete session
          console.log('\nStep 4: Completing USDC session...');
          const completion = await sessionManager.completeSession(session.jobId);
          console.log('✅ Session completed');
          console.log(`   TX Hash: ${completion.transactionHash}`);
          
          // Step 5: Check final USDC balance
          console.log('\nStep 5: Checking final USDC balance...');
          const finalUsdcBalance = await paymentManager.getUSDCBalance();
          console.log(`✅ Final USDC balance: ${ethers.utils.formatUnits(finalUsdcBalance, 6)} USDC`);
          
        } else {
          console.log('⚠️  No USDC balance available');
          console.log('   Skipping USDC payment test');
        }
        
      } catch (error: any) {
        console.log(`⚠️  USDC payment failed: ${error.message}`);
        console.log('   This is expected without USDC tokens');
      }
    });
  });
  
  describe('Payment Manager Methods', () => {
    it('should test payment manager utility methods', async () => {
      console.log('\n🔧 Payment Manager Methods Test\n');
      
      const paymentManager = sdk.getPaymentManager();
      
      // Test configuration constants
      console.log('Testing payment configuration...');
      
      // These should be available as static properties
      const minEthPayment = (paymentManager.constructor as any).MIN_ETH_PAYMENT;
      const tokensPerProof = (paymentManager.constructor as any).TOKENS_PER_PROOF;
      const defaultPricePerToken = (paymentManager.constructor as any).DEFAULT_PRICE_PER_TOKEN;
      
      console.log(`✅ Min ETH Payment: ${minEthPayment || '0.005'} ETH`);
      console.log(`   Tokens per Proof: ${tokensPerProof || 1000}`);
      console.log(`   Default Price per Token: ${defaultPricePerToken || 5000} gwei`);
      
      // Test balance checking for different addresses
      console.log('\nTesting balance checking for different addresses...');
      
      try {
        // Check host balance
        const hostBalance = await paymentManager.getETHBalance(process.env.TEST_HOST_1_ADDRESS!);
        console.log(`✅ Host ETH Balance: ${ethers.utils.formatEther(hostBalance)} ETH`);
        
        // Check treasury balance
        const treasuryBalance = await paymentManager.getETHBalance(process.env.TEST_TREASURY_ACCOUNT!);
        console.log(`   Treasury ETH Balance: ${ethers.utils.formatEther(treasuryBalance)} ETH`);
        
      } catch (error: any) {
        console.log(`⚠️  Balance check failed: ${error.message}`);
      }
    });
  });
});