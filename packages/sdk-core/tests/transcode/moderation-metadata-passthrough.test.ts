/**
 * WP-S1 Phase 4-lite — D6/D6a: the moderation verdict survives the SECOND hop, from the
 * transcode result onto the assembled content metadata that consumers persist to S5.
 *
 * The assemblers stay pure, non-throwing mappers with unchanged 5-parameter signatures. There
 * is NO gate here: sdk-core performs no publish write, and the release decision belongs to the
 * consumer's gate (spec §3.1, built in fabstir-sdk as WP-S2).
 */
import { describe, it, expect, vi } from 'vitest';
import { assembleHlsContentMetadata, assembleContentMetadata } from '../../src/utils/transcode-utils';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import type { TranscodeResult, VideoFormat, TranscodeModerationStatus } from '../../src/types/transcode.types';

// Fixtures mirror the shapes the existing assembler suites already prove work:
// hls-utils.test.ts (assembleHlsContentMetadata) and streaming-utils.test.ts (assembleContentMetadata).
const hlsFormats: VideoFormat[] = [
  { id: 1, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1920x1080', b_v: '5M', hls: true },
];
const hlsOutputs = [
  {
    id: 1, hls: true as const, initSegmentCid: 'zINIT',
    segments: [{ index: 0, cid: 'zS0', duration: 6.0, encrypted: false }],
    previewSegments: 1, totalSegments: 5, totalDuration: 30.0,
  },
];

const streamFormats: VideoFormat[] = [
  { id: 1, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1920x1080', b_v: '5M', encrypt: true },
  { id: 2, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1920x1080', b_v: '5M', encrypt: false, trim_percent: 15 },
];
const streamOutputs = [
  { id: 1, ext: 'mp4', cid: 'fullCid1080' },
  { id: 2, ext: 'mp4', cid: 'prevCid1080' },
];

const mkResult = (outputs: unknown[], moderation?: TranscodeModerationStatus): TranscodeResult => ({
  taskId: 'task-1',
  outputs: outputs as TranscodeResult['outputs'],
  billing: { units: 1, tokens: 10 },
  duration: 8,
  qualityMetrics: null,
  proofTreeCID: null,
  proofTreeRootHash: null,
  ...(moderation !== undefined && { moderation }),
});

const assemble = {
  hls: (m?: TranscodeModerationStatus) => assembleHlsContentMetadata(mkResult(hlsOutputs, m), hlsFormats, 'src-cid', 10, 7),
  streaming: (m?: TranscodeModerationStatus) => assembleContentMetadata(mkResult(streamOutputs, m), streamFormats, 'src-cid', 10, 7),
} as const;
const ASSEMBLERS = Object.keys(assemble) as Array<keyof typeof assemble>;

describe('moderation metadata passthrough (WP-S1 Phase 4-lite, D6/D6a)', () => {
  describe('the verdict is copied onto the assembled metadata', () => {
    it.each(ASSEMBLERS)('%s: a blocked verdict with its reason survives', (which) => {
      const meta = assemble[which]({ verdict: 'blocked', reason: 'hash-list-match' });
      expect(meta.moderation).toEqual({ verdict: 'blocked', reason: 'hash-list-match' });
    });

    it.each(ASSEMBLERS)('%s: a cleared verdict survives', (which) => {
      expect(assemble[which]({ verdict: 'cleared' }).moderation).toEqual({ verdict: 'cleared' });
    });

    it.each(ASSEMBLERS)('%s: a flagged verdict survives', (which) => {
      expect(assemble[which]({ verdict: 'flagged' }).moderation).toEqual({ verdict: 'flagged' });
    });
  });

  describe('D6a(1) — absent stays absent', () => {
    // Asserted as key ABSENCE, not `=== undefined`: `{}` and `{moderation: undefined}` both
    // satisfy `toBeUndefined()`, but they serialise differently once the object reaches S5 —
    // and being serialised to S5 is the entire point of this record.
    it.each(ASSEMBLERS)('%s: no verdict on the result ⇒ NO moderation key on the metadata', (which) => {
      const meta = assemble[which]();
      expect('moderation' in meta).toBe(false);
    });

    it.each(ASSEMBLERS)('%s: the absent case survives JSON round-tripping as absent', (which) => {
      const round = JSON.parse(JSON.stringify(assemble[which]()));
      expect('moderation' in round).toBe(false);
    });

    it.each(ASSEMBLERS)('%s: output is otherwise identical to today when no verdict is present', (which) => {
      const meta = assemble[which]();
      expect(meta.sourceCid).toBe('src-cid');
      expect(meta.freePreviewPercent).toBe(10);
      expect(meta.jobId).toBe(7);
      expect(meta.sources.length).toBe(1);
      expect(typeof meta.transcodedAt).toBe('number');
      expect(Object.keys(meta).sort()).toEqual(
        ['freePreviewPercent', 'jobId', 'sourceCid', 'sources', 'transcodedAt'],
      );
    });
  });

  describe('D6a(2) — verbatim copy only, pinned as a negative too', () => {
    it.each(ASSEMBLERS)('%s: the copy deep-equals the input, with no added keys', (which) => {
      const input: TranscodeModerationStatus = { verdict: 'blocked', reason: 'hash-list-match' };
      const meta = assemble[which](input);
      expect(meta.moderation).toEqual(input);
      expect(Object.keys(meta.moderation!).sort()).toEqual(['reason', 'verdict']);
    });

    it.each(ASSEMBLERS)('%s: no derived convenience flag or list fingerprint is invented', (which) => {
      const meta = assemble[which]({ verdict: 'blocked', reason: 'hash-list-match' });
      const flat = JSON.stringify(meta);
      // Scans the WHOLE assembled object, so it catches a derived flag added anywhere — not
      // just on `moderation`, which the key-set assertion above already pins exactly.
      for (const forbidden of ['approved', 'safe', 'status', 'fingerprint', 'listId', 'listVersion', 'hash']) {
        expect(flat).not.toContain(`"${forbidden}"`);
      }
    });

    it.each(ASSEMBLERS)('%s: a verdict with no reason gains no reason key', (which) => {
      const meta = assemble[which]({ verdict: 'cleared' });
      expect('reason' in meta.moderation!).toBe(false);
    });
  });

  describe('D3′ carried through the second hop', () => {
    // The parser preserves unknown verdicts; nothing previously stopped the ASSEMBLER
    // re-normalising them. Only 'cleared' releases, so an erased unknown would read
    // downstream as "not moderated" — the exact diagnostic loss D3′ exists to prevent.
    it.each(ASSEMBLERS)('%s: an unrecognised verdict string reaches the metadata verbatim', (which) => {
      const meta = assemble[which]({ verdict: 'quarantined' as any, reason: 'policy-v9' });
      expect(meta.moderation).toEqual({ verdict: 'quarantined', reason: 'policy-v9' });
    });

    it.each(ASSEMBLERS)('%s: an unknown verdict is never coerced toward cleared', (which) => {
      const meta = assemble[which]({ verdict: 'weird-future-value' as any });
      expect(meta.moderation?.verdict).toBe('weird-future-value');
      expect(meta.moderation?.verdict).not.toBe('cleared');
    });
  });

  // Both assemblers are public exports (src/utils/index.ts), so a consumer can hand them a
  // result the WS parser never produced — most obviously one that has round-tripped through
  // JSON or a database, where `undefined` becomes `null`. Copying that through as a present
  // key destroys the absent-vs-present distinction the whole design rests on, and a bare
  // string would read as safe to a naive truthiness check.
  describe('D6a(1) — a structurally unusable verdict on the result is not copied through', () => {
    const UNUSABLE: Array<[string, unknown]> = [
      ['null', null],
      ['a bare string', 'cleared'],
      ['an empty object', {}],
      ['false', false],
      ['an array', []],
      ['a non-string verdict', { verdict: 42 }],
    ];

    it.each(UNUSABLE)('hls: %s ⇒ no moderation key', (_label, bad) => {
      const meta = assembleHlsContentMetadata(
        mkResult(hlsOutputs, bad as never), hlsFormats, 'src-cid', 10, 7);
      expect('moderation' in meta).toBe(false);
    });

    it.each(UNUSABLE)('streaming: %s ⇒ no moderation key', (_label, bad) => {
      const meta = assembleContentMetadata(
        mkResult(streamOutputs, bad as never), streamFormats, 'src-cid', 10, 7);
      expect('moderation' in meta).toBe(false);
    });
  });

  // D6a(2) is not only "don't invent keys" — it is "persist the declared shape and nothing
  // else". Spreading the node's object wholesale would carry any extra field it attached
  // straight into user-sovereign S5 storage, list fingerprints being the named example.
  describe('D6a(2) — only the declared fields are persisted, whatever else arrives', () => {
    const CONTAMINATED = {
      verdict: 'blocked', reason: 'hash-list-match',
      matchedHash: 'ab12deadbeef', listId: 'ncmec-2026-07', frameDataUrl: 'data:image/png;base64,AAA',
    };

    it.each(ASSEMBLERS)('%s: extra node-supplied keys are dropped, not persisted', (which) => {
      const meta = assemble[which](CONTAMINATED as never);
      expect(meta.moderation).toEqual({ verdict: 'blocked', reason: 'hash-list-match' });
      expect(Object.keys(meta.moderation!).sort()).toEqual(['reason', 'verdict']);
    });

    it.each(ASSEMBLERS)('%s: no fingerprint survives into the serialised record', (which) => {
      const flat = JSON.stringify(assemble[which](CONTAMINATED as never));
      expect(flat).not.toContain('ab12deadbeef');
      expect(flat).not.toContain('ncmec-2026-07');
      expect(flat).not.toContain('data:image');
    });

    it.each(ASSEMBLERS)('%s: a non-string reason is dropped, exactly as the parser drops it', (which) => {
      const meta = assemble[which]({ verdict: 'blocked', reason: { nested: 'obj' } } as never);
      expect(meta.moderation).toEqual({ verdict: 'blocked' });
    });

    // Spread copies own ENUMERABLE properties only, so a non-enumerable verdict would yield a
    // present-but-empty record — truthy to a naive `if (meta.moderation)` check.
    it.each(ASSEMBLERS)('%s: a non-enumerable verdict still lands as a real verdict', (which) => {
      const sneaky = {};
      Object.defineProperty(sneaky, 'verdict', { value: 'blocked', enumerable: false });
      const meta = assemble[which](sneaky as never);
      expect(meta.moderation).toEqual({ verdict: 'blocked' });
    });
  });

  describe('the persisted record is a snapshot, not a live alias', () => {
    it.each(ASSEMBLERS)('%s: mutating the result afterwards does not rewrite the metadata', (which) => {
      const status: TranscodeModerationStatus = { verdict: 'blocked', reason: 'hash-list-match' };
      const meta = assemble[which](status);
      status.verdict = 'cleared' as never;
      expect(meta.moderation?.verdict).toBe('blocked');
    });
  });

  // Everything above tests ONE hop. WP-S1's actual claim is about the composition: a verdict
  // the node put on the wire reaches the record a consumer persists. Both hops are individually
  // green in ways that would still compose wrongly — e.g. if the parser and the assembler
  // disagreed about what "usable" means, or if either re-normalised. This drives the real
  // submitTranscodeWs and feeds its output straight into the real assembler.
  describe('end-to-end — wire frame to persisted metadata, no hand-built results', () => {
    const wireToMetadata = async (moderation?: unknown) => {
      const handlers: ((d: any) => void)[] = [];
      const frame = {
        type: 'transcode_complete', taskId: 'task-1',
        outputs: streamOutputs, billing: { units: 1, tokens: 10 }, duration: 8,
        qualityMetrics: null, proofTreeCID: null, proofTreeRootHash: null,
        ...(moderation !== undefined && { moderation }),
      };
      const handle = await submitTranscodeWs({
        wsClient: {
          sendWithoutResponse: vi.fn().mockResolvedValue(undefined),
          onMessage: vi.fn((h: any) => { handlers.push(h); return () => {}; }),
        },
        encryptionManager: {
          encryptMessage: vi.fn().mockReturnValue({ ciphertextHex: 'a', nonceHex: 'b', aadHex: 'c' }),
          decryptMessage: vi.fn().mockReturnValue(JSON.stringify(frame)),
        },
        sessionId: 'sess-1', sessionKey: new Uint8Array(32), messageIndex: { value: 0 },
        sourceCid: 'src-cid', formats: streamFormats, timeoutMs: 500,
      } as never);
      handlers.forEach(h => h({ type: 'encrypted_response', payload: { ciphertextHex: 'x' } }));
      const result = await handle.result;
      return assembleContentMetadata(result, streamFormats, 'src-cid', 10, 7);
    };

    it('a blocked verdict survives both hops with its reason', async () => {
      const meta = await wireToMetadata({ verdict: 'blocked', reason: 'hash-list-match' });
      expect(meta.moderation).toEqual({ verdict: 'blocked', reason: 'hash-list-match' });
    });

    it('an UNKNOWN verdict survives both hops verbatim — the D3′ end-to-end guarantee', async () => {
      const meta = await wireToMetadata({ verdict: 'quarantined' });
      expect(meta.moderation).toEqual({ verdict: 'quarantined' });
    });

    it('a node that sends no verdict yields a record with no moderation key', async () => {
      const meta = await wireToMetadata();
      expect('moderation' in meta).toBe(false);
      expect('moderation' in JSON.parse(JSON.stringify(meta))).toBe(false);
    });

    it('a malformed wire payload does not become a persisted verdict', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const meta = await wireToMetadata({ verdict: null });
        expect('moderation' in meta).toBe(false);
      } finally {
        warn.mockRestore();
      }
    });

    it('a node-attached fingerprint never reaches the persisted record', async () => {
      const meta = await wireToMetadata({ verdict: 'blocked', reason: 'hash-list-match', matchedHash: 'ab12deadbeef' });
      expect(JSON.stringify(meta)).not.toContain('ab12deadbeef');
      expect(meta.moderation).toEqual({ verdict: 'blocked', reason: 'hash-list-match' });
    });
  });

  describe('the assemblers remain pure, non-throwing mappers (the gate is elsewhere)', () => {
    it.each(ASSEMBLERS)('%s: a blocked verdict still returns metadata rather than throwing', (which) => {
      expect(() => assemble[which]({ verdict: 'blocked', reason: 'hash-list-match' })).not.toThrow();
      expect(assemble[which]({ verdict: 'blocked' }).sources.length).toBe(1);
    });

    it('signatures are unchanged — both assemblers still take exactly 5 parameters', () => {
      expect(assembleHlsContentMetadata.length).toBe(5);
      expect(assembleContentMetadata.length).toBe(5);
    });
  });
});
