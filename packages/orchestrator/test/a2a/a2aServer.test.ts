import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { OrchestratorA2AServer } from '../../src/a2a/server/OrchestratorA2AServer';

function createMockManager() {
  return {
    orchestrate: vi.fn().mockResolvedValue({
      taskGraphId: 'graph-1', synthesis: 'Final answer',
      subTaskResults: new Map(), proofCIDs: [], totalTokensUsed: 100,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

function mockSSEReq(goal = 'test goal') {
  const req = new EventEmitter() as any;
  req.headers = { authorization: 'Bearer valid-jwt', accept: 'text/event-stream' };
  req.body = { goal };
  return req;
}

function mockSSERes() {
  return { setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(), end: vi.fn(), destroyed: false };
}

function parseSSEWrites(res: ReturnType<typeof mockSSERes>) {
  return res.write.mock.calls.map((c: any[]) => JSON.parse(c[0].replace('data: ', '').trim()));
}

async function runSSE(server: OrchestratorA2AServer, req?: any, res?: any) {
  server.setJwtVerifier(() => true);
  const handler = server.getRouteHandler('/v1/orchestrate');
  req = req ?? mockSSEReq();
  res = res ?? mockSSERes();
  await handler(req, res as any);
  return { req, res, writes: parseSSEWrites(res) };
}

describe('OrchestratorA2AServer', () => {
  let server: OrchestratorA2AServer;
  let manager: ReturnType<typeof createMockManager>;

  beforeEach(() => {
    manager = createMockManager();
    server = new OrchestratorA2AServer(manager as any, {
      publicUrl: 'http://localhost:3000', port: 0,
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    });
  });

  afterEach(async () => { await server.stop(); });

  it('server exposes /.well-known/agent.json', () => {
    const handlers = server.getRoutes();
    expect(handlers).toContainEqual(expect.objectContaining({ path: '/.well-known/agent.json' }));
  });

  it('server exposes /v1/orchestrate endpoint', () => {
    expect(server.getRoutes().some((r: any) => r.path === '/v1/orchestrate')).toBe(true);
  });

  it('/v1/orchestrate rejects unauthenticated requests', async () => {
    const handler = server.getRouteHandler('/v1/orchestrate');
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ headers: {}, body: { goal: 'test' } } as any, mockRes as any);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('/v1/orchestrate accepts wallet-signed JWT', async () => {
    server.setJwtVerifier(() => true);
    const handler = server.getRouteHandler('/v1/orchestrate');
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ headers: { authorization: 'Bearer valid-jwt' }, body: { goal: 'test' } } as any, mockRes as any);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ synthesis: 'Final answer' }));
  });

  it('server starts on configured port', async () => {
    await server.start();
    expect(server.isListening()).toBe(true);
    await server.stop();
  });

  it('server serves agent card at well-known endpoint', () => {
    const card = server.getAgentCard();
    expect(card.name).toBeDefined();
    expect(card.url).toBe('http://localhost:3000');
    expect(card.skills.length).toBeGreaterThan(0);
  });

  it('SSE: returns text/event-stream content type when Accept header set', async () => {
    const { res } = await runSSE(server);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
  });

  it('SSE: streams status-update working event on start', async () => {
    const { writes } = await runSSE(server);
    expect(writes.find((e: any) => e.type === 'status-update' && e.state === 'working')).toBeDefined();
  });

  it('SSE: streams progress status-update events during orchestration', async () => {
    manager.orchestrate.mockImplementation(async (_g: string, opts: any) => {
      opts?.onProgress?.({ phase: 'executing', message: 'Step 1/2', completedTasks: 1, totalTasks: 2 });
      return { taskGraphId: 'g-1', synthesis: 'Done', subTaskResults: new Map(), proofCIDs: [], totalTokensUsed: 50 };
    });
    const { writes } = await runSSE(server);
    expect(writes.filter((e: any) => e.message === 'Step 1/2').length).toBe(1);
  });

  it('SSE: streams artifact-update with synthesis', async () => {
    const { writes } = await runSSE(server);
    const artifact = writes.find((e: any) => e.type === 'artifact-update');
    expect(artifact).toBeDefined();
    expect(artifact.artifact.text).toBe('Final answer');
  });

  it('SSE: streams completed status-update at end', async () => {
    const { writes } = await runSSE(server);
    expect(writes[writes.length - 1]).toMatchObject({ type: 'status-update', state: 'completed' });
  });

  it('SSE: client disconnect triggers abort', async () => {
    let capturedSignal: AbortSignal | undefined;
    manager.orchestrate.mockImplementation(async (_g: string, opts: any) => {
      capturedSignal = opts?.signal;
      await new Promise((r) => setTimeout(r, 100));
      return { taskGraphId: 'g-1', synthesis: 'Done', subTaskResults: new Map(), proofCIDs: [], totalTokensUsed: 0 };
    });
    server.setJwtVerifier(() => true);
    const handler = server.getRouteHandler('/v1/orchestrate');
    const req = mockSSEReq();
    const res = mockSSERes();
    const promise = handler(req, res as any);
    await new Promise((r) => setTimeout(r, 10));
    req.emit('close');
    await promise;
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('sync JSON: still works without Accept header (backward compat)', async () => {
    server.setJwtVerifier(() => true);
    const handler = server.getRouteHandler('/v1/orchestrate');
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ headers: { authorization: 'Bearer jwt' }, body: { goal: 'test' } } as any, mockRes as any);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ synthesis: 'Final answer' }));
  });

  it('DELETE /v1/orchestrate/:taskId cancels active task', async () => {
    let resolveOrchestrate: () => void;
    manager.orchestrate.mockImplementation(async () => {
      await new Promise<void>((r) => { resolveOrchestrate = r; });
      return { taskGraphId: 'g-1', synthesis: 'Done', subTaskResults: new Map(), proofCIDs: [], totalTokensUsed: 0 };
    });
    server.setJwtVerifier(() => true);
    const handler = server.getRouteHandler('/v1/orchestrate');
    const req = mockSSEReq();
    const res = mockSSERes();
    const promise = handler(req, res as any);
    await new Promise((r) => setTimeout(r, 10));
    const taskId = JSON.parse(res.write.mock.calls[0][0].replace('data: ', '').trim()).taskId;
    const cancelHandler = server.getRouteHandler('/v1/orchestrate/:taskId');
    const cancelRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await cancelHandler({ params: { taskId } } as any, cancelRes as any);
    expect(cancelRes.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    resolveOrchestrate!();
    await promise;
  });

  it('DELETE /v1/orchestrate/:taskId returns 404 for unknown task', async () => {
    const cancelHandler = server.getRouteHandler('/v1/orchestrate/:taskId');
    const cancelRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await cancelHandler({ params: { taskId: 'nonexistent' } } as any, cancelRes as any);
    expect(cancelRes.status).toHaveBeenCalledWith(404);
  });

  it('orchestrate response X-PAYMENT-RESPONSE header is valid base64 without Buffer', async () => {
    const x402Cfg = {
      orchestratePrice: '1000000', payTo: '0xRecipient',
      asset: 'USDC', network: 'base-sepolia', maxTimeoutSeconds: 30,
    };
    const x402Server = new OrchestratorA2AServer(manager as any, {
      publicUrl: 'http://localhost:3000', port: 0, x402Pricing: x402Cfg,
    });
    const handler = x402Server.getRouteHandler('/v1/orchestrate');
    const paymentPayload = {
      x402Version: 1, scheme: 'exact', network: 'base-sepolia',
      payload: { signature: '0xsig', authorization: {
        from: '0xPayer', to: '0xRecipient', value: '1000000',
        validAfter: '0', validBefore: String(Math.floor(Date.now() / 1000) + 3600), nonce: '0x01',
      } },
    };
    const xPaymentHeader = btoa(JSON.stringify(paymentPayload));
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
    await handler({ headers: { 'x-payment': xPaymentHeader }, body: { goal: 'test' } } as any, res as any);
    expect(res.setHeader).toHaveBeenCalledWith('X-PAYMENT-RESPONSE', expect.any(String));
    const b64 = res.setHeader.mock.calls.find((c: any[]) => c[0] === 'X-PAYMENT-RESPONSE')![1] as string;
    // Decode using atob (browser-compatible), NOT Buffer
    const parsed = JSON.parse(atob(b64));
    expect(parsed.success).toBe(true);
    expect(parsed.network).toBe('base-sepolia');
    await x402Server.stop();
  });
});
