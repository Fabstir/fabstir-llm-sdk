import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrchestratorA2AServer } from '../../src/a2a/server/OrchestratorA2AServer';

function createMockManager() {
  return {
    orchestrate: vi.fn().mockResolvedValue({
      taskGraphId: 'graph-1',
      synthesis: 'Final answer',
      subTaskResults: new Map(),
      proofCIDs: [],
      totalTokensUsed: 100,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

describe('OrchestratorA2AServer', () => {
  let server: OrchestratorA2AServer;
  let manager: ReturnType<typeof createMockManager>;

  beforeEach(() => {
    manager = createMockManager();
    server = new OrchestratorA2AServer(manager as any, {
      publicUrl: 'http://localhost:3000',
      port: 0, // random port for testing
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('server exposes /.well-known/agent.json', async () => {
    const app = server.getApp();
    const { default: request } = await import('supertest').catch(() => ({ default: null }));
    // If supertest not available, test the route handler directly
    if (!request) {
      const handlers = server.getRoutes();
      expect(handlers).toContainEqual(expect.objectContaining({ path: '/.well-known/agent.json' }));
      return;
    }
  });

  it('server exposes /v1/orchestrate endpoint', async () => {
    const routes = server.getRoutes();
    expect(routes.some((r: any) => r.path === '/v1/orchestrate')).toBe(true);
  });

  it('/v1/orchestrate rejects unauthenticated requests', async () => {
    const handler = server.getRouteHandler('/v1/orchestrate');
    const mockReq = { headers: {}, body: { goal: 'test' } };
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler(mockReq as any, mockRes as any);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('/v1/orchestrate accepts wallet-signed JWT', async () => {
    const handler = server.getRouteHandler('/v1/orchestrate');
    const mockReq = {
      headers: { authorization: 'Bearer valid-jwt-token' },
      body: { goal: 'test goal' },
    };
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    // Override JWT verification for test
    server.setJwtVerifier(() => true);
    await handler(mockReq as any, mockRes as any);
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
});
