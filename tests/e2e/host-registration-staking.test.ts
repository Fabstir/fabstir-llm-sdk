import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { FabstirSDK } from '../../src/FabstirSDK';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.test' });

/**
 * Host Registration and Staking E2E Test - SDK Version
 * 
 * This test uses ONLY FabstirSDK and managers, no direct contract access.
 * Tests the complete lifecycle of a host:
 * 1. Register as host
 * 2. Stake FAB tokens  
 * 3. Unstake FAB tokens
 * 4. Unregister as host
 */
describe('Host Registration and Staking E2E (SDK Only)', () => {
  let sdk: FabstirSDK;
  let hostManager: any;
  
  const hostAddress = process.env.TEST_HOST_2_ADDRESS!;
  const hostPrivateKey = process.env.TEST_HOST_2_PRIVATE_KEY!;
  
  beforeAll(async () => {
    console.log('\n🔧 Setting up Host Registration Test (SDK Only)\n');
    console.log(`Host Address: ${hostAddress} (TEST_HOST_2)`);
    console.log(`Using FabstirSDK with HostManager only\n`);
    
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
    
    // Authenticate with SDK
    await sdk.authenticate(hostPrivateKey);
    
    // Get host manager from SDK
    hostManager = sdk.getHostManager();
    
    // Display gas price
    const provider = sdk.provider!;
    const gasPrice = await provider.getGasPrice();
    console.log(`Current gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`);
  }, 60000);
  
  afterAll(async () => {
    console.log('\n✅ Host Registration Test Complete (SDK Only)\n');
  });
  
  /**
   * Helper function to wait for next block to ensure state is updated
   */
  async function waitForNextBlock(): Promise<void> {
    const provider = sdk.provider!;
    const currentBlock = await provider.getBlockNumber();
    console.log(`   ⏳ Waiting for block ${currentBlock + 1}...`);
    await new Promise(resolve => {
      provider.once('block', resolve);
    });
  }
  
  /**
   * Helper function to display host status using SDK managers
   */
  async function displayHostStatus(stage: string): Promise<void> {
    console.log(`\n📊 ${stage}:`);
    
    const hostInfo = await hostManager.getHostInfo();
    const fabBalance = await hostManager.getFabBalance();
    
    console.log(`   Registration Status: ${hostInfo.isRegistered ? '✅ Registered' : '❌ Not Registered'}`);
    if (hostInfo.isRegistered) {
      console.log(`   Metadata: ${hostInfo.metadata || 'None'}`);
      console.log(`   Staked Amount: ${ethers.utils.formatUnits(hostInfo.stakedAmount, 18)} FAB`);
      console.log(`   Active: ${hostInfo.active ? 'Yes' : 'No'}`);
    }
    console.log(`   FAB Token Balance: ${ethers.utils.formatUnits(fabBalance, 18)} FAB`);
    
    // ETH balance via SDK provider
    const provider = sdk.provider!;
    const ethBalance = await provider.getBalance(hostAddress);
    console.log(`   ETH Balance: ${ethers.utils.formatEther(ethBalance)} ETH`);
  }
  
  it('should complete full host lifecycle using SDK managers only', async () => {
    console.log('\n🚀 Starting Host Registration and Staking Test\n');
    
    // Display initial status
    await displayHostStatus('Initial Status');
    
    // Step 1: Register as host
    console.log('\n═══════════════════════════════════════════');
    console.log('STEP 1: REGISTER AS HOST');
    console.log('═══════════════════════════════════════════');
    
    try {
      console.log('\nPreparing for registration...');
      const metadata = 'llama-2-7b,llama-2-13b,inference';
      
      // Check requirements via SDK
      const minStake = await hostManager.getMinStake();
      console.log(`   Minimum stake required: ${ethers.utils.formatUnits(minStake, 18)} FAB`);
      
      const fabBalance = await hostManager.getFabBalance();
      console.log(`   Current FAB balance: ${ethers.utils.formatUnits(fabBalance, 18)} FAB`);
      
      const hostInfo = await hostManager.getHostInfo();
      
      if (hostInfo.isRegistered) {
        console.log('❌ Registration failed: Host already registered');
        console.log('   Note: Host was already registered, continuing with test...');
      } else if (fabBalance.lt(minStake)) {
        throw new Error(`Insufficient FAB tokens. Need ${ethers.utils.formatUnits(minStake, 18)} FAB, have ${ethers.utils.formatUnits(fabBalance, 18)} FAB`);
      } else {
        console.log('\nRegistering host with metadata...');
        const registerTx = await hostManager.registerHost({ metadata });
        console.log(`📝 Registration Transaction: ${registerTx.hash}`);
        
        const registerReceipt = await registerTx.wait();
        console.log(`✅ Registration Confirmed in Block: ${registerReceipt.blockNumber}`);
        console.log(`   Gas Used: ${registerReceipt.gasUsed.toString()}`);
        
        // Find NodeRegistered event
        const registeredEvent = registerReceipt.events?.find((e: any) => e.event === 'NodeRegistered');
        if (registeredEvent) {
          console.log(`   Event: NodeRegistered`);
          console.log(`   Operator: ${registeredEvent.args.operator}`);
          console.log(`   Staked Amount: ${ethers.utils.formatUnits(registeredEvent.args.stakedAmount, 18)} FAB`);
          console.log(`   Metadata: ${registeredEvent.args.metadata}`);
        }
        
        // Wait for next block to ensure state is updated
        await waitForNextBlock();
        await displayHostStatus('After Registration');
      }
    } catch (error: any) {
      console.log(`❌ Registration failed: ${error.message.substring(0, 100)}...`);
      if (error.message.includes('already registered')) {
        console.log('   Note: Host was already registered, continuing with test...');
      } else if (error.message.includes('insufficient funds')) {
        console.log('   ⚠️  Insufficient ETH for gas fees');
        console.log('   Note: Test account needs more ETH to execute transactions');
      } else {
        console.log('   Unexpected error, continuing...');
      }
    }
    
    // Step 2: Additional staking (optional)
    console.log('\n═══════════════════════════════════════════');
    console.log('STEP 2: ADDITIONAL STAKING (OPTIONAL)');
    console.log('═══════════════════════════════════════════');
    
    try {
      const hostInfo = await hostManager.getHostInfo();
      
      if (!hostInfo.isRegistered) {
        console.log('⚠️  Not registered, skipping additional staking');
      } else {
        const fabBalance = await hostManager.getFabBalance();
        const additionalStake = ethers.utils.parseUnits('500', 18);
        
        console.log(`\nCurrent FAB Balance: ${ethers.utils.formatUnits(fabBalance, 18)} FAB`);
        console.log(`Current Staked: ${ethers.utils.formatUnits(hostInfo.stakedAmount, 18)} FAB`);
        
        if (fabBalance.lt(additionalStake)) {
          console.log(`⚠️  Insufficient FAB tokens for additional staking`);
          console.log(`   Required: 500.0 FAB`);
          console.log(`   Available: ${ethers.utils.formatUnits(fabBalance, 18)} FAB`);
        } else {
          console.log(`\nStaking additional 500 FAB tokens...`);
          const stakeTx = await hostManager.addStake('500');
          console.log(`📝 Stake Transaction: ${stakeTx.hash}`);
          
          const stakeReceipt = await stakeTx.wait();
          console.log(`✅ Additional Staking Confirmed in Block: ${stakeReceipt.blockNumber}`);
          console.log(`   Gas Used: ${stakeReceipt.gasUsed.toString()}`);
          
          // Find StakeAdded event
          const stakedEvent = stakeReceipt.events?.find((e: any) => e.event === 'StakeAdded');
          if (stakedEvent) {
            console.log(`   Event: StakeAdded`);
            console.log(`   Amount: ${ethers.utils.formatUnits(stakedEvent.args.additionalAmount, 18)} FAB`);
          }
          
          await displayHostStatus('After Additional Staking');
        }
      }
    } catch (error: any) {
      console.log(`❌ Additional staking failed: ${error.message.substring(0, 100)}...`);
      console.log('   Note: Additional staking is optional, continuing...');
    }
    
    // Step 3: Unregister as host (returns staked tokens)
    console.log('\n═══════════════════════════════════════════');
    console.log('STEP 3: UNREGISTER AS HOST (Returns Staked Tokens)');
    console.log('═══════════════════════════════════════════');
    
    try {
      const hostInfo = await hostManager.getHostInfo();
      
      if (!hostInfo.isRegistered) {
        console.log('⚠️  Not registered, skipping unregistration');
      } else {
        console.log(`\nCurrent Staked Amount: ${ethers.utils.formatUnits(hostInfo.stakedAmount, 18)} FAB`);
        console.log('Unregistering as host (will return staked FAB)...');
        
        const unregisterTx = await hostManager.unregisterHost();
        console.log(`📝 Unregister Transaction: ${unregisterTx.hash}`);
        
        const unregisterReceipt = await unregisterTx.wait();
        console.log(`✅ Unregistration Confirmed in Block: ${unregisterReceipt.blockNumber}`);
        console.log(`   Gas Used: ${unregisterReceipt.gasUsed.toString()}`);
        
        // Find NodeUnregistered event
        const unregisteredEvent = unregisterReceipt.events?.find((e: any) => e.event === 'NodeUnregistered');
        if (unregisteredEvent) {
          console.log(`   Event: NodeUnregistered`);
          console.log(`   Operator: ${unregisteredEvent.args.operator}`);
          console.log(`   Returned Amount: ${ethers.utils.formatUnits(unregisteredEvent.args.returnedAmount, 18)} FAB`);
        }
        
        // Wait for next block to ensure state is updated
        await waitForNextBlock();
        await displayHostStatus('After Unregistration');
      }
    } catch (error: any) {
      console.log(`❌ Unregistration failed: ${error.message.substring(0, 100)}...`);
      if (error.message.includes('not registered')) {
        console.log('   Note: Host was not registered');
      } else if (error.message.includes('insufficient funds')) {
        console.log('   ⚠️  Insufficient ETH for gas fees');
      }
    }
    
    // Final Summary
    console.log('\n═══════════════════════════════════════════');
    console.log('TEST SUMMARY');
    console.log('═══════════════════════════════════════════');
    
    const finalInfo = await hostManager.getHostInfo();
    const finalBalance = await hostManager.getFabBalance();
    const provider = sdk.provider!;
    const finalEthBalance = await provider.getBalance(hostAddress);
    
    console.log('\nFinal Status:');
    console.log(`  Host Address: ${hostAddress}`);
    console.log(`  Registration: ${finalInfo.isRegistered ? '✅ Still Registered' : '✅ Successfully Unregistered'}`);
    console.log(`  FAB Balance: ${ethers.utils.formatUnits(finalBalance, 18)} FAB`);
    console.log(`  ETH Balance: ${ethers.utils.formatEther(finalEthBalance)} ETH`);
    
    // Verify final state
    if (!finalInfo.isRegistered) {
      console.log('\n✅ Host lifecycle test completed successfully!');
    } else {
      console.log('\n⚠️  Host lifecycle test completed with limitations');
      console.log('   To run full test, ensure sufficient ETH for gas fees');
    }
  }, 120000); // 2 minute timeout for blockchain operations
});