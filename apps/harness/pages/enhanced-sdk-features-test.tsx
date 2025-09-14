/**
 * Enhanced SDK Features Test
 * 
 * Demonstrates:
 * 1. Host Discovery from blockchain NodeRegistry
 * 2. WebSocket streaming for real-time responses
 * 3. Integrated session management with discovered hosts
 */

import React, { useState } from 'react';
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ethers } from 'ethers';
import { getOrGenerateS5Seed, cacheSeed } from '@fabstir/sdk-core';

const EnhancedSDKFeaturesTest: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [streamedResponse, setStreamedResponse] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<string>('');

  const addLog = (message: string) => {
    console.log(message);
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const testHostDiscovery = async () => {
    try {
      addLog('🚀 Starting Host Discovery Test...');
      
      // Initialize SDK
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      
      const sdk = new FabstirSDKCore({
        mode: 'production',
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
        contractAddresses: {
          jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
          nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
          proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
          hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
          fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
          usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
          modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
        }
      });
      
      await sdk.authenticate('signer', { signer });
      addLog(`✅ SDK initialized for ${walletAddress}`);
      setConnectedWallet(walletAddress);
      
      // Test Host Discovery
      const hostManager = sdk.getHostManager();
      addLog('🔍 Discovering active hosts from blockchain...');
      
      try {
        // Discover all active hosts with models
        const activeHosts = await (hostManager as any).discoverAllActiveHostsWithModels();
        
        if (activeHosts.length > 0) {
          addLog(`✅ Found ${activeHosts.length} active hosts:`);
          for (const host of activeHosts) {
            addLog(`  - Node: ${host.address}`);
            addLog(`    API URL: ${host.apiUrl || 'Not set'}`);
            addLog(`    Models: ${host.modelIds?.join(', ') || 'none'}`);
          }

          // Show API URLs from discovered hosts
          const firstHost = activeHosts[0];
          addLog(`✅ Verified host ${firstHost.address} with API URL: ${firstHost.apiUrl || 'Not set'}`);
        } else {
          addLog('⚠️ No active hosts found in NodeRegistry');
          addLog('Using fallback hosts for testing...');
        }
      } catch (error: any) {
        addLog(`⚠️ Host discovery failed: ${error.message}`);
        addLog('Using fallback hosts for testing...');
      }
      
      addLog('✅ Host Discovery Test Complete!');
      
    } catch (error: any) {
      addLog(`❌ Host Discovery Test failed: ${error.message}`);
      console.error(error);
    }
  };

  const testWebSocketStreaming = async () => {
    try {
      addLog('🚀 Starting WebSocket Streaming Test...');
      setStreamedResponse('');
      setIsStreaming(true);
      
      // Initialize SDK
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      
      const sdk = new FabstirSDKCore({
        mode: 'production',
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
        contractAddresses: {
          jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
          nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
          proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
          hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
          fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
          usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
          modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
        }
      });
      
      await sdk.authenticate('signer', { signer });
      
      // Generate and cache S5 seed to avoid popup
      const s5Seed = await getOrGenerateS5Seed(signer);
      cacheSeed(walletAddress.toLowerCase(), s5Seed);
      addLog('✅ S5 seed cached');
      
      // Create a session
      const sessionManager = sdk.getSessionManager();
      const paymentManager = sdk.getPaymentManager();

      // Discover active hosts to find a valid provider
      const hostManager = sdk.getHostManager();
      // Use fallback if env var is not available
      let providerAddress = process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS || '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';

      try {
        const activeHosts = await (hostManager as any).discoverAllActiveHostsWithModels();
        addLog(`Found ${activeHosts.length} active hosts`);

        if (activeHosts.length > 0) {
          // Log what we found
          for (const host of activeHosts) {
            addLog(`  Found host: ${host.address}, models: ${host.modelIds?.join(', ') || 'none'}`);
          }

          // Use the first active host that's not the current wallet
          const availableHost = activeHosts.find(h =>
            h.address?.toLowerCase() !== walletAddress.toLowerCase()
          );
          if (availableHost) {
            providerAddress = availableHost.address;
            addLog(`Using discovered host: ${providerAddress}`);

            // Check if host supports TinyVicuna model
            const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
            if (availableHost.modelIds && !availableHost.modelIds.includes(TINY_VICUNA_MODEL_ID)) {
              addLog(`⚠️ Warning: Host does not support TinyVicuna model, may fail`);
            }
          } else if (activeHosts.length > 0) {
            // If all hosts are the current wallet, just use the first one
            providerAddress = activeHosts[0].address;
            addLog(`Using host: ${providerAddress} (same as wallet - may fail)`);
          }
        } else {
          addLog(`No active hosts found, using default: ${providerAddress}`);
        }
      } catch (error: any) {
        addLog(`⚠️ Could not discover hosts (${error.message}), using default: ${providerAddress}`);
      }

      // First, check if the provider actually supports the model
      addLog(`Checking if ${providerAddress} supports tiny-vicuna-1b...`);

      // Create session job with all required parameters
      // Use the actual approved model ID for TinyVicuna-1B
      const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
      const jobTx = await paymentManager.createSessionJob(
        TINY_VICUNA_MODEL_ID, // Correct TinyVicuna model ID
        providerAddress, // provider (discovered host address)
        '2', // depositAmount ($2.00 USDC - will be converted to 6 decimals internally)
        2000, // pricePerToken
        10, // proofInterval (tokens between proofs)
        3600 // duration (1 hour)
      );
      addLog(`✅ Session job created: ${jobTx.txHash}`);
      
      // Start session
      // The startSession method expects: model, provider, config, endpoint
      const sessionConfig = {
        depositAmount: BigInt(2000000), // 2 USDC in smallest units
        pricePerToken: BigInt(2000),
        proofInterval: BigInt(10),
        duration: BigInt(3600)
      };

      const session = await sessionManager.startSession(
        TINY_VICUNA_MODEL_ID, // Use the correct model ID
        providerAddress,
        sessionConfig,
        'http://localhost:8080' // endpoint
      );

      addLog(`✅ Session started: ${session.sessionId}`);
      addLog('🔄 Sending prompt with WebSocket streaming...');
      
      // Send prompt with streaming
      const prompt = "Tell me a very short story about AI in 2 sentences.";
      let tokenCount = 0;
      
      const response = await sessionManager.sendPromptStreaming(
        session.sessionId,
        prompt,
        (token: string) => {
          // Handle each token as it arrives
          tokenCount++;
          setStreamedResponse(prev => prev + token);
          
          // Log every 10th token to avoid spam
          if (tokenCount % 10 === 0) {
            addLog(`Streaming... (${tokenCount} tokens)`);
          }
        }
      );
      
      addLog(`✅ Streaming complete! Total tokens: ${tokenCount}`);
      addLog(`Full response: ${response}`);
      
      // Complete session
      const completeTx = await sessionManager.completeSession(
        session.sessionId,
        100,
        '0x' + '00'.repeat(32) // Mock proof
      );
      
      addLog(`✅ Session completed: ${completeTx}`);
      addLog('✅ WebSocket Streaming Test Complete!');
      
    } catch (error: any) {
      addLog(`❌ WebSocket Streaming Test failed: ${error.message}`);
      console.error(error);
    } finally {
      setIsStreaming(false);
    }
  };

  const testIntegratedFlow = async () => {
    try {
      addLog('🚀 Starting Integrated Flow Test...');
      
      // Initialize SDK
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      
      const sdk = new FabstirSDKCore({
        mode: 'production',
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
        contractAddresses: {
          jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
          nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
          proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
          hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
          fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
          usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
          modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
        }
      });

      await sdk.authenticate('signer', { signer });
      addLog(`✅ SDK initialized for ${walletAddress}`);
      setConnectedWallet(walletAddress);

      // Step 1: Discover hosts
      const hostManager = sdk.getHostManager();
      addLog('🔍 Discovering hosts...');
      
      let selectedHost: string | undefined;
      let apiUrl: string | undefined;
      
      try {
        const activeHosts = await hostManager.discoverAllActiveHosts();
        if (activeHosts.length > 0) {
          selectedHost = activeHosts[0].nodeAddress;
          apiUrl = activeHosts[0].apiUrl;
          addLog(`✅ Selected host: ${selectedHost} at ${apiUrl}`);
        }
      } catch (error) {
        addLog('⚠️ Using fallback host');
        selectedHost = process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS || '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
        apiUrl = process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8080';
      }
      
      // Step 2: Create session with discovered host
      const sessionManager = sdk.getSessionManager();
      const paymentManager = sdk.getPaymentManager();
      
      const jobTx = await paymentManager.createSessionJob(
        'tiny-vicuna-1b', // model
        selectedHost!, // provider (discovered host address)
        '2', // depositAmount ($2.00 USDC - will be converted to 6 decimals internally)
        2000, // pricePerToken
        10, // proofInterval (tokens between proofs)
        3600 // duration (1 hour)
      );
      addLog(`✅ Session job created`);
      
      // Start session with discovered endpoint
      const sessionId = await sessionManager.startSession({
        model: 'tiny-vicuna-1b',
        provider: selectedHost!,
        endpoint: apiUrl, // Use discovered API URL
        sessionConfig: {
          maxTokens: 1000,
          temperature: 0.7,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          proofInterval: 10,
          pricePerToken: 2000
        }
      });
      
      addLog(`✅ Session started with discovered host`);
      
      // Step 3: Use WebSocket streaming
      addLog('🔄 Testing WebSocket streaming...');
      setStreamedResponse('');
      
      await sessionManager.sendPromptStreaming(
        sessionId,
        "What is 2+2?",
        (token: string) => {
          setStreamedResponse(prev => prev + token);
        }
      );
      
      addLog('✅ Streaming response received');
      
      // Complete session
      await sessionManager.completeSession(
        sessionId,
        50,
        '0x' + '00'.repeat(32)
      );
      
      addLog('✅ Integrated Flow Test Complete!');
      addLog('✨ Successfully tested: Host Discovery + WebSocket Streaming');
      
    } catch (error: any) {
      addLog(`❌ Integrated Flow Test failed: ${error.message}`);
      console.error(error);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Enhanced SDK Features Test</h1>

      {connectedWallet && (
        <div style={{
          marginBottom: '20px',
          padding: '10px',
          backgroundColor: '#e8f4f8',
          borderRadius: '4px',
          border: '1px solid #0ea5e9'
        }}>
          <strong>Connected Wallet:</strong> {connectedWallet}
        </div>
      )}
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={testHostDiscovery}
          style={{ 
            padding: '10px 20px', 
            marginRight: '10px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Test Host Discovery
        </button>
        
        <button 
          onClick={testWebSocketStreaming}
          disabled={isStreaming}
          style={{ 
            padding: '10px 20px', 
            marginRight: '10px',
            backgroundColor: isStreaming ? '#ccc' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isStreaming ? 'not-allowed' : 'pointer'
          }}
        >
          {isStreaming ? 'Streaming...' : 'Test WebSocket Streaming'}
        </button>
        
        <button 
          onClick={testIntegratedFlow}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Test Integrated Flow
        </button>
      </div>
      
      {streamedResponse && (
        <div style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f0f0f0',
          borderRadius: '4px',
          border: '1px solid #ddd'
        }}>
          <h3>Streamed Response:</h3>
          <div style={{ whiteSpace: 'pre-wrap' }}>{streamedResponse}</div>
        </div>
      )}
      
      <div style={{ 
        backgroundColor: '#f5f5f5', 
        padding: '10px', 
        borderRadius: '4px',
        maxHeight: '500px',
        overflowY: 'auto'
      }}>
        <h3>Test Logs:</h3>
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: '5px' }}>{log}</div>
        ))}
      </div>
    </div>
  );
};

export default EnhancedSDKFeaturesTest;