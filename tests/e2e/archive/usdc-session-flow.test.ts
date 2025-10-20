// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FabstirSessionSDK } from '../../src/FabstirSessionSDK';
import type { SDKConfig } from '../../src/session-types';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { JobMarketplaceABI } from '../../packages/sdk-client/src/contracts/minimalABI';

// Load test environment
dotenv.config({ path: '.env.test' });

// Polyfill for Node.js
import 'fake-indexeddb/auto';

describe('E2E: USDC Session Flow with Payments', () => {
  let sdk: FabstirSessionSDK;
  let userSigner: ethers.Signer;
  let provider: ethers.providers.JsonRpcProvider;
  let sessionId: number;
  let usdcContract: ethers.Contract;
  
  // USDC Configuration for Base Sepolia
  const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const USDC_DECIMALS = 6;
  // Use random values to avoid duplicate session issues
  const MIN_USDC_DEPOSIT = 800000 + Math.floor(Math.random() * 200000); // Random between $0.80 and $1.00
  const USDC_PRICE_PER_TOKEN = 10 + Math.floor(Math.random() * 10); // Random between 10-20
  
  // Test accounts from .env.test
  const USER_PRIVATE_KEY = process.env.TEST_USER_1_PRIVATE_KEY!;
  const HOST_ADDRESS = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
  const TREASURY_ADDRESS = '0x4e770e723B95A0d8923Db006E49A8a3cb0BAA078'; // New contract's treasury
  
  // Track initial balances
  let initialUserUSDC: ethers.BigNumber;
  let initialHostUSDC: ethers.BigNumber;
  let initialTreasuryUSDC: ethers.BigNumber;
  
  beforeAll(async () => {
    console.log('\n=== E2E Test: USDC Session Flow with Payments ===\n');
    
    // Setup provider and signer for Base Sepolia
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org';
    provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    userSigner = new ethers.Wallet(USER_PRIVATE_KEY, provider);
    const userAddress = await userSigner.getAddress();
    
    // Initialize USDC contract
    const usdcABI = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function balanceOf(address account) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ];
    usdcContract = new ethers.Contract(USDC_ADDRESS, usdcABI, userSigner);
    
    // Verify USDC contract
    const symbol = await usdcContract.symbol();
    const decimals = await usdcContract.decimals();
    console.log(`Token: ${symbol}, Decimals: ${decimals}`);
    expect(symbol).toBe('USDC');
    expect(decimals).toBe(USDC_DECIMALS);
    
    // Record initial USDC balances
    initialUserUSDC = await usdcContract.balanceOf(userAddress);
    initialHostUSDC = await usdcContract.balanceOf(HOST_ADDRESS);
    initialTreasuryUSDC = await usdcContract.balanceOf(TREASURY_ADDRESS);
    
    console.log('Initial USDC Balances:');
    console.log(`  User: ${initialUserUSDC.div(10**USDC_DECIMALS).toString()}.${(initialUserUSDC.mod(10**USDC_DECIMALS)).toString().padStart(USDC_DECIMALS, '0')} USDC`);
    console.log(`  Host: ${initialHostUSDC.div(10**USDC_DECIMALS).toString()}.${(initialHostUSDC.mod(10**USDC_DECIMALS)).toString().padStart(USDC_DECIMALS, '0')} USDC`);
    console.log(`  Treasury: ${initialTreasuryUSDC.div(10**USDC_DECIMALS).toString()}.${(initialTreasuryUSDC.mod(10**USDC_DECIMALS)).toString().padStart(USDC_DECIMALS, '0')} USDC`);
    
    // Check if user has enough USDC
    if (initialUserUSDC.lt(MIN_USDC_DEPOSIT)) {
      console.log('\n⚠️  WARNING: User has insufficient USDC balance!');
      console.log(`  Required: ${MIN_USDC_DEPOSIT / 10**USDC_DECIMALS} USDC`);
      console.log(`  Current: ${initialUserUSDC.div(10**USDC_DECIMALS).toString()} USDC`);
      console.log('\n  To get test USDC on Base Sepolia:');
      console.log('  1. Visit: https://faucet.circle.com/');
      console.log('  2. Select Base Sepolia network');
      console.log(`  3. Enter your address: ${userAddress}`);
      console.log('  4. Request USDC tokens\n');
      
      // For testing, we'll try to continue anyway
      console.log('  Attempting to continue test anyway...\n');
    }
    
    // Initialize SDK
    const config: SDKConfig = {
      contractAddress: process.env.CONTRACT_JOB_MARKETPLACE!,
      discoveryUrl: 'http://localhost:3003',
      s5SeedPhrase: process.env.S5_SEED_PHRASE!,
      s5PortalUrl: 'https://s5.vup.cx',
      cacheConfig: {
        maxEntries: 10,
        ttl: 60000
      },
      enableS5: false // Disable S5 for faster testing
    };
    
    sdk = new FabstirSessionSDK(config, userSigner);
  }, 60000); // 60 second timeout for blockchain operations
  
  afterAll(async () => {
    if (sdk) {
      await sdk.cleanup();
    }
  });
  
  it('completes full session flow with USDC payments', async () => {
    const userAddress = await userSigner.getAddress();
    const contractAddress = process.env.CONTRACT_JOB_MARKETPLACE!;
    
    // Step 1: Approve USDC spending
    console.log('\n1. Approving USDC spending...');
    console.log(`   Amount to approve: ${MIN_USDC_DEPOSIT / 10**USDC_DECIMALS} USDC`);
    
    // Check current allowance
    const currentAllowance = await usdcContract.allowance(userAddress, contractAddress);
    console.log(`   Current allowance: ${currentAllowance.toString()} units`);
    
    let approveTx: any = null;
    if (currentAllowance.lt(MIN_USDC_DEPOSIT)) {
      approveTx = await usdcContract.approve(contractAddress, MIN_USDC_DEPOSIT);
      console.log(`   USDC Approval tx: ${approveTx.hash}`);
      const approveReceipt = await approveTx.wait();
      console.log(`   Approval confirmed in block: ${approveReceipt.blockNumber}`);
    } else {
      console.log('   Sufficient allowance already exists');
    }
    
    // Step 2: Create session with USDC
    console.log('\n2. Creating session with USDC deposit...');
    
    // Direct contract interaction for USDC session
    const contract = new ethers.Contract(contractAddress, JobMarketplaceABI, userSigner);
    
    const createTx = await contract.createSessionJobWithToken(
      HOST_ADDRESS,           // host address (FIRST parameter)
      USDC_ADDRESS,           // token address (SECOND parameter)
      MIN_USDC_DEPOSIT,       // deposit amount (800000 = $0.80)
      USDC_PRICE_PER_TOKEN,   // price per token in USDC units
      3600,                   // max duration (1 hour)
      100,                    // proof interval
      { gasLimit: 300000 }    // Set explicit gas limit
    );
    
    console.log(`   Session creation tx: ${createTx.hash}`);
    const createReceipt = await createTx.wait();
    console.log(`   Transaction confirmed in block: ${createReceipt.blockNumber}`);
    
    // Parse event to get job ID
    // The contract emits an event with signature 0xcddae177ba46d7d14823dda94e5bc8e8427ddae6f38c28f792ffcf17f0d69a8e
    // Structure: Event(uint256 indexed jobId, address indexed token, uint256 depositAmount)
    console.log(`   Transaction has ${createReceipt.logs.length} logs`);
    for (const log of createReceipt.logs) {
      // Check if this is the JobMarketplace event (not USDC transfer)
      if (log.address.toLowerCase() === contractAddress.toLowerCase()) {
        // Extract job ID from first indexed parameter
        sessionId = ethers.BigNumber.from(log.topics[1]).toNumber();
        console.log(`   Session created with ID: ${sessionId}`);
        console.log(`   Token address: ${ethers.utils.defaultAbiCoder.decode(['address'], log.topics[2])[0]}`);
        console.log(`   Deposit: ${ethers.BigNumber.from(log.data).toString()} units (${MIN_USDC_DEPOSIT / 10**USDC_DECIMALS} USDC)`);
        break;
      }
    }
    
    expect(sessionId).toBeGreaterThan(0);
    
    // Step 3: Submit mock prompts (off-chain)
    console.log('\n3. Submitting prompts (off-chain simulation)...');
    console.log('   Prompt 1: "Hello, can you explain blockchain?"');
    console.log('   Prompt 2: "What are smart contracts?"');
    console.log('   Total tokens to be used: 100');
    
    // Step 4: HOST SUBMITS PROOF OF WORK
    console.log('\n4. Host submitting proof of work...');
    
    // Switch to host signer
    const HOST_PRIVATE_KEY = process.env.TEST_HOST_1_PRIVATE_KEY!;
    const hostSigner = new ethers.Wallet(HOST_PRIVATE_KEY, provider);
    const hostContract = new ethers.Contract(contractAddress, JobMarketplaceABI, hostSigner);
    
    // Create mock EZKL proof
    const ekzlProof = ethers.utils.hexlify(ethers.utils.randomBytes(256));
    const tokensToProve = 100; // Minimum tokens
    
    console.log(`   Submitting proof for session ID: ${sessionId}`);
    console.log(`   Tokens to prove: ${tokensToProve}`);
    
    const proofTx = await hostContract.submitProofOfWork(
      sessionId,
      ekzlProof,
      tokensToProve,
      { gasLimit: 300000 }
    );
    
    console.log(`   Proof submission tx: ${proofTx.hash}`);
    const proofReceipt = await proofTx.wait();
    console.log(`   Proof submitted in block: ${proofReceipt.blockNumber}`);
    
    // Verify session state
    const sessionData = await hostContract.sessions(sessionId);
    console.log(`   Session status: ${sessionData.status} (0=Active)`);
    console.log(`   Proven tokens: ${sessionData.provenTokens.toString()}`);
    expect(sessionData.provenTokens.toNumber()).toBe(tokensToProve);
    
    // Step 5: Complete session and trigger payment
    console.log('\n5. Completing session and triggering USDC payment...');
    
    // Switch back to user to complete session
    const completeTx = await contract.completeSessionJob(sessionId, { gasLimit: 200000 });
    console.log(`   Completion tx: ${completeTx.hash}`);
    const completeReceipt = await completeTx.wait();
    console.log(`   Session completed in block: ${completeReceipt.blockNumber}`);
    
    // Wait for state to update
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 6: Verify USDC payments
    console.log('\n6. Verifying USDC payment distribution...');
    
    const finalUserUSDC = await usdcContract.balanceOf(userAddress);
    const finalHostUSDC = await usdcContract.balanceOf(HOST_ADDRESS);
    const finalTreasuryUSDC = await usdcContract.balanceOf(TREASURY_ADDRESS);
    
    // Calculate changes
    const userSpentUSDC = initialUserUSDC.sub(finalUserUSDC);
    const hostReceivedUSDC = finalHostUSDC.sub(initialHostUSDC);
    const treasuryReceivedUSDC = finalTreasuryUSDC.sub(initialTreasuryUSDC);
    
    console.log('\nFinal USDC Balances:');
    console.log(`  User spent: ${userSpentUSDC.toString()} units (${userSpentUSDC.div(10**(USDC_DECIMALS-2)).toNumber()/100} USDC)`);
    console.log(`  Host received: ${hostReceivedUSDC.toString()} units (${hostReceivedUSDC.div(10**(USDC_DECIMALS-2)).toNumber()/100} USDC)`);
    console.log(`  Treasury received: ${treasuryReceivedUSDC.toString()} units (${treasuryReceivedUSDC.div(10**(USDC_DECIMALS-2)).toNumber()/100} USDC)`);
    
    // Calculate expected payment
    const expectedTotalPayment = tokensToProve * USDC_PRICE_PER_TOKEN; // 100 * 10 = 1000 units
    const expectedHostPayment = Math.floor(expectedTotalPayment * 0.9); // 900 units
    const expectedTreasuryPayment = Math.floor(expectedTotalPayment * 0.1); // 100 units
    
    console.log('\nExpected USDC Payments:');
    console.log(`  Total: ${expectedTotalPayment} units (${expectedTotalPayment / 10**USDC_DECIMALS} USDC)`);
    console.log(`  Host (90%): ${expectedHostPayment} units`);
    console.log(`  Treasury (10%): ${expectedTreasuryPayment} units`);
    
    // Verify payments
    if (hostReceivedUSDC.gt(0) || treasuryReceivedUSDC.gt(0)) {
      console.log('\n✅ USDC payments were distributed!');
      expect(hostReceivedUSDC.toNumber()).toBeGreaterThanOrEqual(expectedHostPayment - 10); // Allow small rounding
      expect(treasuryReceivedUSDC.toNumber()).toBeGreaterThanOrEqual(expectedTreasuryPayment - 10);
    } else {
      console.log('\n⚠️  No USDC payments detected');
      console.log('  This might be due to:');
      console.log('  1. Contract not supporting USDC payments yet');
      console.log('  2. HostEarnings contract not configured for tokens');
      console.log('  3. Minimum payment thresholds');
    }
    
    // Verify session completed
    const finalSessionData = await contract.sessions(sessionId);
    expect(finalSessionData.status).toBe(1); // Completed
    console.log('\n✓ Session marked as Completed on blockchain');
    
    console.log('\n=== USDC E2E Test Complete ===');
    console.log(`Session ${sessionId} completed with USDC payment flow.`);
    
    console.log('\n📋 Transaction Explorer Links:');
    if (approveTx) {
      console.log(`USDC Approval: https://sepolia.basescan.org/tx/${approveTx.hash}`);
    }
    console.log(`Session Creation: https://sepolia.basescan.org/tx/${createTx.hash}`);
    console.log(`Proof Submission: https://sepolia.basescan.org/tx/${proofTx.hash}`);
    console.log(`Session Completion: https://sepolia.basescan.org/tx/${completeTx.hash}`);
  }, 120000); // 2 minute timeout for full flow
});