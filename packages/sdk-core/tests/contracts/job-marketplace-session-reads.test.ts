// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * The two new wrapper reads, exercised through a fake signer/provider so the CALL PATH is
 * tested, not just the prototype: getSessionJobOnChain must encode `sessionJobs(jobId)` for the
 * configured contract, verify the chain first, and hand the raw bytes to decodeSessionJobWords;
 * getSessionModel must return the bytes32. Predicted profile: GREEN — a RED is a wiring defect.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Interface, zeroPadValue } from 'ethers';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';

const raw = readFileSync(join(__dirname, 'fixtures', 'sessionjobs_931.hex'), 'utf8').trim();
const iface = new Interface(['function sessionJobs(uint256)', 'function sessionModel(uint256) view returns (bytes32)']);
const MODEL = `0x${'7a'.repeat(32)}`;

function fakeProvider(chainId = 84532n, sessionJobsBytes = raw) {
  return {
    getNetwork: vi.fn(async () => ({ chainId })),
    call: vi.fn(async (tx: any) => {
      const selector = (tx.data as string).slice(0, 10);
      if (selector === iface.getFunction('sessionJobs')!.selector) return sessionJobsBytes;
      if (selector === iface.getFunction('sessionModel')!.selector) return zeroPadValue(MODEL, 32);
      throw new Error(`unexpected selector ${selector}`);
    }),
  };
}
function wrapped(chainId = 84532n, opts: { sessionJobsBytes?: string; readProvider?: any; provider?: any } = {}) {
  const provider = 'provider' in opts ? opts.provider : fakeProvider(chainId, opts.sessionJobsBytes);
  const signer: any = {
    provider,
    getAddress: vi.fn(async () => `0x${'ee'.repeat(20)}`),
    call: vi.fn(async (tx: any) => provider.call(tx)),
    resolveName: vi.fn(async (n: string) => n),
  };
  const w = new JobMarketplaceWrapper(84532, signer, opts.readProvider);
  const callsOf = (p: any) => p.call.mock.calls.map((c: any[]) => c[0]);
  return { signer, provider, w, calls: () => callsOf(provider) , callsOf };
}

describe('JobMarketplaceWrapper session reads (call path)', () => {
  it('getSessionJobOnChain encodes sessionJobs(jobId) for the configured contract and decodes the raw words', async () => {
    const { w, calls } = wrapped();
    const s = await w.getSessionJobOnChain(931n);
    expect(calls()).toHaveLength(1);
    expect(calls()[0].to).toBe(w.getContractAddress());
    expect(calls()[0].data).toBe(iface.encodeFunctionData('sessionJobs', [931n]));
    expect(s.id).toBe(931n);
    expect(s.pricePerToken).toBe(904n);
    expect(s.proofTimeoutWindow).toBe(300n);
    expect(s.status).toBe(1);
  });

  it('verifies the chain BEFORE reading — a wrong network never reaches eth_call', async () => {
    const { w, calls } = wrapped(1n);
    await expect(w.getSessionJobOnChain(931n)).rejects.toThrow(/chain/i);
    expect(calls()).toHaveLength(0);
  });

  it('getSessionModel returns the bytes32 the contract holds for the job', async () => {
    const { w } = wrapped();
    expect((await w.getSessionModel(931n)).toLowerCase()).toBe(MODEL);
  });

  it('getSessionModel verifies the chain first too', async () => {
    const { w, calls } = wrapped(1n);
    await expect(w.getSessionModel(931n)).rejects.toThrow(/chain/i);
    expect(calls()).toHaveLength(0);
  });

  it('a signer with no provider is refused with a typed error, not a TypeError', async () => {
    const { w } = wrapped(84532n, { provider: undefined });
    await expect(w.getSessionJobOnChain(931n)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('bad bytes from the chain surface as the typed layout error out of the wrapper — the link the pre-flight relies on', async () => {
    const { w } = wrapped(84532n, { sessionJobsBytes: '0x' + '00'.repeat(700) });
    await expect(w.getSessionJobOnChain(931n)).rejects.toMatchObject({ code: 'SESSION_JOB_LAYOUT_MISMATCH' });
  });

  it('reads ride an injected read provider (rpcUrl), not the wallet, when one is given', async () => {
    // 1.38.1 moved discovery reads off the injected wallet; the pre-flight is the one read
    // standing between a card charge and a spent session, so it must not go back to it.
    const readProvider = fakeProvider();
    const { w, provider, callsOf } = wrapped(84532n, { readProvider });
    await w.getSessionJobOnChain(931n);
    await w.getSessionModel(931n);
    expect(callsOf(readProvider)).toHaveLength(2);
    expect(callsOf(provider)).toHaveLength(0);
    expect(readProvider.getNetwork).toHaveBeenCalled();
    expect(provider.getNetwork).not.toHaveBeenCalled();
  });
});

describe('switchToChain keeps the read provider', () => {
  it('forwards the injected read provider to the new-chain wrapper — otherwise reads fall back to the wallet', async () => {
    const readProvider = fakeProvider();
    const { w } = wrapped(84532n, { readProvider });
    const w2 = await w.switchToChain(84532);
    expect((w2 as any).readProvider).toBe(readProvider);
  });
});
