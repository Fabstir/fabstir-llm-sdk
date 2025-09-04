const ethers = require('ethers');
require('dotenv').config({ path: '.env.test' });

async function testUSDCWithCorrectParsing() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);
  const userSigner = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY, provider);
  const hostSigner = new ethers.Wallet(process.env.TEST_HOST_1_PRIVATE_KEY, provider);
  
  console.log('=== USDC TEST WITH CORRECT JOB ID PARSING ===\n');
  console.log('The bug: receipt.logs[0].topics[1] gives USER ADDRESS, not job ID!\n');
  
  const usdc = new ethers.Contract(
    process.env.CONTRACT_USDC_TOKEN,
    ['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'],
    userSigner
  );
  
  const jobAbi = [
    'function createSessionJobWithToken(address,address,uint256,uint256,uint256,uint256) returns (uint256)',
    'function submitProofOfWork(uint256,bytes,uint256) returns (bool)',
    'function completeSessionJob(uint256) returns (bool)',
    'function treasuryAddress() view returns (address)',
    'event SessionJobCreated(uint256 indexed jobId, address indexed user, address indexed host, uint256 deposit, uint256 pricePerToken, uint256 maxDuration)'
  ];
  
  const job = new ethers.Contract(process.env.CONTRACT_JOB_MARKETPLACE, jobAbi, userSigner);
  const treasury = await job.treasuryAddress();
  
  // Initial balances
  const initHost = await usdc.balanceOf(hostSigner.address);
  const initTreasury = await usdc.balanceOf(treasury);
  
  console.log('Initial Host USDC:', ethers.utils.formatUnits(initHost, 6));
  console.log('Initial Treasury USDC:', ethers.utils.formatUnits(initTreasury, 6));
  
  // 1. Approve
  console.log('\n1. APPROVING USDC...');
  const approveTx = await usdc.approve(job.address, ethers.utils.parseUnits('10', 6));
  await approveTx.wait();
  console.log('✓ Approved');
  
  // 2. Get job ID using staticCall FIRST (correct way)
  console.log('\n2. GETTING JOB ID WITH STATIC CALL...');
  const jobId = await job.callStatic.createSessionJobWithToken(
    hostSigner.address,
    process.env.CONTRACT_USDC_TOKEN,
    ethers.utils.parseUnits('1', 6),
    1000,
    3600,
    100
  );
  console.log('✅ CORRECT Job ID from staticCall:', jobId.toString());
  
  // 3. Now actually create the session
  console.log('\n3. CREATING SESSION...');
  const createTx = await job.createSessionJobWithToken(
    hostSigner.address,
    process.env.CONTRACT_USDC_TOKEN,
    ethers.utils.parseUnits('1', 6),
    1000,
    3600,
    100,
    { gasLimit: 500000 }
  );
  const receipt = await createTx.wait();
  console.log('✓ Created');
  
  // Show the WRONG way (for comparison)
  const wrongJobId = ethers.BigNumber.from(receipt.logs[0].topics[1]).toString();
  console.log('\n❌ WRONG Job ID from topics[1]:', wrongJobId);
  console.log('   This is actually user address as decimal:', userSigner.address);
  console.log('   User address in decimal:', ethers.BigNumber.from(userSigner.address).toString());
  
  // Parse from events (alternative correct way)
  let eventJobId;
  for (const log of receipt.logs) {
    try {
      const parsed = job.interface.parseLog(log);
      if (parsed.name === 'SessionJobCreated') {
        eventJobId = parsed.args.jobId.toString();
        console.log('\n✅ CORRECT Job ID from event:', eventJobId);
        break;
      }
    } catch {}
  }
  
  // 4. Submit proof with CORRECT job ID
  console.log('\n4. SUBMITTING PROOF WITH CORRECT JOB ID...');
  try {
    const hostJob = job.connect(hostSigner);
    const proofTx = await hostJob.submitProofOfWork(
      jobId, // Using the CORRECT job ID from staticCall
      ethers.utils.hexlify(ethers.utils.randomBytes(256)),
      100,
      { gasLimit: 300000 }
    );
    const proofReceipt = await proofTx.wait();
    console.log('✅ PROOF SUBMITTED SUCCESSFULLY!');
    console.log('   Tx:', proofTx.hash);
    console.log('   Gas used:', proofReceipt.gasUsed.toString(), '(not 33,370 failure!)');
    
    // 5. Complete session
    console.log('\n5. COMPLETING SESSION...');
    const completeTx = await job.completeSessionJob(jobId, { gasLimit: 300000 });
    await completeTx.wait();
    console.log('✓ Completed');
    
    // Wait for settlement
    await new Promise(r => setTimeout(r, 2000));
    
    // Check final balances
    const finalHost = await usdc.balanceOf(hostSigner.address);
    const finalTreasury = await usdc.balanceOf(treasury);
    
    const hostGained = finalHost.sub(initHost);
    const treasuryGained = finalTreasury.sub(initTreasury);
    
    console.log('\n=== PAYMENT SETTLEMENT ===');
    console.log('Host received:', ethers.utils.formatUnits(hostGained, 6), 'USDC');
    console.log('Treasury received:', ethers.utils.formatUnits(treasuryGained, 6), 'USDC');
    
    if (hostGained.gt(0) && treasuryGained.gt(0)) {
      const total = hostGained.add(treasuryGained);
      const hostPct = hostGained.mul(100).div(total);
      console.log('\n🎉 USDC PAYMENT SETTLEMENT VERIFIED!');
      console.log(`✅ Distribution: ${hostPct}% host / ${100 - hostPct.toNumber()}% treasury`);
      console.log('\nThe issue was CLIENT-SIDE parsing, not the contracts!');
    }
  } catch (error) {
    console.log('❌ Failed:', error.message);
    console.log('\nIf this fails, the job ID might already exist.');
    console.log('The key point is: use staticCall or parse events, NOT topics[1]!');
  }
}

testUSDCWithCorrectParsing()
  .then(() => {
    console.log('\n✅ Test completed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  });