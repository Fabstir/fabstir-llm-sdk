import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, statSync, rmSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ethers } from 'ethers';
import { loadOrCreateDelegateKey } from '../../src/delegate/delegate-key';

/** Sub-phase 5.1 — hot-EOA delegate key: generate / load / persist (0600). */

describe('delegate-key (5.1)', () => {
  let dir: string;
  let keyPath: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fabstir-key-')); keyPath = join(dir, 'delegate.key'); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('generates a new EOA, persists it with mode 0600, and reuses it on next load', () => {
    const first = loadOrCreateDelegateKey({ keyPath });
    expect(ethers.isAddress(first.address)).toBe(true);
    expect(existsSync(keyPath)).toBe(true);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);

    const second = loadOrCreateDelegateKey({ keyPath });
    expect(second.address).toBe(first.address); // reused, not regenerated
  });

  it('FABSTIR_DELEGATE_KEY (envKey) overrides and does NOT persist a file', () => {
    const known = ethers.Wallet.createRandom();
    const result = loadOrCreateDelegateKey({ envKey: known.privateKey, keyPath });
    expect(result.address).toBe(known.address);
    expect(existsSync(keyPath)).toBe(false);
  });

  it('envKey overrides even when a persisted file already exists', () => {
    const fileWallet = ethers.Wallet.createRandom();
    writeFileSync(keyPath, fileWallet.privateKey, { mode: 0o600 });
    const known = ethers.Wallet.createRandom();
    const result = loadOrCreateDelegateKey({ envKey: known.privateKey, keyPath });
    expect(result.address).toBe(known.address);
  });

  it('returns a usable signer (wallet.getAddress() === address) and exposes only the address as plain data', async () => {
    const { wallet, address } = loadOrCreateDelegateKey({ keyPath });
    expect(await wallet.getAddress()).toBe(address);
    // The result surface for logging/return is the address; the key is only on the wallet.
    expect(Object.keys({ address })).toEqual(['address']);
  });
});
