/**
 * Node Management Component - Multi-Chain & Multi-Wallet Support
 *
 * Client-side only component to avoid SSR issues with SDK
 */

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

// Chain ID constants (matching sdk-core)
const ChainId = {
  BASE_SEPOLIA: 84532,
  OPBNB_TESTNET: 5611
} as const;

// Chain configurations
const CHAINS = {
  [ChainId.BASE_SEPOLIA]: {
    id: ChainId.BASE_SEPOLIA,
    name: 'Base Sepolia',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org',
    nativeToken: 'ETH',
    explorer: 'https://sepolia.basescan.org'
  },
  [ChainId.OPBNB_TESTNET]: {
    id: ChainId.OPBNB_TESTNET,
    name: 'opBNB Testnet',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_OPBNB || 'https://opbnb-testnet-rpc.bnbchain.org',
    nativeToken: 'BNB',
    explorer: 'https://testnet.opbnbscan.com'
  }
};

// Test accounts from .env
const TEST_ACCOUNTS = {
  TEST_USER_1: {
    address: process.env.NEXT_PUBLIC_TEST_USER_1_ADDRESS,
    privateKey: process.env.NEXT_PUBLIC_TEST_USER_1_PRIVATE_KEY,
    name: 'Test User 1'
  },
  TEST_HOST_1: {
    address: process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS,
    privateKey: process.env.NEXT_PUBLIC_TEST_HOST_1_PRIVATE_KEY,
    name: 'Test Host 1',
    apiUrl: process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8080'
  },
  TEST_HOST_2: {
    address: process.env.NEXT_PUBLIC_TEST_HOST_2_ADDRESS,
    privateKey: process.env.NEXT_PUBLIC_TEST_HOST_2_PRIVATE_KEY,
    name: 'Test Host 2',
    apiUrl: process.env.NEXT_PUBLIC_TEST_HOST_2_URL || 'http://localhost:8081'
  }
};

type WalletType = 'metamask' | 'private-key';

const NodeManagementComponent: React.FC = () => {
  // Chain state
  const [selectedChain, setSelectedChain] = useState<number>(ChainId.BASE_SEPOLIA);
  const [chainSwitching, setChainSwitching] = useState(false);

  // Wallet state
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [selectedTestAccount, setSelectedTestAccount] = useState<string>('TEST_USER_1');

  // Node state
  const [isRegistered, setIsRegistered] = useState(false);
  const [nodeInfo, setNodeInfo] = useState<any>(null);
  const [discoveredApiUrl, setDiscoveredApiUrl] = useState<string>('');

  // Form inputs
  const [metadata, setMetadata] = useState(JSON.stringify({
    name: 'Test Node',
    description: 'A multi-chain test node',
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
  const [sdk, setSdk] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Helper: Add log message
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev, logMessage]);
  };

  // Get chain-specific contract addresses
  const getContractAddresses = (chainId: number) => {
    // For now, only Base Sepolia has deployed contracts
    // opBNB will use placeholder addresses until deployment
    if (chainId === ChainId.BASE_SEPOLIA) {
      return {
        jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE || '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944',
        nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY || '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
        proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM || '0x2ACcc60893872A499700908889B38C5420CBcFD1',
        fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN || '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS || '0x908962e8c6CE72610021586f85ebDE09aAc97776',
        usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY || '0x92b2De840bB2171203011A6dBA928d855cA8183E'
      };
    } else {
      // opBNB placeholder addresses (will be deployed later)
      return {
        jobMarketplace: '0x0000000000000000000000000000000000000001',
        nodeRegistry: '0x0000000000000000000000000000000000000002',
        proofSystem: '0x0000000000000000000000000000000000000003',
        fabToken: '0x0000000000000000000000000000000000000007',
        hostEarnings: '0x0000000000000000000000000000000000000004',
        usdcToken: '0x0000000000000000000000000000000000000006',
        modelRegistry: '0x0000000000000000000000000000000000000005'
      };
    }
  };

  // 1. CONNECT WALLET - Multi-wallet support
  const connectWallet = async (type: WalletType) => {
    if (isConnecting) {
      addLog('⏳ Connection already in progress...');
      return;
    }

    try {
      setIsConnecting(true);
      addLog(`🔌 Connecting via ${type}...`);

      let walletSigner: ethers.Signer | null = null;
      let address: string = '';

      if (type === 'metamask') {
        // MetaMask connection
        if (!window.ethereum) {
          throw new Error('MetaMask not found! Please install MetaMask.');
        }

        const accounts = await window.ethereum!.request!({
          method: 'eth_requestAccounts'
        });

        if (accounts.length === 0) {
          throw new Error('No accounts found');
        }

        const provider = new ethers.BrowserProvider(window.ethereum as any);
        walletSigner = await provider.getSigner();
        address = await walletSigner.getAddress();

      } else if (type === 'private-key') {
        // Private key connection (for test accounts)
        const testAccount = TEST_ACCOUNTS[selectedTestAccount as keyof typeof TEST_ACCOUNTS];
        if (!testAccount || !testAccount.privateKey) {
          throw new Error('Invalid test account selected');
        }

        const provider = new ethers.JsonRpcProvider(CHAINS[selectedChain as keyof typeof CHAINS].rpcUrl);
        walletSigner = new ethers.Wallet(testAccount.privateKey, provider);
        address = await walletSigner.getAddress();

        addLog(`✅ Connected with test account: ${testAccount.name} (${address})`);
      }

      if (!walletSigner || !address) {
        throw new Error('Failed to connect wallet');
      }

      setWalletType(type);
      setSigner(walletSigner);
      setWalletAddress(address);
      setWalletConnected(true);

      addLog(`✅ Wallet connected: ${address}`);
      addLog(`🔗 Chain: ${CHAINS[selectedChain as keyof typeof CHAINS].name}`);

      // Initialize SDK with connected wallet
      const sdkInstance = await initializeSDK(walletSigner);
      setSdk(sdkInstance);

      // Check registration status
      if (sdkInstance) {
        await checkRegistrationStatusWithSDK(address, sdkInstance);
      }

    } catch (error: any) {
      addLog(`❌ Wallet connection failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
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
    setIsConnecting(false);
    setWalletType(null);

    // Clear logs but add disconnect message
    setLogs(['Wallet disconnected. Connect a wallet to continue.']);
    addLog('✅ Wallet disconnected');
  };

  // 2. SWITCH CHAIN
  const switchChain = async (chainId: number) => {
    try {
      setChainSwitching(true);
      addLog(`🔄 Switching to ${CHAINS[chainId as keyof typeof CHAINS].name}...`);

      setSelectedChain(chainId);

      // If wallet is connected, reinitialize SDK with new chain
      if (walletConnected && signer) {
        const sdkInstance = await initializeSDK(signer);
        setSdk(sdkInstance);

        // Check registration on new chain
        if (sdkInstance) {
          await checkRegistrationStatusWithSDK(walletAddress, sdkInstance);
        }
      }

      addLog(`✅ Switched to ${CHAINS[chainId as keyof typeof CHAINS].name}`);

    } catch (error: any) {
      addLog(`❌ Chain switch failed: ${error.message}`);
    } finally {
      setChainSwitching(false);
    }
  };

  // 3. INITIALIZE SDK with multi-chain support
  const initializeSDK = async (walletSigner: ethers.Signer) => {
    try {
      addLog('🔧 Initializing SDK...');
      addLog(`📊 Chain: ${CHAINS[selectedChain as keyof typeof CHAINS].name} (${selectedChain})`);

      // Dynamically import SDK to avoid build-time issues
      const { FabstirSDKCore } = await import('@fabstir/sdk-core');

      const contractAddresses = getContractAddresses(selectedChain);
      addLog(`📋 Using contracts for chain ${selectedChain}`);

      const sdkInstance = new FabstirSDKCore({
        mode: 'production',
        chainId: selectedChain,
        rpcUrl: CHAINS[selectedChain as keyof typeof CHAINS].rpcUrl,
        contractAddresses
      });

      // Authenticate with signer
      await sdkInstance.authenticate('signer', { signer: walletSigner });

      setSdk(sdkInstance);
      addLog('✅ SDK initialized');
      return sdkInstance;

    } catch (error: any) {
      addLog(`❌ SDK initialization failed: ${error.message}`);
      return null;
    }
  };

  // 4. CHECK REGISTRATION STATUS with SDK instance
  const checkRegistrationStatusWithSDK = async (address: string, sdkInstance: any) => {
    try {
      addLog(`🔍 Checking registration on ${CHAINS[selectedChain as keyof typeof CHAINS].name}...`);

      const hostManager = sdkInstance.getHostManager();
      const info = await hostManager.getHostInfo(address);

      console.log('Host status:', info);
      addLog(`📊 Registration: ${info.isRegistered ? '✅' : '❌'}, Active: ${info.isActive ? '✅' : '❌'}`);

      // Get staked amount
      let actualStakedAmount = '0';
      if (info.stakedAmount) {
        actualStakedAmount = ethers.formatUnits(info.stakedAmount, 18);
        addLog(`💰 Staked: ${actualStakedAmount} FAB`);
      }

      setIsRegistered(info.isRegistered);

      if (info.isRegistered) {
        addLog('✅ Node registered on this chain!');

        // Update metadata
        if (info.metadata) {
          setMetadata(info.metadata);
        }

        // Check for API URL
        if (info.apiUrl) {
          setDiscoveredApiUrl(info.apiUrl);
          addLog(`📍 API URL: ${info.apiUrl}`);
        } else if (info.metadata) {
          try {
            const meta = typeof info.metadata === 'string' ? JSON.parse(info.metadata) : info.metadata;
            if (meta.apiUrl) {
              setDiscoveredApiUrl(meta.apiUrl);
              addLog(`📍 API URL from metadata: ${meta.apiUrl}`);
            }
          } catch {
            addLog('ℹ️ No API URL in registry');
          }
        }

        setNodeInfo({
          address: address,
          isActive: info.isActive,
          stakedAmount: actualStakedAmount,
          metadata: typeof info.metadata === 'object' ? JSON.stringify(info.metadata, null, 2) : (info.metadata || 'None'),
          supportedModels: info.supportedModels || [],
          chainId: selectedChain
        });

      } else {
        addLog(`ℹ️ Not registered on ${CHAINS[selectedChain as keyof typeof CHAINS].name}`);
        setNodeInfo(null);
        setDiscoveredApiUrl('');
      }

    } catch (error: any) {
      addLog(`❌ Registration check failed: ${error.message}`);

      // Check if it's because contracts aren't deployed
      if (selectedChain === ChainId.OPBNB_TESTNET) {
        addLog('⚠️ opBNB contracts not yet deployed');
      }
    }
  };

  // 5. REGISTER NODE with chain support
  const registerNode = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');

      addLog(`📝 Registering node on ${CHAINS[selectedChain as keyof typeof CHAINS].name}...`);
      addLog(`API URL: ${apiUrl}`);
      addLog(`Metadata: ${metadata}`);
      addLog(`Stake: ${stakeAmount} FAB`);

      // Parse metadata
      let metaObj: any = {};
      try {
        metaObj = JSON.parse(metadata);
      } catch (e) {
        metaObj = {
          name: "Test Node",
          description: "Multi-chain test node",
          models: ["CohereForAI/TinyVicuna-1B-32k-GGUF/tiny-vicuna-1b.q4_k_m.gguf"]
        };
      }

      const hostManager = sdk.getHostManager() as any;

      // Register with models
      const txHash = await hostManager.registerHostWithModels({
        apiUrl: apiUrl,
        supportedModels: [
          {
            repo: "CohereForAI/TinyVicuna-1B-32k-GGUF",
            file: "tiny-vicuna-1b.q4_k_m.gguf"
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
          stakeAmount: stakeAmount.toString(),
          chainId: selectedChain // Include chain in metadata
        }
      });

      addLog(`✅ Node registered! TX: ${txHash}`);
      addLog(`🔗 View on explorer: ${CHAINS[selectedChain as keyof typeof CHAINS].explorer}/tx/${txHash}`);

      // Refresh status
      await checkRegistrationStatusWithSDK(walletAddress, sdk);

    } catch (error: any) {
      addLog(`❌ Registration failed: ${error.message}`);

      if (selectedChain === ChainId.OPBNB_TESTNET) {
        addLog('⚠️ Note: opBNB contracts not yet deployed');
      }
    } finally {
      setLoading(false);
    }
  };

  // 6. CONNECT WEBSOCKET with chain_id
  const connectWebSocket = async () => {
    try {
      if (!discoveredApiUrl) {
        addLog('❌ No API URL discovered');
        return;
      }

      addLog(`🔌 Connecting WebSocket (chain: ${selectedChain})...`);

      const wsUrl = discoveredApiUrl
        .replace('http://', 'ws://')
        .replace('https://', 'wss://') + '/v1/ws';

      addLog(`Connecting to ${wsUrl}...`);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        addLog('✅ WebSocket connected!');
        setWsConnected(true);

        // Send initial session init with chain_id
        ws.send(JSON.stringify({
          type: 'session_init',
          chain_id: selectedChain, // Critical for multi-chain
          session_id: `test_${Date.now()}`,
          user_address: walletAddress
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'connected') {
            addLog(`🎉 ${data.message}`);
          } else if (data.type === 'stream_chunk') {
            if (data.content) {
              setStreamedTokens(prev => prev + data.content);
            }
          } else if (data.type === 'stream_end') {
            addLog('✅ Streaming complete!');
          } else {
            addLog(`📨 Message: ${JSON.stringify(data).slice(0, 100)}...`);
          }
        } catch (e) {
          addLog(`📨 Raw: ${event.data}`);
        }
      };

      const client = {
        ws,
        sendMessage: (msg: any) => {
          // Always include chain_id in messages
          const messageWithChain = { ...msg, chain_id: selectedChain };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(messageWithChain));
          }
        },
        disconnect: () => ws.close()
      };

      setWsClient(client as any);

      ws.onerror = (error) => {
        addLog(`❌ WebSocket error: ${error}`);
        setWsConnected(false);
      };

      ws.onclose = (event) => {
        addLog(`WebSocket closed: ${event.code} ${event.reason}`);
        setWsConnected(false);
        addLog('ℹ️ Host will handle settlement on disconnect');
      };

    } catch (error: any) {
      addLog(`❌ WebSocket failed: ${error.message}`);
      setWsConnected(false);
    }
  };

  // Other methods remain similar but with chain awareness...

  const unregisterNode = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');

      addLog(`📝 Unregistering from ${CHAINS[selectedChain as keyof typeof CHAINS].name}...`);

      const hostManager = sdk.getHostManager();
      const txHash = await hostManager.unregisterHost();

      addLog(`✅ Unregistered! TX: ${txHash}`);

      await checkRegistrationStatusWithSDK(walletAddress, sdk);

    } catch (error: any) {
      addLog(`❌ Unregister failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateMetadata = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');

      addLog('📝 Updating models...');

      const hostManager = sdk.getHostManager() as any;
      const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';

      const txHash = await hostManager.updateSupportedModels([TINY_VICUNA_MODEL_ID]);

      addLog(`✅ Updated! TX: ${txHash}`);

      await checkRegistrationStatusWithSDK(walletAddress, sdk);

    } catch (error: any) {
      addLog(`❌ Update failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const discoverAllNodes = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');

      addLog(`🔍 Discovering nodes on ${CHAINS[selectedChain as keyof typeof CHAINS].name}...`);

      const hostManager = sdk.getHostManager();
      const nodes = await hostManager.discoverAllActiveHosts();

      if (nodes.length > 0) {
        addLog(`✅ Found ${nodes.length} active nodes:`);
        nodes.forEach((node: any) => {
          addLog(`  📍 ${node.nodeAddress.slice(0, 8)}...${node.nodeAddress.slice(-6)}: ${node.apiUrl}`);
        });
        setDiscoveredNodes(nodes);
      } else {
        addLog('ℹ️ No active nodes found');
        setDiscoveredNodes([]);
      }

    } catch (error: any) {
      addLog(`❌ Discovery failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const checkHealth = async () => {
    try {
      if (!discoveredApiUrl) {
        addLog('❌ No API URL discovered');
        return;
      }

      addLog(`🏥 Checking health at ${discoveredApiUrl}...`);

      const healthUrl = `${discoveredApiUrl}/health`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        setHealthStatus(`🟢 Online`);
        addLog(`✅ Node healthy! Chain: ${data.chain_id || 'unknown'}`);
      } else {
        setHealthStatus('🔴 Offline');
        addLog(`❌ Node unhealthy: HTTP ${response.status}`);
      }

    } catch (error: any) {
      setHealthStatus('🔴 Offline');
      addLog(`❌ Health check failed: ${error.message}`);
    }
  };

  const testWebSocketStreaming = async () => {
    try {
      if (!wsClient || !wsConnected) {
        addLog('❌ WebSocket not connected');
        return;
      }

      addLog('🚀 Testing streaming...');
      setStreamedTokens('');

      await wsClient.sendMessage({
        type: 'inference',
        chain_id: selectedChain, // Include chain_id
        request: {
          prompt: 'Hello! Please respond with exactly 5 words.',
          model: 'llama-2-7b',
          stream: true,
          temperature: 0.7,
          max_tokens: 20
        }
      });

      addLog('📤 Sent inference request...');

    } catch (error: any) {
      addLog(`❌ Streaming failed: ${error.message}`);
    }
  };

  const addStake = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');

      addLog(`💰 Adding ${stakeAmount} FAB...`);

      const hostManager = sdk.getHostManager();
      const txHash = await hostManager.addStake(stakeAmount);

      addLog(`✅ Stake added! TX: ${txHash}`);

      await checkRegistrationStatusWithSDK(walletAddress, sdk);

    } catch (error: any) {
      addLog(`❌ Add stake failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const withdrawEarnings = async () => {
    setLoading(true);
    try {
      if (!sdk) throw new Error('SDK not initialized');

      addLog('💸 Withdrawing earnings...');

      const hostManager = sdk.getHostManager();
      const contractAddresses = getContractAddresses(selectedChain);
      const txHash = await hostManager.withdrawEarnings(contractAddresses.usdcToken);

      addLog(`✅ Withdrawn! TX: ${txHash}`);

    } catch (error: any) {
      addLog(`❌ Withdrawal failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const disconnectWebSocket = async () => {
    try {
      if (wsClient) {
        await wsClient.disconnect();
        setWsClient(null);
        setWsConnected(false);
        addLog('✅ WebSocket disconnected');
        addLog('ℹ️ Host will complete session on chain');
      }
    } catch (error: any) {
      addLog(`❌ Disconnect failed: ${error.message}`);
    }
  };

  useEffect(() => {
    addLog('👋 Multi-Chain Node Management Ready!');
    addLog('🔗 Select chain and connect wallet to begin.');
    addLog('⚠️ Note: Base Account Kit temporarily disabled due to build issues');
  }, []);

  // Listen for MetaMask events
  useEffect(() => {
    if (window.ethereum && walletType === 'metamask') {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          addLog('👤 Accounts disconnected');
          disconnectWallet();
        } else if (walletAddress && accounts[0].toLowerCase() !== walletAddress.toLowerCase()) {
          addLog(`👤 Account changed to ${accounts[0]}`);
          disconnectWallet();
          setTimeout(() => connectWallet('metamask'), 500);
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum!.on!('accountsChanged', handleAccountsChanged);
      window.ethereum!.on!('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum!.removeListener) {
          window.ethereum!.removeListener!('accountsChanged', handleAccountsChanged);
          window.ethereum!.removeListener!('chainChanged', handleChainChanged);
        }
      };
    }
  }, [walletAddress, walletType]);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>🚀 Multi-Chain Node Management</h1>
      <p style={{ color: '#666' }}>Multi-chain support with MetaMask and test accounts</p>

      {/* Chain Selector */}
      <div style={{
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#f0f8ff',
        borderRadius: '5px'
      }}>
        <h3>🔗 Select Chain</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {Object.values(CHAINS).map(chain => (
            <button
              key={chain.id}
              onClick={() => switchChain(chain.id)}
              disabled={chainSwitching || chain.id === selectedChain}
              style={{
                padding: '8px 16px',
                backgroundColor: chain.id === selectedChain ? '#007bff' : '#e9ecef',
                color: chain.id === selectedChain ? 'white' : '#495057',
                border: 'none',
                borderRadius: '5px',
                cursor: chain.id === selectedChain ? 'default' : 'pointer',
                fontWeight: chain.id === selectedChain ? 'bold' : 'normal'
              }}
            >
              {chain.name}
              {chain.id === ChainId.OPBNB_TESTNET && ' (Soon)'}
            </button>
          ))}
          <span style={{ marginLeft: '20px', color: '#666' }}>
            Current: <strong>{CHAINS[selectedChain as keyof typeof CHAINS].name}</strong> ({CHAINS[selectedChain as keyof typeof CHAINS].nativeToken})
          </span>
        </div>
      </div>

      {/* Wallet Connection */}
      {!walletConnected ? (
        <div style={{
          padding: '30px',
          border: '2px solid #007bff',
          borderRadius: '10px',
          marginBottom: '20px'
        }}>
          <h2>Connect Wallet</h2>

          {/* Wallet Type Selection */}
          <div style={{ marginBottom: '20px' }}>
            <h3>Select Wallet Type:</h3>

            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              <button
                onClick={() => connectWallet('metamask')}
                disabled={isConnecting}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#f6851b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: isConnecting ? 'not-allowed' : 'pointer'
                }}
              >
                🦊 MetaMask
              </button>
            </div>
          </div>

          {/* Test Account Selection */}
          <div style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#fff3cd',
            borderRadius: '5px'
          }}>
            <h3>🧪 Test Accounts (Private Key):</h3>
            <select
              value={selectedTestAccount}
              onChange={(e) => setSelectedTestAccount(e.target.value)}
              style={{ padding: '8px', marginRight: '10px' }}
            >
              {Object.entries(TEST_ACCOUNTS).map(([key, account]) => (
                <option key={key} value={key}>
                  {account.name} - {account.address?.slice(0, 10)}...
                </option>
              ))}
            </select>
            <button
              onClick={() => connectWallet('private-key')}
              disabled={isConnecting}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: isConnecting ? 'not-allowed' : 'pointer'
              }}
            >
              Connect Test Account
            </button>

            {selectedTestAccount.startsWith('TEST_HOST') && (() => {
              const account = TEST_ACCOUNTS[selectedTestAccount as keyof typeof TEST_ACCOUNTS];
              return 'apiUrl' in account && account.apiUrl ? (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#856404' }}>
                  <strong>API URL:</strong> {account.apiUrl}
                </div>
              ) : null;
            })()}
          </div>

          <div style={{
            marginTop: '20px',
            padding: '10px',
            backgroundColor: '#d1ecf1',
            borderRadius: '5px',
            fontSize: '14px',
            color: '#0c5460'
          }}>
            ℹ️ Base Account Kit integration temporarily disabled due to build compatibility issues
          </div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <strong>Wallet:</strong> {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
                <br />
                <strong>Type:</strong> {walletType}
                <br />
                <strong>Chain:</strong> {CHAINS[selectedChain as keyof typeof CHAINS].name}
                <br />
                <strong>Status:</strong> {isRegistered ? '✅ Registered' : '❌ Not Registered'}
                {discoveredApiUrl && (
                  <>
                    <br />
                    <strong>API URL:</strong> {discoveredApiUrl}
                  </>
                )}
              </div>
              <div>
                <button
                  onClick={() => checkRegistrationStatusWithSDK(walletAddress, sdk!)}
                  disabled={loading || !sdk}
                  style={{
                    padding: '5px 10px',
                    marginRight: '10px',
                    backgroundColor: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: (loading || !sdk) ? 'not-allowed' : 'pointer'
                  }}
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={disconnectWallet}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer'
                  }}
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>

          {/* Registration Section */}
          {!isRegistered && (
            <div style={{
              marginBottom: '20px',
              padding: '15px',
              border: '1px solid #28a745',
              borderRadius: '5px',
              backgroundColor: '#f0fff0'
            }}>
              <h3>📝 Register Node on {CHAINS[selectedChain as keyof typeof CHAINS].name}</h3>

              <div style={{ marginBottom: '10px' }}>
                <label>API URL:</label><br />
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  style={{ padding: '5px', width: '100%' }}
                  placeholder='http://localhost:8080'
                />
                {walletType === 'private-key' && selectedTestAccount.startsWith('TEST_HOST') && (
                  <button
                    onClick={() => {
                      const account = TEST_ACCOUNTS[selectedTestAccount as keyof typeof TEST_ACCOUNTS];
                      if ('apiUrl' in account && account.apiUrl) {
                        setApiUrl(account.apiUrl);
                      }
                    }}
                    style={{ marginTop: '5px', padding: '3px 8px', fontSize: '12px' }}
                  >
                    Use Test Host URL
                  </button>
                )}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>Metadata:</label><br />
                <textarea
                  value={metadata}
                  onChange={(e) => setMetadata(e.target.value)}
                  style={{ width: '100%', height: '80px', fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>Stake (FAB):</label><br />
                <input
                  type="text"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  style={{ padding: '5px', width: '200px' }}
                />
              </div>

              <button
                onClick={registerNode}
                disabled={loading || selectedChain === ChainId.OPBNB_TESTNET}
                style={{
                  padding: '10px 20px',
                  backgroundColor: selectedChain === ChainId.OPBNB_TESTNET ? '#6c757d' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: (loading || selectedChain === ChainId.OPBNB_TESTNET) ? 'not-allowed' : 'pointer'
                }}
                title={selectedChain === ChainId.OPBNB_TESTNET ? 'opBNB contracts not yet deployed' : ''}
              >
                Register Node
                {selectedChain === ChainId.OPBNB_TESTNET && ' (Not Available)'}
              </button>
            </div>
          )}

          {/* Node Management */}
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
                <div>Chain: {CHAINS[(nodeInfo.chainId || selectedChain) as keyof typeof CHAINS].name}</div>
                <div>Active: {nodeInfo.isActive ? '✅' : '❌'}</div>
                <div>Staked: {nodeInfo.stakedAmount} FAB</div>
                <div>Models: {nodeInfo.supportedModels?.length || 0}</div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={updateMetadata} disabled={loading}>Update Models</button>
                <button onClick={addStake} disabled={loading}>Add Stake</button>
                <button onClick={withdrawEarnings} disabled={loading}>Withdraw</button>
                <button
                  onClick={unregisterNode}
                  disabled={loading}
                  style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '3px' }}
                >
                  Unregister
                </button>
              </div>
            </div>
          )}

          {/* Node Testing */}
          {isRegistered && discoveredApiUrl && (
            <div style={{
              marginBottom: '20px',
              padding: '15px',
              border: '1px solid #6c757d',
              borderRadius: '5px'
            }}>
              <h3>🧪 Node Testing</h3>

              <div style={{ marginBottom: '10px' }}>
                <strong>Health:</strong> {healthStatus}
                <br />
                <strong>WebSocket:</strong> {wsConnected ? '✅ Connected' : '❌ Disconnected'}
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={checkHealth} disabled={loading}>Check Health</button>
                <button onClick={connectWebSocket} disabled={loading || wsConnected}>Connect WS</button>
                <button onClick={disconnectWebSocket} disabled={loading || !wsConnected}>Disconnect</button>
                <button onClick={testWebSocketStreaming} disabled={loading || !wsConnected}>Test Stream</button>
              </div>

              {streamedTokens && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px',
                  backgroundColor: '#f0f0f0',
                  borderRadius: '3px'
                }}>
                  <strong>Output:</strong> {streamedTokens}
                </div>
              )}
            </div>
          )}

          {/* Discovery */}
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
              style={{ marginBottom: '10px' }}
            >
              Discover Nodes on {CHAINS[selectedChain as keyof typeof CHAINS].name}
            </button>

            {discoveredNodes.length > 0 && (
              <div>
                <strong>Found {discoveredNodes.length} nodes:</strong>
                {discoveredNodes.map((node, i) => (
                  <div key={i} style={{ padding: '5px', fontSize: '12px' }}>
                    {node.nodeAddress.slice(0, 10)}... - {node.apiUrl}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Logs */}
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
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
        {logs.length > 0 && (
          <button
            onClick={() => setLogs([])}
            style={{ marginTop: '10px', fontSize: '12px' }}
          >
            Clear Logs
          </button>
        )}
      </div>
    </div>
  );
};

export default NodeManagementComponent;