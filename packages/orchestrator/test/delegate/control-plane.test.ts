import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegateControlPlane } from '../../src/delegate/control-plane';

/** Sub-phase 5.2 — delegate control plane (status / payer). */

const DELEGATE = '0x3333333333333333333333333333333333333333';
const PAYER = '0x2222222222222222222222222222222222222222';

function mockSdk(auth = { authorized: true, remaining: 50000000n }) {
  const getDelegateAuthorization = vi.fn().mockResolvedValue(auth);
  return { sdk: { getPaymentManager: () => ({ getDelegateAuthorization }) } as any, getDelegateAuthorization };
}
function res() {
  const r: any = {};
  r.status = vi.fn(() => r); r.json = vi.fn((o: any) => { r.body = o; return r; });
  return r;
}

describe('delegate control plane (5.2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /v1/delegate/status returns delegate address + getDelegateAuthorization result', async () => {
    const { sdk, getDelegateAuthorization } = mockSdk();
    const cp = new DelegateControlPlane({ sdk, delegateAddress: DELEGATE, chainId: 84532, initialPayer: PAYER });
    const r = res();
    await cp.handleStatus({} as any, r);
    expect(getDelegateAuthorization).toHaveBeenCalledWith({ payer: PAYER, delegate: DELEGATE });
    expect(r.body).toMatchObject({ delegateAddress: DELEGATE, payer: PAYER, authorized: true, chainId: 84532 });
  });

  it('allowanceRemaining is a raw base-units decimal STRING (never a JS number)', async () => {
    const { sdk } = mockSdk({ authorized: true, remaining: 50000000n });
    const cp = new DelegateControlPlane({ sdk, delegateAddress: DELEGATE, chainId: 84532, initialPayer: PAYER });
    const r = res();
    await cp.handleStatus({} as any, r);
    expect(typeof r.body.allowanceRemaining).toBe('string');
    expect(r.body.allowanceRemaining).toBe('50000000');
  });

  it('status with no payer → payer null, authorized false, allowance 0 (no chain read)', async () => {
    const { sdk, getDelegateAuthorization } = mockSdk();
    const cp = new DelegateControlPlane({ sdk, delegateAddress: DELEGATE, chainId: 84532 });
    const r = res();
    await cp.handleStatus({} as any, r);
    expect(r.body).toMatchObject({ payer: null, authorized: false, allowanceRemaining: '0' });
    expect(getDelegateAuthorization).not.toHaveBeenCalled();
  });

  it('POST /v1/delegate/payer sets the payer and reflects it in status', async () => {
    const { sdk } = mockSdk();
    const cp = new DelegateControlPlane({ sdk, delegateAddress: DELEGATE, chainId: 84532 });
    const r = res();
    await cp.handlePayer({ body: { payer: PAYER } } as any, r);
    expect(cp.getPayer()).toBe(PAYER);
    expect(r.body.payer).toBe(PAYER);
  });

  it('POST /v1/delegate/payer rejects a malformed address with 400', async () => {
    const { sdk } = mockSdk();
    const cp = new DelegateControlPlane({ sdk, delegateAddress: DELEGATE, chainId: 84532 });
    const r = res();
    await cp.handlePayer({ body: { payer: 'not-an-address' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(cp.getPayer()).toBeNull();
  });

  it('status reflects authorized=true once the (mocked) chain reads flip', async () => {
    const { sdk, getDelegateAuthorization } = mockSdk({ authorized: false, remaining: 0n });
    const cp = new DelegateControlPlane({ sdk, delegateAddress: DELEGATE, chainId: 84532, initialPayer: PAYER });
    let r = res();
    await cp.handleStatus({} as any, r);
    expect(r.body.authorized).toBe(false);
    getDelegateAuthorization.mockResolvedValue({ authorized: true, remaining: 1000n });
    r = res();
    await cp.handleStatus({} as any, r);
    expect(r.body.authorized).toBe(true);
    expect(r.body.allowanceRemaining).toBe('1000');
  });
});
