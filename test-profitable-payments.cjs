const ethers = require('ethers');
require('dotenv').config({ path: '.env.test' });

async function testProfitablePayments() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);
  const userSigner = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY, provider);
  const hostSigner = new ethers.Wallet(process.env.TEST_HOST_1_PRIVATE_KEY, provider);
  
  const abi = [
    'function createSessionJob(address,uint256,uint256,uint256,uint256) payable returns (uint256)',
    'function submitProofOfWork(uint256,bytes,uint256) returns (bool)',
    'function completeSessionJob(uint256) returns (bool)',
    'function treasuryAddress() view returns (address)',
    'event SessionJobCreated(uint256 indexed jobId, address indexed user, address indexed host, uint256 deposit, uint256 pricePerToken, uint256 maxDuration)',
    'event SessionJobCompleted(uint256 indexed jobId, uint256 totalPayment)',
  ];
  
  const userContract = new ethers.Contract(process.env.CONTRACT_JOB_MARKETPLACE, abi, userSigner);
  const hostContract = new ethers.Contract(process.env.CONTRACT_JOB_MARKETPLACE, abi, hostSigner);
  
  // Get the ACTUAL treasury address from contract
  const ACTUAL_TREASURY = await userContract.treasuryAddress();
  const HOST_ADDRESS = process.env.TEST_HOST_1_ADDRESS;
  
  console.log('=== PROFITABLE PAYMENT TEST ===\n');
  console.log('Goal: Ensure host makes a profit after gas costs\n');
  console.log('Contract Treasury:', ACTUAL_TREASURY);
  console.log('Host Address:', HOST_ADDRESS);
  
  // Record initial balances
  const initialHostBalance = await provider.getBalance(HOST_ADDRESS);
  const initialTreasuryBalance = await provider.getBalance(ACTUAL_TREASURY);
  const initialContractBalance = await provider.getBalance(process.env.CONTRACT_JOB_MARKETPLACE);
  
  console.log('\nInitial Balances:');
  console.log('  Host:', ethers.utils.formatEther(initialHostBalance), 'ETH');
  console.log('  Treasury:', ethers.utils.formatEther(initialTreasuryBalance), 'ETH');
  console.log('  Contract:', ethers.utils.formatEther(initialContractBalance), 'ETH');
  
  // PROFITABLE PARAMETERS
  const deposit = ethers.utils.parseEther('0.005');
  const pricePerToken = ethers.utils.parseUnits('5000', 'gwei'); // 5000 gwei per token
  const tokensToProve = 1000; // 1000 tokens
  
  console.log('\nSession Parameters (Profitable):');
  console.log('  Deposit:', ethers.utils.formatEther(deposit), 'ETH');
  console.log('  Price per token:', '5000 gwei');
  console.log('  Tokens to prove:', tokensToProve);
  console.log('  Total payment:', ethers.utils.formatEther(pricePerToken.mul(tokensToProve)), 'ETH');
  console.log('  Expected host payment (90%):', ethers.utils.formatEther(pricePerToken.mul(tokensToProve).mul(90).div(100)), 'ETH');
  console.log('  Expected treasury payment (10%):', ethers.utils.formatEther(pricePerToken.mul(tokensToProve).mul(10).div(100)), 'ETH');
  
  // Step 1: Create session
  console.log('\n1. Creating session...');
  const createTx = await userContract.createSessionJob(
    HOST_ADDRESS,
    deposit,
    pricePerToken,
    3600,
    100, // proof interval (minimum)
    { value: deposit, gasLimit: 500000 }
  );
  
  const createReceipt = await createTx.wait();
  let jobId;
  for (const log of createReceipt.logs) {
    try {
      const parsed = userContract.interface.parseLog(log);
      if (parsed.name === 'SessionJobCreated') {
        jobId = parsed.args.jobId.toString();
        console.log('  ✓ Session created with ID:', jobId);
        console.log('  Transaction:', createTx.hash);
      }
    } catch {}
  }
  
  // Step 2: Submit proof as host
  console.log('\n2. Host submitting proof for', tokensToProve, 'tokens...');
  const proof = ethers.utils.hexlify(ethers.utils.randomBytes(256));
  
  // Track gas costs for host
  const proofTx = await hostContract.submitProofOfWork(jobId, proof, tokensToProve, { gasLimit: 300000 });
  const proofReceipt = await proofTx.wait();
  
  const proofGasUsed = proofReceipt.gasUsed;
  const proofGasPrice = proofReceipt.effectiveGasPrice;
  const proofGasCost = proofGasUsed.mul(proofGasPrice);
  
  console.log('  ✓ Proof submitted');
  console.log('  Transaction:', proofTx.hash);
  console.log('  Gas used:', proofGasUsed.toString(), 'units');
  console.log('  Gas cost:', ethers.utils.formatEther(proofGasCost), 'ETH');
  
  // Step 3: Complete session
  console.log('\n3. User completing session...');
  const completeTx = await userContract.completeSessionJob(jobId, { gasLimit: 300000 });
  const completeReceipt = await completeTx.wait();
  
  let totalPayment;
  for (const log of completeReceipt.logs) {
    try {
      const parsed = userContract.interface.parseLog(log);
      if (parsed.name === 'SessionJobCompleted') {
        totalPayment = parsed.args.totalPayment;
      }
    } catch {}
  }
  
  console.log('  ✓ Session completed');
  console.log('  Transaction:', completeTx.hash);
  if (totalPayment) {
    console.log('  Total payment processed:', ethers.utils.formatEther(totalPayment), 'ETH');
  }
  
  // Wait for state to settle
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check final balances
  const finalHostBalance = await provider.getBalance(HOST_ADDRESS);
  const finalTreasuryBalance = await provider.getBalance(ACTUAL_TREASURY);
  const finalContractBalance = await provider.getBalance(process.env.CONTRACT_JOB_MARKETPLACE);
  
  console.log('\nFinal Balances:');
  console.log('  Host:', ethers.utils.formatEther(finalHostBalance), 'ETH');
  console.log('  Treasury:', ethers.utils.formatEther(finalTreasuryBalance), 'ETH');
  console.log('  Contract:', ethers.utils.formatEther(finalContractBalance), 'ETH');
  
  // Calculate changes
  const hostBalanceChange = finalHostBalance.sub(initialHostBalance);
  const treasuryBalanceChange = finalTreasuryBalance.sub(initialTreasuryBalance);
  const contractBalanceChange = finalContractBalance.sub(initialContractBalance);
  
  // Calculate host's net profit
  const hostPaymentReceived = hostBalanceChange.add(proofGasCost); // Add back gas cost to get gross payment
  const hostNetProfit = hostBalanceChange; // This is already net of gas
  
  console.log('\n=== PAYMENT ANALYSIS ===');
  console.log('Treasury received:', ethers.utils.formatEther(treasuryBalanceChange), 'ETH');
  console.log('Host gross payment:', ethers.utils.formatEther(hostPaymentReceived), 'ETH');
  console.log('Host gas costs:', ethers.utils.formatEther(proofGasCost), 'ETH');
  console.log('Host NET profit:', ethers.utils.formatEther(hostNetProfit), 'ETH');
  
  // Expected values
  const expectedTotal = pricePerToken.mul(tokensToProve);
  const expectedHost = expectedTotal.mul(90).div(100);
  const expectedTreasury = expectedTotal.mul(10).div(100);
  
  console.log('\nExpected vs Actual:');
  console.log('  Expected host payment: ', ethers.utils.formatEther(expectedHost), 'ETH');
  console.log('  Actual host payment:   ', ethers.utils.formatEther(hostPaymentReceived), 'ETH');
  console.log('  Expected treasury:     ', ethers.utils.formatEther(expectedTreasury), 'ETH');
  console.log('  Actual treasury:       ', ethers.utils.formatEther(treasuryBalanceChange), 'ETH');
  
  console.log('\n=== RESULTS ===');
  
  // Verify treasury payment
  if (treasuryBalanceChange.gte(expectedTreasury.sub(ethers.utils.parseEther('0.00001')))) {
    console.log('✅ Treasury payment correct!');
  } else {
    console.log('❌ Treasury payment incorrect');
  }
  
  // Verify host payment
  if (hostPaymentReceived.gte(expectedHost.sub(ethers.utils.parseEther('0.00001')))) {
    console.log('✅ Host payment correct!');
  } else {
    console.log('❌ Host payment incorrect');
  }
  
  // Most importantly - verify host made a profit
  if (hostNetProfit.gt(0)) {
    console.log('✅ HOST IS PROFITABLE! Net profit:', ethers.utils.formatEther(hostNetProfit), 'ETH');
  } else {
    console.log('❌ Host lost money:', ethers.utils.formatEther(hostNetProfit), 'ETH');
  }
  
  // Verify contract released all funds
  const totalReleased = deposit.sub(contractBalanceChange);
  if (totalReleased.gte(expectedTotal)) {
    console.log('✅ Contract released full payment from escrow');
  }
  
  console.log('\n🎉 Payment Distribution Summary:');
  console.log('  Total payment:', ethers.utils.formatEther(expectedTotal), 'ETH');
  console.log('  Host received:', ethers.utils.formatEther(hostPaymentReceived), 'ETH (90%)');
  console.log('  Treasury received:', ethers.utils.formatEther(treasuryBalanceChange), 'ETH (10%)');
  console.log('  Host profit after gas:', ethers.utils.formatEther(hostNetProfit), 'ETH');
  
  console.log('\n📊 Transaction Links:');
  console.log('  Create:', `https://sepolia.basescan.org/tx/${createTx.hash}`);
  console.log('  Proof:', `https://sepolia.basescan.org/tx/${proofTx.hash}`);
  console.log('  Complete:', `https://sepolia.basescan.org/tx/${completeTx.hash}`);
}

testProfitablePayments()
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  });