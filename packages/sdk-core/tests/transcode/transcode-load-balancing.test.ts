import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { TranscodeError } from '../../src/errors/transcode-errors';
import type { TranscodeErrorCode } from '../../src/errors/transcode-errors';
import type { TranscodeHandle, VideoFormat } from '../../src/types/transcode.types';
import type { IHostSelectionService, RankedHost } from '../../src/interfaces/IHostSelectionService';
import { HostSelectionMode } from '../../src/types/settings.types';

// Minimal mock factories
const mkHost = (addr: string, url: string) => ({
  address: addr, apiUrl: url, metadata: {} as any, supportedModels: [],
  isActive: true, stake: 1000n, minPricePerTokenNative: 100n, minPricePerTokenStable: 100n,
});

const mkRanked = (addr: string, url: string): RankedHost => ({
  host: mkHost(addr, url), score: 0.9, factors: { stakeScore: 1, priceScore: 1, uptimeScore: 1, latencyScore: 1 },
});

const mkHandle = (): TranscodeHandle => ({ taskId: 'task-1', cancel: vi.fn(), result: Promise.resolve({} as any) });

function createManager() {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: 100n, jobId: 1n }),
    submitTranscode: vi.fn().mockResolvedValue(mkHandle()),
  };
  const tm = new TranscodeManager(sessionManager, {} as any, {} as any, {} as any, {} as any, 84532);
  const hostSel: IHostSelectionService = {
    getRankedHostsForModel: vi.fn(),
    calculateHostScore: vi.fn(),
    getScoreFactors: vi.fn(),
    selectHostForModel: vi.fn(),
  };
  tm.setHostSelectionService(hostSel);
  return { tm, sessionManager, hostSel };
}

// Mock fetch globally
const mockFetch = vi.fn();
let origFetch: typeof globalThis.fetch;
beforeEach(() => { origFetch = globalThis.fetch; globalThis.fetch = mockFetch; });
import { afterEach } from 'vitest';
afterEach(() => { globalThis.fetch = origFetch; vi.restoreAllMocks(); });

const cap = (avail: number, connected = true) => ({ active: 3 - avail, max: 3, queued: 0, available: avail, sidecarConnected: connected });
const formats: VideoFormat[] = [{ id: 1, ext: 'mp4' }];
const modelId = '0xabc';

describe('submitTranscodeWithLoadBalancing', () => {
  it('selects first host with available capacity', async () => {
    const { tm, hostSel, sessionManager } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([mkRanked('0x1', 'http://h1:8080')]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(2) });
    const handle = await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId);
    expect(handle.taskId).toBe('task-1');
    expect(sessionManager.startSession).toHaveBeenCalledTimes(1);
  });

  it('skips hosts with available === 0', async () => {
    const { tm, hostSel, sessionManager } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([
      mkRanked('0x1', 'http://h1:8080'), mkRanked('0x2', 'http://h2:8080'),
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => cap(0) })
             .mockResolvedValueOnce({ ok: true, json: async () => cap(2) });
    await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId);
    expect(sessionManager.startSession).toHaveBeenCalledTimes(1);
    expect(sessionManager.startSession.mock.calls[0][0].host).toBe('0x2');
  });

  it('skips hosts with sidecarConnected === false', async () => {
    const { tm, hostSel, sessionManager } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([
      mkRanked('0x1', 'http://h1:8080'), mkRanked('0x2', 'http://h2:8080'),
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => cap(2, false) })
             .mockResolvedValueOnce({ ok: true, json: async () => cap(2, true) });
    await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId);
    expect(sessionManager.startSession.mock.calls[0][0].host).toBe('0x2');
  });

  it('skips hosts where capacity fetch throws', async () => {
    const { tm, hostSel, sessionManager } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([
      mkRanked('0x1', 'http://h1:8080'), mkRanked('0x2', 'http://h2:8080'),
    ]);
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
             .mockResolvedValueOnce({ ok: true, json: async () => cap(2) });
    await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId);
    expect(sessionManager.startSession.mock.calls[0][0].host).toBe('0x2');
  });

  it('retries on next host when CAPACITY_FULL during submission', async () => {
    const { tm, hostSel, sessionManager } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([
      mkRanked('0x1', 'http://h1:8080'), mkRanked('0x2', 'http://h2:8080'),
    ]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(1) });
    sessionManager.submitTranscode
      .mockRejectedValueOnce(new TranscodeError('Full', 'CAPACITY_FULL'))
      .mockResolvedValueOnce(mkHandle());
    await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId);
    expect(sessionManager.startSession).toHaveBeenCalledTimes(2);
  });

  it('throws NO_AVAILABLE_HOSTS when all hosts exhausted', async () => {
    const { tm, hostSel } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([mkRanked('0x1', 'http://h1:8080')]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(0) });
    await expect(tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId))
      .rejects.toMatchObject({ code: 'NO_AVAILABLE_HOSTS' });
  });

  it('respects maxHostRetries limit (default 3)', async () => {
    const { tm, hostSel } = createManager();
    const hosts = Array.from({ length: 5 }, (_, i) => mkRanked(`0x${i}`, `http://h${i}:8080`));
    (hostSel.getRankedHostsForModel as any).mockResolvedValue(hosts);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(0) });
    await expect(tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId, { retryDelayMs: 0 }))
      .rejects.toMatchObject({ code: 'NO_AVAILABLE_HOSTS' });
    // Default maxHostRetries=3, 2 rounds = 6 capacity fetches
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('returns TranscodeHandle from successful submission', async () => {
    const { tm, hostSel } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([mkRanked('0x1', 'http://h1:8080')]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(2) });
    const handle = await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId);
    expect(handle).toHaveProperty('taskId');
    expect(handle).toHaveProperty('cancel');
    expect(handle).toHaveProperty('result');
  });

  it('passes options through to submission', async () => {
    const { tm, hostSel, sessionManager } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([mkRanked('0x1', 'http://h1:8080')]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(2) });
    const opts = { isGpu: true, timeoutMs: 60000 };
    await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId, opts);
    expect(sessionManager.submitTranscode).toHaveBeenCalledWith('100', 'cid-1', formats, opts);
  });

  it('calls onHostSelected with chosen host address and URL', async () => {
    const { tm, hostSel } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([mkRanked('0xABC', 'http://chosen:8080')]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(2) });
    const onHostSelected = vi.fn();
    await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId, { onHostSelected });
    expect(onHostSelected).toHaveBeenCalledOnce();
    expect(onHostSelected).toHaveBeenCalledWith('0xABC', 'http://chosen:8080');
  });

  it('retries after backoff when all hosts fail on first round', async () => {
    const { tm, hostSel } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([mkRanked('0x1', 'http://h1:8080')]);
    // Round 1: capacity fetch fails. Round 2: succeeds.
    mockFetch
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ ok: true, json: async () => cap(2) });
    const handle = await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId, { retryDelayMs: 10 });
    expect(handle.taskId).toBe('task-1');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

/**
 * WP-S1 Phase 2.3 — anti-bypass regression guard.
 *
 * The load balancer catches SUBMISSION failures only: it returns the handle without ever
 * awaiting `handle.result`, so an error arriving on that already-returned promise cannot drive
 * host-shopping. That is what stops a moderation hold being retried across hosts until one
 * accepts it — but nothing in the code SAYS so, so it is incidental rather than defended.
 *
 * These tests make a future refactor that awaits the result inside the loop break loudly.
 * The CAPACITY_FULL case is the paired control: it is the one code the loop DOES re-host on at
 * submission, so its passing here proves these tests pin *where* the retry boundary is, not
 * merely that moderation codes happen to be non-retryable.
 */
describe('submitTranscodeWithLoadBalancing — moderation holds must not bypass via retry', () => {
  /** A handle whose job fails after submission succeeded. */
  const mkFailingHandle = (code: TranscodeErrorCode): TranscodeHandle => {
    const result = Promise.reject(new TranscodeError('held', code));
    result.catch(() => {}); // keep the eager rejection from surfacing as unhandled
    return { taskId: 'task-1', cancel: vi.fn(), result };
  };

  const runWithFailingResult = async (code: TranscodeErrorCode) => {
    const { tm, hostSel, sessionManager } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([
      mkRanked('0x1', 'http://h1:8080'), mkRanked('0x2', 'http://h2:8080'),
    ]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(2) });
    sessionManager.submitTranscode.mockResolvedValue(mkFailingHandle(code));
    const handle = await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId);
    await expect(handle.result).rejects.toThrow(TranscodeError);
    return sessionManager;
  };

  it.each(['CONTENT_BLOCKED', 'CONTENT_FLAGGED', 'MODERATION_UNAVAILABLE'] as const)(
    '%s on handle.result does not shop for a second host',
    async (code) => {
      const sessionManager = await runWithFailingResult(code);
      expect(sessionManager.startSession).toHaveBeenCalledTimes(1);
      expect(sessionManager.submitTranscode).toHaveBeenCalledTimes(1);
      expect(sessionManager.startSession.mock.calls[0][0].host).toBe('0x1');
    },
  );

  it('paired control: CAPACITY_FULL on handle.result also does not shop — the retry boundary is submission, not result', async () => {
    const sessionManager = await runWithFailingResult('CAPACITY_FULL');
    expect(sessionManager.startSession).toHaveBeenCalledTimes(1);
    expect(sessionManager.submitTranscode).toHaveBeenCalledTimes(1);
  });

  it('contrast: CAPACITY_FULL thrown at SUBMISSION does still shop — proving the tests above are not vacuous', async () => {
    const { tm, hostSel, sessionManager } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([
      mkRanked('0x1', 'http://h1:8080'), mkRanked('0x2', 'http://h2:8080'),
    ]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(2) });
    sessionManager.submitTranscode
      .mockRejectedValueOnce(new TranscodeError('full', 'CAPACITY_FULL'))
      .mockResolvedValueOnce(mkHandle());
    await tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId);
    expect(sessionManager.submitTranscode).toHaveBeenCalledTimes(2);
    expect(sessionManager.startSession.mock.calls[1][0].host).toBe('0x2');
  });

  // The pending-count bookkeeping attaches `.finally()` to the caller's result promise, which
  // creates a SECOND promise. When the job fails, that derived promise rejects with nobody
  // listening — an unhandled rejection, which Node terminates the process for by default.
  // Latent until now because no test ever handed the manager a rejecting handle; WP-S1 makes it
  // routine, since a moderation hold is an ordinary outcome rather than a crash.
  it('a failing job emits NO unhandled rejection from the pending-count bookkeeping', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (r: unknown) => { unhandled.push(r); };
    process.on('unhandledRejection', onUnhandled);
    try {
      await runWithFailingResult('CONTENT_BLOCKED');
      // Node emits unhandledRejection at the end of the turn, once microtasks have drained.
      // One macrotask hop is sufficient and deterministic — no fixed sleep to go flaky.
      await new Promise(r => setImmediate(r));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toHaveLength(0);
  });

  it('a moderation hold thrown at SUBMISSION is terminal — it is never re-hosted', async () => {
    const { tm, hostSel, sessionManager } = createManager();
    (hostSel.getRankedHostsForModel as any).mockResolvedValue([
      mkRanked('0x1', 'http://h1:8080'), mkRanked('0x2', 'http://h2:8080'),
    ]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => cap(2) });
    sessionManager.submitTranscode.mockRejectedValue(new TranscodeError('held', 'CONTENT_BLOCKED'));
    await expect(tm.submitTranscodeWithLoadBalancing('cid-1', formats, modelId))
      .rejects.toMatchObject({ code: 'CONTENT_BLOCKED' });
    expect(sessionManager.submitTranscode).toHaveBeenCalledTimes(1);
  });
});
