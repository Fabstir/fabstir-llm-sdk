import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SSEEventBus } from '../../src/a2a/server/SSEEventBus';
import type { StatusEvent, ArtifactEvent } from '../../src/a2a/server/OrchestratorExecutor';

function mockResponse() {
  return {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    destroyed: false,
  };
}

describe('SSEEventBus', () => {
  let res: ReturnType<typeof mockResponse>;

  beforeEach(() => {
    res = mockResponse();
  });

  it('constructor sets SSE response headers', () => {
    new SSEEventBus(res as any);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it('publish writes SSE-formatted event', () => {
    const bus = new SSEEventBus(res as any);
    const event: StatusEvent = { type: 'status-update', taskId: 't-1', state: 'working', message: 'Starting' };
    bus.publish(event);
    expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify(event)}\n\n`);
  });

  it('publish writes multiple events sequentially', () => {
    const bus = new SSEEventBus(res as any);
    const e1: StatusEvent = { type: 'status-update', taskId: 't-1', state: 'working', message: 'Step 1' };
    const e2: StatusEvent = { type: 'status-update', taskId: 't-1', state: 'working', message: 'Step 2' };
    const e3: ArtifactEvent = { type: 'artifact-update', taskId: 't-1', artifact: { type: 'text', text: 'Result' } };
    bus.publish(e1);
    bus.publish(e2);
    bus.publish(e3);
    expect(res.write).toHaveBeenCalledTimes(3);
    expect(res.write.mock.calls[0][0]).toContain('Step 1');
    expect(res.write.mock.calls[1][0]).toContain('Step 2');
    expect(res.write.mock.calls[2][0]).toContain('Result');
  });

  it('close ends the response', () => {
    const bus = new SSEEventBus(res as any);
    bus.close();
    expect(res.end).toHaveBeenCalled();
  });

  it('publish after close is a no-op', () => {
    const bus = new SSEEventBus(res as any);
    bus.close();
    const event: StatusEvent = { type: 'status-update', taskId: 't-1', state: 'working', message: 'Late' };
    bus.publish(event);
    expect(res.write).not.toHaveBeenCalled();
  });

  it('publish after client disconnect is a no-op', () => {
    const bus = new SSEEventBus(res as any);
    res.destroyed = true;
    const event: StatusEvent = { type: 'status-update', taskId: 't-1', state: 'working', message: 'Late' };
    bus.publish(event);
    expect(res.write).not.toHaveBeenCalled();
  });
});
