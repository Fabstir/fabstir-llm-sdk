// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Storage region (1.39.27, echo 1.39.28) T7 — LIVE, against the UK engineering portal (the brief: point tests at it freely, store no
 * client data). Gated: REGION_LIVE=1. Acceptance (b) and (d) — the capture of every outbound connection is the test
 * that counts, not a unit test of StorageManager.
 *
 * Capture: every TCP connect in this process (net.Socket.prototype.connect — under fetch/undici, https and WebSocket
 * alike) and every DNS lookup. A local stand-in for the application backend holds the UK registration token
 * (S5_UK_REGISTRATION_TOKEN, given privately by the node developer; never written to a file) and registers on the UK
 * portal with it, as the harness route does.
 *
 *   REGION_LIVE=1 S5_UK_REGISTRATION_TOKEN=… npx vitest run tests/region/region-live-capture.test.ts
 */

import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import dns from 'node:dns';
import http from 'node:http';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ChainId } from '../../src/types/chain.types';

const LIVE = process.env.REGION_LIVE === '1';
const TOKEN = process.env.S5_UK_REGISTRATION_TOKEN;
const UK_HOST = 's5-uk.platformlessai.ai';
const UK_PORTAL = `https://${UK_HOST}`;

const dialled = new Set<string>();
const looked = new Set<string>();
let blockUk = false;

const origConnect = net.Socket.prototype.connect;
const origLookup = dns.lookup;
function installCapture() {
  (net.Socket.prototype as any).connect = function (...args: any[]) {
    const o = args[0];
    const host = Array.isArray(o) ? o[0]?.host : (o && typeof o === 'object') ? (o.host ?? o.path) : args[1];
    dialled.add(String(host ?? 'localhost'));
    if (blockUk && String(host) === UK_HOST) {
      // The UK portal unreachable (acceptance b): the connection is refused here, nothing is sent.
      const self = this;
      process.nextTick(() => self.destroy(Object.assign(new Error(`connect ECONNREFUSED ${UK_HOST} (test)`), { code: 'ECONNREFUSED' })));
      return this;
    }
    return (origConnect as any).apply(this, args);
  };
  (dns as any).lookup = function (hostname: string, ...rest: any[]) {
    looked.add(hostname);
    return (origLookup as any).call(dns, hostname, ...rest);
  };
}
function removeCapture() {
  (net.Socket.prototype as any).connect = origConnect;
  (dns as any).lookup = origLookup;
}

/**
 * The application backend, in miniature: <url>/register and /register-complete, the UK portal and its token only; both
 * replies echo the region (1.39.28). 'outdated' is a backend not yet updated for regions: it ignores `region`, answers
 * /register with a challenge and no echo, and contacts no portal (a real one would use the Global portal and token).
 */
async function startBackend(mode: 'updated' | 'outdated' = 'updated'): Promise<{ url: string; close: () => Promise<void>; regions: string[]; paths: string[] }> {
  const regions: string[] = [];
  const paths: string[] = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw || '{}');
    regions.push(String(body.region));
    paths.push(String(req.url));
    const send = (status: number, obj: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (mode === 'outdated') {
      if (req.url === '/api/s5/register') return send(200, { challenge: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url') });
      return send(200, { authToken: 'outdated-backend-token' });
    }
    if (body.region !== 'uk' || !TOKEN) return send(400, { error: `no registration token for region ${body.region}` });
    const auth = { Authorization: `Bearer ${TOKEN}` };
    try {
      if (req.url === '/api/s5/register') {
        const r = await fetch(`${UK_PORTAL}/s5/account/register?pubKey=${encodeURIComponent(body.pubKey)}`, { headers: auth });
        if (!r.ok) return send(r.status, { error: await r.text() });
        return send(200, { challenge: (await r.json()).challenge, region: 'uk' });
      }
      if (req.url === '/api/s5/register-complete') {
        const r = await fetch(`${UK_PORTAL}/s5/account/register`, {
          method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ pubKey: body.pubKey, response: body.response, signature: body.signature, label: body.label }),
        });
        const text = await r.text();
        if (!r.ok) return send(500, { error: text });
        const cookie = r.headers.get('set-cookie')?.match(/s5-auth-token=([^;]+)/)?.[1];
        return send(200, { authToken: cookie ?? JSON.parse(text).authToken, region: 'uk' });
      }
      send(404, { error: 'not found' });
    } catch (e: any) {
      send(502, { error: e?.message ?? String(e) });
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  return { url: `http://127.0.0.1:${port}/api/s5`, regions, paths, close: () => new Promise((r) => server.close(() => r())) };
}

function ukSdk(authApiUrl: string) {
  const e = process.env;
  return new FabstirSDKCore({
    mode: 'production', chainId: ChainId.BASE_SEPOLIA, rpcUrl: e.RPC_URL_BASE_SEPOLIA!,
    storageRegion: 'uk',
    s5Config: { authApiUrl },
    contractAddresses: {
      jobMarketplace: e.CONTRACT_JOB_MARKETPLACE, nodeRegistry: e.CONTRACT_NODE_REGISTRY, proofSystem: e.CONTRACT_PROOF_SYSTEM,
      hostEarnings: e.CONTRACT_HOST_EARNINGS, modelRegistry: e.CONTRACT_MODEL_REGISTRY, usdcToken: e.CONTRACT_USDC_TOKEN,
      fabToken: e.CONTRACT_FAB_TOKEN,
    },
  } as any);
}

/** Hosts this session may reach: the UK portal, the chain RPC, and the local backend. Everything else fails the test. */
function allowed(): Set<string> {
  return new Set([UK_HOST, new URL(process.env.RPC_URL_BASE_SEPOLIA!).hostname, '127.0.0.1', 'localhost', '::1']);
}
const FORBIDDEN = /platformlessai\.ai$|sfive|s5\.(vup|garden|ninja)|s5\.cx/;

describe.skipIf(!LIVE)('T7 live capture, storageRegion uk', () => {
  let backend: Awaited<ReturnType<typeof startBackend>>;
  beforeAll(async () => { installCapture(); backend = await startBackend(); });
  afterAll(async () => { await backend?.close(); removeCapture(); });

  test('(b) the UK portal unreachable: every storage call fails, and no other storage host is dialled', async () => {
    dialled.clear(); looked.clear(); blockUk = true;
    try {
      const sdk = ukSdk(backend.url);
      await sdk.authenticate('privatekey', { privateKey: process.env.TEST_USER_1_PRIVATE_KEY! }).catch(() => undefined);
      const sm: any = (sdk as any).storageManager;
      for (const call of [() => sm.store({ t: 1 }), () => sm.saveConversation({ id: 'c1', messages: [] }), () => sm.putWithRetry('home/region-test/doc.txt', 'x'), () => sm.getUserSettings()]) {
        await expect(call()).rejects.toBeDefined();
      }
      expect(() => sdk.getVectorRAGManager()).toThrow();
    } finally {
      blockUk = false;
    }
    const hosts = [...dialled, ...looked].filter((h) => h !== 'undefined');
    console.log('[T7 b] dialled:', [...dialled].join(', '), '| looked up:', [...looked].join(', '));
    expect(hosts.filter((h) => FORBIDDEN.test(h) && h !== UK_HOST)).toEqual([]);
    expect(hosts.every((h) => allowed().has(h))).toBe(true);
  }, 240_000);

  test.skipIf(!TOKEN)('(d) register, store a file, documents, vectors, a session group: no storage host but the UK portal', async () => {
    dialled.clear(); looked.clear();
    const sdk = ukSdk(backend.url);
    await sdk.authenticate('privatekey', { privateKey: process.env.TEST_USER_1_PRIVATE_KEY! });
    expect(backend.regions).toEqual(['uk', 'uk']);                       // both registration calls named the region
    const sm: any = (sdk as any).storageManager;
    const stamp = Date.now();
    await sm.store({ regionTest: stamp });                                 // a file
    await sm.saveConversation({ id: `region-${stamp}`, messages: [{ role: 'user', content: 'hello', timestamp: stamp }] });
    await sm.putWithRetry(`home/region-test/doc-${stamp}.txt`, 'document text');   // documents (the UI's upload path)
    expect(await sm.getWithRetry(`home/region-test/doc-${stamp}.txt`)).toBe('document text');
    await sdk.getVectorRAGReady();
    const rag: any = sdk.getVectorRAGManager();
    const db = `region-db-${stamp}`;
    const session = await rag.createSession(db);
    await rag.addVectors(session, [{ id: 'v1', vector: [0.1, 0.2, 0.3], metadata: { text: 'chunk' } }]);
    await rag.addPendingDocument(db, { id: 'doc1', fileName: 'doc.txt' });
    const groups: any = sdk.getSessionGroupManager();
    await groups.createSessionGroup({ name: `region-${stamp}`, owner: (sdk as any).userAddress });
    const hosts = [...dialled, ...looked].filter((h) => h !== 'undefined');
    console.log('[T7 d] dialled:', [...dialled].join(', '), '| looked up:', [...looked].join(', '));
    expect(dialled.has(UK_HOST)).toBe(true);
    expect(hosts.filter((h) => FORBIDDEN.test(h) && h !== UK_HOST)).toEqual([]);
    expect(hosts.every((h) => allowed().has(h))).toBe(true);
  }, 300_000);

  test('(g, 1.39.28) a backend not updated for regions: the sign-in is refused at /register, and nothing completes a registration', async () => {
    dialled.clear(); looked.clear();
    const outdated = await startBackend('outdated');
    try {
      const sdk = ukSdk(outdated.url);
      await expect(sdk.authenticate('privatekey', { privateKey: process.env.TEST_USER_1_PRIVATE_KEY! }))
        .rejects.toMatchObject({ code: 'STORAGE_REGION_REGISTRATION_REFUSED', details: { region: 'uk', call: 'register', received: null } });
      expect(outdated.paths).toEqual(['/api/s5/register']);            // /register-complete was never sent
    } finally {
      await outdated.close();
    }
    const hosts = [...dialled, ...looked].filter((h) => h !== 'undefined');
    console.log('[T7 g] dialled:', [...dialled].join(', '), '| looked up:', [...looked].join(', '));
    expect(hosts.filter((h) => FORBIDDEN.test(h) && h !== UK_HOST)).toEqual([]);
    expect(hosts.every((h) => allowed().has(h))).toBe(true);
  }, 240_000);
});
