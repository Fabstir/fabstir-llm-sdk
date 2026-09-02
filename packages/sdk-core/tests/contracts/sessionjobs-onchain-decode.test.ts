// A.3 pre-flight read for ADOPTED sessions: the static head of `sessionJobs(jobId)` decoded from
// RAW words against the deployed 18-slot layout, failing CLOSED on drift. The design doc names
// the 17-field-decode trap (a decoder that survives only behind a masked fallback fails OPEN —
// the exact hole A.3 exists to close), and this repo still carries a 17-output sibling ABI
// (JobMarketplaceWithModels-CLIENT-ABI.json) that would decode the same bytes misaligned. The
// live fixture pins the chain; the synthetic encodings pin the refusals.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AbiCoder, Interface, ZeroHash } from 'ethers';
import JobMarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import { decodeSessionJobWords, JobMarketplaceWrapper, SESSION_JOBS_OUTPUT_NAMES } from '../../src/contracts/JobMarketplace';

const raw = readFileSync(join(__dirname, 'fixtures', 'sessionjobs_931.hex'), 'utf8').trim();
// The ABI JSON is a plain array — no `.abi ?? …` fallback anywhere (house rule: a fallback hides a shape change).
expect(Array.isArray(JobMarketplaceABI)).toBe(true);
const named = new Interface(JobMarketplaceABI as any).decodeFunctionResult('sessionJobs', raw);

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const T18 = ['uint256','address','address','address','uint256','uint256','uint256','uint256','uint256','uint256','uint256','uint256','uint8','uint256','uint256','string','bytes32','string'];
const V18 = [1145n, A(0xa1), A(0xa2), A(0xa3), 500000n, 10000n, 0n, 86400n, 1787778208n, 1787778208n, 1000n, 300n, 0, 0n, 0n, 'conv', ZeroHash, ''];
const enc = (types: string[], values: unknown[]) => AbiCoder.defaultAbiCoder().encode(types, values);

describe('decodeSessionJobWords — the drift-proof A.3 read', () => {
  it('agrees with the NAMED decode on the live session-931 bytes, field for field', () => {
    const s = decodeSessionJobWords(raw);
    expect(s.id).toBe(931n);
    expect(s.depositor).toBe(named.depositor);
    expect(s.host).toBe(named.host);
    expect(s.paymentToken).toBe(named.paymentToken);
    expect(s.deposit).toBe(named.deposit);
    expect(s.pricePerToken).toBe(904n);
    expect(s.tokensUsed).toBe(733225n);
    expect(s.maxDuration).toBe(3600n);          // the fiat-service constant A.3 rejects
    expect(s.startTime).toBe(named.startTime);
    expect(s.lastProofTime).toBe(named.lastProofTime);
    expect(s.proofInterval).toBe(1000n);        // TOKENS
    expect(s.proofTimeoutWindow).toBe(300n);    // SECONDS — the other fiat-service constant
    expect(s.status).toBe(1);                   // Completed
  });

  it('decodes a synthetic Active 18-slot session', () => {
    const s = decodeSessionJobWords(enc(T18, V18));
    expect(s.status).toBe(0);
    expect(s.host.toLowerCase()).toBe(A(0xa2));
    expect(s.proofTimeoutWindow).toBe(300n);
  });

  it('FAILS CLOSED on the 17-slot layout (no proofTimeoutWindow) — the named decode trap', () => {
    const t = T18.filter((_, i) => i !== 11);
    const v = V18.filter((_, i) => i !== 11);
    expect(() => decodeSessionJobWords(enc(t, v))).toThrow(/layout/i);
  });

  it('the slot-15 pin is load-bearing: a 17-slot layout whose conversationCID is LONG passes every other check', () => {
    // Found by mutation: with a short CID the 17-slot vector is caught by the slot-17 range
    // check, so removing the slot-15 pin left the suite green. A long CID puts a plausible
    // offset-sized length word in slot 17 and a zero status in slot 12 — only the pin remains.
    const t = T18.filter((_, i) => i !== 11);
    const v = V18.filter((_, i) => i !== 11);
    v[14] = 'c'.repeat(700);
    expect(() => decodeSessionJobWords(enc(t, v))).toThrow(/first dynamic offset/i);
  });

  it('fails closed when the SECOND dynamic offset is out of range (slot 17) — its own vector', () => {
    const words = enc(T18, V18).slice(2).match(/.{64}/g)!;
    words[17] = '0'.repeat(64);                                            // before the first tail
    expect(() => decodeSessionJobWords('0x' + words.join(''))).toThrow(/second dynamic offset/i);
    words[17] = (10_000).toString(16).padStart(64, '0');                   // past the end of the data
    expect(() => decodeSessionJobWords('0x' + words.join(''))).toThrow(/second dynamic offset/i);
  });

  it('fails closed when an address slot carries non-zero high bytes (a shifted uint256)', () => {
    const words = enc(T18, V18).slice(2).match(/.{64}/g)!;
    words[1] = 'f'.repeat(64);
    expect(() => decodeSessionJobWords('0x' + words.join(''))).toThrow(/slot 1 is not an address/i);
  });

  it('pins the ABI production actually decodes sessionJobs with — 18 named outputs, proofTimeoutWindow at [11]', () => {
    // A swap to the adjacently-named 16-output JobMarketplaceWithModels.json decodes these same
    // bytes with host ← the USDC token and deposit ← the price, silently. This reads the names
    // off the Interface the wrapper builds, so the swap goes RED here, not in a payment.
    expect(SESSION_JOBS_OUTPUT_NAMES).toEqual([
      'id', 'depositor', 'host', 'paymentToken', 'deposit', 'pricePerToken', 'tokensUsed', 'maxDuration',
      'startTime', 'lastProofTime', 'proofInterval', 'proofTimeoutWindow', 'status', 'withdrawnByHost',
      'refundedToUser', 'conversationCID', 'lastProofHash', 'lastProofCID',
    ]);
  });

  it('fails closed on truncated data', () => {
    expect(() => decodeSessionJobWords(enc(T18, V18).slice(0, 2 + 64 * 17))).toThrow(/layout|bytes/i);
  });

  it('fails closed on a status outside Active/Completed/TimedOut (a misaligned slot)', () => {
    const v = [...V18]; v[12] = 7;
    expect(() => decodeSessionJobWords(enc(T18, v))).toThrow(/status/i);
  });

  it('is a call site on the REAL wrapper, not new plumbing (the CP1 lesson)', () => {
    expect(typeof JobMarketplaceWrapper.prototype.getSessionJobOnChain).toBe('function');
    expect(typeof JobMarketplaceWrapper.prototype.getSessionModel).toBe('function');
  });
});
