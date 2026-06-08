// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 3.1 — buildSmartDelegate (RED → GREEN).
 *
 * Derives the counterfactual SimpleAccount address (fixed salt 0, Constraint 8),
 * wires createBundlerSendUserOp into an AASigner (provider as the 2nd ctor arg,
 * Constraint 7), and persists the SA address in a sidecar next to the key
 * (cache only — never the private key). sdk-core + fs are mocked (no network).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Checksummed so the owner-keyed cache path (which validates via ethers.getAddress) compares exactly.
const { SA } = vi.hoisted(() => ({ SA: '0x55555555555555555555555555555555aabBCcdd' }));

vi.mock('@fabstir/sdk-core', () => ({
  getCounterfactualAddress: vi.fn().mockResolvedValue(SA),
  createBundlerSendUserOp: vi.fn().mockReturnValue(vi.fn()),
  AASigner: vi.fn().mockImplementation((opts: any, provider: any) => ({
    getAddress: async () => opts.smartAccountAddress,
    _opts: opts,
    _provider: provider,
  })),
}));
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(SA),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
}));

import { getCounterfactualAddress, createBundlerSendUserOp, AASigner } from '@fabstir/sdk-core';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { buildSmartDelegate, ensureSmartAccountDeployed } from '../../src/delegate/smart-account';

const EOA_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const OWNER = new ethers.Wallet(EOA_KEY).address;

function baseInput(over: Record<string, unknown> = {}) {
  return {
    eoaKey: EOA_KEY,
    rpcUrl: 'https://rpc.example',
    chainId: 84532,
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    factory: '0x4444444444444444444444444444444444444444',
    bundlerUrl: 'https://bundler',
    paymasterUrl: 'https://pm',
    addrPath: '/tmp/delegate.key.sa',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (existsSync as any).mockReturnValue(false);
  (readFileSync as any).mockReturnValue(SA);
});

describe('buildSmartDelegate', () => {
  it('derives the SA with fixed salt 0 and returns address + signer bound to that SA', async () => {
    const out = await buildSmartDelegate(baseInput());
    expect(out.address).toBe(SA);
    expect(await out.signer.getAddress()).toBe(SA);

    expect(getCounterfactualAddress).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ owner: OWNER, salt: 0n }),
    );
    expect(createBundlerSendUserOp).toHaveBeenCalledWith(
      expect.objectContaining({ accountAddress: SA, salt: 0n, factory: baseInput().factory }),
    );
  });

  it('constructs the AASigner with a provider as the 2nd ctor arg (Constraint 7)', async () => {
    await buildSmartDelegate(baseInput());
    const [opts, provider] = (AASigner as any).mock.calls.at(-1);
    expect(opts.smartAccountAddress).toBe(SA);
    expect(provider).toBeTruthy(); // non-null provider — delegate preflight reads signer.provider
  });

  it('persists the SA address (owner-keyed) to the sidecar; reuses it (no re-derivation) when the owner matches', async () => {
    await buildSmartDelegate(baseInput());
    // Sidecar is "<owner>:<saAddress>" so a rotated key can't be served a stale address.
    expect(writeFileSync).toHaveBeenCalledWith('/tmp/delegate.key.sa', `${OWNER}:${SA}`, expect.objectContaining({ mode: 0o600 }));

    vi.clearAllMocks();
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(`${OWNER}:${SA}`);
    const out2 = await buildSmartDelegate(baseInput());
    expect(out2.address).toBe(SA);
    expect(getCounterfactualAddress).not.toHaveBeenCalled(); // reused from sidecar
  });

  it('IGNORES a stale sidecar from a different owner and re-derives (Constraint 8 — key rotation changes the SA)', async () => {
    const otherOwner = new ethers.Wallet('0x' + '22'.repeat(32)).address;
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(`${otherOwner}:0x1234567890123456789012345678901234567890`);
    const out = await buildSmartDelegate(baseInput());
    expect(getCounterfactualAddress).toHaveBeenCalled(); // stale (wrong-owner) cache ignored → re-derived
    expect(out.address).toBe(SA); // current owner's freshly-derived SA
    expect(writeFileSync).toHaveBeenCalledWith('/tmp/delegate.key.sa', `${OWNER}:${SA}`, expect.objectContaining({ mode: 0o600 }));
  });

  it('NEVER writes or logs the private key', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await buildSmartDelegate(baseInput());
    for (const call of (writeFileSync as any).mock.calls) {
      expect(JSON.stringify(call)).not.toContain(EOA_KEY);
    }
    for (const call of logSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(EOA_KEY);
    }
    logSpy.mockRestore();
  });

  it('throws a clear config error when the factory (FABSTIR_ACCOUNT_FACTORY) is missing (no fallback)', async () => {
    await expect(buildSmartDelegate(baseInput({ factory: '' }))).rejects.toThrow(/FABSTIR_ACCOUNT_FACTORY/);
  });

  it('autoDeploy: checks deployment via the injected provider (already-deployed ⟹ no deploy)', async () => {
    const provider = { getCode: vi.fn().mockResolvedValue('0x6080604052'), getBalance: vi.fn() } as any;
    const out = await buildSmartDelegate(baseInput({ autoDeploy: true, provider }));
    expect(out.address).toBe(SA);
    expect(provider.getCode).toHaveBeenCalled(); // deployment was checked
    expect(provider.getBalance).not.toHaveBeenCalled(); // already deployed → no funding check/deploy
  });
});

const FACTORY = '0x4444444444444444444444444444444444444444';
const SA_DEPLOY = '0x55555555555555555555555555555555aabbccdd';

describe('ensureSmartAccountDeployed', () => {
  const owner = { getAddress: async () => OWNER, sendTransaction: vi.fn() } as any;
  const base = { address: SA_DEPLOY, owner, factory: FACTORY, salt: 0n };

  it('already deployed ⟹ returns "already", never sends a tx', async () => {
    const provider = { getCode: vi.fn().mockResolvedValue('0x6080'), getBalance: vi.fn() } as any;
    expect(await ensureSmartAccountDeployed({ ...base, provider })).toBe('already');
    expect(owner.sendTransaction).not.toHaveBeenCalled();
  });

  it('undeployed + owner has 0 ETH ⟹ "skipped-unfunded", logs guidance, no tx', async () => {
    const provider = { getCode: vi.fn().mockResolvedValue('0x'), getBalance: vi.fn().mockResolvedValue(0n) } as any;
    const log = vi.fn();
    expect(await ensureSmartAccountDeployed({ ...base, provider, log })).toBe('skipped-unfunded');
    expect(owner.sendTransaction).not.toHaveBeenCalled();
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/fund|createAccount|0 ETH/i);
  });

  it('undeployed + owner funded ⟹ sends createAccount(owner, salt) to the factory, waits, "deployed"', async () => {
    const wait = vi.fn().mockResolvedValue({});
    owner.sendTransaction = vi.fn().mockResolvedValue({ hash: '0xtx', wait });
    const provider = { getCode: vi.fn().mockResolvedValue('0x'), getBalance: vi.fn().mockResolvedValue(10n ** 16n) } as any;
    expect(await ensureSmartAccountDeployed({ ...base, provider })).toBe('deployed');
    const tx = owner.sendTransaction.mock.calls.at(-1)[0];
    expect(tx.to.toLowerCase()).toBe(FACTORY.toLowerCase());
    const [o, s] = new ethers.Interface(['function createAccount(address,uint256)']).decodeFunctionData('createAccount', tx.data);
    expect(o.toLowerCase()).toBe(OWNER.toLowerCase());
    expect(s).toBe(0n);
    expect(wait).toHaveBeenCalledWith(1);
  });
});
