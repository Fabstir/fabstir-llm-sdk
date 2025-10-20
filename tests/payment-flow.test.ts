// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FabstirSDK, JobStatus, PaymentStatus } from '../src';
import { ethers } from 'ethers';

describe('Payment and Settlement Flow', () => {
  let sdk: FabstirSDK;
  let completedJobId: number;
  let failedJobId: number;
  
  beforeAll(async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    };
    
    await sdk.connect(mockProvider as any);
    
    // Create a completed job
    completedJobId = await sdk.submitJob({
      prompt: 'Test prompt',
      modelId: 'llama2-7b',
      maxTokens: 150,
      paymentToken: 'USDC',
      maxPrice: ethers.utils.parseUnits('0.001', 6)
    });
    
    // Simulate job completion
    await sdk._simulateStatusChange(completedJobId, JobStatus.COMPLETED);
    await sdk._simulateJobResult(completedJobId, {
      response: 'Test response',
      tokensUsed: 127,
      completionTime: Date.now()
    });
    
    // Create a failed job
    failedJobId = await sdk.submitJob({
      prompt: 'Failed job',
      modelId: 'llama2-7b',
      maxTokens: 100,
      paymentToken: 'USDC',
      maxPrice: ethers.utils.parseUnits('0.001', 6)
    });
    await sdk._simulateStatusChange(failedJobId, JobStatus.FAILED);
  });

  it('should get payment details for a job', async () => {
    const payment = await sdk.getPaymentDetails(completedJobId);
    
    expect(payment.jobId).toBe(completedJobId);
    expect(payment.amount).toBeDefined();
    expect(payment.amount.gt(0)).toBe(true);
    expect(payment.token).toBe('USDC');
    expect(payment.status).toBe(PaymentStatus.ESCROWED);
    expect(payment.payer).toBe('0x1234567890123456789012345678901234567890');
    expect(payment.recipient).toBeDefined();
  });

  it('should calculate actual cost based on tokens used', async () => {
    const actualCost = await sdk.calculateActualCost(completedJobId);
    
    expect(actualCost.totalCost).toBeDefined();
    expect(actualCost.totalCost.gt(0)).toBe(true);
    expect(actualCost.tokensUsed).toBe(127);
    expect(actualCost.pricePerToken).toBeDefined();
    
    // Check payment split (85% host, 10% treasury, 5% stakers)
    expect(actualCost.breakdown.hostPayment.toString()).toBe(
      actualCost.totalCost.mul(85).div(100).toString()
    );
    expect(actualCost.breakdown.treasuryFee.toString()).toBe(
      actualCost.totalCost.mul(10).div(100).toString()
    );
    expect(actualCost.breakdown.stakerReward.toString()).toBe(
      actualCost.totalCost.mul(5).div(100).toString()
    );
  });

  it('should approve payment for USDC token', async () => {
    const amount = ethers.utils.parseUnits('1', 6); // 1 USDC
    const tx = await sdk.approvePayment('USDC', amount);
    
    expect(tx).toBeDefined();
    expect(tx.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(tx.from).toBe('0x1234567890123456789012345678901234567890');
    expect(tx.wait).toBeDefined();
  });

  it('should release payment for completed job', async () => {
    const tx = await sdk.approveJobPayment(completedJobId);
    
    expect(tx).toBeDefined();
    expect(tx.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    
    // After approval, payment status should change
    const payment = await sdk.getPaymentDetails(completedJobId);
    expect(payment.status).toBe(PaymentStatus.RELEASED);
  });

  it('should get payment status', async () => {
    const status = await sdk.getPaymentStatus(completedJobId);
    expect(Object.values(PaymentStatus)).toContain(status);
  });

  it('should handle refund for failed job', async () => {
    const tx = await sdk.requestRefund(failedJobId);
    
    expect(tx).toBeDefined();
    expect(tx.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    
    const payment = await sdk.getPaymentDetails(failedJobId);
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
  });

  it('should get payment history', async () => {
    // First approve payment
    await sdk.approveJobPayment(completedJobId);
    
    const history = await sdk.getPaymentHistory(completedJobId);
    
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].event).toBe('PaymentEscrowed');
    expect(history[history.length - 1].event).toBe('PaymentReleased');
    
    history.forEach(entry => {
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.event).toBeDefined();
    });
  });

  it('should emit payment events', async () => {
    const events: any[] = [];
    
    const unsubscribe = sdk.onPaymentEvent((event) => {
      events.push(event);
    });
    
    // Trigger a payment event
    const newJobId = await sdk.submitJob({
      prompt: 'Payment event test',
      modelId: 'llama2-7b',
      maxTokens: 50
    });
    
    await sdk._simulateStatusChange(newJobId, JobStatus.COMPLETED);
    await sdk.approveJobPayment(newJobId);
    
    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'PaymentReleased')).toBe(true);
    
    unsubscribe();
  });

  it('should calculate refund amount correctly', async () => {
    const jobId = await sdk.submitJob({
      prompt: 'Refund test',
      modelId: 'llama2-7b',
      maxTokens: 100,
      paymentToken: 'USDC',
      maxPrice: ethers.utils.parseUnits('0.001', 6)
    });
    
    // Cancel job before completion
    await sdk._simulateStatusChange(jobId, JobStatus.CANCELLED);
    
    const refundAmount = await sdk.calculateRefundAmount(jobId);
    const estimate = await sdk.estimateJobCost({
      prompt: 'Refund test',
      modelId: 'llama2-7b',
      maxTokens: 100
    });
    
    // Full refund for cancelled job
    expect(refundAmount.toString()).toBe(estimate.estimatedCost.toString());
  });
});
