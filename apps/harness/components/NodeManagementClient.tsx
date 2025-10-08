/**
 * Node Management Client Component
 * This component ONLY runs on the client side and loads SDK dynamically
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
  TEST_USER_2: {
    address: process.env.NEXT_PUBLIC_TEST_USER_2_ADDRESS,
    privateKey: process.env.NEXT_PUBLIC_TEST_USER_2_PRIVATE_KEY,
    name: 'Test User 2'
  },
  TEST_HOST_1: {
    address: process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS,
    privateKey: process.env.NEXT_PUBLIC_TEST_HOST_1_PRIVATE_KEY,
    name: 'Test Host 1',
    apiUrl: process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8083'
  },
  TEST_HOST_2: {
    address: process.env.NEXT_PUBLIC_TEST_HOST_2_ADDRESS,
    privateKey: process.env.NEXT_PUBLIC_TEST_HOST_2_PRIVATE_KEY,
    name: 'Test Host 2',
    apiUrl: process.env.NEXT_PUBLIC_TEST_HOST_2_URL || 'http://localhost:8081'
  }
};

type WalletType = 'metamask' | 'private-key';

declare global {
  interface Window {
    ethereum: any;
  }
}

const NodeManagementClient: React.FC = () => {
  // SDK Module state (loaded dynamically)
  const [SDKModule, setSDKModule] = useState<any>(null);
  const [sdkLoading, setSdkLoading] = useState(true);
  const [sdkError, setSdkError] = useState<string>('');

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

  // Form inputs - metadata structure expected by NodeRegistry contract
  // Note: models are passed separately to registerNode(), not in metadata
  const [metadata, setMetadata] = useState(JSON.stringify({
    hardware: {
      gpu: 'NVIDIA RTX 4090',
      vram: 24,  // GB
      ram: 64    // GB
    },
    capabilities: ['streaming', 'batch'],  // Array of supported capabilities
    location: 'us-east-1',  // Datacenter location
    maxConcurrent: 5,       // Max concurrent sessions
    costPerToken: 0.0001    // Price per token in USD
  }, null, 2));
  const [stakeAmount, setStakeAmount] = useState('1000');
  const [additionalStakeAmount, setAdditionalStakeAmount] = useState('100');
  const [apiUrl, setApiUrl] = useState('http://localhost:8083');
  const [supportedModels, setSupportedModels] = useState('CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf'); // Default approved model
  const [minPricePerToken, setMinPricePerToken] = useState('2000');

  // UI state
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string>('⚫ Unknown');
  const [discoveredNodes, setDiscoveredNodes] = useState<any[]>([]);

  // WebSocket state (for LLM streaming)
  const [wsConnected, setWsConnected] = useState(false);
  const [wsClient, setWsClient] = useState<any>(null);
  const [streamedTokens, setStreamedTokens] = useState<string>('');

  // Management server WebSocket state (for log streaming)
  const [mgmtWsClient, setMgmtWsClient] = useState<any>(null);
  const [liveServerLogs, setLiveServerLogs] = useState<string[]>([]);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [logFilter, setLogFilter] = useState<'all' | 'stdout' | 'stderr'>('all');

  // Management API client state (for node lifecycle control)
  const [mgmtApiClient, setMgmtApiClient] = useState<any>(null);
  const [nodeStatus, setNodeStatus] = useState<'running' | 'stopped'>('stopped');
  const [nodePid, setNodePid] = useState<number | null>(null);
  const [nodeUptime, setNodeUptime] = useState<number>(0);
  const [nodePublicUrl, setNodePublicUrl] = useState<string>('');
  const [nodeStartTime, setNodeStartTime] = useState<string>('');
  const [statusPollingActive, setStatusPollingActive] = useState(false);

  // SDK instance
  const [sdk, setSdk] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Load SDK module dynamically on client side only
  useEffect(() => {
    const loadSDK = async () => {
      try {
        setSdkLoading(true);
        // Only load SDK on client side
        if (typeof window !== 'undefined') {
          const module = await import('@fabstir/sdk-core');
          setSDKModule(module);
          addLog('✅ SDK module loaded successfully');
        }
      } catch (error: any) {
        setSdkError(`Failed to load SDK: ${error.message}`);
        addLog(`❌ SDK loading failed: ${error.message}`);
      } finally {
        setSdkLoading(false);
      }
    };

    loadSDK();
  }, []);

  // Connect to management server WebSocket for live log streaming
  useEffect(() => {
    const connectMgmtWebSocket = async () => {
      // Only connect on client side
      if (typeof window === 'undefined') return;

      try {
        const { HostWsClient } = await import('../lib/hostWsClient');
        const wsUrl = 'ws://localhost:3001/ws/logs';
        const client = new HostWsClient(wsUrl);

        // Setup callbacks before connecting
        client.onLog((log: any) => {
          const formattedLog = `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.level}] ${log.message}`;
          setLiveServerLogs(prev => [...prev, formattedLog]);
        });

        client.onHistory((logs: string[]) => {
          setLiveServerLogs(prev => [...prev, ...logs]);
        });

        // Connect to WebSocket
        await client.connect();
        setMgmtWsClient(client);
        addLog('✅ Connected to management server logs');
      } catch (error: any) {
        console.error('Failed to connect to management server WebSocket:', error);
        addLog(`⚠️  Could not connect to management server logs: ${error.message}`);
      }
    };

    connectMgmtWebSocket();

    // Cleanup on unmount
    return () => {
      if (mgmtWsClient) {
        mgmtWsClient.disconnect();
      }
    };
  }, []);

  // Auto-scroll logs when new log arrives
  useEffect(() => {
    if (autoScrollLogs) {
      const logContainer = document.getElementById('live-logs-container');
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    }
  }, [liveServerLogs, autoScrollLogs]);

  // Initialize Management API Client for node lifecycle control
  useEffect(() => {
    const initMgmtApiClient = async () => {
      if (typeof window === 'undefined') return;

      try {
        const { HostApiClient } = await import('../lib/hostApiClient');
        const client = new HostApiClient({ baseUrl: 'http://localhost:3001' });
        setMgmtApiClient(client);
        addLog('✅ Management API client initialized');

        // Refresh status immediately after initialization
        refreshNodeStatus(client);
      } catch (error: any) {
        console.error('Failed to initialize management API client:', error);
        addLog(`⚠️  Could not initialize management API: ${error.message}`);
      }
    };

    initMgmtApiClient();
  }, []);

  // Status polling every 10 seconds when node is running
  useEffect(() => {
    if (!mgmtApiClient || !statusPollingActive) return;

    const interval = setInterval(() => {
      refreshNodeStatus(mgmtApiClient);
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [mgmtApiClient, statusPollingActive]);

  // Helper: Add log message
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev, logMessage]);
  };

  // Helper: Clear live server logs
  const clearLiveServerLogs = () => {
    setLiveServerLogs([]);
  };

  // Helper: Filter logs by level
  const getFilteredLogs = () => {
    if (logFilter === 'all') return liveServerLogs;
    return liveServerLogs.filter(log => log.includes(`[${logFilter}]`));
  };

  // Helper: Format uptime seconds to human-readable string
  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m ${secs}s`;
  };

  // Node Control: Refresh node status from management API
  const refreshNodeStatus = async (client?: any) => {
    const apiClient = client || mgmtApiClient;
    if (!apiClient) return;

    try {
      const status = await apiClient.getStatus();

      if (status.status === 'running') {
        setNodeStatus('running');
        setNodePid(status.pid || null);
        setNodePublicUrl(status.publicUrl || '');
        setNodeStartTime(status.startTime || '');
        setNodeUptime(status.uptime || 0);
        setStatusPollingActive(true);
      } else {
        setNodeStatus('stopped');
        setNodePid(null);
        setNodePublicUrl('');
        setNodeStartTime('');
        setNodeUptime(0);
        setStatusPollingActive(false);
      }
    } catch (error: any) {
      console.error('Failed to refresh node status:', error);
      // Don't spam logs with polling errors
    }
  };

  // Node Control: Start node in daemon mode
  const handleStartNode = async () => {
    if (!mgmtApiClient) {
      addLog('❌ Management API client not initialized');
      return;
    }

    setLoading(true);
    try {
      addLog('🚀 Starting node via management API...');
      const result = await mgmtApiClient.start(true); // daemon mode

      setNodePid(result.pid);
      setNodePublicUrl(result.publicUrl || '');

      addLog(`✅ Node started (PID: ${result.pid})`);

      // Refresh status after starting
      await refreshNodeStatus();
    } catch (error: any) {
      addLog(`❌ Start failed: ${error.message}`);
      console.error('Start node error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Node Control: Stop running node
  const handleStopNode = async () => {
    if (!mgmtApiClient) {
      addLog('❌ Management API client not initialized');
      return;
    }

    setLoading(true);
    try {
      addLog('⏸️  Stopping node via management API...');
      await mgmtApiClient.stop(false); // graceful stop

      setNodePid(null);
      setNodePublicUrl('');
      setNodeUptime(0);
      setStatusPollingActive(false);

      addLog('✅ Node stopped');

      // Refresh status after stopping
      await refreshNodeStatus();
    } catch (error: any) {
      addLog(`❌ Stop failed: ${error.message}`);
      console.error('Stop node error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get chain-specific contract addresses
  const getContractAddresses = (chainId: number) => {
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

  // Connect Wallet
  const connectWallet = async (type: WalletType) => {
    if (isConnecting || !SDKModule) {
      addLog('⏳ SDK not ready or connection in progress...');
      return;
    }

    try {
      setIsConnecting(true);
      addLog(`🔌 Connecting via ${type}...`);

      let walletSigner: ethers.Signer | null = null;
      let address: string = '';

      if (type === 'metamask') {
        if (!window.ethereum) {
          throw new Error('MetaMask not found! Please install MetaMask.');
        }

        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });

        if (accounts.length === 0) {
          throw new Error('No accounts found');
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        walletSigner = await provider.getSigner();
        address = await walletSigner.getAddress();

      } else if (type === 'private-key') {
        const testAccount = TEST_ACCOUNTS[selectedTestAccount as keyof typeof TEST_ACCOUNTS];
        if (!testAccount || !testAccount.privateKey) {
          throw new Error('Invalid test account selected');
        }

        const provider = new ethers.JsonRpcProvider(CHAINS[selectedChain].rpcUrl);
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
      addLog(`🔗 Chain: ${CHAINS[selectedChain].name}`);

      // Initialize SDK with connected wallet
      const sdkInstance = await initializeSDK(walletSigner);
      if (sdkInstance) {
        // Check registration status with the correct address and signer
        await checkRegistrationStatus(sdkInstance, address, walletSigner);
      }

    } catch (error: any) {
      addLog(`❌ Wallet connection failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Initialize SDK
  const initializeSDK = async (walletSigner: ethers.Signer) => {
    try {
      if (!SDKModule) {
        addLog('❌ SDK module not loaded');
        return;
      }

      addLog('🔧 Initializing SDK...');
      addLog(`📊 Chain: ${CHAINS[selectedChain].name} (${selectedChain})`);

      const { FabstirSDKCore } = SDKModule;
      const contractAddresses = getContractAddresses(selectedChain);

      const sdkInstance = new FabstirSDKCore({
        mode: 'production',
        chainId: selectedChain,
        rpcUrl: CHAINS[selectedChain].rpcUrl,
        contractAddresses
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

  // Check Registration Status
  const checkRegistrationStatus = async (sdkInstance?: any, addressToCheck?: string, signerToUse?: ethers.Signer) => {
    const targetSdk = sdkInstance || sdk;
    if (!targetSdk) {
      addLog('❌ SDK not initialized');
      return;
    }

    const checkAddress = addressToCheck || walletAddress;
    if (!checkAddress) {
      addLog('❌ No wallet address to check');
      return;
    }

    // Use provided signer, fall back to state signer
    const currentSigner = signerToUse || signer;

    try {
      addLog(`🔍 Checking registration for ${checkAddress.slice(0, 10)}... on ${CHAINS[selectedChain].name}...`);

      const hostManager = targetSdk.getHostManager();
      const info = await hostManager.getHostInfo(checkAddress);

      console.log('Host status for', checkAddress, ':', info);
      addLog(`📊 Registration: ${info.isRegistered ? '✅' : '❌'}, Active: ${info.isActive ? '✅' : '❌'}`);

      // Update supported models from blockchain if available (only when registered)
      if (info.isRegistered && info.supportedModels && info.supportedModels.length > 0) {
        // Note: Blockchain returns model IDs (hashes), not repo:file format
        // Don't overwrite the input field with hashes
        addLog(`📚 Loaded ${info.supportedModels.length} supported model(s) from blockchain`);
      } else if (!info.isRegistered) {
        // Reset to default repo:file format when not registered
        setSupportedModels('CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf');
      }

      // Get staked amount from SDK (no direct contract calls)
      let stakedAmountDisplay = '0';

      if (info.isRegistered) {
        // Use stake from SDK HostInfo
        if (info.stake !== undefined && info.stake !== null && info.stake !== 0n) {
          try {
            const stakeAmount = typeof info.stake === 'bigint'
              ? info.stake
              : BigInt(info.stake.toString());
            stakedAmountDisplay = ethers.formatUnits(stakeAmount.toString(), 18);
            console.log('Staked amount in FAB (from SDK):', stakedAmountDisplay);
          } catch (e) {
            console.error('Error formatting staked amount:', e);
          }
        }

        // Load metadata from SDK HostInfo
        if (info.metadata) {
          try {
            setMetadata(JSON.stringify(info.metadata, null, 2));
            addLog('📝 Loaded node metadata from SDK');
          } catch (e) {
            console.error('Failed to format node metadata:', e);
          }
        }

        addLog(`💰 Staked: ${stakedAmountDisplay} FAB`);
      }

      setIsRegistered(info.isRegistered);

      if (info.isRegistered) {
        addLog('✅ Node registered on this chain!');

        if (info.apiUrl) {
          setDiscoveredApiUrl(info.apiUrl);
          addLog(`📍 API URL: ${info.apiUrl}`);
        }

        // Include formatted stake amount in node info
        setNodeInfo({
          ...info,
          stakedAmount: info.stakedAmount,
          stakedAmountFormatted: stakedAmountDisplay
        });
      } else {
        addLog(`ℹ️ Not registered on ${CHAINS[selectedChain].name}`);
        setNodeInfo(null);
        setDiscoveredApiUrl('');
      }

    } catch (error: any) {
      addLog(`❌ Registration check failed: ${error.message}`);
      if (selectedChain === ChainId.OPBNB_TESTNET) {
        addLog('⚠️ opBNB contracts not yet deployed');
      }
      setIsRegistered(false);
      setNodeInfo(null);
    }
  };

  // Disconnect Wallet
  const disconnectWallet = () => {
    addLog('🔌 Disconnecting wallet...');
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
    setWalletType(null);
    setLogs(['Wallet disconnected. Connect a wallet to continue.']);
  };

  // Switch Chain
  const switchChain = async (chainId: number) => {
    try {
      setChainSwitching(true);
      addLog(`🔄 Switching to ${CHAINS[chainId].name}...`);

      // Store the old chain temporarily
      const oldChain = selectedChain;

      // Update the selected chain first
      setSelectedChain(chainId);

      // Reset registration state while checking
      setIsRegistered(false);
      setNodeInfo(null);
      setDiscoveredApiUrl('');

      if (walletConnected && signer && walletAddress) {
        // Need to wait for state update
        setTimeout(async () => {
          const sdkInstance = await initializeSDKForChain(signer, chainId);
          if (sdkInstance) {
            await checkRegistrationStatus(sdkInstance, walletAddress, signer);
          }
          setChainSwitching(false);
        }, 100);
      } else {
        setChainSwitching(false);
      }

      addLog(`✅ Switched to ${CHAINS[chainId].name}`);
    } catch (error: any) {
      addLog(`❌ Chain switch failed: ${error.message}`);
      setChainSwitching(false);
    }
  };

  // Initialize SDK for specific chain
  const initializeSDKForChain = async (walletSigner: ethers.Signer, chainId: number) => {
    try {
      if (!SDKModule) {
        addLog('❌ SDK module not loaded');
        return null;
      }

      addLog('🔧 Initializing SDK...');
      addLog(`📊 Chain: ${CHAINS[chainId].name} (${chainId})`);

      const { FabstirSDKCore } = SDKModule;
      const contractAddresses = getContractAddresses(chainId);

      const sdkInstance = new FabstirSDKCore({
        mode: 'production',
        chainId: chainId,
        rpcUrl: CHAINS[chainId].rpcUrl,
        contractAddresses
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

  // Price calculation helper for UI display
  const calculatePriceDisplay = (price: string) => {
    const p = parseInt(price) || 0;
    return {
      perToken: (p / 1000000).toFixed(6),
      per1000: ((p * 1000) / 1000000).toFixed(3),
      per10000: ((p * 10000) / 1000000).toFixed(2)
    };
  };

  // Register Node
  const registerNode = async () => {
    if (!mgmtApiClient) {
      addLog('❌ Management API client not initialized');
      return;
    }

    if (!walletAddress) {
      addLog('❌ No wallet address available');
      return;
    }

    // Get private key from selected test account (only for private key wallet type)
    let privateKey: string | undefined;
    if (walletType === 'private-key') {
      const testAccount = TEST_ACCOUNTS[selectedTestAccount as keyof typeof TEST_ACCOUNTS];
      if (!testAccount || !testAccount.privateKey) {
        addLog('❌ No private key available for selected account');
        return;
      }
      privateKey = testAccount.privateKey;
    } else {
      addLog('❌ Registration via Management API only supports private key wallet type');
      return;
    }

    setLoading(true);
    try {
      addLog(`📝 Registering node on ${CHAINS[selectedChain].name} via Management API...`);

      // Parse supported models from input (format: repo:file)
      const trimmedModel = supportedModels.trim();

      // Check if user entered a hex hash (not supported during registration)
      if (trimmedModel.startsWith('0x')) {
        addLog('❌ Model IDs (0x...hashes) cannot be used during registration');
        addLog('   Use repo:file format (e.g., CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf)');
        addLog('   You can update to use model IDs after registering via "Update Models"');
        setLoading(false);
        return;
      }

      const modelParts = trimmedModel.split(':');
      if (modelParts.length !== 2) {
        addLog('❌ Invalid model format. Use: repo:file');
        addLog('   Example: CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf');
        setLoading(false);
        return;
      }

      const [repo, file] = modelParts;
      const modelString = `${repo}:${file}`;
      addLog(`📚 Model: ${modelString}`);

      // Call management API /api/register endpoint
      // This will create the config file AND register on blockchain
      const result = await mgmtApiClient.register({
        walletAddress: walletAddress,
        publicUrl: apiUrl,
        models: [modelString],
        stakeAmount: stakeAmount,
        metadata: JSON.parse(metadata),
        privateKey: privateKey,
        minPricePerToken: minPricePerToken
      });

      addLog(`✅ Node registered! TX: ${result.transactionHash}`);
      addLog(`📝 Config file created for address: ${result.hostAddress}`);
      addLog(`💵 Pricing: ${minPricePerToken} (${calculatePriceDisplay(minPricePerToken).perToken} USDC/token)`);
      await checkRegistrationStatus();

    } catch (error: any) {
      addLog(`❌ Registration failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Unregister Node
  const unregisterNode = async () => {
    if (!sdk) {
      addLog('❌ SDK not initialized');
      return;
    }

    if (!mgmtApiClient) {
      addLog('❌ Management API client not initialized');
      return;
    }

    setLoading(true);
    try {
      addLog(`📝 Unregistering from ${CHAINS[selectedChain].name}...`);

      const hostManager = sdk.getHostManager();
      const txHash = await hostManager.unregisterHost();

      addLog(`✅ Unregistered! TX: ${txHash}`);

      // Automatically stop the node if it's running
      if (nodeStatus === 'running') {
        addLog('⏸️  Stopping node automatically...');
        try {
          await mgmtApiClient.stop(false); // graceful stop

          setNodePid(null);
          setNodePublicUrl('');
          setNodeUptime(0);
          setStatusPollingActive(false);

          addLog('✅ Node stopped');

          // Refresh status after stopping
          await refreshNodeStatus();
        } catch (stopError: any) {
          addLog(`⚠️  Failed to stop node: ${stopError.message}`);
          addLog('   You may need to stop it manually using "Stop Node" button');
        }
      }

      await checkRegistrationStatus();

    } catch (error: any) {
      addLog(`❌ Unregister failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Add Stake
  const addStake = async () => {
    if (!sdk) {
      addLog('❌ SDK not initialized');
      return;
    }

    if (!additionalStakeAmount || parseFloat(additionalStakeAmount) <= 0) {
      addLog('❌ Please enter a valid stake amount');
      return;
    }

    setLoading(true);
    try {
      addLog(`💰 Adding ${additionalStakeAmount} FAB to stake...`);
      addLog(`📊 Current chain: ${CHAINS[selectedChain].name}`);

      const hostManager = sdk.getHostManager();

      if (!hostManager) {
        addLog('❌ Host manager not available');
        setLoading(false);
        return;
      }

      addLog(`📝 Calling hostManager.addStake() with amount: ${additionalStakeAmount} FAB`);

      // Debug: Check what we're sending
      console.log('Sending to addStake:', additionalStakeAmount, typeof additionalStakeAmount);

      // Call addStake function from the SDK - it expects amount as a string in FAB units
      const txHash = await hostManager.addStake(additionalStakeAmount);

      addLog(`✅ Transaction submitted: ${txHash}`);
      addLog(`🔗 View on explorer: ${CHAINS[selectedChain].explorer}/tx/${txHash}`);

      // Wait for transaction confirmation
      addLog('⏳ Waiting for blockchain confirmation...');

      // Refresh status after a delay to allow blockchain to update
      setTimeout(async () => {
        addLog('🔄 Refreshing node status...');
        await checkRegistrationStatus();
        setAdditionalStakeAmount(''); // Clear the input
        addLog(`✅ Stake added successfully! New balance should be reflected.`);
      }, 5000);

    } catch (error: any) {
      addLog(`❌ Add stake failed: ${error.message || error}`);
      console.error('Add stake error - full details:', error);

      // Log more details about the error
      if (error.code) {
        addLog(`Error code: ${error.code}`);
      }
      if (error.data) {
        addLog(`Error data: ${JSON.stringify(error.data)}`);
      }
      if (error.reason) {
        addLog(`Error reason: ${error.reason}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Withdraw Earnings
  const withdrawEarnings = async () => {
    if (!sdk) {
      addLog('❌ SDK not initialized');
      return;
    }

    setLoading(true);
    try {
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

  // Update Models
  const updateModels = async () => {
    if (!sdk) {
      addLog('❌ SDK not initialized');
      return;
    }

    setLoading(true);
    try {
      addLog('📝 Updating supported models...');

      // Parse and hash model inputs (supports both repo:file and 0x... formats)
      const modelIds = supportedModels.split(',').map(input => {
        const trimmed = input.trim();

        if (!trimmed) return null;

        // If already a hex hash, use as-is
        if (trimmed.startsWith('0x')) {
          addLog(`  • Using hash: ${trimmed.substring(0, 10)}...`);
          return trimmed;
        }

        // Otherwise, treat as repo:file format and hash it
        if (trimmed.includes(':')) {
          const [repo, file] = trimmed.split(':');
          const modelString = `${repo}/${file}`;
          const hash = ethers.keccak256(ethers.toUtf8Bytes(modelString));
          addLog(`  • ${trimmed} → ${hash.substring(0, 10)}...`);
          return hash;
        }

        throw new Error(`Invalid model format: "${trimmed}". Use repo:file or 0x...hash`);
      }).filter((id): id is string => id !== null);

      if (modelIds.length === 0) {
        addLog('❌ No models provided');
        setLoading(false);
        return;
      }

      addLog(`📋 Updating ${modelIds.length} model(s)...`);
      const hostManager = sdk.getHostManager() as any;
      const txHash = await hostManager.updateSupportedModels(modelIds);

      addLog(`✅ Models updated! TX: ${txHash}`);
      await checkRegistrationStatus();

    } catch (error: any) {
      addLog(`❌ Update failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update Metadata
  const updateMetadata = async () => {
    if (!sdk) {
      addLog('❌ SDK not initialized');
      return;
    }

    setLoading(true);
    try {
      addLog('📝 Updating node metadata...');

      // Validate JSON
      let parsedMetadata;
      try {
        parsedMetadata = JSON.parse(metadata);
      } catch (e) {
        addLog('❌ Invalid JSON in metadata field');
        setLoading(false);
        return;
      }

      const hostManager = sdk.getHostManager() as any;
      // updateMetadata only takes the metadata JSON, not the API URL
      const txHash = await hostManager.updateMetadata(JSON.stringify(parsedMetadata));

      addLog(`✅ Metadata updated! TX: ${txHash}`);
      await checkRegistrationStatus();

    } catch (error: any) {
      addLog(`❌ Metadata update failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Discover All Nodes
  const discoverAllNodes = async () => {
    if (!sdk) {
      addLog('❌ SDK not initialized');
      return;
    }

    setLoading(true);
    try {
      addLog(`🔍 Discovering nodes on ${CHAINS[selectedChain].name}...`);

      const hostManager = sdk.getHostManager();
      const nodes = await hostManager.discoverAllActiveHosts();

      if (nodes.length > 0) {
        addLog(`✅ Found ${nodes.length} active nodes:`);
        nodes.forEach(node => {
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

  // Check Health
  const checkHealth = async () => {
    if (!discoveredApiUrl) {
      addLog('❌ No API URL discovered');
      return;
    }

    try {
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

  // Connect WebSocket
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
          chain_id: selectedChain,
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

  // Disconnect WebSocket
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

  // Test WebSocket Streaming
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
        chain_id: selectedChain,
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

  // Initial setup message
  useEffect(() => {
    addLog('👋 Multi-Chain Node Management Ready!');
    addLog('🔗 Loading SDK module...');
  }, []);

  // Show loading state while SDK loads
  if (sdkLoading) {
    return (
      <div style={{ padding: '20px', fontFamily: 'monospace' }}>
        <h2>Loading Node Management...</h2>
        <p>Initializing SDK module...</p>
      </div>
    );
  }

  // Show error if SDK failed to load
  if (sdkError) {
    return (
      <div style={{ padding: '20px', fontFamily: 'monospace' }}>
        <h2>❌ Failed to Load</h2>
        <p>{sdkError}</p>
        <button onClick={() => window.location.reload()}>Reload Page</button>
      </div>
    );
  }

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
            Current: <strong>{CHAINS[selectedChain].name}</strong> ({CHAINS[selectedChain].nativeToken})
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

          <div style={{ marginBottom: '20px' }}>
            <h3>Select Wallet Type:</h3>
            <button
              onClick={() => connectWallet('metamask')}
              disabled={isConnecting || !SDKModule}
              style={{
                padding: '12px 24px',
                backgroundColor: '#f6851b',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: (isConnecting || !SDKModule) ? 'not-allowed' : 'pointer',
                marginRight: '10px'
              }}
            >
              🦊 MetaMask
            </button>
          </div>

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
              disabled={isConnecting || !SDKModule}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: (isConnecting || !SDKModule) ? 'not-allowed' : 'pointer'
              }}
            >
              Connect Test Account
            </button>
          </div>
        </div>
      ) : (
        <>
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
                <strong>Chain:</strong> {CHAINS[selectedChain].name}
                <br />
                <strong>Status:</strong> {isRegistered ? '✅ Registered' : '❌ Not Registered'}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => checkRegistrationStatus()}
                  disabled={loading || !sdk}
                  style={{
                    padding: '5px 10px',
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

          {!isRegistered && (
            <div style={{
              marginBottom: '20px',
              padding: '15px',
              border: '1px solid #28a745',
              borderRadius: '5px',
              backgroundColor: '#f0fff0'
            }}>
              <h3>📝 Register Node</h3>
              <div style={{ marginBottom: '10px' }}>
                <label>API URL:</label><br />
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  style={{ padding: '5px', width: '100%' }}
                  placeholder='http://localhost:8083'
                />
                {walletType === 'private-key' && selectedTestAccount.startsWith('TEST_HOST') && (
                  <button
                    onClick={() => setApiUrl(TEST_ACCOUNTS[selectedTestAccount as keyof typeof TEST_ACCOUNTS].apiUrl!)}
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
                <label>Supported Models (format: repo:file):</label><br />
                <input
                  type="text"
                  value={supportedModels}
                  onChange={(e) => setSupportedModels(e.target.value)}
                  style={{ padding: '5px', width: '100%', fontFamily: 'monospace', fontSize: '12px' }}
                  placeholder="CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"
                />
                <small style={{ color: '#666', display: 'block' }}>
                  Format: repo:file (e.g., CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf)
                  <br />
                  <strong>Note:</strong> Registration only accepts repo:file format. Use "Update Models" later to add models by hash.
                </small>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>Stake Amount (FAB):</label><br />
                <input
                  type="text"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  style={{ padding: '5px', width: '200px' }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>Minimum Price Per Token:</label><br />
                <input
                  type="number"
                  value={minPricePerToken}
                  onChange={(e) => setMinPricePerToken(e.target.value)}
                  min="100"
                  max="100000"
                  step="100"
                  style={{ padding: '5px', width: '200px' }}
                />
                <div style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
                  <div>💵 ${calculatePriceDisplay(minPricePerToken).perToken} USDC per token</div>
                  <div>💵 ${calculatePriceDisplay(minPricePerToken).per1000} USDC per 1,000 tokens</div>
                  <div>💵 ${calculatePriceDisplay(minPricePerToken).per10000} USDC per 10,000 tokens</div>
                </div>
                <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>
                  Range: 100-100,000 (0.0001-0.1 USDC per token)
                </small>
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
              >
                Register Node
                {selectedChain === ChainId.OPBNB_TESTNET && ' (Not Available)'}
              </button>
            </div>
          )}

          {/* Node Management - for registered nodes */}
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
                <div>Chain: {CHAINS[selectedChain].name}</div>
                <div>Active: {nodeInfo.isActive ? '✅' : '❌'}</div>
                <div>Staked: {nodeInfo.stakedAmountFormatted || '0'} FAB</div>
                <div>API URL: {nodeInfo.apiUrl || discoveredApiUrl || 'Not set'}</div>
              </div>

              {/* Metadata Editor */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '14px', marginBottom: '5px', display: 'block' }}>
                  Node Metadata (JSON):
                </label>
                <textarea
                  value={metadata}
                  onChange={(e) => setMetadata(e.target.value)}
                  style={{
                    width: '100%',
                    height: '120px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '3px'
                  }}
                  disabled={loading}
                />
                <small style={{ color: '#666', fontSize: '12px' }}>
                  Update your node's metadata including hardware specs and capabilities
                </small>
              </div>

              {/* Supported Models */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '14px', marginBottom: '5px', display: 'block' }}>
                  Supported Models (comma-separated):
                </label>
                <input
                  type="text"
                  value={supportedModels}
                  onChange={(e) => setSupportedModels(e.target.value)}
                  placeholder="repo:file or 0x...hash"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'monospace'
                  }}
                  disabled={loading}
                />
                <small style={{ color: '#666', fontSize: '12px', display: 'block', marginTop: '5px' }}>
                  Enter model strings (repo:file) or hex hashes. Examples:
                  <br />
                  • CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
                  <br />
                  • 0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced
                </small>
              </div>

              {/* Additional Stake Input */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '14px', marginBottom: '5px', display: 'block' }}>
                  Additional Stake Amount (FAB):
                </label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={additionalStakeAmount}
                    onChange={(e) => setAdditionalStakeAmount(e.target.value)}
                    placeholder="0"
                    style={{
                      padding: '8px',
                      width: '150px',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      fontSize: '14px'
                    }}
                    disabled={loading}
                  />
                  <button
                    onClick={addStake}
                    disabled={loading || !additionalStakeAmount || parseFloat(additionalStakeAmount) <= 0}
                    style={{
                      padding: '8px 15px',
                      backgroundColor: (loading || !additionalStakeAmount || parseFloat(additionalStakeAmount) <= 0) ? '#ccc' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: (loading || !additionalStakeAmount || parseFloat(additionalStakeAmount) <= 0) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Add Stake
                  </button>
                </div>
                <small style={{ color: '#666', fontSize: '12px' }}>
                  Enter amount of FAB tokens to add to your current stake
                </small>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <button onClick={updateModels} disabled={loading}>Update Models</button>
                <button onClick={withdrawEarnings} disabled={loading}>Withdraw Earnings</button>
                <button onClick={updateMetadata} disabled={loading}>Update Metadata</button>
                <button onClick={() => checkRegistrationStatus()} disabled={loading}>Refresh Status</button>
              </div>

              <div style={{ marginTop: '10px' }}>
                <button
                  onClick={unregisterNode}
                  disabled={loading}
                  style={{
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    padding: '8px 15px',
                    borderRadius: '3px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  Unregister Node
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
                <button onClick={disconnectWebSocket} disabled={loading || !wsConnected}>Disconnect WS</button>
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

          {/* Network Discovery */}
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
              Discover Nodes on {CHAINS[selectedChain].name}
            </button>

            {discoveredNodes.length > 0 && (
              <div>
                <strong>Found {discoveredNodes.length} nodes:</strong>
                {discoveredNodes.map((node, i) => (
                  <div key={i} style={{ padding: '5px', fontSize: '12px' }}>
                    {node.nodeAddress.slice(0, 10)}... - {node.apiUrl || 'No API URL'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Node Control Panel */}
      <div style={{
        marginBottom: '20px',
        padding: '15px',
        border: '1px solid #28a745',
        borderRadius: '5px',
        backgroundColor: '#e7f9f0'
      }}>
        <h3>🎮 Node Control {mgmtApiClient ? '(API Ready)' : '(Initializing...)'}</h3>

        <div style={{
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: '#ffffff',
          borderRadius: '3px',
          border: '1px solid #ddd'
        }}>
          <div style={{ marginBottom: '5px' }}>
            <strong>Status:</strong>{' '}
            <span style={{
              color: nodeStatus === 'running' ? '#28a745' : '#6c757d',
              fontSize: '20px',
              verticalAlign: 'middle'
            }}>
              ●
            </span>{' '}
            {nodeStatus === 'running' ? 'Running' : 'Stopped'}
          </div>

          {nodeStatus === 'running' && (
            <>
              <div style={{ marginBottom: '5px' }}>
                <strong>PID:</strong> {nodePid || 'N/A'}
              </div>
              <div style={{ marginBottom: '5px' }}>
                <strong>Uptime:</strong> {formatUptime(nodeUptime)}
              </div>
              <div style={{ marginBottom: '5px' }}>
                <strong>URL:</strong> {nodePublicUrl || 'N/A'}
              </div>
            </>
          )}

          {nodeStatus === 'stopped' && (
            <div style={{ color: '#6c757d', fontSize: '14px', marginTop: '5px' }}>
              Node is not running. Click "Start Node" to begin.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleStartNode}
            disabled={loading || !mgmtApiClient || nodeStatus === 'running'}
            style={{
              padding: '10px 20px',
              backgroundColor: nodeStatus === 'running' ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: (loading || !mgmtApiClient || nodeStatus === 'running') ? 'not-allowed' : 'pointer',
              opacity: (loading || !mgmtApiClient || nodeStatus === 'running') ? 0.6 : 1
            }}
          >
            {loading ? '⏳ Starting...' : '▶️ Start Node'}
          </button>

          <button
            onClick={handleStopNode}
            disabled={loading || !mgmtApiClient || nodeStatus === 'stopped'}
            style={{
              padding: '10px 20px',
              backgroundColor: nodeStatus === 'stopped' ? '#6c757d' : '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: (loading || !mgmtApiClient || nodeStatus === 'stopped') ? 'not-allowed' : 'pointer',
              opacity: (loading || !mgmtApiClient || nodeStatus === 'stopped') ? 0.6 : 1
            }}
          >
            {loading ? '⏳ Stopping...' : '⏹️ Stop Node'}
          </button>

          <button
            onClick={() => refreshNodeStatus()}
            disabled={loading || !mgmtApiClient}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: (loading || !mgmtApiClient) ? 'not-allowed' : 'pointer',
              opacity: (loading || !mgmtApiClient) ? 0.6 : 1
            }}
          >
            🔄 Refresh Status
          </button>
        </div>

        <div style={{ marginTop: '10px', fontSize: '12px', color: '#6c757d' }}>
          {statusPollingActive && nodeStatus === 'running' && (
            <div>⏱️ Auto-refreshing status every 10 seconds</div>
          )}
          {!mgmtApiClient && (
            <div>⚠️ Waiting for management API connection...</div>
          )}
        </div>
      </div>

      {/* Live Server Logs */}
      <div style={{
        marginBottom: '20px',
        padding: '15px',
        border: '1px solid #17a2b8',
        borderRadius: '5px',
        backgroundColor: '#e7f9fc'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3>🔴 Live Server Logs {mgmtWsClient ? '(Connected)' : '(Disconnected)'}</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={autoScrollLogs}
                onChange={(e) => setAutoScrollLogs(e.target.checked)}
              />
              {' '}Auto-scroll
            </label>
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value as 'all' | 'stdout' | 'stderr')}
              style={{ padding: '5px', fontSize: '12px' }}
            >
              <option value="all">All Logs</option>
              <option value="stdout">stdout only</option>
              <option value="stderr">stderr only</option>
            </select>
            <button
              onClick={clearLiveServerLogs}
              style={{ padding: '5px 10px', fontSize: '12px' }}
            >
              Clear
            </button>
          </div>
        </div>
        <div
          id="live-logs-container"
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            fontSize: '12px',
            fontFamily: 'monospace',
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            padding: '10px',
            borderRadius: '3px'
          }}
        >
          {getFilteredLogs().length === 0 ? (
            <div style={{ color: '#888' }}>
              {mgmtWsClient
                ? 'Waiting for server logs...'
                : 'Disconnected from management server. Start the server with: fabstir-host serve'}
            </div>
          ) : (
            getFilteredLogs().map((log, i) => (
              <div
                key={i}
                style={{
                  marginBottom: '2px',
                  color: log.includes('[stderr]') ? '#f48771' : '#d4d4d4'
                }}
              >
                {log}
              </div>
            ))
          )}
        </div>
      </div>

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
      </div>
    </div>
  );
};

export default NodeManagementClient;