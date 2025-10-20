// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import React, { useState } from 'react';
import { parseUnits } from 'viem';
import { buildSessionJobBatch } from '../lib/call-builder';
interface USDCFlowButtonProps {
  smartAccount: string;
  onSuccess?: (sessionId: string, txHash: string) => void;
  onError?: (error: Error) => void;
}
const USDC_DECIMALS = 6, CHAIN_ID_HEX = '0x14a34';
export function USDCFlowButton({ smartAccount, onSuccess, onError }: USDCFlowButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<{sessionId?: string, txHash?: string}>({});

  const executeFlow = async () => {
    if (!smartAccount) return onError?.(new Error('No smart account connected'));
    setLoading(true);
    setStatus('Approving USDC and Creating session job...');
    setResult({});
    try {
      const [approveCall, createCall] = buildSessionJobBatch(
        parseUnits('2', USDC_DECIMALS), parseUnits('0.002', USDC_DECIMALS));
      const provider = (window as any).ethereum;
      const res = await provider.request({
        method: 'wallet_sendCalls',
        params: [{ version: '2.0.0', chainId: CHAIN_ID_HEX, from: smartAccount,
          calls: [approveCall, createCall], capabilities: { atomic: { required: true } } }]
      });
      setStatus('Waiting for confirmation...');
      for (let i = 0; i < 30; i++) {
        const stat = await provider.request({ method: 'wallet_getCallsStatus', params: [res.id] });
        if (stat.status === 'CONFIRMED') {
          const txHash = stat.receipts?.[0]?.transactionHash || res.id;
          const sessionId = stat.receipts?.[1]?.logs?.find((l: any) => l.topics?.length > 1)?.topics[1] || '0x0';
          setStatus('Session job created successfully!');
          setResult({ sessionId, txHash });
          onSuccess?.(sessionId, txHash);
          break;
        } else if (stat.status === 'FAILED') throw new Error('Transaction failed');
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      onError?.(error as Error);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ marginTop: '24px' }}>
      <button onClick={executeFlow} disabled={loading || !smartAccount}
        style={{ padding: '12px 24px', fontSize: '16px', backgroundColor: loading ? '#666' : '#28a745',
          color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'wait' : 'pointer', width: '100%' }}>
        {loading ? status : 'Create Session Job (2 USDC)'}
      </button>
      {(result.sessionId || result.txHash) && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#d4edda', borderRadius: '4px' }}>
          {result.sessionId && <p><strong>Session ID:</strong> {result.sessionId}</p>}
          {result.txHash && <p><strong>Transaction:</strong> {result.txHash.slice(0, 10)}...{result.txHash.slice(-8)}</p>}
        </div>
      )}
      {status && !loading && status.includes('Error') && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
          <p>{status}</p>
        </div>
      )}
    </div>
  );
}