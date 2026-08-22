/**
 * WP-S1 Phase 1 — wire→type passthrough for the node's `moderation` field.
 *
 * Spec: docs/node-reference/DESIGN-SDK-SEAM3-PUBLISH-GATE.md §1.5 (test 1: "field survives the
 * boundary verbatim"), §2.2 (the wire shape), §2.3 (the mirror type + defensive parsing).
 * Plan: docs/development/IMPLEMENTATION-MODERATION-V2-OPERATING.md D3′, D4a.
 *
 * Reuses the mock harness shape from transcode-ws-errors.test.ts — no new scaffolding.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import { TranscodeError } from '../../src/errors/transcode-errors';

function createMocks() {
  const handlers: ((data: any) => void)[] = [];
  return {
    wsClient: {
      sendWithoutResponse: vi.fn().mockResolvedValue(undefined),
      onMessage: vi.fn((h: any) => { handlers.push(h); return () => {}; }),
    },
    encryptionManager: {
      encryptMessage: vi.fn().mockReturnValue({ ciphertextHex: 'a', nonceHex: 'b', aadHex: 'c' }),
      decryptMessage: vi.fn(),
    },
    emit: (d: any) => handlers.forEach(h => h(d)),
  };
}

const mkOpts = (m: ReturnType<typeof createMocks>, extra: Record<string, unknown> = {}) => ({
  wsClient: m.wsClient, encryptionManager: m.encryptionManager, sessionId: 'sess-1',
  sessionKey: new Uint8Array(32), messageIndex: { value: 0 }, sourceCid: 'cid-1',
  formats: [{ id: 1, ext: 'mp4' }], timeoutMs: 500, ...extra,
});
const encResp = () => ({ type: 'encrypted_response', payload: { ciphertextHex: 'x' } });

/** A complete, realistic transcode_complete frame with every non-moderation field populated. */
const COMPLETE_BASE = {
  type: 'transcode_complete',
  taskId: 'task-abc',
  outputs: [{ formatId: 1, cid: 'bafyout1' }],
  billing: { units: 10, tokens: 100 },
  duration: 42,
  qualityMetrics: { psnr_db: 41.5, ssim: 0.98, actual_bitrate: 2500, average_gop_size: 60 },
  proofTreeCID: 'bafyproof',
  proofTreeRootHash: '0xdeadbeef',
};

/** Drive one transcode_complete carrying `frame` (merged over the base) and return the result. */
async function completeWith(frame: Record<string, unknown>) {
  const m = createMocks();
  m.encryptionManager.decryptMessage.mockReturnValue(JSON.stringify({ ...COMPLETE_BASE, ...frame }));
  const h = await submitTranscodeWs(mkOpts(m));
  m.emit(encResp());
  return h.result;
}

/** Drive one transcode_error carrying `error` and return the rejection. */
async function errorWith(error: unknown): Promise<TranscodeError> {
  const m = createMocks();
  m.encryptionManager.decryptMessage.mockReturnValue(JSON.stringify({ type: 'transcode_error', error }));
  const h = await submitTranscodeWs(mkOpts(m));
  m.emit(encResp());
  try {
    await h.result;
  } catch (e) {
    return e as TranscodeError;
  }
  throw new Error('expected transcode_error to reject, but it resolved');
}

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warnSpy.mockRestore(); });

describe('transcode-ws moderation passthrough (WP-S1 Phase 1, spec §2.2/§2.3)', () => {
  describe('known verdicts survive the wire boundary', () => {
    it('cleared survives', async () => {
      const r = await completeWith({ moderation: { verdict: 'cleared' } });
      expect(r.moderation).toEqual({ verdict: 'cleared' });
    });

    it('blocked survives with its reason', async () => {
      const r = await completeWith({ moderation: { verdict: 'blocked', reason: 'hash-list-match' } });
      expect(r.moderation).toEqual({ verdict: 'blocked', reason: 'hash-list-match' });
    });

    it('flagged survives', async () => {
      const r = await completeWith({ moderation: { verdict: 'flagged', reason: 'review-queue' } });
      expect(r.moderation).toEqual({ verdict: 'flagged', reason: 'review-queue' });
    });
  });

  describe('D3′ — an unrecognised future verdict passes through VERBATIM', () => {
    // The single most important assertion in WP-S1. The superseded D3 erased these to
    // `undefined`, which destroyed the diagnostic that spec §4 row 10 exists to produce:
    // downstream dark-mode logging would read `verdict=absent` when the node had in fact
    // shipped a fourth verdict — hiding exactly the schema drift dark mode is for.
    it('quarantined reaches the consumer unchanged', async () => {
      const r = await completeWith({ moderation: { verdict: 'quarantined' } });
      expect(r.moderation).toEqual({ verdict: 'quarantined' });
      expect(r.moderation?.verdict).toBe('quarantined');
    });

    it('weird-future-value reaches the consumer unchanged, with its reason', async () => {
      const r = await completeWith({ moderation: { verdict: 'weird-future-value', reason: 'policy-v9' } });
      expect(r.moderation).toEqual({ verdict: 'weird-future-value', reason: 'policy-v9' });
    });

    it('an unknown verdict is never coerced toward cleared', async () => {
      const r = await completeWith({ moderation: { verdict: 'quarantined' } });
      expect(r.moderation?.verdict).not.toBe('cleared');
    });
  });

  describe('D4a — an absent field is silent', () => {
    it('no moderation key ⇒ undefined, never null, never synthesised', async () => {
      const r = await completeWith({});
      expect(r.moderation).toBeUndefined();
      expect(r.moderation).not.toBeNull();
    });

    it('no moderation key ⇒ NO warning (the normal case until WP-N1 deploys)', async () => {
      await completeWith({});
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('D3′ — a present but structurally unusable payload is refused, with one warn', () => {
    const REFUSED: Array<[string, unknown]> = [
      ['null', null],
      ['a bare string', 'cleared'],
      ['an array', []],
      ['an object with no verdict', {}],
      ['a null verdict', { verdict: null }],
      ['a numeric verdict', { verdict: 42 }],
      ['an object verdict', { verdict: { nested: 'cleared' } }],
    ];

    it.each(REFUSED)('%s ⇒ undefined', async (_label, payload) => {
      const r = await completeWith({ moderation: payload });
      expect(r.moderation).toBeUndefined();
    });

    it.each(REFUSED)('%s ⇒ exactly one console.warn, and no throw', async (_label, payload) => {
      await expect(completeWith({ moderation: payload })).resolves.toBeDefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  // The rejected payload FAILED validation, so it has no schema contract — it is not covered by
  // the node's "reason is a category id, never content, never hashes" guarantee. It also just
  // arrived over an encrypted channel, and SDK console output is routinely shipped to log
  // aggregators. Log the shape, never the contents.
  describe('the refusal warning does not leak the payload contents', () => {
    it('logs shape only — no hashes, no content, no data URLs', async () => {
      await completeWith({
        moderation: {
          verdict: 42,
          matchedHash: 'sha256:ab12deadbeef',
          evidenceFrame: 'data:image/jpeg;base64,' + 'A'.repeat(2000),
          transcript: 'user private text',
        },
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Serialise the ARGUMENTS, not their string coercion: a log aggregator receives the live
      // object, so `String(obj)` collapsing to "[object Object]" would hide a real leak.
      const logged = JSON.stringify(warnSpy.mock.calls[0]);
      expect(logged).not.toContain('ab12deadbeef');
      expect(logged).not.toContain('user private text');
      expect(logged).not.toContain('data:image');
      expect(logged.length).toBeLessThan(300);
    });

    it('still says enough to diagnose the drift', async () => {
      await completeWith({ moderation: [] });
      expect(JSON.stringify(warnSpy.mock.calls[0])).toContain('array');
    });

    it('caps key names too — they are node-controlled strings, not just the values', async () => {
      const hugeKey = 'k'.repeat(5000);
      await completeWith({ moderation: { [hugeKey]: 1 } });
      const logged = JSON.stringify(warnSpy.mock.calls[0]);
      expect(logged).not.toContain(hugeKey);
      expect(logged.length).toBeLessThan(300);
    });
  });

  describe('reason is opaque — nothing branches on its value', () => {
    it('the in-flight csam-match → hash-list-match rename is a non-event', async () => {
      const oldName = await completeWith({ moderation: { verdict: 'blocked', reason: 'csam-match' } });
      const newName = await completeWith({ moderation: { verdict: 'blocked', reason: 'hash-list-match' } });
      // Same structure, same verdict — only the opaque string differs.
      expect(Object.keys(oldName.moderation!).sort()).toEqual(Object.keys(newName.moderation!).sort());
      expect(oldName.moderation!.verdict).toBe(newName.moderation!.verdict);
      expect(oldName.moderation!.reason).toBe('csam-match');
      expect(newName.moderation!.reason).toBe('hash-list-match');
    });

    it('a verdict with no reason keeps no reason key', async () => {
      const r = await completeWith({ moderation: { verdict: 'cleared' } });
      expect('reason' in r.moderation!).toBe(false);
    });
  });

  describe('no-regression — the other seven result fields are untouched', () => {
    it('every pre-existing field is unchanged when moderation is present', async () => {
      const r = await completeWith({ moderation: { verdict: 'cleared' } });
      expect(r.taskId).toBe('task-abc');
      expect(r.outputs).toEqual([{ formatId: 1, cid: 'bafyout1' }]);
      expect(r.billing).toEqual({ units: 10, tokens: 100 });
      expect(r.duration).toBe(42);
      expect(r.qualityMetrics).toEqual({ psnrDB: 41.5, ssim: 0.98, actualBitrate: 2500, averageGOPSize: 60 });
      expect(r.proofTreeCID).toBe('bafyproof');
      expect(r.proofTreeRootHash).toBe('0xdeadbeef');
    });

    it('a refused moderation payload does not damage the rest of the result', async () => {
      const r = await completeWith({ moderation: [] });
      expect(r.taskId).toBe('task-abc');
      expect(r.proofTreeRootHash).toBe('0xdeadbeef');
    });
  });
});

/**
 * WP-S1 Phase 2 — the typed hold errors (spec §1.5 test 2, §2.1, §3.2).
 *
 * When the node holds a job it sends NO completion at all: the job ends as a transcode_error
 * carrying one of three codes. Before this work all three collapsed to TRANSCODE_FAILED, making
 * a held job indistinguishable from a crashed ffmpeg.
 */
describe('transcode-ws moderation hold errors (WP-S1 Phase 2, spec §2.1)', () => {
  const HOLD_CODES = ['CONTENT_BLOCKED', 'CONTENT_FLAGGED', 'MODERATION_UNAVAILABLE'] as const;

  describe('object carrier — the only shape the node emits (spec §2.1)', () => {
    it.each(HOLD_CODES)('error.code %s maps to its own typed code', async (code) => {
      const e = await errorWith({ code, message: 'held by moderation' });
      expect(e).toBeInstanceOf(TranscodeError);
      expect(e.code).toBe(code);
    });

    it.each(HOLD_CODES)('%s is NOT retryable (spec §3.2 — no automatic retry anywhere)', async (code) => {
      const e = await errorWith({ code, message: 'held by moderation' });
      expect(e.isRetryable).toBe(false);
    });

    it('the operator-safe reason message survives to the caller', async () => {
      const e = await errorWith({ code: 'CONTENT_BLOCKED', message: 'hash-list-match' });
      expect(e.message).toBe('hash-list-match');
    });
  });

  describe('string carrier — defensive only; the spec rules this shape out', () => {
    it.each(HOLD_CODES)('a bare %s string still maps correctly', async (code) => {
      const e = await errorWith(code);
      expect(e.code).toBe(code);
      expect(e.isRetryable).toBe(false);
    });
  });

  describe('no-regression — the pre-existing mapping is unchanged', () => {
    it('TRANSCODE_CAPACITY_FULL still maps to CAPACITY_FULL and stays retryable', async () => {
      const e = await errorWith({ code: 'TRANSCODE_CAPACITY_FULL', message: 'No slots' });
      expect(e.code).toBe('CAPACITY_FULL');
      expect(e.isRetryable).toBe(true);
    });

    it('an unrecognised code still maps to TRANSCODE_FAILED', async () => {
      const e = await errorWith({ code: 'SOME_FUTURE_CODE', message: 'boom' });
      expect(e.code).toBe('TRANSCODE_FAILED');
    });

    it('a codeless error still maps to TRANSCODE_FAILED', async () => {
      const e = await errorWith({ message: 'Unknown error' });
      expect(e.code).toBe('TRANSCODE_FAILED');
    });
  });

  // The code→code map is keyed by a node-supplied string. Read naively, an inherited
  // Object.prototype member answers the lookup: `error.code: "toString"` yields a FUNCTION as
  // the SDK error code, and a polluted prototype could name a RETRYABLE code — the one thing
  // that makes the load balancer shop for another host.
  describe('the error-code map is not readable through the prototype chain', () => {
    it.each(['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__'])(
      'error.code %s maps to TRANSCODE_FAILED, and code stays a string',
      async (code) => {
        const e = await errorWith({ code, message: 'boom' });
        expect(typeof e.code).toBe('string');
        expect(e.code).toBe('TRANSCODE_FAILED');
      },
    );

    it('an inherited code cannot smuggle in a retryable mapping', async () => {
      (Object.prototype as any).EVIL_CODE = 'CAPACITY_FULL';
      try {
        const e = await errorWith({ code: 'EVIL_CODE', message: 'boom' });
        expect(e.code).toBe('TRANSCODE_FAILED');
        expect(e.isRetryable).toBe(false);
      } finally {
        delete (Object.prototype as any).EVIL_CODE;
      }
    });
  });
});

describe('moderation parsing is immune to prototype-chain reads', () => {
  // The forbidden direction: absence must never become a release. Destructuring reads inherited
  // properties, so a polluted prototype would let `moderation: {}` — "the node recorded nothing"
  // — arrive at the consumer as a clearance.
  it('an inherited verdict does NOT turn an empty payload into a verdict', async () => {
    (Object.prototype as any).verdict = 'cleared';
    try {
      const r = await completeWith({ moderation: {} });
      expect(r.moderation).toBeUndefined();
    } finally {
      delete (Object.prototype as any).verdict;
    }
  });

  it('an inherited reason is not attached to a genuine verdict', async () => {
    (Object.prototype as any).reason = 'synthesised';
    try {
      const r = await completeWith({ moderation: { verdict: 'blocked' } });
      expect(r.moderation).toEqual({ verdict: 'blocked' });
      // Must be an OWN-property check: `in` walks the prototype chain, so while the pollution
      // is installed it reports true no matter what the parser did.
      expect(Object.prototype.hasOwnProperty.call(r.moderation, 'reason')).toBe(false);
    } finally {
      delete (Object.prototype as any).reason;
    }
  });
});
