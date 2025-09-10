import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import { connectWallet, getAccountInfo } from '../lib/base-account';
import { useSubAccount } from '../hooks/useSubAccount';
import { BalanceDisplay } from '../components/BalanceDisplay';
import { USDCFlowButton } from '../components/USDCFlowButton';
import { E2ETestFlow } from '../components/E2ETestFlow';
import { getEthBalance } from '../e2e/assertions';

const USDCDemo: NextPage = () => {
  const [account, setAccount] = useState('');
  const [smartAccount, setSmartAccount] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [ethBalance, setEthBalance] = useState<bigint>(BigInt(0));
  const [lastSessionId, setLastSessionId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const { subAccount, initializeSubAccount } = useSubAccount();
  const handleConnect = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const accounts = await connectWallet();
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        setConnected(true);
        const info = await getAccountInfo(accounts[0]);
        setSmartAccount(info.smartAccount || accounts[0]);
        if (!subAccount) await initializeSubAccount();
        const balance = await getEthBalance(accounts[0]);
        setEthBalance(balance);
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      setErrorMessage(error.message || 'Failed to connect wallet');
    } finally { setLoading(false); }
  };
  const onSuccess = (sessionId: string) => {
    setLastSessionId(sessionId);
    setRefreshKey(k => k + 1);
  };
  const onError = (error: Error) => {
    setErrorMessage(error.message);
    console.error('USDC flow error:', error);
  };
  const onBalanceUpdate = () => setRefreshKey(k => k + 1);
  const refreshBalances = () => setRefreshKey(k => k + 1);
  useEffect(() => {
    if (account) getEthBalance(account).then(setEthBalance).catch(console.error);
  }, [account, lastSessionId]);
  return (
    <main style={{ padding: '24px', fontFamily: 'system-ui', maxWidth: '800px', margin: '0 auto' }}>
      <h1>USDC Session Job Demo</h1>
      <p>Execute gasless USDC transactions on Base Sepolia using Coinbase Smart Wallet.</p>
      <div style={{ marginTop: '24px', padding: '16px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h3>Network Information</h3>
        <p>Chain: Base Sepolia - Chain ID: 84532</p>
      </div>
      {errorMessage && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
          <p style={{ color: '#721c24' }}>{errorMessage}</p>
        </div>
      )}
      {!connected ? (
        <button onClick={handleConnect} disabled={loading} style={{ marginTop: '24px', padding: '12px 24px',
          fontSize: '16px', backgroundColor: loading ? '#666' : '#0052cc', color: 'white', border: 'none',
          borderRadius: '4px', cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ) : (
        <div style={{ display: 'grid', gap: '16px', marginTop: '24px' }}>
          <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h3>Account Information</h3>
            <p><strong>EOA:</strong> {account}</p>
            <p><strong>Smart Account:</strong> {smartAccount}</p>
            {subAccount && <p><strong>Sub-account:</strong> {subAccount}</p>}
            <p><strong>Gasless:</strong> {ethBalance === BigInt(0) ? '✅ 0 ETH spent' : `❌ ${ethBalance} ETH`}</p>
          </div>
          {connected && <BalanceDisplay smartAccount={smartAccount} key={refreshKey} onBalanceUpdate={onBalanceUpdate} />}
          {connected && <USDCFlowButton smartAccount={smartAccount} onSuccess={onSuccess} onError={onError} />}
          {lastSessionId && (
            <div style={{ padding: '12px', backgroundColor: '#d4edda', borderRadius: '4px' }}>
              <p><strong>Session Job Created:</strong> {lastSessionId}</p>
            </div>
          )}
          {connected && <E2ETestFlow smartAccount={smartAccount} jobId={1001} />}
        </div>
      )}
    </main>
  );
};
export default USDCDemo;