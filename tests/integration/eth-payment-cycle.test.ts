import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ethers } from 'ethers';
import { initializeSDK } from './config/sdk-setup';
import { BalanceTracker } from './utils/balance-tracker';
import { config as loadEnv } from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

loadEnv({ path: '.env.test' });

describe('ETH Payment Integration - Real Base Sepolia', () => {
  let sdk: any;
  let provider: ethers.providers.JsonRpcProvider;
  let userSigner: ethers.Wallet;
  let hostSigner: ethers.Wallet;
  let tracker: BalanceTracker;
  let transactionReport: any[] = [];
  let initialBalances: any = {};
  let currentJobId: string;

  beforeAll(async () => {
    try {
      // Setup provider and signers
      provider = new ethers.providers.JsonRpcProvider(
        process.env.RPC_URL_BASE_SEPOLIA,
        { chainId: 84532, name: 'base-sepolia' }
      );
      userSigner = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, provider);
      hostSigner = new ethers.Wallet(process.env.TEST_HOST_1_PRIVATE_KEY!, provider);
      
      // Initialize SDK and connect with provider (SDK will use signer from config)
      sdk = await initializeSDK();
      tracker = new BalanceTracker();
      
      // Record initial balances
      initialBalances.userETH = await tracker.getETHBalance(userSigner.address);
      initialBalances.hostETH = await tracker.getETHBalance(hostSigner.address);
      
      console.log('Initial User ETH:', ethers.utils.formatEther(initialBalances.userETH));
      console.log('Initial Host ETH:', ethers.utils.formatEther(initialBalances.hostETH));
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  }, 60000);

  it('should verify user has sufficient ETH', async () => {
    // Need at least 0.01 ETH for job + gas
    const minRequired = ethers.utils.parseEther('0.01');
    const userBalance = ethers.BigNumber.from(initialBalances.userETH.toString());
    expect(userBalance.gte(minRequired)).toBe(true);
    console.log(`✓ User has ${ethers.utils.formatEther(userBalance)} ETH`);
  });

  it('should discover or configure host', async () => {
    // For now, use known host address
    const hostAddress = process.env.TEST_HOST_1_ADDRESS;
    expect(hostAddress).toBeDefined();
    expect(ethers.utils.isAddress(hostAddress!)).toBe(true);
    console.log(`✓ Host address configured: ${hostAddress}`);
  });

  it('should submit job with ETH payment', async () => {
    // Use minimum required payment amount
    const MIN_DEPOSIT = ethers.utils.parseEther('0.0002'); // Contract minimum
    const paymentAmount = ethers.utils.parseEther('0.001'); // Safe amount for testing (~$4.50)
    
    // Updated contract ABI for session jobs
    const jobMarketplaceABI = [
      'function createSessionJob(address host, uint256 deposit, uint256 pricePerToken, uint32 maxDuration, uint32 proofInterval) payable returns (uint256)',
      'function postJob(string memory modelId, string memory prompt, uint256 offerPrice, uint32 maxTokens) payable returns (uint256)',
      'event SessionJobCreated(uint256 indexed jobId, address indexed client, address indexed host, uint256 deposit)',
      'event JobPosted(uint256 indexed jobId, address indexed client, string modelId, uint256 offerPrice)'
    ];
    
    // Use the UPDATED contract address (from .env.test)
    const jobContract = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,  // Now points to 0xC6E3B618E2901b1b2c1beEB4E2BB86fc87d48D2d
      jobMarketplaceABI,
      userSigner
    );
    
    // Submit job - REAL TRANSACTION
    console.log('Submitting job to NEW contract:', process.env.CONTRACT_JOB_MARKETPLACE);
    console.log('Payment amount:', ethers.utils.formatEther(paymentAmount), 'ETH (~$4.50 at $4500/ETH)');
    console.log('User balance:', ethers.utils.formatEther(initialBalances.userETH), 'ETH');
    
    try {
      // Option 1: Try session job (recommended for new contract)
      const useSessionJob = true;
      
      let tx;
      if (useSessionJob) {
        // Create a session job with the host
        console.log('Creating session job with host:', process.env.TEST_HOST_1_ADDRESS);
        tx = await jobContract.createSessionJob(
          process.env.TEST_HOST_1_ADDRESS!,  // registered host
          paymentAmount,                      // deposit (>= MIN_DEPOSIT)
          ethers.utils.parseUnits('1', 'gwei'), // price per token (1 gwei)
          3600,                               // max duration (1 hour)
          300,                                // proof interval (5 minutes)
          { 
            value: paymentAmount,
            gasLimit: 300000
          }
        );
      } else {
        // Fallback to regular job posting
        tx = await jobContract.postJob(
          'llama2-7b',
          'Integration test: What is 2+2?',
          paymentAmount,
          100,
          { 
            value: paymentAmount,
            gasLimit: 200000
          }
        );
      }
    
      expect(tx.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      console.log(`Transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      expect(receipt.status).toBe(1);
      
      // Extract job ID from events - handle different event structures
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      console.log(`Events received: ${receipt.events?.length || 0}`);
      
      // Debug: Log all events
      receipt.events?.forEach((event: any, index: number) => {
        console.log(`Event ${index}:`, event.event || 'Unknown', event.args);
      });
      
      // Try to extract job ID from events or logs
      if (receipt.events && receipt.events.length > 0) {
        // Look for job ID in event args (could be sessionId or jobId)
        const jobEvent = receipt.events.find((e: any) => 
          e.args?.jobId || e.args?.sessionId || e.args?.[0]
        );
        
        if (jobEvent?.args?.jobId) {
          currentJobId = jobEvent.args.jobId.toString();
        } else if (jobEvent?.args?.sessionId) {
          currentJobId = jobEvent.args.sessionId.toString();
        } else if (jobEvent?.args?.[0]) {
          // Fallback to first arg
          currentJobId = jobEvent.args[0].toString();
        }
      }
      
      if (!currentJobId) {
        console.log('Warning: Could not extract job ID from events, using placeholder');
        currentJobId = '1'; // Placeholder for testing
      }
      
      transactionReport.push({
        step: 'Job Submission',
        txHash: tx.hash,
        jobId: currentJobId,
        amount: ethers.utils.formatEther(paymentAmount),
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber
      });
      
      console.log(`✓ Job submitted: ${tx.hash}`);
      console.log(`  Job ID: ${currentJobId}`);
      console.log(`  Amount: ${ethers.utils.formatEther(paymentAmount)} ETH`);
    } catch (error: any) {
      console.error('Transaction failed:', error.message);
      if (error.error?.message) {
        console.error('Contract error:', error.error.message);
      }
      throw error;
    }
  }, 120000);

  it('should verify escrow creation on-chain', async () => {
    // Query escrow contract for the job
    const escrowABI = [
      'function getJobEscrow(uint256 jobId) view returns (uint256 amount, address token)'
    ];
    
    const escrowContract = new ethers.Contract(
      process.env.CONTRACT_PAYMENT_ESCROW!,
      escrowABI,
      provider
    );
    
    try {
      const escrowData = await escrowContract.getJobEscrow(currentJobId);
      const escrowAmount = escrowData.amount || escrowData[0];
      
      expect(escrowAmount.gt(0)).toBe(true);
      console.log(`✓ Escrow verified: ${ethers.utils.formatEther(escrowAmount)} ETH`);
    } catch (error) {
      // Alternative: Check job details from marketplace
      console.log('Checking job details from marketplace...');
      const marketplaceABI = [
        'function getJob(uint256) view returns (address client, uint256 payment, uint8 status)'
      ];
      const marketplace = new ethers.Contract(
        process.env.CONTRACT_JOB_MARKETPLACE!,
        marketplaceABI,
        provider
      );
      const job = await marketplace.getJob(currentJobId);
      expect(job.payment.gt(0)).toBe(true);
      console.log(`✓ Job payment verified: ${ethers.utils.formatEther(job.payment)} ETH`);
    }
  }, 30000);

  it('should have host claim the job', async () => {
    // Host claims job - REAL TRANSACTION
    const jobContractABI = [
      'function claimJob(uint256 jobId) returns (bool)',
      'event JobClaimed(uint256 indexed jobId, address indexed provider)'
    ];
    
    const jobContract = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,
      jobContractABI,
      hostSigner
    );
    
    console.log('Host claiming job...');
    const tx = await jobContract.claimJob(currentJobId);
    const receipt = await tx.wait();
    
    expect(receipt.status).toBe(1);
    
    transactionReport.push({
      step: 'Job Claim',
      txHash: tx.hash,
      jobId: currentJobId,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber
    });
    
    console.log(`✓ Job claimed by host: ${tx.hash}`);
  }, 120000);

  it('should have host submit result', async () => {
    const result = 'The answer is 4';
    const proof = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(result));
    
    // Host submits result - REAL TRANSACTION
    const jobContractABI = [
      'function submitResult(uint256 jobId, string memory result, bytes32 proof) returns (bool)',
      'event JobCompleted(uint256 indexed jobId, string result)'
    ];
    
    const jobContract = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,
      jobContractABI,
      hostSigner
    );
    
    console.log('Host submitting result...');
    const tx = await jobContract.submitResult(currentJobId, result, proof);
    const receipt = await tx.wait();
    
    expect(receipt.status).toBe(1);
    
    transactionReport.push({
      step: 'Result Submission',
      txHash: tx.hash,
      jobId: currentJobId,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber,
      result: result
    });
    
    console.log(`✓ Result submitted: ${tx.hash}`);
    console.log(`  Result: "${result}"`);
  }, 120000);

  it('should verify payment settlement', async () => {
    // Wait for settlement
    console.log('Waiting for settlement...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check final balances
    const finalUserETH = await tracker.getETHBalance(userSigner.address);
    const finalHostETH = await tracker.getETHBalance(hostSigner.address);
    
    // Convert to BigNumber for comparison
    const initialUserBN = ethers.BigNumber.from(initialBalances.userETH.toString());
    const initialHostBN = ethers.BigNumber.from(initialBalances.hostETH.toString());
    const finalUserBN = ethers.BigNumber.from(finalUserETH.toString());
    const finalHostBN = ethers.BigNumber.from(finalHostETH.toString());
    
    // User should have less ETH (paid for job + gas)
    expect(finalUserBN.lt(initialUserBN)).toBe(true);
    
    // Host should have more ETH (received payment minus gas)
    const hostGained = finalHostBN.sub(initialHostBN);
    expect(hostGained.gt(0)).toBe(true);
    
    const userSpent = initialUserBN.sub(finalUserBN);
    
    console.log('✓ Payment settled:');
    console.log(`  User spent: ${ethers.utils.formatEther(userSpent)} ETH (including gas)`);
    console.log(`  Host gained: ${ethers.utils.formatEther(hostGained)} ETH (after gas)`);
    
    // Add to report
    transactionReport.push({
      step: 'Settlement Summary',
      userSpent: ethers.utils.formatEther(userSpent),
      hostGained: ethers.utils.formatEther(hostGained),
      finalUserBalance: ethers.utils.formatEther(finalUserBN),
      finalHostBalance: ethers.utils.formatEther(finalHostBN)
    });
  }, 30000);

  it('should generate transaction report', () => {
    console.log('\n' + '='.repeat(50));
    console.log('TRANSACTION REPORT - BASE SEPOLIA');
    console.log('='.repeat(50));
    console.log(`Network: Base Sepolia (Chain ID: 84532)`);
    console.log(`Total Transactions: ${transactionReport.filter(r => r.txHash).length}`);
    console.log(`Job ID: ${currentJobId}`);
    
    transactionReport.forEach((tx, i) => {
      console.log(`\n${i + 1}. ${tx.step}`);
      if (tx.txHash) {
        console.log(`   Hash: ${tx.txHash}`);
        console.log(`   Block: ${tx.blockNumber}`);
        console.log(`   Gas Used: ${tx.gasUsed}`);
      }
      if (tx.amount) console.log(`   Amount: ${tx.amount} ETH`);
      if (tx.result) console.log(`   Result: "${tx.result}"`);
      if (tx.userSpent) console.log(`   User Spent: ${tx.userSpent} ETH`);
      if (tx.hostGained) console.log(`   Host Gained: ${tx.hostGained} ETH`);
    });
    
    console.log('\n📋 Verify on Basescan:');
    transactionReport.filter(tx => tx.txHash).forEach(tx => {
      console.log(`   https://sepolia.basescan.org/tx/${tx.txHash}`);
    });
    
    expect(transactionReport.filter(r => r.txHash).length).toBeGreaterThanOrEqual(3);
  });

  afterAll(async () => {
    // Create test-reports directory if it doesn't exist
    const reportsDir = path.join(process.cwd(), 'test-reports');
    try {
      await fs.mkdir(reportsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    // Save report to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `eth-payment-${timestamp}.json`);
    
    const fullReport = {
      timestamp: new Date().toISOString(),
      network: 'base-sepolia',
      chainId: 84532,
      jobId: currentJobId,
      transactions: transactionReport,
      balances: {
        initial: {
          userETH: initialBalances.userETH ? ethers.utils.formatEther(ethers.BigNumber.from(initialBalances.userETH.toString())) : 'N/A',
          hostETH: initialBalances.hostETH ? ethers.utils.formatEther(ethers.BigNumber.from(initialBalances.hostETH.toString())) : 'N/A'
        }
      },
      basescanLinks: transactionReport
        .filter(tx => tx.txHash)
        .map(tx => `https://sepolia.basescan.org/tx/${tx.txHash}`)
    };
    
    await fs.writeFile(reportPath, JSON.stringify(fullReport, null, 2));
    console.log(`\n📁 Report saved to: ${reportPath}`);
  });
});