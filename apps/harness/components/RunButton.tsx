// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { executeBatch } from '../lib/batch-calls';
import { buildUSDCApprovalCall, buildJobCreationCall } from '../lib/call-builder';

interface RunButtonProps {
  subAccount: string | null;
  onStart: () => void;
  onComplete: (result: any) => void;
  onError: (error: Error) => void;
}

export function RunButton({ subAccount, onStart, onComplete, onError }: RunButtonProps) {
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    if (!subAccount) {
      onError(new Error('No sub-account available'));
      return;
    }

    setLoading(true);
    onStart();

    try {
      // Build batch calls
      const approvalCall = buildUSDCApprovalCall(
        '0xD937c594682Fe74E6e3d06239719805C04BE804A', // Job marketplace
        BigInt(10) * BigInt(10 ** 6) // 10 USDC
      );
      
      const jobCall = buildJobCreationCall(
        '0xD937c594682Fe74E6e3d06239719805C04BE804A',
        'Hello from gasless test',
        100,
        BigInt(10) * BigInt(10 ** 6)
      );

      // Execute batch
      const result = await executeBatch(subAccount, [approvalCall, jobCall]);
      onComplete(result);
    } catch (error) {
      onError(error as Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      id="start"
      onClick={handleClick}
      disabled={loading || !subAccount}
      style={{
        padding: '12px 24px',
        fontSize: '16px',
        backgroundColor: loading ? '#666' : '#0052cc',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: loading ? 'wait' : 'pointer'
      }}
    >
      {loading ? 'Processing...' : 'Run sponsored batch'}
    </button>
  );
}