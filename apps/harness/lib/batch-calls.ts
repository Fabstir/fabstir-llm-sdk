// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { getProvider } from './provider';
import type { BatchCall, TransactionResult } from './types';

// Base Sepolia chain ID
const CHAIN_ID_HEX = '0x14a34'; // 84532 in hex

export function createBatchCall(
  to: string,
  data: string,
  value?: string
): BatchCall {
  return {
    to: to as `0x${string}`,
    data: data as `0x${string}`,
    value: value as `0x${string}` | undefined
  };
}

export async function executeBatch(
  from: string,
  calls: BatchCall[]
): Promise<TransactionResult> {
  const provider = getProvider();
  
  try {
    const result = await provider.request({
      method: 'wallet_sendCalls',
      params: [{
        version: '2.0.0',
        chainId: CHAIN_ID_HEX,
        from,
        calls,
        capabilities: {
          atomic: { required: true }
        }
      }]
    }) as TransactionResult;
    
    return result;
  } catch (error) {
    console.error('Batch execution failed:', error);
    throw error;
  }
}

export async function pollForCompletion(
  id: string,
  maxWaitTime: number = 60000
): Promise<TransactionResult> {
  const provider = getProvider();
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const status = await provider.request({
        method: 'wallet_getCallsStatus',
        params: [{ id }]
      }) as TransactionResult & { status: number };
      
      // Success
      if (status.status === 200) {
        return status;
      }
      
      // Error
      if (status.status >= 400) {
        throw new Error(`Transaction failed with status: ${status.status}`);
      }
      
      // Still pending, wait and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Status polling error:', error);
      throw error;
    }
  }
  
  throw new Error(`Transaction timeout after ${maxWaitTime}ms`);
}

export async function executeBatchAndWait(
  from: string,
  calls: BatchCall[],
  maxWaitTime?: number
): Promise<TransactionResult> {
  const result = await executeBatch(from, calls);
  return await pollForCompletion(result.id, maxWaitTime);
}