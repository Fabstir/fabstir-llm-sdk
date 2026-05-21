// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 1.1 — Delegate authorization 3-call API on PaymentManager(MultiChain).
 *
 * createDelegateAuthorization / getDelegateAuthorization / revokeDelegate are thin
 * conveniences built on the EXISTING approveToken / checkAllowance + the
 * JobMarketplaceWrapper (getWrapper).authorizeDelegate / isDelegateAuthorized.
 * They operate on the bridge-payer (Constraint 10) so revoke's approve(0) is safe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentManager } from '../../src/managers/PaymentManagerMultiChain';
import { ChainId } from '../../src/types/chain.types';
import { SDKError } from '../../src/types';

const ZERO = '0x0000000000000000000000000000000000000000';
const DELEGATE = '0x1111111111111111111111111111111111111111';
const PAYER = '0x2222222222222222222222222222222222222222';

function makeManager() {
  const pm = new PaymentManager(undefined, ChainId.BASE_SEPOLIA);
  const chain = pm.getChainConfig();
  const mkt = chain.contracts.jobMarketplace;
  const usdc = chain.contracts.usdcToken;

  // Fake wrapper: authorizeDelegate returns an UNWAITED tx with a .wait spy + .hash.
  const authorizeTx = { hash: '0xauthorize', wait: vi.fn().mockResolvedValue({}) };
  const revokeTx = { hash: '0xrevoke', wait: vi.fn().mockResolvedValue({}) };
  const authorizeDelegate = vi
    .fn()
    .mockImplementation((_d: string, authorized: boolean) =>
      Promise.resolve(authorized ? authorizeTx : revokeTx)
    );
  const isDelegateAuthorized = vi.fn().mockResolvedValue(true);
  const fakeWrapper = { authorizeDelegate, isDelegateAuthorized, getContractAddress: () => mkt };
  (pm as any).getWrapper = vi.fn().mockReturnValue(fakeWrapper);

  // Spy on the existing ERC20 helpers — no real chain calls.
  const approveToken = vi
    .spyOn(pm, 'approveToken')
    .mockResolvedValue({ hash: '0xapprove' } as any);
  const checkAllowance = vi.spyOn(pm, 'checkAllowance').mockResolvedValue(123n);

  return { pm, mkt, usdc, authorizeDelegate, isDelegateAuthorized, authorizeTx, revokeTx, approveToken, checkAllowance };
}

describe('PaymentManager delegate authorization API (1.1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createDelegateAuthorization approves the cap THEN authorizes, awaiting wait(3)', async () => {
    const { pm, mkt, usdc, approveToken, authorizeDelegate, authorizeTx } = makeManager();
    const order: string[] = [];
    approveToken.mockImplementation(async () => { order.push('approve'); return { hash: '0xapprove' } as any; });
    authorizeDelegate.mockImplementation(async () => { order.push('authorize'); return authorizeTx; });

    await pm.createDelegateAuthorization({ delegate: DELEGATE, allowanceCap: 50_000_000n });

    expect(approveToken).toHaveBeenCalledWith(mkt, 50_000_000n, usdc);
    expect(authorizeDelegate).toHaveBeenCalledWith(DELEGATE, true);
    expect(order).toEqual(['approve', 'authorize']); // approve precedes authorize
    expect(authorizeTx.wait).toHaveBeenCalledWith(3);
  });

  it('createDelegateAuthorization rejects a zero/native token with DELEGATE_USDC_REQUIRED', async () => {
    const { pm, approveToken, authorizeDelegate } = makeManager();
    await expect(
      pm.createDelegateAuthorization({ delegate: DELEGATE, allowanceCap: 1n, token: ZERO })
    ).rejects.toMatchObject({ code: 'DELEGATE_USDC_REQUIRED' });
    expect(approveToken).not.toHaveBeenCalled();
    expect(authorizeDelegate).not.toHaveBeenCalled();
  });

  it('createDelegateAuthorization returns tx hashes for both on-chain actions', async () => {
    const { pm } = makeManager();
    const res = await pm.createDelegateAuthorization({ delegate: DELEGATE, allowanceCap: 1n });
    expect(res).toEqual({ approveTxHash: '0xapprove', authorizeTxHash: '0xauthorize' });
  });

  it('getDelegateAuthorization returns { authorized, remaining } from isDelegateAuthorized + checkAllowance', async () => {
    const { pm, mkt, usdc, isDelegateAuthorized, checkAllowance } = makeManager();
    const res = await pm.getDelegateAuthorization({ payer: PAYER, delegate: DELEGATE });
    expect(isDelegateAuthorized).toHaveBeenCalledWith(PAYER, DELEGATE);
    expect(checkAllowance).toHaveBeenCalledWith(PAYER, mkt, usdc);
    expect(res).toEqual({ authorized: true, remaining: 123n });
  });

  it('getDelegateAuthorization returns authorized=false when not authorized (no throw)', async () => {
    const { pm, isDelegateAuthorized } = makeManager();
    isDelegateAuthorized.mockResolvedValue(false);
    const res = await pm.getDelegateAuthorization({ payer: PAYER, delegate: DELEGATE });
    expect(res.authorized).toBe(false);
  });

  it('revokeDelegate calls BOTH authorizeDelegate(false) AND approveToken(mkt, 0n, usdc)', async () => {
    const { pm, mkt, usdc, authorizeDelegate, approveToken, revokeTx } = makeManager();
    const res = await pm.revokeDelegate({ delegate: DELEGATE });
    expect(authorizeDelegate).toHaveBeenCalledWith(DELEGATE, false);
    expect(revokeTx.wait).toHaveBeenCalledWith(3);
    expect(approveToken).toHaveBeenCalledWith(mkt, 0n, usdc);
    expect(res).toEqual({ revokeTxHash: '0xrevoke', approveTxHash: '0xapprove' });
  });

  it('revokeDelegate surfaces DELEGATE_REVOKE_INCOMPLETE (with revoke tx hash) if approve(0) fails', async () => {
    const { pm, approveToken } = makeManager();
    approveToken.mockRejectedValue(new Error('approve reverted'));
    await expect(pm.revokeDelegate({ delegate: DELEGATE })).rejects.toMatchObject({
      code: 'DELEGATE_REVOKE_INCOMPLETE',
      details: { revokeTxHash: '0xrevoke' },
    });
  });
});
