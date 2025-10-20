// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
import { config as loadEnv } from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

loadEnv({ path: '.env.test' });

async function simpleTest() {
  console.log('\n=== SIMPLE ETH JOB TEST ===\n');
  
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_URL_BASE_SEPOLIA,
    { chainId: 84532, name: 'base-sepolia' }
  );
  
  const userSigner = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, provider);
  const hostAddress = process.env.TEST_HOST_1_ADDRESS!;
  
  // Check balance
  const balance = await provider.getBalance(userSigner.address);
  console.log('User balance:', ethers.utils.formatEther(balance), 'ETH');
  
  // Load contract ABI
  const abiPath = path.join(process.cwd(), 'docs/compute-contracts-reference/client-abis/JobMarketplaceFABWithS5-CLIENT-ABI.json');
  const abiContent = await fs.readFile(abiPath, 'utf-8');
  const abi = JSON.parse(abiContent);
  const contract = new ethers.Contract(
    process.env.CONTRACT_JOB_MARKETPLACE!,
    abi,
    userSigner
  );
  
  // Try to create a session job with minimal amount
  const deposit = ethers.utils.parseEther('0.0005'); // 0.5 milliETH
  const pricePerToken = ethers.utils.parseUnits('1000', 'gwei'); // 1000 gwei per token
  
  console.log('Creating session job...');
  console.log('  Host:', hostAddress);
  console.log('  Deposit:', ethers.utils.formatEther(deposit), 'ETH');
  console.log('  Price per token:', '1000 gwei');
  
  try {
    const tx = await contract.createSessionJob(
      hostAddress,
      deposit,
      pricePerToken,
      3600, // 1 hour max duration
      100,  // 100 tokens proof interval
      { 
        value: deposit,
        gasLimit: 500000
      }
    );
    
    console.log('\nTransaction sent:', tx.hash);
    const receipt = await tx.wait();
    
    console.log('Transaction confirmed!');
    console.log('  Block:', receipt.blockNumber);
    console.log('  Gas used:', receipt.gasUsed.toString());
    console.log('  Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
    
    // Extract job ID from logs and decode events
    if (receipt.logs.length > 0) {
      console.log('\nRaw logs:');
      receipt.logs.forEach((log: any, i: number) => {
        console.log(`Log ${i}:`, {
          address: log.address,
          topics: log.topics.slice(0, 2), // Just first 2 topics
          dataLength: log.data.length
        });
      });
      
      // Try to parse events
      const iface = new ethers.utils.Interface(abi);
      receipt.logs.forEach((log: any) => {
        try {
          const parsed = iface.parseLog(log);
          console.log('\nParsed event:', parsed.name);
          console.log('Args:', parsed.args);
        } catch (e) {
          // Not parseable
        }
      });
      
      const jobIdHex = receipt.logs[0].topics[1];
      const jobId = parseInt(jobIdHex, 16);
      console.log('\nExtracted Job ID:', jobId);
    }
    
  } catch (error: any) {
    console.error('\nError:', error.message);
    if (error.error?.data) {
      console.error('Contract revert data:', error.error.data);
    }
  }
}

simpleTest().catch(console.error);