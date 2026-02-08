// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager.authorizeDelegate()
 *
 * February 2026 Contract Update: V2 Direct Payment Delegation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';

// Mock contract
const mockAuthorizeDelegate = vi.fn().mockResolvedValue({
  wait: vi.fn().mockResolvedValue({ hash: '0xdelegatetxhash' })
});

const mockJobMarketplace = {
  connect: vi.fn().mockReturnThis(),
  authorizeDelegate: mockAuthorizeDelegate,
  target: '0xMockJobMarketplace',
  interface: { format: vi.fn() }
};

const mockContractManager = {
  getJobMarketplace: vi.fn().mockReturnValue(mockJobMarketplace),
  getContractAddress: vi.fn().mockReturnValue('0xMockJobMarketplace'),
  setSigner: vi.fn().mockResolvedValue(undefined)
};

describe('SessionJobManager.authorizeDelegate() (Feb 2026)', () => {
  let sessionJobManager: SessionJobManager;
  let mockSigner: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionJobManager = new SessionJobManager(mockContractManager as any);
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0xPayerAddress')
    };
  });

  it('should call contract with correct params (authorize)', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const delegateAddress = '0xDelegateAddress';
    await sessionJobManager.authorizeDelegate(delegateAddress, true);

    expect(mockAuthorizeDelegate).toHaveBeenCalledWith(delegateAddress, true);
  });

  it('should call contract with correct params (revoke)', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const delegateAddress = '0xDelegateAddress';
    await sessionJobManager.authorizeDelegate(delegateAddress, false);

    expect(mockAuthorizeDelegate).toHaveBeenCalledWith(delegateAddress, false);
  });

  it('should return transaction hash', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const txHash = await sessionJobManager.authorizeDelegate('0xDelegate', true);

    expect(txHash).toBe('0xdelegatetxhash');
  });

  it('should throw if signer not set', async () => {
    await expect(
      sessionJobManager.authorizeDelegate('0xDelegate', true)
    ).rejects.toThrow('Signer not set');
  });

  it('should connect with signer before calling', async () => {
    await sessionJobManager.setSigner(mockSigner);
    await sessionJobManager.authorizeDelegate('0xDelegate', true);

    expect(mockJobMarketplace.connect).toHaveBeenCalledWith(mockSigner);
  });
});
