import { ethers } from './node_modules/ethers/lib/index.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

async function testSession() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);
  const wallet = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY, provider);
  
  const abi = [
    'function createSessionJob(address host, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval) payable returns (uint256)'
  ];
  
  const contract = new ethers.Contract(process.env.CONTRACT_JOB_MARKETPLACE, abi, wallet);
  
  const params = {
    host: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
    deposit: ethers.utils.parseEther('0.00001'),
    pricePerToken: '1000000000', // 1 gwei
    maxDuration: 3600,
    proofInterval: 300
  };
  
  console.log('Creating session with:');
  console.log('  Contract:', process.env.CONTRACT_JOB_MARKETPLACE);
  console.log('  Host:', params.host);
  console.log('  Deposit:', ethers.utils.formatEther(params.deposit), 'ETH');
  
  try {
    const tx = await contract.createSessionJob(
      params.host,
      params.deposit,
      params.pricePerToken,
      params.maxDuration,
      params.proofInterval,
      { 
        value: params.deposit,
        gasLimit: 500000
      }
    );
    console.log('Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Success! Block:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());
    
    // Check for events
    if (receipt.logs.length > 0) {
      console.log('Events emitted:', receipt.logs.length);
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
  }
}

testSession().catch(console.error);