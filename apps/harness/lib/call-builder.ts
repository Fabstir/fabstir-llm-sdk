import { encodeFunctionData, parseUnits } from 'viem';
import type { BatchCall } from './types';

// USDC on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

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