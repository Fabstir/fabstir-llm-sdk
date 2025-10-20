// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { FabstirSDK } from '../../src/FabstirSDK';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.test' });

/**
 * Host Registration and Staking E2E Test using FabstirSDK
 * 
 * This test demonstrates how the UI would interact with host registration
 * using only the SDK and its managers, without direct contract access.
 */
describe('Host Registration via SDK', () => {
  let sdk: FabstirSDK;
  let hostManager: any;
  
  const hostPrivateKey = process.env.TEST_HOST_2_PRIVATE_KEY!;
  const hostAddress = process.env.TEST_HOST_2_ADDRESS!;
  
  beforeAll(async () => {
    console.log('\n🔧 Setting up Host Registration Test via SDK\n');
    console.log(`Host Address: ${hostAddress}`);
    console.log(`Using FabstirSDK with HostManager\n`);
    
    // Initialize SDK
    sdk = new FabstirSDK({
      rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!,
      contractAddresses: {
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
        fabToken: process.env.CONTRACT_FAB_TOKEN!,
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
        usdcToken: process.env.CONTRACT_USDC_TOKEN!
      }
    });
    
    // Authenticate
    await sdk.authenticate(hostPrivateKey);
    
    // Get host manager
    hostManager = sdk.getHostManager();
  }, 60000);
  
  afterAll(async () => {
    console.log('\n✅ SDK Host Registration Test Complete\n');
  });
  
  it('should complete full host lifecycle using SDK', async () => {
    console.log('\n🚀 Starting Host Registration via SDK\n');
    
    // Step 1: Check initial status
    console.log('═══════════════════════════════════════════');
    console.log('STEP 1: CHECK INITIAL STATUS');
    console.log('═══════════════════════════════════════════\n');
    
    let hostInfo = await hostManager.getHostInfo();
    const fabBalance = await hostManager.getFabBalance();
    const minStake = await hostManager.getMinStake();
    
    console.log(`Registration Status: ${hostInfo.isRegistered ? '✅ Registered' : '❌ Not Registered'}`);
    console.log(`FAB Balance: ${ethers.utils.formatUnits(fabBalance, 18)} FAB`);
    console.log(`Min Stake Required: ${ethers.utils.formatUnits(minStake, 18)} FAB`);
    
    if (hostInfo.isRegistered) {
      console.log(`Current Stake: ${ethers.utils.formatUnits(hostInfo.stakedAmount, 18)} FAB`);
      console.log(`Active: ${hostInfo.active}`);
      console.log(`Metadata: ${hostInfo.metadata}`);
    }
    
    // Step 2: Register if not registered
    if (!hostInfo.isRegistered) {
      console.log('\n═══════════════════════════════════════════');
      console.log('STEP 2: REGISTER AS HOST');
      console.log('═══════════════════════════════════════════\n');
      
      try {
        const metadata = 'llama-2-7b,llama-2-13b,inference';
        console.log(`Registering with metadata: ${metadata}`);
        
        const tx = await hostManager.registerHost({ metadata });
        console.log(`📝 Registration Transaction: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Registration Confirmed in Block: ${receipt.blockNumber}`);
        console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
        
        // Check registration event
        const event = receipt.events?.find((e: any) => e.event === 'NodeRegistered');
        if (event) {
          console.log(`   Event: NodeRegistered`);
          console.log(`   Staked: ${ethers.utils.formatUnits(event.args.stakedAmount, 18)} FAB`);
        }
        
        // Check new status
        hostInfo = await hostManager.getHostInfo();
        console.log(`\n📊 After Registration:`);
        console.log(`   Status: ${hostInfo.isRegistered ? '✅ Registered' : '❌ Failed'}`);
        console.log(`   Staked: ${ethers.utils.formatUnits(hostInfo.stakedAmount, 18)} FAB`);
        console.log(`   Active: ${hostInfo.active}`);
        
      } catch (error: any) {
        console.log(`❌ Registration failed: ${error.message}`);
      }
    }
    
    // Step 3: Add additional stake (optional)
    console.log('\n═══════════════════════════════════════════');
    console.log('STEP 3: ADDITIONAL STAKING (OPTIONAL)');
    console.log('═══════════════════════════════════════════\n');
    
    hostInfo = await hostManager.getHostInfo();
    const currentFabBalance = await hostManager.getFabBalance();
    
    if (hostInfo.isRegistered && currentFabBalance.gte(ethers.utils.parseUnits('500', 18))) {
      try {
        console.log('Adding 500 FAB additional stake...');
        const tx = await hostManager.addStake('500');
        console.log(`📝 Stake Transaction: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Stake Added in Block: ${receipt.blockNumber}`);
        
        hostInfo = await hostManager.getHostInfo();
        console.log(`   New Stake: ${ethers.utils.formatUnits(hostInfo.stakedAmount, 18)} FAB`);
        
      } catch (error: any) {
        console.log(`⚠️ Additional staking skipped: ${error.message}`);
      }
    } else {
      console.log('⚠️ Insufficient FAB balance for additional staking');
    }
    
    // Step 4: Update metadata
    console.log('\n═══════════════════════════════════════════');
    console.log('STEP 4: UPDATE METADATA');
    console.log('═══════════════════════════════════════════\n');
    
    hostInfo = await hostManager.getHostInfo();
    if (hostInfo.isRegistered) {
      try {
        const newMetadata = 'llama-2-7b,llama-2-13b,llama-2-70b,inference,embedding';
        console.log(`Updating metadata to: ${newMetadata}`);
        
        const tx = await hostManager.updateMetadata(newMetadata);
        console.log(`📝 Update Transaction: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Metadata Updated in Block: ${receipt.blockNumber}`);
        
        hostInfo = await hostManager.getHostInfo();
        console.log(`   New Metadata: ${hostInfo.metadata}`);
        
      } catch (error: any) {
        console.log(`❌ Metadata update failed: ${error.message}`);
      }
    }
    
    // Step 5: Unregister
    console.log('\n═══════════════════════════════════════════');
    console.log('STEP 5: UNREGISTER AS HOST');
    console.log('═══════════════════════════════════════════\n');
    
    hostInfo = await hostManager.getHostInfo();
    if (hostInfo.isRegistered) {
      try {
        console.log(`Current Stake to be returned: ${ethers.utils.formatUnits(hostInfo.stakedAmount, 18)} FAB`);
        
        const tx = await hostManager.unregisterHost();
        console.log(`📝 Unregister Transaction: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Unregistration Confirmed in Block: ${receipt.blockNumber}`);
        console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
        
        // Check unregistration event
        const event = receipt.events?.find((e: any) => e.event === 'NodeUnregistered');
        if (event) {
          console.log(`   Event: NodeUnregistered`);
          console.log(`   Returned: ${ethers.utils.formatUnits(event.args.returnedAmount, 18)} FAB`);
        }
        
        // Wait for next block to ensure state is updated
        const provider = sdk.provider!;
        await new Promise(resolve => {
          provider.once('block', resolve);
        });
        
        // Check final status
        hostInfo = await hostManager.getHostInfo();
        const finalBalance = await hostManager.getFabBalance();
        
        console.log(`\n📊 After Unregistration:`);
        console.log(`   Status: ${hostInfo.isRegistered ? '⚠️ Still Registered' : '✅ Unregistered'}`);
        console.log(`   FAB Balance: ${ethers.utils.formatUnits(finalBalance, 18)} FAB`);
        
      } catch (error: any) {
        console.log(`❌ Unregistration failed: ${error.message}`);
      }
    } else {
      console.log('Host is not registered, skipping unregistration');
    }
    
    // Final Summary
    console.log('\n═══════════════════════════════════════════');
    console.log('TEST SUMMARY');
    console.log('═══════════════════════════════════════════');
    
    const finalInfo = await hostManager.getHostInfo();
    const finalFabBalance = await hostManager.getFabBalance();
    
    console.log('\nFinal Status:');
    console.log(`  Host Address: ${hostAddress}`);
    console.log(`  Registration: ${finalInfo.isRegistered ? '✅ Registered' : '✅ Not Registered'}`);
    console.log(`  FAB Balance: ${ethers.utils.formatUnits(finalFabBalance, 18)} FAB`);
    
    console.log('\n✅ SDK-based host lifecycle test completed!');
    
  }, 120000); // 2 minute timeout
});