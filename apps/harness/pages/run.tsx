import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import { RunButton } from '../components/RunButton';
import { StatusDisplay } from '../components/StatusDisplay';
import { useSubAccount } from '../hooks/useSubAccount';
import { pollForCompletion } from '../lib/batch-calls';

const Run: NextPage = () => {
  const { subAccount, initializeSubAccount, loading } = useSubAccount();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');

  useEffect(() => {
    // Initialize sub-account on mount
    if (!subAccount && !loading) {
      initializeSubAccount().catch(console.error);
    }
  }, [subAccount, loading]);

  const handleStart = () => {
    setStatus('pending');
    setMessage('Submitting batch transaction...');
    setTxHash('');
  };

  const handleComplete = async (result: any) => {
    setMessage('Transaction submitted, waiting for confirmation...');
    
    try {
      const final = await pollForCompletion(result.id);
      setStatus('success');
      setMessage('Transaction successful!');
      setTxHash(final.receipts?.[0]?.transactionHash || result.id);
    } catch (error) {
      setStatus('error');
      setMessage(`Failed: ${error.message}`);
    }
  };

  const handleError = (error: Error) => {
    setStatus('error');
    setMessage(error.message);
  };

  return (
    <main style={{ padding: '24px', fontFamily: 'system-ui', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Fabstir Harness</h1>
      <p>Test gasless transactions on Base Sepolia using Coinbase Smart Wallet.</p>
      
      {subAccount && (
        <div style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>
          Sub-account: {subAccount}
        </div>
      )}

      <RunButton
        subAccount={subAccount}
        onStart={handleStart}
        onComplete={handleComplete}
        onError={handleError}
      />

      <StatusDisplay status={status} message={message} transactionHash={txHash} />
    </main>
  );
};

export default Run;