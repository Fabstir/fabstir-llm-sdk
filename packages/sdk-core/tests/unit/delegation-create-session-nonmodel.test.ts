// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager.createSessionAsDelegate()
 *
 * February 2026 Contract Update: V2 Direct Payment Delegation (non-model version)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';

// Mock event topics
const SESSION_CREATED_BY_DELEGATE_TOPIC = ethers.id(
  'SessionCreatedByDelegate(uint256,address,address,address,bytes32,uint256)'
);

// Mock contract
const mockCreateSessionAsDelegate = vi.fn().mockResolvedValue({
  wait: vi.fn().mockResolvedValue({
    hash: '0xnonmodeltx',
    logs: [{
      topics: [
        SESSION_CREATED_BY_DELEGATE_TOPIC,
        '0x00000000000000000000000000000000000000000000000000000000000000c8'  // sessionId = 200
      ]
    }]
  })
});

const mockJobMarketplace = {
  connect: vi.fn().mockReturnThis(),
  createSessionAsDelegate: mockCreateSessionAsDelegate,
  target: '0xMockJobMarketplace',
  interface: { format: vi.fn() }
};

const mockContractManager = {
  getJobMarketplace: vi.fn().mockReturnValue(mockJobMarketplace),
  getContractAddress: vi.fn().mockReturnValue('0xMockJobMarketplace'),
  setSigner: vi.fn().mockResolvedValue(undefined)
};

describe('SessionJobManager.createSessionAsDelegate() (Feb 2026)', () => {
  let sessionJobManager: SessionJobManager;
  let mockSigner: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionJobManager = new SessionJobManager(mockContractManager as any);
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0xDelegateAddress')
    };
  });

  it('should call contract with 8 params (no modelId)', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const params = {
      payer: '0xPayerAddress',
      host: '0xHostAddress',
      paymentToken: '0xUSDCAddress',
      amount: BigInt(1000000),
      pricePerToken: BigInt(2000),
      maxDuration: 3600,
      proofInterval: 100,
      proofTimeoutWindow: 300
    };

    await sessionJobManager.createSessionAsDelegate(
      params.payer,
      params.host,
      params.paymentToken,
      params.amount,
      params.pricePerToken,
      params.maxDuration,
      params.proofInterval,
      params.proofTimeoutWindow
    );

    expect(mockCreateSessionAsDelegate).toHaveBeenCalledWith(
      params.payer,
      params.host,
      params.paymentToken,
      params.amount,
      params.pricePerToken,
      params.maxDuration,
      params.proofInterval,
      params.proofTimeoutWindow
    );
  });

  it('should return SessionResult with sessionId', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const result = await sessionJobManager.createSessionAsDelegate(
      '0xPayer',
      '0xHost',
      '0xToken',
      BigInt(1000000),
      BigInt(2000),
      3600,
      100,
      300
    );

    expect(result.sessionId).toBe(BigInt(200));
  });

  it('should return transaction hash', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const result = await sessionJobManager.createSessionAsDelegate(
      '0xPayer',
      '0xHost',
      '0xToken',
      BigInt(1000000),
      BigInt(2000),
      3600,
      100,
      300
    );

    expect(result.txHash).toBe('0xnonmodeltx');
  });

  it('should throw if signer not set', async () => {
    await expect(
      sessionJobManager.createSessionAsDelegate(
        '0xPayer',
        '0xHost',
        '0xToken',
        BigInt(1000000),
        BigInt(2000),
        3600,
        100,
        300
      )
    ).rejects.toThrow('Signer not set');
  });
});
