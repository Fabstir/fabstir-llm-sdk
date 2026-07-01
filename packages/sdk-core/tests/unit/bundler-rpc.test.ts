// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 2.1 — isomorphic bundler/paymaster JSON-RPC wrapper (RED → GREEN).
 *
 * `fetch`-only ERC-4337 + ERC-7677 client. Validates each wrapper POSTs the
 * right method/params, the ERC-7677 4-element params shape (hex chainId,
 * context object), and that a JSON-RPC error rejects with the server message
 * (no swallow, no fallback). global.fetch is stubbed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  jsonRpc,
  estimateUserOperationGas,
  sendUserOperation,
  getUserOperationReceipt,
  pmGetPaymasterStubData,
  pmGetPaymasterData,
} from '../../src/wallet/userop/bundlerRpc';

const URL = 'https://bundler.example/rpc';
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const CHAIN_ID = 84532;

function stubFetch(responseBody: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => responseBody,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('jsonRpc', () => {
  it('POSTs jsonrpc 2.0 envelope and returns result', async () => {
    const fetchMock = stubFetch({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    const out = await jsonRpc(URL, 'eth_chainId', []);
    expect(out).toEqual({ ok: true });
    const body = lastBody(fetchMock);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('eth_chainId');
    expect(body.params).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(URL, expect.objectContaining({ method: 'POST' }));
  });

  it('rejects with the server-provided error message (no swallow, no fallback)', async () => {
    stubFetch({ jsonrpc: '2.0', id: 1, error: { code: -32521, message: 'AA23 reverted' } });
    await expect(jsonRpc(URL, 'eth_sendUserOperation', [{}])).rejects.toThrow(/AA23 reverted/);
  });

  it('passes an AbortSignal and maps an aborted (timed-out) fetch to BUNDLER_RPC_TIMEOUT', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(jsonRpc(URL, 'pm_getPaymasterStubData', [{}], 5)).rejects.toMatchObject({ code: 'BUNDLER_RPC_TIMEOUT' });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('ERC-4337 wrappers', () => {
  it('estimateUserOperationGas POSTs [userOp, entryPoint]', async () => {
    const fetchMock = stubFetch({ result: { callGasLimit: '0x1' } });
    await estimateUserOperationGas(URL, { sender: '0xabc' }, ENTRY_POINT);
    const body = lastBody(fetchMock);
    expect(body.method).toBe('eth_estimateUserOperationGas');
    expect(body.params).toEqual([{ sender: '0xabc' }, ENTRY_POINT]);
  });

  it('sendUserOperation POSTs [userOp, entryPoint]', async () => {
    const fetchMock = stubFetch({ result: '0xhash' });
    await sendUserOperation(URL, { sender: '0xabc' }, ENTRY_POINT);
    expect(lastBody(fetchMock).method).toBe('eth_sendUserOperation');
    expect(lastBody(fetchMock).params[1]).toBe(ENTRY_POINT);
  });

  it('getUserOperationReceipt POSTs [userOpHash]', async () => {
    const fetchMock = stubFetch({ result: null });
    await getUserOperationReceipt(URL, '0xdead');
    expect(lastBody(fetchMock).method).toBe('eth_getUserOperationReceipt');
    expect(lastBody(fetchMock).params).toEqual(['0xdead']);
  });
});

describe('ERC-7677 paymaster wrappers', () => {
  it.each([
    ['pm_getPaymasterStubData', pmGetPaymasterStubData],
    ['pm_getPaymasterData', pmGetPaymasterData],
  ])('%s sends 4-element params: [userOp, entryPoint, hexChainId, context]', async (method, fn) => {
    const fetchMock = stubFetch({ result: { paymaster: '0xpm' } });
    await (fn as any)(URL, { sender: '0xabc' }, ENTRY_POINT, CHAIN_ID);
    const body = lastBody(fetchMock);
    expect(body.method).toBe(method);
    expect(body.params).toHaveLength(4);
    expect(body.params[1]).toBe(ENTRY_POINT);
    expect(body.params[2]).toBe('0x14a34'); // hex of 84532, NOT decimal
    expect(typeof body.params[3]).toBe('object');
    expect(body.params[3]).toEqual({});
  });

  it('passes a non-empty context through (Pimlico/Alchemy policy id)', async () => {
    const fetchMock = stubFetch({ result: {} });
    await pmGetPaymasterData(URL, {}, ENTRY_POINT, CHAIN_ID, { sponsorshipPolicyId: 'sp_x' });
    expect(lastBody(fetchMock).params[3]).toEqual({ sponsorshipPolicyId: 'sp_x' });
  });
});
