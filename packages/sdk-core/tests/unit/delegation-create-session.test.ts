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
// The signer: the session id is read from the marketplace's event naming it as the delegate (plan §35 PP7).
const DELEGATE = ethers.Wallet.createRandom().address;

// A sent transaction as ethers returns it; the manager re-arms it for replacement detection (plan §14 S3).
const rearmable = <T extends object>(tx: T) => {
  const sent: any = { ...tx };
  sent.replaceableTransaction = vi.fn(() => sent);
  return sent;
};

// Mock contract
const mockCreateSessionForModelAsDelegate = vi.fn().mockResolvedValue(rearmable({
  wait: vi.fn().mockResolvedValue({
    hash: '0xdelegatesessiontx',
    logs: [{
      address: '0xMockJobMarketplace',
      topics: [
        SESSION_CREATED_BY_DELEGATE_TOPIC,
        '0x0000000000000000000000000000000000000000000000000000000000000064',  // sessionId = 100
        ethers.zeroPadValue(ethers.Wallet.createRandom().address, 32),         // payer
        ethers.zeroPadValue(DELEGATE, 32),                                      // delegate
      ]
    }]
  })
}));

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
      getAddress: vi.fn().mockResolvedValue(DELEGATE),
      provider: { getBlockNumber: vi.fn().mockResolvedValue(1) }
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
      BigInt(params.maxDuration),
      BigInt(params.proofInterval),
      BigInt(params.proofTimeoutWindow)
    );
  });

  it('waits on the transaction re-armed from the block read before sending (plan §14 S3)', async () => {
    await sessionJobManager.setSigner(mockSigner);
    mockSigner.provider.getBlockNumber.mockResolvedValueOnce(4242);
    await sessionJobManager.createSessionForModelAsDelegate('0xP', '0x' + 'ab'.repeat(32), '0xH', '0xU', 1n, 1n, 3600, 100, 300);
    const sent = await mockCreateSessionForModelAsDelegate.mock.results[0].value;
    expect(sent.replaceableTransaction).toHaveBeenCalledWith(4242);
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

  // 1.39.0: this used to pin `sessionId === 0n` — a funded session reported as id 0, which no caller can
  // reclaim. A missing event is now an error that carries the transaction hash.
  it('refuses to report a session id it could not read (SESSION_ID_UNRESOLVED with the tx hash)', async () => {
    // Override mock to return no matching event
    mockCreateSessionForModelAsDelegate.mockResolvedValueOnce(rearmable({
      wait: vi.fn().mockResolvedValue({
        hash: '0xnoeventtx',
        logs: []
      })
    }));

    await sessionJobManager.setSigner(mockSigner);

    await expect(sessionJobManager.createSessionForModelAsDelegate(
      '0xPayer',
      '0xModelId',
      '0xHost',
      '0xToken',
      BigInt(1000000),
      BigInt(2000),
      3600,
      100,
      300
    )).rejects.toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: '0xnoeventtx' } });
  });
});
