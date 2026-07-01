// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 1.1 — EntryPoint v0.7 userOpHash + packing helpers (RED → GREEN).
 *
 * Pure, offline tests for the single most error-prone piece (v0.7 packing).
 * The `userOpHashV07` value test is anchored to an ON-CHAIN reference vector
 * minted from the deployed EntryPoint v0.7 `getUserOpHash` view — see
 * tests/integration/userop-hash-v07-onchain.test.ts. A green offline test with
 * a hand-typed constant is NOT sufficient; the oracle is the authority.
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import {
  pack2x128,
  getInitCode,
  getPaymasterAndData,
  userOpHashV07,
  type UnpackedUserOpV07,
} from '../../src/wallet/userop/userOpHashV07';

// Canonical EntryPoint v0.7 (same address on every chain).
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const CHAIN_ID = 84532;

// Fixed no-deploy (no factory) op WITH paymaster. Signature is excluded from
// the userOpHash, so its value is irrelevant to the vector.
const FIXTURE: UnpackedUserOpV07 = {
  sender: '0x1111111111111111111111111111111111111111',
  nonce: 7n,
  callData:
    '0xb61d27f6000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000400deadbeef00000000000000000000000000000000000000000000000000000000',
  callGasLimit: 100000n,
  verificationGasLimit: 200000n,
  preVerificationGas: 50000n,
  maxFeePerGas: 1500000000n,
  maxPriorityFeePerGas: 1000000000n,
  paymaster: '0x3333333333333333333333333333333333333333',
  paymasterVerificationGasLimit: 80000n,
  paymasterPostOpGasLimit: 40000n,
  paymasterData: '0xcafe',
};

// On-chain reference vector from EntryPoint v0.7 getUserOpHash(FIXTURE @ 84532).
// Minted via: RUN_USEROP_ORACLE=1 pnpm exec vitest run tests/integration/userop-hash-v07-onchain.test.ts
const EXPECTED = '0x4150d9ec7866c0c8ad4458047e869dcbeb954b8618629aefe9d9e4321b062524';

describe('pack2x128', () => {
  it('packs hi into the high 128 bits and lo into the low 128 bits', () => {
    expect(pack2x128(200000n, 100000n)).toBe((200000n << 128n) | 100000n);
    expect(pack2x128(0n, 0n)).toBe(0n);
  });
});

describe('getInitCode', () => {
  it('returns 0x when no factory', () => {
    expect(getInitCode(FIXTURE)).toBe('0x');
    expect(getInitCode({ ...FIXTURE, factory: '0x', factoryData: '0xabcd' })).toBe('0x');
  });

  it('concatenates factory + factoryData when a factory is present', () => {
    const factory = '0x4444444444444444444444444444444444444444';
    const factoryData = '0x5af06baf';
    const got = getInitCode({ ...FIXTURE, factory, factoryData });
    expect(got.toLowerCase()).toBe(ethers.concat([factory, factoryData]).toLowerCase());
    expect(got.length).toBe(2 + 40 + 8); // 0x + 20-byte factory + 4-byte data
  });
});

describe('getPaymasterAndData', () => {
  it('returns 0x when no paymaster', () => {
    expect(getPaymasterAndData({ ...FIXTURE, paymaster: null })).toBe('0x');
  });

  it('packs paymaster + 16-byte pmVerificationGasLimit + 16-byte pmPostOpGasLimit + paymasterData', () => {
    const got = getPaymasterAndData(FIXTURE);
    // 20-byte address + 16 + 16 + 2-byte data = 54 bytes
    expect(ethers.dataLength(got)).toBe(20 + 16 + 16 + 2);
    expect(ethers.dataSlice(got, 0, 20).toLowerCase()).toBe(FIXTURE.paymaster!.toLowerCase());
    expect(BigInt(ethers.dataSlice(got, 20, 36))).toBe(FIXTURE.paymasterVerificationGasLimit);
    expect(BigInt(ethers.dataSlice(got, 36, 52))).toBe(FIXTURE.paymasterPostOpGasLimit);
    expect(ethers.dataSlice(got, 52).toLowerCase()).toBe(FIXTURE.paymasterData!.toLowerCase());
  });
});

describe('userOpHashV07', () => {
  it('returns a 32-byte hash', () => {
    expect(ethers.dataLength(userOpHashV07(FIXTURE, ENTRY_POINT, CHAIN_ID))).toBe(32);
  });

  it('equals the on-chain EntryPoint v0.7 reference vector', () => {
    expect(userOpHashV07(FIXTURE, ENTRY_POINT, CHAIN_ID)).toBe(EXPECTED);
  });

  it('changes when any hashed field changes (e.g. nonce)', () => {
    const a = userOpHashV07(FIXTURE, ENTRY_POINT, CHAIN_ID);
    const b = userOpHashV07({ ...FIXTURE, nonce: 8n }, ENTRY_POINT, CHAIN_ID);
    expect(a).not.toBe(b);
  });
});
