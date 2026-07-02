// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 5.1: verifyAttestation — input-binding LIVE; integrity inert; signature optional; merkle.
import { describe, it, expect, vi } from 'vitest';
import { getBytes } from 'ethers';
import vectors from './vectors.json';
import { LtxManager } from '../../src/managers/LtxManager';

const result: any = {
  outputCID: vectors.outputCID, proofCID: 'bProof',
  manifest: vectors.attestation.manifest, frames: [],
  billing: { unit: 'megapixel-frame', tokens: vectors.tokens.value },
};

function makeManager(over: any = {}) {
  const storageManager = {
    getByCID: vi.fn(async () => over.attestation ?? vectors.attestation),
    getRawBytes: vi.fn(async () => getBytes(vectors.proofHashInput)),
  };
  return new LtxManager({ storageManager, jobMarketplace: over.jobMarketplace, ltxModelId: '0x01', usdcAddress: '0xabc' } as any);
}

describe('LtxManager.verifyAttestation (SP5.1)', () => {
  it('input-binding passes and merkle is valid for the matching job', async () => {
    const v = await makeManager().verifyAttestation(vectors.job as any, result);
    expect(v.inputBinding).toBe(true);
    expect(v.merkleValid).toBe(true);
  });

  it('throws LTX_INPUT_BINDING_MISMATCH on a tampered job field', async () => {
    await expect(makeManager().verifyAttestation({ ...vectors.job, prompt: 'tampered' } as any, result))
      .rejects.toMatchObject({ code: 'LTX_INPUT_BINDING_MISMATCH' });
  });

  it('throws LTX_INPUT_BINDING_MISMATCH when templateHash differs', async () => {
    await expect(makeManager().verifyAttestation({ ...vectors.job, templateHash: '0x' + 'de'.repeat(32) } as any, result))
      .rejects.toMatchObject({ code: 'LTX_INPUT_BINDING_MISMATCH' });
  });

  it('skips integrity cleanly when no on-chain proof exists (Constraint 3, deferred slice)', async () => {
    const m = makeManager({ jobMarketplace: { getProofSubmission: vi.fn(async () => ({ proofHash: '0x' + '00'.repeat(32) })) } });
    const v = await m.verifyAttestation(vectors.job as any, result, { sessionId: 5n });
    expect(v.integrity).toBe('skipped');
  });

  it('verifies integrity against the on-chain proofHash when present', async () => {
    const m = makeManager({ jobMarketplace: { getProofSubmission: vi.fn(async () => ({ proofHash: vectors.proofHash })) } });
    const v = await m.verifyAttestation(vectors.job as any, result, { sessionId: 5n });
    expect(v.integrity).toBe('ok');
  });

  it('recovers the signer when signed; skips when absent (Constraint 4)', async () => {
    const signed = await makeManager().verifyAttestation(vectors.job as any, result);
    expect(signed.signer?.toLowerCase()).toBe(vectors.signer.toLowerCase());
    expect(signed.signatureValid).toBe(true);

    const m2 = makeManager({ attestation: { ...vectors.attestation, signature: undefined } });
    const unsigned = await m2.verifyAttestation(vectors.job as any, result);
    expect(unsigned.signer).toBeNull();
    expect(unsigned.signatureValid).toBeNull();
  });

  it('degrades to signatureValid=false (never throws) on a malformed present signature', async () => {
    const m = makeManager({ attestation: { ...vectors.attestation, signature: '0xdeadbeef' } });
    const v = await m.verifyAttestation(vectors.job as any, result);
    expect(v.inputBinding).toBe(true);
    expect(v.signer).toBeNull();
    expect(v.signatureValid).toBe(false);
  });
});
