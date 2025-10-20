// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import React, { useState, useEffect } from 'react';
import { formatUnits } from 'viem';
import { fetchAllBalances, HOST_ADDRESS, TREASURY_ADDRESS } from '../lib/balance-fetcher';
interface BalanceDisplayProps { smartAccount: string; onBalanceUpdate?: () => void; }
const USDC_DECIMALS = 6;
export function BalanceDisplay({ smartAccount, onBalanceUpdate }: BalanceDisplayProps) {
  const [balances, setBalances] = useState({ smartBalance: BigInt(0), hostBalance: BigInt(0), treasuryBalance: BigInt(0) });
  const [loading, setLoading] = useState(true);
  const refreshBalances = async () => {
    if (!smartAccount) return;
    setLoading(true);
    try {
      setBalances(await fetchAllBalances(smartAccount));
      if (onBalanceUpdate) onBalanceUpdate();
    } catch (error) { console.error('Failed to fetch balances:', error); } finally { setLoading(false); }
  };
  useEffect(() => { refreshBalances(); }, [smartAccount]);
  if (loading) return <div>Loading balances...</div>;
  return (
    <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginTop: '24px' }}>
      <h3>USDC Balances</h3>
      <div style={{ display: 'grid', gap: '12px' }}>
        <div><strong>Smart Account:</strong> {formatUnits(balances.smartBalance, USDC_DECIMALS)} USDC</div>
        <div><strong>Host:</strong> {formatUnits(balances.hostBalance, USDC_DECIMALS)} USDC ({HOST_ADDRESS.slice(0, 6)}...)</div>
        <div><strong>Treasury:</strong> {formatUnits(balances.treasuryBalance, USDC_DECIMALS)} USDC ({TREASURY_ADDRESS.slice(0, 6)}...)</div>
      </div>
      <button onClick={refreshBalances} style={{ marginTop: '12px', padding: '6px 12px', fontSize: '14px' }}>Refresh</button>
    </div>
  );
}