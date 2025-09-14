/**
 * Node Management Enhanced - Dynamic Wallet Connection
 * 
 * This page demonstrates proper node management without hardcoded addresses:
 * - Connect ANY wallet via MetaMask
 * - Dynamically check registration status
 * - Discover API URLs from blockchain
 * - Show appropriate UI based on node status
 * 
 * NO HARDCODED HOSTS OR URLS!
 */

import React, { useState, useEffect } from 'react';
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { WebSocketClient } from '@fabstir/sdk-core';
import { ethers } from 'ethers';

const NodeManagementEnhanced: React.FC = () => {
  // Wallet connection state
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  
  // Node state
  const [isRegistered, setIsRegistered] = useState(false);
  const [nodeInfo, setNodeInfo] = useState<any>(null);
  const [discoveredApiUrl, setDiscoveredApiUrl] = useState<string>('');
  
  // Form inputs
  const [metadata, setMetadata] = useState(JSON.stringify({
    name: 'Test Node',
    description: 'A test node on Base Sepolia',
    region: 'us-west-2',
    capabilities: ['gpt-4', 'claude-3'],
    models: ['CohereForAI/TinyVicuna-1B-32k-GGUF/tiny-vicuna-1b.q4_k_m.gguf']
  }, null, 2));
  const [stakeAmount, setStakeAmount] = useState('1000');
  const [apiUrl, setApiUrl] = useState('http://localhost:8080');
  
  // UI state
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string>('⚫ Unknown');
  const [discoveredNodes, setDiscoveredNodes] = useState<any[]>([]);
  
  // WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const [wsClient, setWsClient] = useState<any>(null);
  const [streamedTokens, setStreamedTokens] = useState<string>('');
  
  // SDK instance
  const [sdk, setSdk] = useState<FabstirSDKCore | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Helper: Add log message
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev, logMessage]);
  };

  // 1. CONNECT WALLET (No hardcoded addresses!)
  const connectWallet = async () => {
    // Prevent duplicate connections
    if (isConnecting) {
      addLog('⏳ Connection already in progress...');
      return;
    }

    try {
      setIsConnecting(true);
      addLog('🔌 Connecting to MetaMask...');
      addLog('💡 IMPORTANT: To use a different account, first switch it in MetaMask extension, then connect');

      if (!window.ethereum) {
        throw new Error('MetaMask not found! Please install MetaMask.');
      }

      // Simply request accounts - will use the currently selected account in MetaMask
      // Users must manually switch accounts in MetaMask BEFORE connecting
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      // Use the currently active account in MetaMask
      const selectedAccount = accounts[0];
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const walletSigner = await provider.getSigner();
      const address = await walletSigner.getAddress();
      
      // Verify we got the right account
      if (address.toLowerCase() !== selectedAccount.toLowerCase()) {
        addLog(`⚠️ Account mismatch: expected ${selectedAccount}, got ${address}`);
      }
      
      setSigner(walletSigner);
      setWalletAddress(address);
      setWalletConnected(true);
      
      addLog(`✅ Wallet connected: ${address}`);
      
      // Initialize SDK with connected wallet
      const sdkInstance = await initializeSDK(walletSigner);
      
      // IMPORTANT: Set SDK in state and wait for it
      setSdk(sdkInstance);
      
      // Small delay to ensure state is set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now check registration with the SDK instance directly
      if (sdkInstance) {
        await checkRegistrationStatusWithSDK(address, sdkInstance);
      }
      
    } catch (error: any) {
      addLog(`❌ Wallet connection failed: ${error.message}`);
    }
  };

  // 1b. DISCONNECT WALLET
  const disconnectWallet = () => {
    addLog('🔌 Disconnecting wallet...');
    
    // Reset all state
    setWalletConnected(false);
    setWalletAddress('');
    setSigner(null);
    setSdk(null);
    setIsRegistered(false);
    setNodeInfo(null);
    setDiscoveredApiUrl('');
    setHealthStatus('⚫ Unknown');
    setWsConnected(false);
    setWsClient(null);
    setStreamedTokens('');
    
    // Clear logs but add disconnect message
    setLogs(['Wallet disconnected. Connect a wallet to continue.']);
    
    addLog('✅ Wallet disconnected');
  };

  // 2. INITIALIZE SDK with connected wallet
  const initializeSDK = async (walletSigner: ethers.Signer) => {
    try {
      addLog('🔧 Initializing SDK...');
      
      // Log the contract addresses being used
      const nodeRegistryAddress = process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY;
      addLog(`📋 Using NodeRegistry: ${nodeRegistryAddress}`);
      
      const sdkInstance = new FabstirSDKCore({
        mode: 'production',
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
        contractAddresses: {
          jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
          nodeRegistry: nodeRegistryAddress,
          fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN,
          hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS,
          usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN,
          modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY
        }
      });
      
      await sdkInstance.authenticate('signer', { signer: walletSigner });
      setSdk(sdkInstance);
      
      addLog('✅ SDK initialized');
      return sdkInstance;
      
    } catch (error: any) {
      addLog(`❌ SDK initialization failed: ${error.message}`);
      return null;
    }
  };

  // 3. CHECK REGISTRATION STATUS with SDK instance
  const checkRegistrationStatusWithSDK = async (address: string, sdkInstance: FabstirSDKCore) => {
    try {
      addLog(`🔍 Checking registration status for ${address}...`);
      
      const hostManager = sdkInstance.getHostManager();
      addLog(`🔍 Calling getHostInfo for ${address}...`);
      const info = await hostManager.getHostInfo(address);

      // Log the full info for debugging
      console.log('Host status:', info);
      addLog(`📊 Registration check result: isRegistered=${info.isRegistered}, isActive=${info.isActive}`);
      if (info.stakedAmount) {
        addLog(`💰 Staked amount: ${ethers.formatUnits(info.stakedAmount, 18)} FAB`);
      }
      
      setIsRegistered(info.isRegistered);
      
      if (info.isRegistered) {
        addLog('✅ This wallet is registered as a node!');
        
        // Update metadata field with current value
        if (info.metadata) {
          setMetadata(info.metadata);
        }
        
        // Check for API URL in the info object
        if (info.apiUrl) {
          setDiscoveredApiUrl(info.apiUrl);
          addLog(`📍 API URL from registry: ${info.apiUrl}`);
        } else {
          // Try to parse from metadata as fallback
          if (info.metadata) {
            try {
              const meta = typeof info.metadata === 'string' ? JSON.parse(info.metadata) : info.metadata;
              if (meta.apiUrl) {
                setDiscoveredApiUrl(meta.apiUrl);
                addLog(`📍 Found API URL in metadata: ${meta.apiUrl}`);
              } else {
                addLog('ℹ️ No API URL found in registry');
              }
            } catch {
              addLog('ℹ️ No API URL found in registry');
            }
          } else {
            addLog('ℹ️ No API URL found in registry');
          }
        }
        
        setNodeInfo({
          address: address,
          isActive: info.isActive,
          stakedAmount: info.stakedAmount ? ethers.formatUnits(info.stakedAmount, 18) : '0',
          metadata: typeof info.metadata === 'object' ? JSON.stringify(info.metadata, null, 2) : (info.metadata || 'None'),
          supportedModels: info.supportedModels || []
        });
        
      } else {
        addLog('ℹ️ This wallet is not registered as a node');
        setNodeInfo(null);
        setDiscoveredApiUrl('');
      }
      
    } catch (error: any) {
      addLog(`❌ Failed to check registration: ${error.message}`);
    }
  };

  // 3b. CHECK REGISTRATION STATUS (uses state SDK)
  const checkRegistrationStatus = async (address: string) => {
    try {
      if (!sdk) {
        addLog('⚠️ SDK not initialized, initializing now...');
        return;
      }
      
      addLog(`🔍 Checking registration status for ${address}...`);
      
      const hostManager = sdk.getHostManager();
      addLog(`🔍 Calling getHostInfo for ${address}...`);
      const info = await hostManager.getHostInfo(address);
      
      // Log the full info for debugging
      console.log('Host info:', info);
      addLog(`📊 Registration check result: isRegistered=${info.isRegistered}, isActive=${info.isActive}`);
      if (info.stakedAmount) {
        addLog(`💰 Staked amount: ${ethers.formatUnits(info.stakedAmount, 18)} FAB`);
      }
      
      setIsRegistered(info.isRegistered);
      
      if (info.isRegistered) {
        addLog('✅ This wallet is registered as a node!');
        
        // Update metadata field with current value
        if (info.metadata) {
          setMetadata(info.metadata);
        }
        
        // Check for API URL in the info object
        if (info.apiUrl) {
          setDiscoveredApiUrl(info.apiUrl);
          addLog(`📍 API URL from registry: ${info.apiUrl}`);
        } else {
          // Try to parse from metadata as fallback
          if (info.metadata) {
            try {
              const meta = typeof info.metadata === 'string' ? JSON.parse(info.metadata) : info.metadata;
              if (meta.apiUrl) {
                setDiscoveredApiUrl(meta.apiUrl);
                addLog(`📍 Found API URL in metadata: ${meta.apiUrl}`);
              } else {
                addLog('ℹ️ No API URL found in registry');
              }
            } catch {
              addLog('ℹ️ No API URL found in registry');
            }
          } else {
            addLog('ℹ️ No API URL found in registry');
          }
        }
        
        setNodeInfo({
          address: address,
          isActive: info.isActive,
          stakedAmount: info.stakedAmount ? ethers.formatUnits(info.stakedAmount, 18) : '0',
          metadata: typeof info.metadata === 'object' ? JSON.stringify(info.metadata, null, 2) : (info.metadata || 'None'),
          supportedModels: info.supportedModels || []
        });
        
      } else {
        addLog('ℹ️ This wallet is not registered as a node');
        setNodeInfo(null);
        setDiscoveredApiUrl('');
      }
      
    } catch (error: any) {
      addLog(`❌ Failed to check registration: ${error.message}`);
    }
  };

  // 4. REGISTER NODE
  const registerNode = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');

      addLog('📝 Registering as node with models...');
      addLog(`API URL: ${apiUrl}`);
      addLog(`Metadata: ${metadata}`);
      addLog(`Stake: ${stakeAmount} FAB`);

      // Parse metadata to get models
      let metaObj: any = {};
      try {
        metaObj = JSON.parse(metadata);
      } catch (e) {
        // Create default metadata
        metaObj = {
          name: "Test Node",
          description: "A test node on Base Sepolia",
          models: ["CohereForAI/TinyVicuna-1B-32k-GGUF/tiny-vicuna-1b.q4_k_m.gguf"]
        };
      }

      // Use HostManagerEnhanced for model-aware registration
      const hostManager = sdk.getHostManager() as any; // Cast to avoid type issues

      // Use the new registerHostWithModels method
      // Using a pre-approved model (you may need to check which models are approved in your ModelRegistry)
      const txHash = await hostManager.registerHostWithModels({
        apiUrl: apiUrl,
        supportedModels: [
          {
            repo: "CohereForAI/TinyVicuna-1B-32k-GGUF",  // Correct repo for approved model
            file: "tiny-vicuna-1b.q4_k_m.gguf"           // Correct file for approved model
          }
        ],
        metadata: {
          hardware: {
            gpu: "RTX 3090",
            vram: 24,
            ram: 32
          },
          capabilities: {
            streaming: true,
            batch: true
          },
          location: metaObj.region || "us-west-2",
          maxConcurrent: 5,
          costPerToken: 0.0001,
          stakeAmount: stakeAmount.toString()
        }
      });
      
      addLog(`✅ Node registered! TX: ${txHash}`);
      
      // Refresh status
      await checkRegistrationStatus(walletAddress);
      
    } catch (error: any) {
      addLog(`❌ Registration failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 5. UNREGISTER NODE
  const unregisterNode = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');
      
      addLog('📝 Unregistering node...');
      
      const hostManager = sdk.getHostManager();
      const txHash = await hostManager.unregisterHost();
      
      addLog(`✅ Node unregistered! TX: ${txHash}`);
      
      // Refresh status
      await checkRegistrationStatus(walletAddress);
      
    } catch (error: any) {
      addLog(`❌ Unregister failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 6. UPDATE METADATA / MODELS
  const updateMetadata = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');

      addLog('📝 Updating supported models to include TinyVicuna-1B...');

      const hostManager = sdk.getHostManager() as any;

      // Use the actual approved model ID for TinyVicuna-1B
      // This is the keccak256 hash of the model's HuggingFace repo + filename
      const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';

      const txHash = await hostManager.updateSupportedModels([TINY_VICUNA_MODEL_ID]);

      addLog(`✅ Models updated! TX: ${txHash}`);
      addLog('✅ Host now supports TinyVicuna-1B (CohereForAI/TinyVicuna-1B-32k-GGUF)');

      // Refresh to get updated info
      await checkRegistrationStatus(walletAddress);

    } catch (error: any) {
      addLog(`❌ Update failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 7. DISCOVER ALL NODES (Shows the power of discovery!)
  const discoverAllNodes = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');
      
      addLog('🔍 Discovering all active nodes from blockchain...');
      
      const hostManager = sdk.getHostManager();
      const nodes = await hostManager.discoverAllActiveHosts();
      
      if (nodes.length > 0) {
        addLog(`✅ Found ${nodes.length} active nodes:`);
        nodes.forEach(node => {
          addLog(`  📍 ${node.nodeAddress.slice(0, 8)}...${node.nodeAddress.slice(-6)}: ${node.apiUrl}`);
        });
        setDiscoveredNodes(nodes);
      } else {
        addLog('ℹ️ No active nodes found in registry');
        setDiscoveredNodes([]);
      }
      
    } catch (error: any) {
      addLog(`❌ Discovery failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 8. HEALTH CHECK (Uses discovered URL, not hardcoded!)
  const checkHealth = async () => {
    try {
      if (!discoveredApiUrl) {
        addLog('❌ No API URL discovered for this node');
        return;
      }
      
      addLog(`🏥 Checking health at ${discoveredApiUrl}...`);
      
      const healthUrl = `${discoveredApiUrl}/health`;
      const startTime = Date.now();
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        setHealthStatus(`🟢 Online (${responseTime}ms)`);
        addLog(`✅ Node healthy! Response: ${responseTime}ms`);
        if (data) {
          addLog(`Health data: ${JSON.stringify(data)}`);
        }
      } else {
        setHealthStatus('🔴 Offline');
        addLog(`❌ Node unhealthy: HTTP ${response.status}`);
      }
      
    } catch (error: any) {
      setHealthStatus('🔴 Offline');
      addLog(`❌ Health check failed: ${error.message}`);
    }
  };

  // 9. WEBSOCKET TEST (Uses discovered URL!)
  const connectWebSocket = async () => {
    try {
      if (!discoveredApiUrl) {
        addLog('❌ No API URL discovered for WebSocket connection');
        return;
      }
      
      addLog('🔌 Connecting to WebSocket...');
      
      // Convert discovered URL to WebSocket
      // Use the discovered API URL directly from browser's perspective
      const wsUrl = discoveredApiUrl
        .replace('http://', 'ws://')
        .replace('https://', 'wss://') + '/v1/ws';
      
      addLog(`Connecting to ${wsUrl}...`);
      
      // Try simple WebSocket connection first (as recommended by node developer)
      try {
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          addLog('✅ WebSocket connected!');
          setWsConnected(true);
        };
        
        // Handle messages - expecting initial "connected" message
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'connected') {
              addLog(`🎉 ${data.message}`);
            } else if (data.type === 'stream_chunk') {
              // Handle streaming tokens
              if (data.content) {
                setStreamedTokens(prev => prev + data.content);
              }
            } else if (data.type === 'stream_end') {
              addLog('✅ Streaming complete!');
            } else {
              addLog(`📨 WS Message: ${JSON.stringify(data).slice(0, 100)}...`);
            }
          } catch (e) {
            addLog(`📨 WS Raw: ${event.data}`);
          }
        };
        
        // Create client wrapper after connection is established
        const client = {
          ws,
          sendMessage: (msg: any) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(msg));
            }
          },
          onMessage: (handler: (data: any) => void) => {
            const originalHandler = ws.onmessage;
            ws.onmessage = (event) => {
              if (originalHandler) originalHandler(event);
              try {
                const data = JSON.parse(event.data);
                handler(data);
              } catch (e) {
                handler(event.data);
              }
            };
          },
          disconnect: () => {
            ws.close();
          }
        };
        
        setWsClient(client as any);
        
        ws.onerror = (error) => {
          addLog(`❌ WebSocket error: ${error}`);
          setWsConnected(false);
        };
        
        ws.onclose = (event) => {
          addLog(`WebSocket closed: ${event.code} ${event.reason}`);
          setWsConnected(false);
        };
        
      } catch (directError: any) {
        addLog(`❌ Direct WebSocket failed: ${directError.message}`);
        
        // Fall back to WebSocketClient
        const client = new WebSocketClient(wsUrl);
        await client.connect();
        
        setWsClient(client);
        setWsConnected(true);
        addLog('✅ WebSocket connected via client!');
        
        // Set up message handler
        client.onMessage((data: any) => {
          addLog(`📨 WS Message: ${JSON.stringify(data).slice(0, 100)}...`);
        });
      }
      
    } catch (error: any) {
      addLog(`❌ WebSocket connection failed: ${error.message}`);
      setWsConnected(false);
    }
  };

  const disconnectWebSocket = async () => {
    try {
      if (wsClient) {
        await wsClient.disconnect();
        setWsClient(null);
        setWsConnected(false);
        addLog('✅ WebSocket disconnected');
      }
    } catch (error: any) {
      addLog(`❌ Disconnect failed: ${error.message}`);
    }
  };

  // 10. TEST WEBSOCKET STREAMING
  const testWebSocketStreaming = async () => {
    try {
      if (!wsClient || !wsConnected) {
        addLog('❌ WebSocket not connected');
        return;
      }
      
      addLog('🚀 Testing WebSocket streaming...');
      setStreamedTokens('');
      
      // Send inference request according to the new format
      await wsClient.sendMessage({
        type: 'inference',
        request: {
          prompt: 'Hello! Please respond with exactly 5 words.',
          model: 'llama-2-7b',
          stream: true,
          temperature: 0.7,
          max_tokens: 20
        }
      });
      
      addLog('📤 Sent inference request, waiting for response...');
      
    } catch (error: any) {
      addLog(`❌ Streaming test failed: ${error.message}`);
    }
  };

  // 11. ADD STAKE
  const addStake = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');
      
      addLog(`💰 Adding ${stakeAmount} FAB stake...`);
      
      const hostManager = sdk.getHostManager();
      const txHash = await hostManager.addStake(stakeAmount);
      
      addLog(`✅ Stake added! TX: ${txHash}`);
      
      // Refresh
      await checkRegistrationStatus(walletAddress);
      
    } catch (error: any) {
      addLog(`❌ Add stake failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 12. WITHDRAW EARNINGS
  const withdrawEarnings = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');
      
      addLog('💸 Withdrawing earnings...');
      
      const hostManager = sdk.getHostManager();
      const txHash = await hostManager.withdrawEarnings(
        process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!
      );
      
      addLog(`✅ Earnings withdrawn! TX: ${txHash}`);
      
    } catch (error: any) {
      addLog(`❌ Withdrawal failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // DO NOT auto-connect - let user manually connect to choose account
  useEffect(() => {
    addLog('👋 Welcome! Click "Connect MetaMask" to choose your account.');
    addLog('💡 Tip: Use Disconnect button to switch between accounts.');
  }, []);

  // Listen for account changes in MetaMask
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          // User disconnected all accounts
          addLog('👤 All accounts disconnected');
          disconnectWallet();
        } else if (walletAddress && accounts[0].toLowerCase() !== walletAddress.toLowerCase()) {
          // User switched accounts
          addLog(`👤 Account changed from ${walletAddress} to ${accounts[0]}`);
          // Disconnect and reconnect with new account
          disconnectWallet();
          setTimeout(() => {
            connectWallet();
          }, 500);
        }
      };

      const handleChainChanged = () => {
        // Reload the page when chain changes
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      // Cleanup listeners
      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, [walletAddress]);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>🚀 Node Management - Dynamic & Decentralized (v2)</h1>
      <p style={{ color: '#666' }}>No hardcoded addresses or URLs - everything discovered from blockchain!</p>
      
      {/* Wallet Connection */}
      {!walletConnected ? (
        <div style={{
          padding: '30px',
          border: '2px solid #007bff',
          borderRadius: '10px',
          textAlign: 'center',
          marginBottom: '20px'
        }}>
          <h2>Connect Your Wallet</h2>
          <p>Connect any wallet to manage your node or register as a new node</p>

          {/* Account Switching Instructions */}
          <div style={{
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '5px',
            padding: '15px',
            margin: '20px auto',
            maxWidth: '500px',
            textAlign: 'left'
          }}>
            <strong>⚠️ To Switch Accounts:</strong>
            <ol style={{ marginTop: '10px', marginBottom: '10px' }}>
              <li>Open MetaMask extension</li>
              <li>Click on the account dropdown at the top</li>
              <li>Select the desired account (User or Host)</li>
              <li>Then click Connect below</li>
            </ol>
            <small style={{ color: '#856404' }}>
              MetaMask will connect with the currently selected account.
              You must switch accounts in MetaMask BEFORE connecting.
            </small>
          </div>

          <button
            onClick={connectWallet}
            disabled={isConnecting}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              backgroundColor: isConnecting ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: isConnecting ? 'not-allowed' : 'pointer'
            }}
          >
            {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
          </button>
        </div>
      ) : (
        <>
          {/* Connected Wallet Info */}
          <div style={{
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#e8f4fd',
            borderRadius: '5px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <strong>Connected Wallet:</strong> {walletAddress}
                <br />
                <strong>Node Status:</strong> {isRegistered ? '✅ Registered' : '❌ Not Registered'}
                {discoveredApiUrl && (
                  <>
                    <br />
                    <strong>Discovered API URL:</strong> {discoveredApiUrl}
                  </>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                  <button
                    onClick={() => checkRegistrationStatus(walletAddress)}
                    disabled={loading}
                    style={{
                      padding: '5px 10px',
                      fontSize: '12px',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    🔄 Refresh
                  </button>
                  <button
                    onClick={disconnectWallet}
                    style={{
                      padding: '5px 10px',
                      fontSize: '12px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    🔌 Disconnect
                  </button>
                </div>
                <small style={{ color: '#6c757d', fontSize: '11px' }}>
                  To switch accounts: Disconnect → Switch in MetaMask → Connect
                </small>
              </div>
            </div>
          </div>

          {/* Registration Section (Only if not registered) */}
          {!isRegistered && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              border: '1px solid #28a745', 
              borderRadius: '5px',
              backgroundColor: '#f0fff0'
            }}>
              <h3>📝 Register as Node</h3>
              
              <div style={{ marginBottom: '10px' }}>
                <label>API URL (Your running node endpoint):</label><br />
                <input 
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  style={{ padding: '5px', width: '100%', fontFamily: 'monospace' }}
                  placeholder='http://localhost:8080'
                />
                <small style={{ color: '#666' }}>For Node 1: http://localhost:8080 | For Node 2: http://localhost:8083</small>
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <label>Metadata (JSON):</label><br />
                <textarea 
                  value={metadata}
                  onChange={(e) => setMetadata(e.target.value)}
                  style={{ width: '100%', height: '80px', fontFamily: 'monospace', fontSize: '12px' }}
                  placeholder='{"models":["model-name"]}'
                />
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <label>Initial Stake (FAB):</label><br />
                <input 
                  type="text"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  style={{ padding: '5px', width: '200px' }}
                />
              </div>
              
              <button 
                onClick={registerNode} 
                disabled={loading}
                style={{ 
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                Register Node
              </button>
            </div>
          )}

          {/* Node Management (Only if registered) */}
          {isRegistered && nodeInfo && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              border: '1px solid #17a2b8', 
              borderRadius: '5px',
              backgroundColor: '#f0f8ff'
            }}>
              <h3>⚙️ Node Management</h3>
              
              <div style={{ marginBottom: '15px', fontSize: '14px' }}>
                <div>Active: {nodeInfo.isActive ? '✅ Yes' : '❌ No'}</div>
                <div>Staked: {nodeInfo.stakedAmount} FAB</div>
                <div style={{ marginBottom: '10px' }}>
                  <strong>Supported Models:</strong>
                  {nodeInfo.supportedModels && nodeInfo.supportedModels.length > 0 ? (
                    <ul style={{ marginTop: '5px', marginBottom: '5px', paddingLeft: '20px' }}>
                      {nodeInfo.supportedModels.map((modelId: string, index: number) => (
                        <li key={index} style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>
                          {modelId === '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced'
                            ? `TinyVicuna-1B (${modelId.slice(0, 10)}...)`
                            : modelId}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: '#ff6b6b', marginLeft: '10px' }}>❌ No models configured</span>
                  )}
                </div>
                <details style={{ marginTop: '10px' }}>
                  <summary style={{ cursor: 'pointer', color: '#007bff' }}>View Metadata</summary>
                  <div style={{ wordBreak: 'break-all', marginTop: '5px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '3px' }}>
                    {nodeInfo.metadata}
                  </div>
                </details>
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <label>Update API URL:</label><br />
                <input 
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  style={{ padding: '5px', width: '100%', fontFamily: 'monospace', marginBottom: '5px' }}
                  placeholder='http://localhost:8080'
                />
                <button 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      addLog(`📝 Updating API URL to: ${apiUrl}`);
                      const hostManager = sdk.getHostManager();
                      const txHash = await hostManager.updateApiUrl(apiUrl);
                      addLog(`✅ API URL updated! TX: ${txHash}`);
                      await checkRegistrationStatus(walletAddress);
                    } catch (error: any) {
                      addLog(`❌ Update failed: ${error.message}`);
                    } finally {
                      setLoading(false);
                    }
                  }} 
                  disabled={loading}
                  style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '3px' }}
                >
                  Update API URL
                </button>
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <label>Update Metadata:</label><br />
                <textarea 
                  value={metadata}
                  onChange={(e) => setMetadata(e.target.value)}
                  style={{ width: '100%', height: '60px', fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <label>Add Stake (FAB):</label><br />
                <input 
                  type="text"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  style={{ padding: '5px', width: '150px', marginRight: '10px' }}
                />
                <button onClick={addStake} disabled={loading}>Add Stake</button>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={updateMetadata} disabled={loading}>Add Model Support</button>
                <button onClick={withdrawEarnings} disabled={loading}>Withdraw Earnings</button>
                <button 
                  onClick={unregisterNode} 
                  disabled={loading}
                  style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '3px' }}
                >
                  Unregister Node
                </button>
              </div>
            </div>
          )}

          {/* Node Testing (Only if registered with API URL) */}
          {isRegistered && discoveredApiUrl && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              border: '1px solid #6c757d', 
              borderRadius: '5px' 
            }}>
              <h3>🧪 Node Testing</h3>
              
              <div style={{ marginBottom: '10px' }}>
                <strong>Health Status:</strong> {healthStatus}
              </div>
              
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button onClick={checkHealth} disabled={loading}>Check Health</button>
                <button onClick={connectWebSocket} disabled={loading || wsConnected}>Connect WebSocket</button>
                <button onClick={disconnectWebSocket} disabled={loading || !wsConnected}>Disconnect WS</button>
                <button onClick={testWebSocketStreaming} disabled={loading || !wsConnected}>Test Streaming</button>
              </div>
              
              <div>WebSocket: {wsConnected ? '✅ Connected' : '❌ Disconnected'}</div>
              
              {streamedTokens && (
                <div style={{ 
                  marginTop: '10px', 
                  padding: '10px', 
                  backgroundColor: '#f0f0f0', 
                  borderRadius: '3px',
                  maxHeight: '100px',
                  overflowY: 'auto'
                }}>
                  <strong>Streamed Output:</strong><br />
                  {streamedTokens}
                </div>
              )}
            </div>
          )}

          {/* Discovery Section (Always visible when connected) */}
          <div style={{ 
            marginBottom: '20px', 
            padding: '15px', 
            border: '1px solid #ffc107', 
            borderRadius: '5px',
            backgroundColor: '#fffef0'
          }}>
            <h3>🔍 Network Discovery</h3>
            
            <button 
              onClick={discoverAllNodes} 
              disabled={loading}
              style={{ marginBottom: '10px', padding: '8px 15px' }}
            >
              Discover All Active Nodes
            </button>
            
            {discoveredNodes.length > 0 && (
              <div>
                <strong>Discovered Nodes ({discoveredNodes.length}):</strong>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>
                  {discoveredNodes.map((node, i) => (
                    <div key={i} style={{ 
                      padding: '5px', 
                      backgroundColor: i % 2 === 0 ? '#f9f9f9' : '#fff',
                      borderLeft: '3px solid #ffc107'
                    }}>
                      <strong>{node.nodeAddress.slice(0, 10)}...{node.nodeAddress.slice(-8)}</strong>
                      <br />
                      API: {node.apiUrl}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Logs (Always visible) */}
      <div style={{ 
        padding: '15px', 
        border: '1px solid #ddd', 
        borderRadius: '5px', 
        backgroundColor: '#f5f5f5' 
      }}>
        <h3>📜 Activity Log</h3>
        <div style={{ 
          maxHeight: '300px', 
          overflowY: 'auto', 
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          {logs.length === 0 ? (
            <div style={{ color: '#999' }}>Connect wallet to begin...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} style={{ marginBottom: '2px' }}>{log}</div>
            ))
          )}
        </div>
        {logs.length > 0 && (
          <button 
            onClick={() => setLogs([])} 
            style={{ marginTop: '10px', fontSize: '12px', padding: '5px 10px' }}
          >
            Clear Logs
          </button>
        )}
      </div>
    </div>
  );
};

export default NodeManagementEnhanced;