// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Host preflight before funding (docs/development/IMPLEMENTATION-ORCHESTRATOR-OPENSHELL.md O3/O4, sdk-core 1.39.10).
 * - An explicit host without an endpoint takes its apiUrl from the registry, never the localhost default.
 * - A host the SDK chose or looked up itself must answer GET /v1/health before any funding; AUTO skips one that
 *   does not and selects again. An endpoint the caller supplied is the caller's (no probe, unchanged).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { HostSelectionMode } from '../../src/types/settings.types';
import * as entry from '../../src/index';
import { HostSelectionService } from '../../src/services/HostSelectionService';

const MODEL = '0x' + 'a'.repeat(64);
const CHAIN = 84532;
const TOKEN = '0x' + '2'.repeat(40);
const A = '0x' + '1'.repeat(40);
const B = '0x' + '3'.repeat(40);

const host = (address: string, apiUrl: string, over: Record<string, unknown> = {}) => ({
  address, apiUrl, isRegistered: true, isActive: true, supportedModels: [MODEL], stake: 1n,
  metadata: {}, minPricePerTokenNative: 1n, minPricePerTokenStable: 2000n, ...over,
});

/** A SessionManager whose funding call records the order of events; the health probe answers from `health`. */
function rig(opts: { hosts?: any[]; registry?: Record<string, any>; health?: Record<string, string>; mode?: HostSelectionMode } = {}) {
  const order: string[] = [];
  const paymentManager: any = {
    isInitialized: () => true, initialize: vi.fn(),
    createSessionJob: vi.fn(async () => { order.push('fund'); return 123; }),
  };
  const storage: any = {
    isInitialized: () => true, initialize: vi.fn(),
    getHostSelectionMode: vi.fn(async () => opts.mode ?? HostSelectionMode.AUTO),
    getUserSettings: vi.fn(async () => null), updateUserSettings: vi.fn(async () => {}),
    storeConversation: vi.fn(async () => ({})), assertConversationLogWritable: vi.fn(),
  };
  const registry = opts.registry ?? {};
  const hostManager: any = {
    getModelPricing: vi.fn(async () => 2000n),
    getHostInfo: vi.fn(async (a: string) => { order.push(`registry:${a}`); return registry[a] ?? host(a, '', { isRegistered: false, isActive: false }); }),
  };
  const hosts = opts.hosts ?? [];
  const selection: any = {
    selectHostForModel: vi.fn(async (_m: string, _mode: any, _p?: string, exclude: readonly string[] = []) =>
      hosts.find((h) => !exclude.includes(h.address)) ?? null),
    getRankedHostsForModel: vi.fn(async () => []), calculateHostScore: vi.fn(() => 0.5), setHostManager: vi.fn(),
  };
  const sm: any = new SessionManager(paymentManager, storage, hostManager);
  sm.setHostSelectionService(selection);
  const probe = vi.spyOn(sm, '_checkHostHealth').mockImplementation(async (endpoint: any) => {
    order.push(`probe:${endpoint}`);
    return { status: (opts.health ?? {})[endpoint] ?? 'healthy', issues: [], checkedAt: 0 };
  });
  return { sm, paymentManager, hostManager, selection, probe, order };
}
const start = (sm: any, over: Record<string, unknown> = {}) =>
  sm.startSession({ modelId: MODEL, chainId: CHAIN, paymentMethod: 'deposit', depositAmount: '1', paymentToken: TOKEN, encryption: false, ...over });

afterEach(() => vi.restoreAllMocks());

describe('O3 — an explicit host without an endpoint takes its apiUrl from the registry', () => {
  it('H1: the registry apiUrl is probed and becomes the session endpoint, all before funding', async () => {
    const r = rig({ registry: { [A]: host(A, 'https://host2.example') } });
    await r.sm.initialize();
    const { sessionId } = await start(r.sm, { host: A });
    expect(r.order).toEqual([`registry:${A}`, 'probe:https://host2.example', 'fund']);
    expect(r.sm.sessions.get(String(sessionId)).endpoint).toBe('https://host2.example'); // not the localhost default
  });

  it('H2: an unregistered, inactive or url-less host is refused before funding', async () => {
    for (const bad of [host(A, '', { isRegistered: false, isActive: false }), host(A, 'https://h', { isActive: false }), host(A, '')]) {
      const r = rig({ registry: { [A]: bad } });
      await r.sm.initialize();
      await expect(start(r.sm, { host: A })).rejects.toMatchObject({ code: 'HOST_NOT_AVAILABLE' });
      expect(r.paymentManager.createSessionJob).not.toHaveBeenCalled();
    }
  });

  it('H3: a host that does not answer is refused before funding', async () => {
    const r = rig({ registry: { [A]: host(A, 'https://down.example') }, health: { 'https://down.example': 'unreachable' } });
    await r.sm.initialize();
    await expect(start(r.sm, { host: A })).rejects.toMatchObject({ code: 'HOST_UNREACHABLE', details: { host: A, endpoint: 'https://down.example' } });
    expect(r.paymentManager.createSessionJob).not.toHaveBeenCalled();
  });

  it('H7: an endpoint the caller supplied is used as given — no registry lookup for it, no probe', async () => {
    const r = rig({ health: { 'https://given.example': 'unreachable' } });
    await r.sm.initialize();
    await start(r.sm, { host: A, endpoint: 'https://given.example' });
    expect(r.hostManager.getHostInfo).not.toHaveBeenCalled();
    expect(r.probe).not.toHaveBeenCalled();
    expect(r.paymentManager.createSessionJob).toHaveBeenCalled();
  });

  it('H10: the endpoint transform applies to a registry apiUrl, as it does to a selected one', async () => {
    const r = rig({ registry: { [A]: host(A, 'http://localhost:8082') } });
    r.sm.setEndpointTransform((u: string) => u.replace('localhost', 'host.docker.internal'));
    await r.sm.initialize();
    await start(r.sm, { host: A });
    expect(r.order).toContain('probe:http://host.docker.internal:8082');
  });
});

describe('O4 — AUTO skips a host that does not answer, before funding', () => {
  it('H4: the first pick does not answer → it is excluded and the second is funded', async () => {
    const r = rig({ hosts: [host(A, 'https://a.example'), host(B, 'https://b.example')], health: { 'https://a.example': 'unreachable' } });
    await r.sm.initialize();
    const { sessionId } = await start(r.sm);
    expect(r.order).toEqual(['probe:https://a.example', 'probe:https://b.example', 'fund']);
    expect(r.selection.selectHostForModel.mock.calls[1][3]).toEqual([A]);
    expect(r.sm.sessions.get(String(sessionId)).provider).toBe(B);
    expect(r.sm.sessions.get(String(sessionId)).endpoint).toBe('https://b.example'); // the probed endpoint, not the localhost default
  });

  it('H5: none answers → NO_HOSTS_AVAILABLE naming the skipped hosts; nothing funded', async () => {
    const r = rig({ hosts: [host(A, 'https://a.example'), host(B, 'https://b.example')], health: { 'https://a.example': 'unreachable', 'https://b.example': 'unreachable' } });
    await r.sm.initialize();
    const err = await start(r.sm).catch((e: any) => e);
    expect(err).toMatchObject({ code: 'NO_HOSTS_AVAILABLE' });
    expect(err.details.unreachable).toEqual([{ host: A, endpoint: 'https://a.example' }, { host: B, endpoint: 'https://b.example' }]);
    expect(r.paymentManager.createSessionJob).not.toHaveBeenCalled();
  });

  it('H6: degraded and unhealthy hosts answer — they are funded', async () => {
    for (const status of ['degraded', 'unhealthy']) {
      const r = rig({ hosts: [host(A, 'https://a.example')], health: { 'https://a.example': status } });
      await r.sm.initialize();
      await start(r.sm);
      expect(r.paymentManager.createSessionJob).toHaveBeenCalledTimes(1);
    }
  });

  it('H8: a selection that hands back an excluded host ends the search (no loop), nothing funded', async () => {
    const r = rig({ hosts: [host(A, 'https://a.example')], health: { 'https://a.example': 'unreachable' } });
    r.selection.selectHostForModel.mockImplementation(async () => host(A, 'https://a.example')); // ignores the exclusion
    await r.sm.initialize();
    await expect(start(r.sm)).rejects.toMatchObject({ code: 'NO_HOSTS_AVAILABLE' });
    expect(r.selection.selectHostForModel).toHaveBeenCalledTimes(2);
    expect(r.paymentManager.createSessionJob).not.toHaveBeenCalled();
  });
});

describe('round 1 fixes (1.39.10)', () => {
  it('F1: a pinned host that does not serve the model is refused before funding', async () => {
    const r = rig({ registry: { [A]: host(A, 'https://h', { supportedModels: ['0x' + 'b'.repeat(64)] }) } });
    await r.sm.initialize();
    await expect(start(r.sm, { host: A })).rejects.toMatchObject({ code: 'HOST_NOT_AVAILABLE', details: { host: A } });
    expect(r.probe).not.toHaveBeenCalled();
    expect(r.paymentManager.createSessionJob).not.toHaveBeenCalled();
  });

  it('F1b: supported model ids compare case-insensitively', async () => {
    const r = rig({ registry: { [A]: host(A, 'https://h', { supportedModels: [MODEL.toUpperCase().replace('0X', '0x')] }) } });
    await r.sm.initialize();
    await start(r.sm, { host: A });
    expect(r.paymentManager.createSessionJob).toHaveBeenCalled();
  });

  it('F2: AUTO with an endpoint the caller passed uses it as given — no probe', async () => {
    const r = rig({ hosts: [host(A, 'https://a.example')], health: { 'https://given.example': 'unreachable' } });
    await r.sm.initialize();
    const { sessionId } = await start(r.sm, { endpoint: 'https://given.example' });
    expect(r.probe).not.toHaveBeenCalled();
    expect(r.sm.sessions.get(String(sessionId))).toMatchObject({ provider: A, endpoint: 'https://given.example' });
  });

  it('F4: an AUTO host with no apiUrl is skipped without calling the endpoint transform', async () => {
    const r = rig({ hosts: [host(A, ''), host(B, 'https://b.example')] });
    const transform = vi.fn((u: string) => u);
    r.sm.setEndpointTransform(transform);
    await r.sm.initialize();
    const { sessionId } = await start(r.sm);
    expect(transform).not.toHaveBeenCalledWith(undefined);
    expect(transform).not.toHaveBeenCalledWith('');
    expect(r.sm.sessions.get(String(sessionId))).toMatchObject({ provider: B, endpoint: 'https://b.example' });
  });

  it('F6: a registry read that fails is HOST_NOT_AVAILABLE with its cause, before funding', async () => {
    const r = rig();
    r.hostManager.getHostInfo.mockRejectedValue(new Error('rpc down'));
    await r.sm.initialize();
    await expect(start(r.sm, { host: A })).rejects.toMatchObject({ code: 'HOST_NOT_AVAILABLE', message: expect.stringContaining('rpc down') });
    expect(r.paymentManager.createSessionJob).not.toHaveBeenCalled();
  });
});

describe('F3 — the probe needs a 2xx with a string status', () => {
  const realProbe = async (reply: () => Promise<Response>) => {
    const sm: any = new SessionManager({ isInitialized: () => true } as any, {} as any);
    vi.spyOn(globalThis, 'fetch').mockImplementation(reply as any);
    return (await sm._checkHostHealth('https://h.example')).status;
  };
  const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('200 with a status answers; its value is kept', async () => {
    expect(await realProbe(json({ status: 'healthy' }))).toBe('healthy');
    expect(await realProbe(json({ status: 'degraded', issues: ['No P2P node available'] }))).toBe('degraded');
  });

  it('a JSON 404 or 500, a 200 without a status, an HTML 200, a network error → unreachable', async () => {
    expect(await realProbe(json({ error: 'not found' }, 404))).toBe('unreachable');
    expect(await realProbe(json({ status: 'healthy' }, 500))).toBe('unreachable');
    expect(await realProbe(json({}))).toBe('unreachable');
    expect(await realProbe(async () => new Response('<html>hi</html>', { status: 200 }))).toBe('unreachable');
    expect(await realProbe(async () => { throw new TypeError('fetch failed'); })).toBe('unreachable');
  });
});

describe('O4 — HostSelectionService leaves excluded hosts out (written after the code: proven by the mutation gate)', () => {
  const svc = (hosts: any[]) => new HostSelectionService({
    findHostsForModel: vi.fn(async () => hosts), getHostInfo: vi.fn(async (a: string) => hosts.find((h) => h.address === a)),
    hostSupportsModel: vi.fn(async () => true),
  } as any);

  it('H11: AUTO never returns an excluded host (any case); all excluded → null', async () => {
    const C = '0x' + 'ab'.repeat(20); // hex letters, so the case of the exclusion matters
    const s = svc([host(C, 'https://c'), host(B, 'https://b')]);
    for (let i = 0; i < 20; i++) expect((await s.selectHostForModel(MODEL, HostSelectionMode.AUTO, undefined, ['0x' + 'AB'.repeat(20)]))!.address).toBe(B);
    expect(await s.selectHostForModel(MODEL, HostSelectionMode.AUTO, undefined, [C, B])).toBeNull();
  });

  it('F5: exclusions do not use up the ranking window — with 12 hosts and the top 10 excluded, one of the last 2 is picked', async () => {
    const many = Array.from({ length: 12 }, (_, i) => host('0x' + (i + 1).toString(16).padStart(40, '0'), `https://h${i}`));
    const s = svc(many);
    const excluded = many.slice(0, 10).map((h) => h.address);
    const picked = await s.selectHostForModel(MODEL, HostSelectionMode.AUTO, undefined, excluded);
    expect(picked).not.toBeNull();
    expect(excluded).not.toContain(picked!.address);
  });

  it('H12: SPECIFIC returns null when its host is excluded (no alternative is picked)', async () => {
    const s = svc([host(A, 'https://a'), host(B, 'https://b')]);
    expect((await s.selectHostForModel(MODEL, HostSelectionMode.SPECIFIC, A))!.address).toBe(A);
    expect(await s.selectHostForModel(MODEL, HostSelectionMode.SPECIFIC, A, [A])).toBeNull();
  });
});

it('C1 — capability flags', () => {
  expect((entry as any).SDK_CAPABILITIES.hostEndpointFromRegistry).toBe(true);
  expect((entry as any).SDK_CAPABILITIES.hostLivenessBeforeFunding).toBe(true);
});
