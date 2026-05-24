// Hot-EOA delegate key for the local daemon: load from FABSTIR_DELEGATE_KEY,
// else from a persisted file (~/.fabstir/delegate.key, mode 0600), else generate
// and persist one. The private key is never logged or returned — only the address.
import { ethers } from 'ethers';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

export interface DelegateKeyOptions {
  /** FABSTIR_DELEGATE_KEY — overrides the persisted file and is NOT persisted. */
  envKey?: string;
  /** Defaults to ~/.fabstir/delegate.key. */
  keyPath?: string;
  /** Provider to connect the wallet to (for the daemon's signing path). */
  provider?: ethers.Provider;
}

export interface DelegateKeyResult {
  wallet: ethers.Wallet;
  address: string;
}

export function defaultDelegateKeyPath(): string {
  return join(homedir(), '.fabstir', 'delegate.key');
}

export function loadOrCreateDelegateKey(opts: DelegateKeyOptions = {}): DelegateKeyResult {
  const keyPath = opts.keyPath ?? defaultDelegateKeyPath();

  let privateKey: string;
  if (opts.envKey) {
    privateKey = opts.envKey.trim();
  } else if (existsSync(keyPath)) {
    privateKey = readFileSync(keyPath, 'utf8').trim();
  } else {
    privateKey = ethers.Wallet.createRandom().privateKey;
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, privateKey, { mode: 0o600 });
    chmodSync(keyPath, 0o600); // enforce even if umask widened the create mode
  }

  const base = new ethers.Wallet(privateKey);
  const wallet = (opts.provider ? base.connect(opts.provider) : base) as ethers.Wallet;
  return { wallet, address: base.address };
}
