// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { encodeFunctionData, parseUnits } from 'viem';
import type { BatchCall } from './types';

// USDC on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Host address for session jobs
const HOST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7';

// Job Marketplace contract (from .env.test)
const JOB_MARKETPLACE = process.env.NEXT_PUBLIC_JOB_MARKETPLACE || 
  '0xD937c594682Fe74E6e3d06239719805C04BE804A';

export function buildUSDCApprovalCall(
  spender: string,
  amount: bigint
): BatchCall {
  const data = encodeFunctionData({
    abi: [{
      name: 'approve',
      type: 'function',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ name: '', type: 'bool' }]
    }],
    functionName: 'approve',
    args: [spender, amount]
  });

  return {
    to: USDC_ADDRESS as `0x${string}`,
    data: data as `0x${string}`
  };
}

export function buildJobCreationCall(
  jobMarketplace: string,
  prompt: string,
  maxTokens: number,
  paymentAmount: bigint
): BatchCall {
  const data = encodeFunctionData({
    abi: [{
      name: 'createJob',
      type: 'function',
      inputs: [
        { name: 'prompt', type: 'string' },
        { name: 'maxTokens', type: 'uint256' },
        { name: 'payment', type: 'uint256' }
      ],
      outputs: [{ name: 'jobId', type: 'uint256' }]
    }],
    functionName: 'createJob',
    args: [prompt, BigInt(maxTokens), paymentAmount]
  });

  return {
    to: jobMarketplace as `0x${string}`,
    data: data as `0x${string}`
  };
}

export function buildCreateSessionJobWithTokenCall(
  host: string, token: string, deposit: bigint,
  pricePerToken: bigint, duration: bigint, proofInterval: bigint
): BatchCall {
  if (deposit <= 0) throw new Error('Deposit must be greater than 0');
  if (duration <= 0) throw new Error('Duration must be greater than 0');
  const data = encodeFunctionData({
    abi: [{
      name: 'createSessionJobWithToken', type: 'function',
      inputs: [
        { name: 'host', type: 'address' }, { name: 'token', type: 'address' },
        { name: 'deposit', type: 'uint256' }, { name: 'pricePerToken', type: 'uint256' },
        { name: 'duration', type: 'uint256' }, { name: 'proofInterval', type: 'uint256' }
      ],
      outputs: [{ name: 'sessionId', type: 'uint256' }]
    }],
    functionName: 'createSessionJobWithToken',
    args: [host, token, deposit, pricePerToken, duration, proofInterval]
  });
  return { to: JOB_MARKETPLACE as `0x${string}`, data: data as `0x${string}` };
}

export function buildSessionJobBatch(
  deposit: bigint, pricePerToken: bigint,
  duration: bigint = BigInt(86400), proofInterval: bigint = BigInt(100)
): BatchCall[] {
  const approveCall = buildUSDCApprovalCall(JOB_MARKETPLACE, deposit);
  const createCall = buildCreateSessionJobWithTokenCall(
    HOST_ADDRESS, USDC_ADDRESS, deposit, pricePerToken, duration, proofInterval);
  return [approveCall, createCall];
}