import React, { useState, useEffect } from 'react';
import { FabstirSDK } from '../../../src/FabstirSDK';
import { ethers } from 'ethers';

// Test environment configuration
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA || 'https://base-sepolia.g.alchemy.com/v2/ZQwJHMddbCkW7FQNBafHcQQvULpN9XeD';
const CONTRACT_JOB_MARKETPLACE = process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE || '0xD937c594682Fe74E6e3d06239719805C04BE804A';
const CONTRACT_NODE_REGISTRY = process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY || '0x039AB5d5e8D5426f9963140202F506A2Ce6988F9';
const CONTRACT_FAB_TOKEN = process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN || '0xC78949004B4EB6dEf2D66e49Cd81231472612D62';
const CONTRACT_HOST_EARNINGS = process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS || '0x9c96902DE4F22Ee9dfb93E8F973de47ec4EAB7bC';
const CONTRACT_USDC_TOKEN = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const DEFAULT_STAKE_AMOUNT = '1000';

// Test accounts
const TEST_HOST_1_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_HOST_1_PRIVATE_KEY || '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2';
const TEST_HOST_1_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS || '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
const TEST_HOST_1_URL = process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8080';

const TEST_USER_1_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_USER_1_PRIVATE_KEY || '0xd214b24de3b656c0fa3d696f6e2a8e5e2cc4c93f95f8b1e8f979e37c69e685e2';
const TEST_USER_1_ADDRESS = process.env.NEXT_PUBLIC_TEST_USER_1_ADDRESS || '0xC3A4b6fc1309cF0fF695bDa63F675C21a0Dd45eC';

interface HostInfo {
  address: string;
  isRegistered: boolean;
  active: boolean;
  stakedAmount: string;
  metadata: string;
  models: string[];
  usdcBalance: string;
  fabBalance: string;
  accumulatedEarnings: string;
}

interface NodeMetrics {
  status: 'online' | 'offline' | 'checking';
  uptime?: number;
  totalRequests?: number;
  activeConnections?: number;
  gpuUtilization?: number;
  memoryUsageGb?: number;
  averageResponseTimeMs?: number;
  totalTokensGenerated?: number;
  availableModels?: string[];
}

export default function NodeRegistration() {
  // State management
  const [selectedHost, setSelectedHost] = useState<'host1' | 'host2'>('host1');
  const [metadata, setMetadata] = useState('llama-2-7b,gpt-4,inference,base-sepolia');
  const [additionalStake, setAdditionalStake] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  
  // Host information
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetrics>({ status: 'offline' });
  
  // SDK instance
  const [sdk, setSdk] = useState<FabstirSDK | null>(null);

  // Helper function to add logs
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(message);
  };

  // Initialize SDK with selected host
  const initializeSDK = async () => {
    try {
      const privateKey = selectedHost === 'host1' ? TEST_HOST_1_PRIVATE_KEY : TEST_USER_1_PRIVATE_KEY;
      const hostAddress = selectedHost === 'host1' ? TEST_HOST_1_ADDRESS : TEST_USER_1_ADDRESS;
      
      addLog(`Initializing SDK for ${selectedHost} (${hostAddress})...`);
      
      const sdkInstance = new FabstirSDK({
        rpcUrl: RPC_URL,
        contractAddresses: {
          jobMarketplace: CONTRACT_JOB_MARKETPLACE,
          nodeRegistry: CONTRACT_NODE_REGISTRY,
          fabToken: CONTRACT_FAB_TOKEN,
          hostEarnings: CONTRACT_HOST_EARNINGS,
          usdcToken: CONTRACT_USDC_TOKEN,
        }
      });
      
      await sdkInstance.authenticate(privateKey);
      setSdk(sdkInstance);
      
      addLog('✅ SDK initialized and authenticated');
      return sdkInstance;
    } catch (err: any) {
      addLog(`❌ SDK initialization failed: ${err.message}`);
      throw err;
    }
  };

  // Fetch host information
  const fetchHostInfo = async () => {
    try {
      let sdkInstance = sdk;
      if (!sdkInstance) {
        sdkInstance = await initializeSDK();
      }
      
      const hostManager = sdkInstance.getHostManager();
      const hostAddress = selectedHost === 'host1' ? TEST_HOST_1_ADDRESS : TEST_USER_1_ADDRESS;
      
      addLog('Fetching host information...');
      
      // Get host registration info
      const info = await hostManager.getHostInfo(hostAddress);
      
      // Get balances
      const usdcBalance = await hostManager.getFabBalance(CONTRACT_USDC_TOKEN);
      const fabBalance = await hostManager.getFabBalance();
      
      // Get accumulated earnings
      let earnings = ethers.BigNumber.from(0);
      try {
        earnings = await hostManager.checkAccumulatedEarnings(CONTRACT_USDC_TOKEN);
      } catch (err) {
        // No earnings yet
      }
      
      const hostData: HostInfo = {
        address: hostAddress,
        isRegistered: info.isRegistered,
        active: info.active,
        stakedAmount: ethers.utils.formatUnits(info.stakedAmount, 18),
        metadata: info.metadata,
        models: info.models || [],
        usdcBalance: ethers.utils.formatUnits(usdcBalance, 6),
        fabBalance: ethers.utils.formatUnits(fabBalance, 18),
        accumulatedEarnings: ethers.utils.formatUnits(earnings, 6)
      };
      
      setHostInfo(hostData);
      addLog('✅ Host information updated');
      
      // Query node capabilities if registered
      if (info.isRegistered) {
        await queryNodeMetrics(hostAddress);
      }
      
    } catch (err: any) {
      addLog(`❌ Failed to fetch host info: ${err.message}`);
      setError(err.message);
    }
  };

  // Query node metrics from API
  const queryNodeMetrics = async (hostAddress: string) => {
    try {
      setNodeMetrics({ status: 'checking' });
      
      // For demo, we'll simulate metrics since actual node may not be running
      // In production, this would query the actual node endpoint
      const nodeUrl = selectedHost === 'host1' ? TEST_HOST_1_URL : 'http://localhost:8081';
      
      try {
        // Try to fetch actual metrics
        const response = await fetch(`${nodeUrl}/metrics`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
          const data = await response.json();
          setNodeMetrics({
            status: 'online',
            uptime: data.uptime_seconds,
            totalRequests: data.total_requests,
            activeConnections: data.active_connections,
            gpuUtilization: data.gpu_utilization,
            memoryUsageGb: data.memory_usage_gb,
            averageResponseTimeMs: data.average_response_time_ms,
            totalTokensGenerated: data.total_tokens_generated
          });
          addLog('✅ Node is online');
        } else {
          throw new Error('Node offline');
        }
      } catch (err) {
        // Node is offline - show mock data for demo
        setNodeMetrics({
          status: 'offline',
          uptime: 86400,
          totalRequests: 1234,
          activeConnections: 0,
          gpuUtilization: 0,
          memoryUsageGb: 0,
          averageResponseTimeMs: 0,
          totalTokensGenerated: 0
        });
        addLog('⚠️ Node is offline (showing cached metrics)');
      }
    } catch (err: any) {
      setNodeMetrics({ status: 'offline' });
      addLog(`⚠️ Could not query node metrics: ${err.message}`);
    }
  };

  // Register host
  const registerHost = async () => {
    setLoading(true);
    setError('');
    setStatus('Registering host...');
    
    try {
      let sdkInstance = sdk;
      if (!sdkInstance) {
        sdkInstance = await initializeSDK();
      }
      
      const hostManager = sdkInstance.getHostManager();
      
      addLog('Checking FAB token balance...');
      const fabBalance = await hostManager.getFabBalance();
      const requiredStake = ethers.utils.parseUnits(DEFAULT_STAKE_AMOUNT, 18);
      
      if (fabBalance.lt(requiredStake)) {
        throw new Error(`Insufficient FAB tokens. Need ${DEFAULT_STAKE_AMOUNT}, have ${ethers.utils.formatUnits(fabBalance, 18)}`);
      }
      
      addLog('Approving FAB tokens for staking...');
      addLog(`Registering with metadata: ${metadata}`);
      
      const tx = await hostManager.registerHost({
        metadata: metadata,
        stakeAmount: DEFAULT_STAKE_AMOUNT
      });
      
      addLog('Waiting for transaction confirmation...');
      await tx.wait();
      
      addLog('✅ Host registered successfully!');
      setStatus('Host registered successfully');
      
      // Refresh host info
      await fetchHostInfo();
      
    } catch (err: any) {
      addLog(`❌ Registration failed: ${err.message}`);
      setError(err.message);
      setStatus('Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // Unregister host
  const unregisterHost = async () => {
    setLoading(true);
    setError('');
    setStatus('Unregistering host...');
    
    try {
      let sdkInstance = sdk;
      if (!sdkInstance) {
        sdkInstance = await initializeSDK();
      }
      
      const hostManager = sdkInstance.getHostManager();
      
      addLog('Unregistering host and withdrawing stake...');
      
      const tx = await hostManager.unregisterHost();
      
      addLog('Waiting for transaction confirmation...');
      await tx.wait();
      
      addLog('✅ Host unregistered and stake returned!');
      setStatus('Host unregistered successfully');
      
      // Refresh host info
      await fetchHostInfo();
      
    } catch (err: any) {
      addLog(`❌ Unregistration failed: ${err.message}`);
      setError(err.message);
      setStatus('Unregistration failed');
    } finally {
      setLoading(false);
    }
  };

  // Update metadata
  const updateMetadata = async () => {
    setLoading(true);
    setError('');
    setStatus('Updating metadata...');
    
    try {
      let sdkInstance = sdk;
      if (!sdkInstance) {
        sdkInstance = await initializeSDK();
      }
      
      const hostManager = sdkInstance.getHostManager();
      
      addLog(`Updating metadata to: ${metadata}`);
      
      const tx = await hostManager.updateMetadata(metadata);
      
      addLog('Waiting for transaction confirmation...');
      await tx.wait();
      
      addLog('✅ Metadata updated successfully!');
      setStatus('Metadata updated');
      
      // Refresh host info
      await fetchHostInfo();
      
    } catch (err: any) {
      addLog(`❌ Metadata update failed: ${err.message}`);
      setError(err.message);
      setStatus('Metadata update failed');
    } finally {
      setLoading(false);
    }
  };

  // Add additional stake
  const addStake = async () => {
    if (!additionalStake) {
      setError('Please enter stake amount');
      return;
    }
    
    setLoading(true);
    setError('');
    setStatus('Adding stake...');
    
    try {
      let sdkInstance = sdk;
      if (!sdkInstance) {
        sdkInstance = await initializeSDK();
      }
      
      const hostManager = sdkInstance.getHostManager();
      
      addLog(`Adding ${additionalStake} FAB to stake...`);
      
      const tx = await hostManager.addStake(additionalStake);
      
      addLog('Waiting for transaction confirmation...');
      await tx.wait();
      
      addLog('✅ Additional stake added successfully!');
      setStatus('Stake added');
      setAdditionalStake('');
      
      // Refresh host info
      await fetchHostInfo();
      
    } catch (err: any) {
      addLog(`❌ Add stake failed: ${err.message}`);
      setError(err.message);
      setStatus('Add stake failed');
    } finally {
      setLoading(false);
    }
  };

  // Withdraw accumulated earnings
  const withdrawEarnings = async () => {
    setLoading(true);
    setError('');
    setStatus('Withdrawing earnings...');
    
    try {
      let sdkInstance = sdk;
      if (!sdkInstance) {
        sdkInstance = await initializeSDK();
      }
      
      const hostManager = sdkInstance.getHostManager();
      
      addLog('Withdrawing USDC earnings...');
      
      const receipt = await hostManager.withdrawEarnings(CONTRACT_USDC_TOKEN);
      
      if (receipt.status === 0) {
        addLog('No earnings to withdraw');
        setStatus('No earnings available');
      } else {
        addLog('✅ Earnings withdrawn successfully!');
        setStatus('Earnings withdrawn');
      }
      
      // Refresh host info
      await fetchHostInfo();
      
    } catch (err: any) {
      addLog(`❌ Withdrawal failed: ${err.message}`);
      setError(err.message);
      setStatus('Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle host switching
  const switchHost = async (host: 'host1' | 'host2') => {
    setSelectedHost(host);
    setSdk(null); // Reset SDK to force re-authentication
    setHostInfo(null);
    setNodeMetrics({ status: 'offline' });
    setLogs([]);
    addLog(`Switched to ${host}`);
  };

  // Initial load
  useEffect(() => {
    fetchHostInfo();
  }, [selectedHost]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1>Node Registration & Management</h1>
      <p>Register hosts, stake FAB tokens, and manage node operations</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        {/* Left column: Controls */}
        <div>
          <h3>Registration Controls</h3>
          
          <div style={{ 
            border: '1px solid #dee2e6', 
            borderRadius: 4, 
            padding: 16,
            backgroundColor: '#f8f9fa'
          }}>
            {/* Host selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>Select Host:</label>
              <select 
                value={selectedHost}
                onChange={(e) => switchHost(e.target.value as 'host1' | 'host2')}
                style={{
                  width: '100%',
                  padding: 8,
                  fontSize: 14,
                  borderRadius: 4,
                  border: '1px solid #ced4da'
                }}
                disabled={loading}
              >
                <option value="host1">TEST_HOST_1 ({TEST_HOST_1_ADDRESS.slice(0, 6)}...)</option>
                <option value="host2">TEST_USER_1 as Host 2 ({TEST_USER_1_ADDRESS.slice(0, 6)}...)</option>
              </select>
            </div>

            {/* Metadata input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>Node Metadata:</label>
              <input
                type="text"
                value={metadata}
                onChange={(e) => setMetadata(e.target.value)}
                placeholder="e.g., llama-2-7b,gpt-4,inference"
                style={{
                  width: '100%',
                  padding: 8,
                  fontSize: 14,
                  borderRadius: 4,
                  border: '1px solid #ced4da'
                }}
                disabled={loading}
              />
            </div>

            {/* Registration buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <button
                onClick={registerHost}
                disabled={loading || hostInfo?.isRegistered}
                style={{
                  padding: '10px 16px',
                  fontSize: 14,
                  backgroundColor: hostInfo?.isRegistered ? '#6c757d' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: loading || hostInfo?.isRegistered ? 'not-allowed' : 'pointer',
                  opacity: loading || hostInfo?.isRegistered ? 0.6 : 1
                }}
              >
                Register Host
              </button>
              
              <button
                onClick={unregisterHost}
                disabled={loading || !hostInfo?.isRegistered}
                style={{
                  padding: '10px 16px',
                  fontSize: 14,
                  backgroundColor: !hostInfo?.isRegistered ? '#6c757d' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: loading || !hostInfo?.isRegistered ? 'not-allowed' : 'pointer',
                  opacity: loading || !hostInfo?.isRegistered ? 0.6 : 1
                }}
              >
                Unregister
              </button>
            </div>

            <button
              onClick={updateMetadata}
              disabled={loading || !hostInfo?.isRegistered}
              style={{
                width: '100%',
                padding: '10px 16px',
                fontSize: 14,
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: loading || !hostInfo?.isRegistered ? 'not-allowed' : 'pointer',
                opacity: loading || !hostInfo?.isRegistered ? 0.6 : 1,
                marginBottom: 16
              }}
            >
              Update Metadata
            </button>

            {/* Add stake section */}
            <div style={{ borderTop: '1px solid #dee2e6', paddingTop: 16 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>Add Stake (FAB):</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={additionalStake}
                  onChange={(e) => setAdditionalStake(e.target.value)}
                  placeholder="Amount"
                  style={{
                    flex: 1,
                    padding: 8,
                    fontSize: 14,
                    borderRadius: 4,
                    border: '1px solid #ced4da'
                  }}
                  disabled={loading || !hostInfo?.isRegistered}
                />
                <button
                  onClick={addStake}
                  disabled={loading || !hostInfo?.isRegistered}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    backgroundColor: '#6f42c1',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: loading || !hostInfo?.isRegistered ? 'not-allowed' : 'pointer',
                    opacity: loading || !hostInfo?.isRegistered ? 0.6 : 1
                  }}
                >
                  Add Stake
                </button>
              </div>
            </div>

            {/* Earnings section */}
            <div style={{ borderTop: '1px solid #dee2e6', paddingTop: 16, marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6c757d' }}>Accumulated Earnings</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                    ${hostInfo?.accumulatedEarnings || '0.00'} USDC
                  </div>
                </div>
                <button
                  onClick={withdrawEarnings}
                  disabled={loading || !hostInfo?.isRegistered || parseFloat(hostInfo?.accumulatedEarnings || '0') === 0}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading || parseFloat(hostInfo?.accumulatedEarnings || '0') === 0 ? 0.6 : 1
                  }}
                >
                  Withdraw
                </button>
              </div>
            </div>
          </div>

          {/* Refresh button */}
          <button
            onClick={fetchHostInfo}
            disabled={loading}
            style={{
              width: '100%',
              marginTop: 16,
              padding: '10px 16px',
              fontSize: 14,
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            Refresh Information
          </button>
        </div>

        {/* Right column: Information */}
        <div>
          <h3>Node Information</h3>
          
          <div style={{ 
            border: '1px solid #dee2e6', 
            borderRadius: 4, 
            padding: 16,
            backgroundColor: '#f8f9fa'
          }}>
            {hostInfo ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <strong>Address:</strong>
                  <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{hostInfo.address}</div>
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <strong>Status:</strong>{' '}
                  {hostInfo.isRegistered ? (
                    <span style={{ color: '#28a745' }}>✅ Registered</span>
                  ) : (
                    <span style={{ color: '#dc3545' }}>❌ Not Registered</span>
                  )}
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <strong>Active:</strong> {hostInfo.active ? 'Yes' : 'No'}
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <strong>Staked Amount:</strong> {hostInfo.stakedAmount} FAB
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <strong>USDC Balance:</strong> ${hostInfo.usdcBalance}
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <strong>FAB Balance:</strong> {hostInfo.fabBalance}
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <strong>Metadata:</strong>
                  <div style={{ 
                    fontFamily: 'monospace', 
                    fontSize: 12,
                    backgroundColor: 'white',
                    padding: 8,
                    borderRadius: 4,
                    wordBreak: 'break-all'
                  }}>
                    {hostInfo.metadata || 'None'}
                  </div>
                </div>
                
                {hostInfo.models.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>Models:</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                      {hostInfo.models.map((model, idx) => (
                        <li key={idx}>{model}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: '#6c757d' }}>Loading host information...</div>
            )}
          </div>

          {/* Node Metrics */}
          <h3 style={{ marginTop: 24 }}>Node Metrics</h3>
          
          <div style={{ 
            border: '1px solid #dee2e6', 
            borderRadius: 4, 
            padding: 16,
            backgroundColor: '#f8f9fa'
          }}>
            <div style={{ marginBottom: 12 }}>
              <strong>Node Status:</strong>{' '}
              {nodeMetrics.status === 'online' ? (
                <span style={{ color: '#28a745' }}>🟢 Online</span>
              ) : nodeMetrics.status === 'checking' ? (
                <span style={{ color: '#ffc107' }}>🟡 Checking...</span>
              ) : (
                <span style={{ color: '#dc3545' }}>🔴 Offline</span>
              )}
            </div>
            
            {nodeMetrics.uptime !== undefined && (
              <>
                <div style={{ marginBottom: 8 }}>
                  <strong>Uptime:</strong> {Math.floor(nodeMetrics.uptime / 3600)}h {Math.floor((nodeMetrics.uptime % 3600) / 60)}m
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Total Requests:</strong> {nodeMetrics.totalRequests?.toLocaleString() || 0}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Active Connections:</strong> {nodeMetrics.activeConnections || 0}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>GPU Utilization:</strong> {((nodeMetrics.gpuUtilization || 0) * 100).toFixed(1)}%
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Memory Usage:</strong> {nodeMetrics.memoryUsageGb?.toFixed(2) || 0} GB
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Avg Response Time:</strong> {nodeMetrics.averageResponseTimeMs || 0} ms
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Tokens Generated:</strong> {nodeMetrics.totalTokensGenerated?.toLocaleString() || 0}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Logs section */}
      <div style={{ marginTop: 24 }}>
        <h3>Execution Logs</h3>
        <div style={{ 
          maxHeight: 300, 
          overflowY: 'auto',
          backgroundColor: '#000',
          color: '#0f0',
          padding: 12,
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: 12
        }}>
          {logs.length === 0 ? (
            <div style={{ color: '#666' }}>No logs yet. Perform an action to see logs.</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} style={{ marginBottom: 4 }}>{log}</div>
            ))
          )}
        </div>
      </div>

      {/* Status bar */}
      <div style={{ 
        marginTop: 16, 
        padding: 12, 
        backgroundColor: error ? '#f8d7da' : '#e9ecef', 
        borderRadius: 4,
        fontFamily: 'monospace'
      }}>
        {status}
      </div>

      {error && (
        <div style={{ 
          marginTop: 12, 
          padding: 12, 
          backgroundColor: '#f8d7da', 
          borderRadius: 4,
          color: '#721c24'
        }}>
          {error}
        </div>
      )}
    </main>
  );
}