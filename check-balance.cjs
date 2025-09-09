const ethers = require('ethers');
require('dotenv').config({ path: '.env.test' });

async function checkBalances() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);
  
  // Addresses
  const addresses = {
    user: '0x8D642988E3e7b6DB15b6058461d5563835b04bF6',
    host: process.env.TEST_HOST_1_ADDRESS,
    treasury: process.env.TEST_TREASURY_ACCOUNT,
    marketplace: process.env.CONTRACT_JOB_MARKETPLACE,
    hostEarnings: process.env.CONTRACT_HOST_EARNINGS
  };
  
  // USDC contract
  const usdcAddress = process.env.CONTRACT_USDC_TOKEN;
  const usdcABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ];
  const usdc = new ethers.Contract(usdcAddress, usdcABI, provider);
  
  console.log('\n=== USDC BALANCE CHECK ===');
  console.log('Block:', await provider.getBlockNumber());
  console.log('USDC Token:', usdcAddress);
  console.log('\nDirect Balances:');
  console.log('================');
  
  for (const [name, address] of Object.entries(addresses)) {
    const balance = await usdc.balanceOf(address);
    const formatted = ethers.utils.formatUnits(balance, 6);
    console.log(`${name.padEnd(15)} ${address}: ${formatted} USDC`);
  }
  
  // Check if host has accumulated earnings
  const hostEarningsABI = [
    'function earnings(address, address) view returns (uint256)'
  ];
  const hostEarningsContract = new ethers.Contract(addresses.hostEarnings, hostEarningsABI, provider);
  
  console.log('\nAccumulated Earnings:');
  console.log('====================');
  try {
    const hostAccumulated = await hostEarningsContract.earnings(addresses.host, usdcAddress);
    console.log(`Host accumulated in HostEarnings: ${ethers.utils.formatUnits(hostAccumulated, 6)} USDC`);
  } catch (e) {
    console.log('Could not check host accumulated earnings:', e.reason || e.message);
  }
  
  // Check marketplace accumulated fees
  const marketplaceABI = [
    'function treasuryFees(address) view returns (uint256)'
  ];
  const marketplace = new ethers.Contract(addresses.marketplace, marketplaceABI, provider);
  
  try {
    const treasuryFees = await marketplace.treasuryFees(usdcAddress);
    console.log(`Treasury accumulated in Marketplace: ${ethers.utils.formatUnits(treasuryFees, 6)} USDC`);
  } catch (e) {
    console.log('Could not check treasury fees:', e.reason || e.message);
  }
  
  // Check session state for latest job
  const sessionABI = [
    'function sessions(uint256) view returns (tuple(uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 endTime, address host, address renter, uint256 proofInterval, bytes32 finalProofHash, uint256 tokensProven, uint256 completedAt))'
  ];
  const sessionContract = new ethers.Contract(addresses.marketplace, sessionABI, provider);
  
  console.log('\nRecent Session Status:');
  console.log('=====================');
  // Check jobs 35-38 (recent ones from test)
  for (let jobId = 35; jobId <= 38; jobId++) {
    try {
      const session = await sessionContract.sessions(jobId);
      console.log(`Job ${jobId}: ${session.tokensProven} tokens proven, completed: ${session.completedAt > 0}`);
    } catch (e) {
      // Session might not exist
    }
  }
}

checkBalances().catch(console.error);