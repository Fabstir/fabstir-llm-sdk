// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 1.2 — SimpleAccount v0.7 calldata + counterfactual address (RED → GREEN).
 *
 * `encodeExecute`/`encodeFactoryData`/`getInitCodeFor` are pure ABI encoders;
 * `getCounterfactualAddress` derives the undeployed SA address via the
 * authoritative EntryPoint `getSenderAddress` revert-trick (parses the
 * `SenderAddressResult(address)` custom error). No network — provider mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import { ethers } from 'ethers';
import {
  encodeExecute,
  encodeFactoryData,
  getInitCodeFor,
  getCounterfactualAddress,
} from '../../src/wallet/userop/SimpleAccountV07';

const FACTORY = '0x4444444444444444444444444444444444444444';
const OWNER = '0x9999999999999999999999999999999999999999';
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const SA_ADDR = '0x55555555555555555555555555555555aabbccdd';

describe('encodeExecute', () => {
  it('decodes back to execute(address,uint256,bytes) with the given args', () => {
    const to = '0x2222222222222222222222222222222222222222';
    const data = '0xdeadbeef';
    const encoded = encodeExecute(to, 123n, data);
    const iface = new ethers.Interface(['function execute(address,uint256,bytes)']);
    const [d, v, f] = iface.decodeFunctionData('execute', encoded);
    expect(d.toLowerCase()).toBe(to.toLowerCase());
    expect(v).toBe(123n);
    expect(f.toLowerCase()).toBe(data.toLowerCase());
  });
});

describe('encodeFactoryData', () => {
  it('decodes back to createAccount(address,uint256) with (owner, salt)', () => {
    const encoded = encodeFactoryData(OWNER, 0n);
    const iface = new ethers.Interface(['function createAccount(address,uint256)']);
    const [owner, salt] = iface.decodeFunctionData('createAccount', encoded);
    expect(owner.toLowerCase()).toBe(OWNER.toLowerCase());
    expect(salt).toBe(0n);
  });

  it('defaults salt to 0n', () => {
    expect(encodeFactoryData(OWNER)).toBe(encodeFactoryData(OWNER, 0n));
  });
});

describe('getInitCodeFor', () => {
  it('is factory(20) ++ createAccount calldata', () => {
    const initCode = getInitCodeFor(FACTORY, OWNER, 0n);
    expect(ethers.dataSlice(initCode, 0, 20).toLowerCase()).toBe(FACTORY.toLowerCase());
    expect(ethers.dataSlice(initCode, 20).toLowerCase()).toBe(encodeFactoryData(OWNER, 0n).toLowerCase());
  });
});

describe('getCounterfactualAddress', () => {
  function rejectingProvider(data: string) {
    return {
      call: vi.fn().mockRejectedValue(Object.assign(new Error('execution reverted'), { data })),
    } as any;
  }

  it('parses the address from a SenderAddressResult revert', async () => {
    const errIface = new ethers.Interface(['error SenderAddressResult(address sender)']);
    const revertData = errIface.encodeErrorResult('SenderAddressResult', [SA_ADDR]);
    const provider = rejectingProvider(revertData);
    const got = await getCounterfactualAddress(provider, {
      entryPoint: ENTRY_POINT,
      factory: FACTORY,
      owner: OWNER,
      salt: 0n,
    });
    expect(got).toBe(ethers.getAddress(SA_ADDR));
    expect(provider.call).toHaveBeenCalledWith(
      expect.objectContaining({ to: ENTRY_POINT }),
    );
  });

  it('throws (no fallback) when the revert is NOT SenderAddressResult', async () => {
    const errIface = new ethers.Interface(['error Error(string reason)']);
    const revertData = errIface.encodeErrorResult('Error', ['nope']);
    const provider = rejectingProvider(revertData);
    await expect(
      getCounterfactualAddress(provider, { entryPoint: ENTRY_POINT, factory: FACTORY, owner: OWNER }),
    ).rejects.toThrow();
  });

  it('throws when getSenderAddress unexpectedly does NOT revert', async () => {
    const provider = { call: vi.fn().mockResolvedValue('0x') } as any;
    await expect(
      getCounterfactualAddress(provider, { entryPoint: ENTRY_POINT, factory: FACTORY, owner: OWNER }),
    ).rejects.toThrow();
  });
});
