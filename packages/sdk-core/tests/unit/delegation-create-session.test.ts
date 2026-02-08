// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager.createSessionForModelAsDelegate()
 *
 * February 2026 Contract Update: V2 Direct Payment Delegation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';

// Mock event topics
const SESSION_CREATED_BY_DELEGATE_TOPIC = ethers.id(
  'SessionCreatedByDelegate(uint256,address,address,address,bytes32,uint256)'
);

// Mock contract
const mockCreateSessionForModelAsDelegate = vi.fn().mockResolvedValue({
  wait: vi.fn().mockResolvedValue({
    hash: '0xdelegatesessiontx',
    logs: [{
      topics: [
        SESSION_CREATED_BY_DELEGATE_TOPIC,
        '0x0000000000000000000000000000000000000000000000000000000000000064'  // sessionId = 100
      ]
    }]
  })
});

const mockJobMarketplace = {
  connect: vi.fn().mockReturnThis(),
  createSessionForModelAsDelegate: mockCreateSessionForModelAsDelegate,
  target: '0xMockJobMarketplace',
  interface: { format: vi.fn() }
};

const mockContractManager = {
  getJobMarketplace: vi.fn().mockReturnValue(mockJobMarketplace),
  getContractAddress: vi.fn().mockReturnValue('0xMockJobMarketplace'),
  setSigner: vi.fn().mockResolvedValue(undefined)
};

describe('SessionJobManager.createSessionForModelAsDelegate() (Feb 2026)', () => {
  let sessionJobManager: SessionJobManager;
  let mockSigner: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionJobManager = new SessionJobManager(mockContractManager as any);
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0xDelegateAddress')
    };
  });

  it('should call contract with all 9 params', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const params = {
      payer: '0xPayerAddress',
      modelId: '0x' + 'ab'.repeat(32),
      host: '0xHostAddress',
      paymentToken: '0xUSDCAddress',
      amount: BigInt(1000000),
      pricePerToken: BigInt(2000),
      maxDuration: 3600,
      proofInterval: 100,
      proofTimeoutWindow: 300
    };

    await sessionJobManager.createSessionForModelAsDelegate(
      params.payer,
      params.modelId,
      params.host,
      params.paymentToken,
      params.amount,
      params.pricePerToken,
      params.maxDuration,
      params.proofInterval,
      params.proofTimeoutWindow
    );

    expect(mockCreateSessionForModelAsDelegate).toHaveBeenCalledWith(
      params.payer,
      params.modelId,
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

    const result = await sessionJobManager.createSessionForModelAsDelegate(
      '0xPayer',
      '0xModelId',
      '0xHost',
      '0xToken',
      BigInt(1000000),
      BigInt(2000),
      3600,
      100,
      300
    );

    expect(result).toHaveProperty('sessionId');
    expect(result.sessionId).toBe(BigInt(100));
  });

  it('should return transaction hash', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const result = await sessionJobManager.createSessionForModelAsDelegate(
      '0xPayer',
      '0xModelId',
      '0xHost',
      '0xToken',
      BigInt(1000000),
      BigInt(2000),
      3600,
      100,
      300
    );

    expect(result.txHash).toBe('0xdelegatesessiontx');
  });

  it('should return deposit amount', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const amount = BigInt(2000000);
    const result = await sessionJobManager.createSessionForModelAsDelegate(
      '0xPayer',
      '0xModelId',
      '0xHost',
      '0xToken',
      amount,
      BigInt(2000),
      3600,
      100,
      300
    );

    expect(result.depositAmount).toBe(amount);
  });

  it('should throw if signer not set', async () => {
    await expect(
      sessionJobManager.createSessionForModelAsDelegate(
        '0xPayer',
        '0xModelId',
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

  it('should handle missing event gracefully', async () => {
    // Override mock to return no matching event
    mockCreateSessionForModelAsDelegate.mockResolvedValueOnce({
      wait: vi.fn().mockResolvedValue({
        hash: '0xnoeventtx',
        logs: []
      })
    });

    await sessionJobManager.setSigner(mockSigner);

    const result = await sessionJobManager.createSessionForModelAsDelegate(
      '0xPayer',
      '0xModelId',
      '0xHost',
      '0xToken',
      BigInt(1000000),
      BigInt(2000),
      3600,
      100,
      300
    );

    // Should return 0n when event not found
    expect(result.sessionId).toBe(0n);
  });
});
