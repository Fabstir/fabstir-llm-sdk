// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IMPLEMENTATION-SESSION-SETTLED-REST (sdk-core 1.39.23): node 8.63.1 (`session-settled-rest`) refuses /v1/inference on a
 * settled session with HTTP 409 SESSION_SETTLED; a refusal echoes the frame's requestId; `webSearch()` uses REST
 * /v1/search (owner, 2026-11-08).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { FakeWs, FakeWebSocket, makeFakeEncryptionManager, fakeHostManager } from '../helpers/session-doubles';

const HOST = '0x' + '4'.repeat(40);
const MODEL = '0x' + 'ab'.repeat(32);
const ENDPOINT = 'https://host2.fabstir.net';
const A = 1433n;
const KEY = new Uint8Array(32).fill(1);
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

/** Answers /v1/version with `features`, /v1/inference with `inference`, /v1/search with `search`. */
function stubHttp(features: string[], inference: () => any = () => ({ ok: true, status: 200, json: async () => ({ content: 'hi' }), text: async () => '' }),
  search: () => any = () => ({ ok: true, status: 200, json: async () => ({ results: [{ title: 't', url: 'u', snippet: 's' }], resultCount: 1, provider: 'brave' }) })) {
  const calls: Array<{ url: string; body?: any }> = [];
  const f = vi.fn(async (url: string, init?: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    if (String(url).endsWith('/v1/version')) return { ok: true, json: async () => ({ features }) } as any;
    if (String(url).endsWith('/v1/inference')) return inference();
    if (String(url).endsWith('/v1/search')) return search();
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', f);
  return { f, calls };
}
const http = (status: number, body: any) => () => ({ ok: false, status, statusText: 'x', json: async () => body, text: async () => JSON.stringify(body) });

function manager() {
  const storage = { storeConversation: vi.fn(), updateConversationMetadata: vi.fn(async () => {}), appendMessages: vi.fn(async () => {}), loadConversation: vi.fn(async () => null) };
  const mgr: any = new SessionManager({ signer: { getAddress: async () => HOST } } as any, storage as any);
  mgr.initialized = true;
  mgr.encryptionManager = makeFakeEncryptionManager();
  mgr.hostManager = fakeHostManager();
  const read = vi.fn(async () => ({ status: 0, startTime: BigInt(Math.floor(Date.now() / 1000)), maxDuration: 3600n }));
  mgr.setSessionJobReader(() => ({ getSessionJobOnChain: read }));
  mgr.setConfidentialHosts([HOST]);
  mgr.registerExternalSession({ sessionId: A, jobId: 1433n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
  const ws: any = new FakeWs();
  ws.disconnect = vi.fn(async () => {});
  mgr.wsClient = ws; mgr.wsSessionId = '1433'; mgr.sessionKey = KEY;
  mgr.watchConnectionIdentity(ws);
  mgr.sessionKeyGeneration = 1; mgr.sessionKeyClient = ws;
  mgr.sessionCrypto.set('1433', { key: KEY, messageIndex: 0 });
  vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY);
  return { mgr, ws, read, storage };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('R2: REST refusals', () => {
  for (const [name, call] of [
    ['sendPrompt', (m: any) => m.sendPrompt(A, 'hi')],
    ['streamResponse', (m: any) => m.streamResponse(A, 'hi', () => {})],
  ] as const) {
    it(`${name}: HTTP 409 SESSION_SETTLED settles the session and throws SESSION_NOT_ACTIVE / SETTLED_BY_NODE`, async () => {
      const { mgr } = manager();
      stubHttp(['session-settled-notice', 'session-settled-rest'], http(409, { error: 'SESSION_SETTLED', code: 'SESSION_SETTLED', job_id: '1433', message: 'session 1433 has been settled; open a new session for new work' }));
      const err: any = await call(mgr).catch((e: any) => e);
      expect(err).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_BY_NODE', nodeCode: 'SESSION_SETTLED', httpStatus: 409, sessionId: '1433' } });
      expect(mgr.getSession('1433').status).toBe('completed');
    });

    it(`${name}: HTTP 403 SESSION_AUTH_DENIED throws SESSION_AUTH_DENIED, not a wrapped send error`, async () => {
      const { mgr } = manager();
      stubHttp(['session-settled-rest'], http(403, { error: 'SESSION_AUTH_DENIED', code: 'SESSION_AUTH_DENIED', message: 'session authorisation denied' }));
      const err: any = await call(mgr).catch((e: any) => e);
      expect(err).toMatchObject({ code: 'SESSION_AUTH_DENIED', details: { nodeCode: 'SESSION_AUTH_DENIED', httpStatus: 403, sessionId: '1433' } });
      expect(mgr.getSession('1433').status).toBe('active');
    });

    it(`${name}: another HTTP error keeps its wrapped error`, async () => {
      const { mgr } = manager();
      stubHttp([], http(500, { error: 'boom' }));
      const err: any = await call(mgr).catch((e: any) => e);
      expect(['PROMPT_SEND_ERROR', 'STREAM_ERROR']).toContain(err.code);
    });
  }
});

describe('R1: the REST gate on a session-settled-rest node', () => {
  it('one read per event (like WebSocket work)', async () => {
    const { mgr, read } = manager();
    stubHttp(['session-settled-notice', 'session-settled-rest']);
    await mgr.sendPrompt(A, 'one');
    await mgr.sendPrompt(A, 'two');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a notice node without session-settled-rest keeps 1.39.21\'s re-reads for REST', async () => {
    const { mgr, read } = manager();
    stubHttp(['session-settled-notice']);
    await mgr.sendPrompt(A, 'one');
    await mgr.sendPrompt(A, 'two');
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('R3: a refusal echoing requestId', () => {
  it('rejects only the request it names', () => {
    const { mgr, ws } = manager();
    stubHttp(['session-settled-notice']);
    const mine = { resolve: vi.fn(), reject: vi.fn(), timeoutId: setTimeout(() => {}, 0) };
    const other = { resolve: vi.fn(), reject: vi.fn(), timeoutId: setTimeout(() => {}, 0) };
    mgr.pendingRequests.set('req-1', mine);
    mgr.pendingRequests.set('req-2', other);
    ws.emit({ type: 'error', code: 'SESSION_SETTLED', session_id: '1433', requestId: 'req-1', message: 'settled' });
    expect(mine.reject).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_NOT_ACTIVE' }));
    expect(other.reject).not.toHaveBeenCalled();
    expect(mgr.getSession('1433').status).toBe('completed');   // the session is settled all the same
  });

  it('one without requestId (8.63.0) still rejects the session\'s vector requests', () => {
    const { mgr, ws } = manager();
    const a = { resolve: vi.fn(), reject: vi.fn(), timeoutId: setTimeout(() => {}, 0) };
    mgr.pendingRequests.set('req-1', a);
    ws.emit({ type: 'error', code: 'SESSION_SETTLED', session_id: '1433', message: 'settled' });
    expect(a.reject).toHaveBeenCalled();
  });
});

describe('R4: webSearch() uses REST /v1/search on the session\'s host', () => {
  it('posts the query to the session host and returns its answer, with no socket', async () => {
    const { mgr, ws, read } = manager();
    const { calls } = stubHttp([]);
    ws.sendWithoutResponse = vi.fn();
    const r = await mgr.webSearch(A, 'latest GPU news', 5);
    expect(r).toMatchObject({ resultCount: 1, provider: 'brave' });
    const call = calls.find((c) => c.url.endsWith('/v1/search'))!;
    expect(call.url).toBe(`${ENDPOINT}/v1/search`);
    expect(call.body).toMatchObject({ query: 'latest GPU news', numResults: 5, chainId: 84532 });
    expect(ws.sendWithoutResponse).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();   // bills no session: not gated
  });

  it('works with no WebSocket at all', async () => {
    const { mgr } = manager();
    mgr.wsClient = undefined;
    stubHttp([]);
    await expect(mgr.webSearch(A, 'q')).resolves.toMatchObject({ resultCount: 1 });
  });

  it('an unknown session is SESSION_NOT_FOUND', async () => {
    const { mgr } = manager();
    stubHttp([]);
    await expect(mgr.webSearch(999n, 'q')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('a rate limit keeps searchDirect\'s WebSearchError', async () => {
    const { mgr } = manager();
    stubHttp([], undefined, () => ({ ok: false, status: 429, statusText: 'Too Many', headers: { get: () => '7' } }));
    await expect(mgr.webSearch(A, 'q')).rejects.toMatchObject({ code: 'rate_limited' });
  });
});

describe('node: the notice can arrive right after the init ack', () => {
  it('a dedicated socket\'s listener is attached before its init is sent, so the notice is not missed', async () => {
    const { mgr } = manager();
    stubHttp(['session-settled-notice']);
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    mgr.sendEncryptedInit.mockImplementation(async () => {
      // the node stores the key, acks, and sends the notice 0.1 ms later — before the init call returns
      FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'session_settled', session_id: '1433', job_id: '1433', reason: 'last_connection_closed' }) });
      return KEY;
    });
    const t: any = await mgr.acquireSessionTransport('1433', 'fetch');
    expect(mgr.getSession('1433').status).toBe('completed');
    await t.wsClient.disconnect();
    await flush();
  });
});

describe('Review round 1', () => {
  for (const [name, call] of [
    ['sendPrompt', (m: any) => m.sendPrompt(A, 'hi')],
    ['streamResponse', (m: any) => m.streamResponse(A, 'hi', () => {})],
  ] as const) {
    it(`MAJOR: ${name} sends the node's InferenceRequest fields: job_id a number, session_id snake_case`, async () => {
      const { mgr } = manager();
      const { calls } = stubHttp([]);
      await call(mgr).catch(() => {});
      const body = calls.find((c) => c.url.endsWith('/v1/inference'))!.body;
      expect(body).toMatchObject({ session_id: '1433', job_id: 1433, chain_id: 84532 });
      expect(typeof body.job_id).toBe('number');
      expect(body).not.toHaveProperty('jobId');
      expect(body).not.toHaveProperty('sessionId');
    });
  }

  it('the card-host 403 body has no code, only error: still SESSION_AUTH_DENIED', async () => {
    const { mgr } = manager();
    stubHttp([], http(403, { error: 'SESSION_AUTH_DENIED', message: 'session authorisation denied' }));
    await expect(mgr.sendPrompt(A, 'hi')).rejects.toMatchObject({ code: 'SESSION_AUTH_DENIED', details: { httpStatus: 403 } });
  });

  it('a 409 naming another job does not settle this record', async () => {
    const { mgr } = manager();
    stubHttp(['session-settled-rest'], http(409, { error: 'SESSION_SETTLED', code: 'SESSION_SETTLED', job_id: '777', message: 'settled' }));
    await mgr.sendPrompt(A, 'hi').catch(() => {});
    expect(mgr.getSession('1433').status).toBe('active');
  });

  for (const endpoint of ['wss://host2.fabstir.net/v1/ws', 'ws://host2.fabstir.net', 'https://host2.fabstir.net/', 'https://host2.fabstir.net/v1/ws']) {
    it(`webSearch finds the host's REST base from endpoint ${endpoint}`, async () => {
      const { mgr } = manager();
      mgr.getSession('1433').endpoint = endpoint;
      const { calls } = stubHttp([]);
      await mgr.webSearch(A, 'q');
      const base = endpoint.startsWith('ws://') ? 'http://host2.fabstir.net' : 'https://host2.fabstir.net';
      expect(calls.find((c) => c.url.endsWith('/v1/search'))!.url).toBe(`${base}/v1/search`);
    });
  }

  it('a blank query is invalid_query, before any request', async () => {
    const { mgr } = manager();
    const { f } = stubHttp([]);
    await expect(mgr.webSearch(A, '   ')).rejects.toMatchObject({ code: 'invalid_query' });
    expect(f).not.toHaveBeenCalled();
  });

  it('the search request carries a 30 s timeout', async () => {
    const { mgr } = manager();
    const f = vi.fn(async (_u: string, init: any) => { expect(init.signal).toBeDefined(); return { ok: true, status: 200, json: async () => ({ results: [], resultCount: 0 }) }; });
    vi.stubGlobal('fetch', f);
    await mgr.webSearch(A, 'q');
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('Review round 2', () => {
  const nodeBody = (content: string) => () => ({ ok: true, status: 200, json: async () => ({ model: 'm', content, tokens_used: 3, finish_reason: 'stop', request_id: 'r' }), text: async () => '' });

  it('MAJOR: streamResponse reads the node\'s InferenceResponse (content)', async () => {
    const { mgr } = manager();
    stubHttp([], nodeBody('a billed answer'));
    const chunks: string[] = [];
    await mgr.streamResponse(A, 'hi', (c: string) => chunks.push(c));
    expect(chunks.join('')).toContain('a billed answer');
  });

  it('sendPrompt reads it too', async () => {
    const { mgr } = manager();
    stubHttp([], nodeBody('the answer'));
    await expect(mgr.sendPrompt(A, 'hi')).resolves.toBe('the answer');
  });

  it('an empty reply is a reply, not "no response"', async () => {
    const { mgr } = manager();
    stubHttp([], nodeBody(''));
    await expect(mgr.sendPrompt(A, 'hi')).resolves.toBe('');
  });

  it('a REST prompt on a /v1/ws endpoint posts to /v1/inference on the host', async () => {
    const { mgr } = manager();
    mgr.getSession('1433').endpoint = 'wss://host2.fabstir.net/v1/ws';
    const { calls } = stubHttp([], nodeBody('x'));
    await mgr.sendPrompt(A, 'hi');
    expect(calls.find((c) => c.url.includes('/inference'))!.url).toBe('https://host2.fabstir.net/v1/inference');
  });

  it('a search that times out is WebSearchError timeout', async () => {
    const { mgr } = manager();
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); }));
    await expect(mgr.webSearch(A, 'q')).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('Review round 3', () => {
  it('sendPrompt sends thinking like streamResponse', async () => {
    const { mgr } = manager();
    const { calls } = stubHttp([], () => ({ ok: true, status: 200, json: async () => ({ content: 'x' }), text: async () => '' }));
    await mgr.sendPrompt(A, 'hi', { thinking: 'low' });
    expect(calls.find((c) => c.url.endsWith('/v1/inference'))!.body).toMatchObject({ thinking: 'low' });
  });

  it('searchDirect: a 400 is invalid_query; a 429 without Retry-After says so plainly; a trailing slash is cleaned', async () => {
    const { mgr } = manager();
    stubHttp([], undefined, () => ({ ok: false, status: 400, statusText: 'Bad Request', headers: { get: () => null } }));
    await expect(mgr.searchDirect('https://host2.fabstir.net/', 'q')).rejects.toMatchObject({ code: 'invalid_query' });
    const { calls } = stubHttp([], undefined, () => ({ ok: false, status: 429, statusText: 'Too Many', headers: { get: () => null } }));
    const err: any = await mgr.searchDirect('https://host2.fabstir.net/', 'q').catch((e: any) => e);
    expect(err).toMatchObject({ code: 'rate_limited' });
    expect(err.message).not.toMatch(/null/);
    expect(calls[0].url).toBe('https://host2.fabstir.net/v1/search');
  });
});

describe('R5: flag', () => {
  it('settledRest', () => {
    expect((SDK_CAPABILITIES as any).settledRest).toBe(true);
  });
});
