// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * RPC usage after the Alchemy shutdown (docs/development/IMPLEMENTATION-RPC-USAGE.md R1–R5): one provider per
 * (chain, url) with its network fixed — no per-second detection storm when the RPC is down — the chain verified once,
 * explicitly; getPaymentHistory removed.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { sharedRpcProvider, verifyRpcChain, __resetSharedProvidersForTests } from '../../src/utils/rpc-provider';
import { createReadOnlyProvider } from '../../src/utils/BrowserProvider';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { AuthManager } from '../../src/managers/AuthManager';
import { realSdk } from '../helpers/sdk-instance';

const URL = 'http://127.0.0.1:1/rpc'; // nothing listens there: a request would fail
const KEY = '0x' + '2'.repeat(64);

afterEach(() => {
  vi.restoreAllMocks();
  __resetSharedProvidersForTests();
});

describe('R1 — one provider per (chain, url), its network fixed', () => {
  test('the same chain and url share one provider; another url or chain gets its own', () => {
    const a = sharedRpcProvider(URL, 84532);
    expect(sharedRpcProvider(URL, 84532)).toBe(a);
    expect(sharedRpcProvider(URL + '2', 84532)).not.toBe(a);
    expect(sharedRpcProvider(URL, 8453)).not.toBe(a);
  });

  test('the network is fixed: getNetwork asks the RPC nothing (no detection, no retry loop)', async () => {
    const p = sharedRpcProvider(URL, 84532);
    const transport = vi.spyOn(p as any, '_send');
    expect((await p.getNetwork()).chainId).toBe(84532n);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('R3 — the chain is verified once, explicitly', () => {
  test('one eth_chainId; a success is remembered', async () => {
    const p = sharedRpcProvider(URL, 84532);
    const send = vi.spyOn(p, 'send').mockResolvedValue('0x14a34');
    await verifyRpcChain(p, 84532);
    await verifyRpcChain(p, 84532);
    expect(send.mock.calls).toEqual([['eth_chainId', []]]);
  });

  test('another chain: RPC_CHAIN_MISMATCH, not retryable', async () => {
    const p = sharedRpcProvider(URL, 84532);
    vi.spyOn(p, 'send').mockResolvedValue('0x2105'); // 8453
    await expect(verifyRpcChain(p, 84532)).rejects.toMatchObject({
      code: 'RPC_CHAIN_MISMATCH', details: { retryable: false, expected: 84532, actual: 8453 },
    });
  });

  test('an RPC that never answers: NETWORK_UNREACHABLE (retryable) within the bound — and not remembered', async () => {
    const p = sharedRpcProvider(URL, 84532);
    const send = vi.spyOn(p, 'send').mockImplementationOnce(() => new Promise(() => {}));
    await expect(verifyRpcChain(p, 84532, { timeoutMs: 20 })).rejects.toMatchObject({ code: 'NETWORK_UNREACHABLE', details: { retryable: true } });
    send.mockResolvedValue('0x14a34');
    await verifyRpcChain(p, 84532);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('an RPC that refuses: NETWORK_UNREACHABLE (retryable), with the cause', async () => {
    const p = sharedRpcProvider(URL, 84532);
    const refused = new Error('connect ECONNREFUSED');
    vi.spyOn(p, 'send').mockRejectedValue(refused);
    await expect(verifyRpcChain(p, 84532)).rejects.toMatchObject({ code: 'NETWORK_UNREACHABLE', details: { retryable: true, cause: refused } });
  });
});

describe('R2 — the SDK builds its providers through it', () => {
  test('the read provider', () => {
    const s = realSdk();
    s.initializeReadProvider();
    expect(s.readProvider).toBe(sharedRpcProvider(s.config.rpcUrl, 84532));
  });

  test('the private-key sign-in: the signer is on the shared provider', async () => {
    const s = realSdk();
    s.config.hostOnly = true;
    await s.authenticateWithPrivateKey(KEY);
    expect(s.provider).toBe(sharedRpcProvider(s.config.rpcUrl, 84532));
    expect(s.signer.provider).toBe(s.provider);
  });

  test('the exported createReadOnlyProvider takes the chain id and shares', () => {
    expect(createReadOnlyProvider(URL, 84532)).toBe(sharedRpcProvider(URL, 84532));
  });

  test('AuthManager\'s private-key path', async () => {
    const m = new AuthManager();
    await m.authenticate('private-key', { privateKey: KEY, rpcUrl: URL });
    expect((m as any).provider).toBe(sharedRpcProvider(URL, AuthManager.BASE_SEPOLIA_CHAIN_ID));
  });
});

test('R4 — the sign-in\'s parity check verifies the RPC\'s chain first: a wrong-chain rpcUrl refuses RPC_CHAIN_MISMATCH', async () => {
  const s = realSdk();
  s.initializeReadProvider();
  vi.spyOn(s.readProvider, 'send').mockResolvedValue('0x2105');
  s.signer = { provider: s.readProvider };
  await expect(s.assertReadWriteChainParity()).rejects.toMatchObject({ code: 'RPC_CHAIN_MISMATCH' });
});

test('R5 — getPaymentHistory is gone', () => {
  expect((PaymentManager.prototype as any).getPaymentHistory).toBeUndefined();
});
