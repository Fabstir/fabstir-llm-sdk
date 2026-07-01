// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * buildSmartDelegate — wraps the daemon's stable hot EOA (the SimpleAccount
 * OWNER) into a gasless ERC-4337 v0.7 delegate: derives the counterfactual SA
 * address (fixed salt 0, Constraint 8), builds the bundler/paymaster sendUserOp,
 * and returns a drop-in AASigner whose getAddress() is the SA address.
 *
 * The AASigner is constructed WITH a chain-matching provider as its 2nd ctor arg
 * (Constraint 7 — authenticateWithSigner adopts signer.provider and the delegate
 * preflight reads it). The SA address is persisted in a sidecar next to the key
 * (cache/visibility only — derivation is canonical); the private key is NEVER
 * written or logged. No fallbacks — a missing factory throws.
 */

import { ethers } from 'ethers';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { AASigner, createBundlerSendUserOp, getCounterfactualAddress } from '@fabstir/sdk-core';

export interface BuildSmartDelegateInput {
  /** Stable hot-EOA private key (the SimpleAccount owner). Never persisted/logged here. */
  eoaKey: string;
  rpcUrl: string;
  chainId: number;
  entryPoint: string;
  factory: string;
  bundlerUrl: string;
  paymasterUrl: string;
  /** Sidecar path for the cached SA address (next to the key file). */
  addrPath: string;
  /** Fixed at 0n for stable identity (Constraint 8). */
  salt?: bigint;
  /** ERC-7677 paymaster context (Pimlico/Alchemy policy id); `{}` for CDP. */
  paymasterContext?: object;
  autoDeploy?: boolean; // pre-deploy the SA on first use when the owner is funded
  provider?: ethers.JsonRpcProvider; // injectable (chain-matching); defaults to JsonRpcProvider(rpcUrl)
  log?: (msg: string) => void; // never receives the key
}

/**
 * Pre-deploy the SimpleAccount via the owner EOA when undeployed + funded. CDP can't sponsor a
 * *deploying* op, so pre-deploying lets every session op be gasless. A 0-ETH owner is skipped
 * (logged) — the in-op factory path then handles deploy-capable paymasters (Pimlico/Alchemy).
 */
export async function ensureSmartAccountDeployed(opts: {
  address: string;
  owner: ethers.Signer;
  factory: string;
  salt: bigint;
  provider: ethers.Provider;
  log?: (msg: string) => void;
}): Promise<'already' | 'deployed' | 'skipped-unfunded'> {
  const code = await opts.provider.getCode(opts.address);
  if (code && code !== '0x') return 'already';
  const ownerAddr = await opts.owner.getAddress();
  if ((await opts.provider.getBalance(ownerAddr)) === 0n) {
    opts.log?.(`SA ${opts.address} undeployed and owner ${ownerAddr} has 0 ETH — cannot auto-pre-deploy (CDP can't sponsor a deploying op). Fund the owner ~0.0002 ETH once, or pre-deploy via SimpleAccountFactory.createAccount.`);
    return 'skipped-unfunded';
  }
  const data = new ethers.Interface(['function createAccount(address,uint256)']).encodeFunctionData('createAccount', [ownerAddr, opts.salt]);
  const tx = await opts.owner.sendTransaction({ to: opts.factory, data });
  await tx.wait(1);
  opts.log?.(`Auto-pre-deployed SimpleAccount ${opts.address} (one-time owner-funded tx ${tx.hash})`);
  return 'deployed';
}

export interface SmartDelegate {
  signer: AASigner;
  address: string;
  owner: ethers.Wallet;
}

export async function buildSmartDelegate(input: BuildSmartDelegateInput): Promise<SmartDelegate> {
  if (!input.factory) {
    throw new Error('FABSTIR_ACCOUNT_FACTORY is required for gasless delegate mode (no fallback)');
  }
  const salt = input.salt ?? 0n;
  const provider = input.provider ?? new ethers.JsonRpcProvider(input.rpcUrl);
  const owner = new ethers.Wallet(input.eoaKey, provider);

  // Reuse the cached SA address ONLY when it belongs to the CURRENT owner. The SA
  // address derives from the owner, so rotating/regenerating the hot key changes it
  // (Constraint 8). The sidecar is `<owner>:<saAddress>` so a stale entry from a
  // different owner is ignored and re-derived, never silently served.
  let address: string | undefined;
  if (existsSync(input.addrPath)) {
    const [cachedOwner, cachedAddr] = readFileSync(input.addrPath, 'utf8').trim().split(':');
    if (cachedOwner && cachedAddr && ethers.getAddress(cachedOwner) === owner.address) {
      address = ethers.getAddress(cachedAddr); // validates + checksums
    }
  }
  if (!address) {
    address = await getCounterfactualAddress(provider, {
      entryPoint: input.entryPoint,
      factory: input.factory,
      owner: owner.address,
      salt,
    });
    mkdirSync(dirname(input.addrPath), { recursive: true });
    writeFileSync(input.addrPath, `${owner.address}:${address}`, { mode: 0o600 }); // SA address only — never the key
  }

  if (input.autoDeploy) {
    await ensureSmartAccountDeployed({ address, owner, factory: input.factory, salt, provider, log: input.log });
  }

  const sendUserOp = createBundlerSendUserOp({
    bundlerUrl: input.bundlerUrl,
    paymasterUrl: input.paymasterUrl,
    entryPoint: input.entryPoint,
    chainId: input.chainId,
    accountAddress: address,
    owner,
    rpcProvider: provider,
    factory: input.factory,
    salt,
    paymasterContext: input.paymasterContext,
  });

  // Provider as the 2nd ctor arg — load-bearing for the delegate preflight (Constraint 7).
  const signer = new AASigner(
    { smartAccountAddress: address, eoaPrivateKey: input.eoaKey, sendUserOp, chainId: input.chainId },
    provider,
  );
  return { signer, address, owner };
}
