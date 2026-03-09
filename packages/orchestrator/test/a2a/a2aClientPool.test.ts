import { describe, it, expect, vi, beforeEach } from 'vitest';
import { A2AClientPool } from '../../src/a2a/client/A2AClientPool';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockAgentCard = {
  name: 'External Agent',
  description: 'Test agent',
  url: 'http://external:3000',
  version: '0.1.0',
  skills: [{ id: 'test-skill', name: 'Test', description: 'Test skill', tags: ['test'] }],
  securitySchemes: [],
};

describe('A2AClientPool', () => {
  let pool: A2AClientPool;

  beforeEach(() => {
    pool = new A2AClientPool();
    mockFetch.mockReset();
  });

  it('discover fetches and caches agent card', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAgentCard,
    });
    const card = await pool.discover('http://external:3000');
    expect(card.name).toBe('External Agent');
    expect(card.skills).toHaveLength(1);
    // Second call should use cache
    const cached = await pool.discover('http://external:3000');
    expect(cached.name).toBe('External Agent');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('delegate sends message to external agent', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentCard })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { status: { state: 'completed' },
            artifacts: [{ parts: [{ type: 'text', text: 'External result' }] }],
          },
        }),
      });
    const result = await pool.delegate('http://external:3000', 'Do something');
    expect(result.summary).toBe('External result');
  });

  it('delegate extracts text from completed task artifacts', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentCard })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { status: { state: 'completed' },
            artifacts: [
              { parts: [{ type: 'text', text: 'Part 1' }, { type: 'text', text: 'Part 2' }] },
            ],
          },
        }),
      });
    const result = await pool.delegate('http://external:3000', 'Task');
    expect(result.summary).toContain('Part 1');
    expect(result.summary).toContain('Part 2');
  });

  it('delegate supports streaming mode', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentCard })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { status: { state: 'completed' },
            artifacts: [{ parts: [{ type: 'text', text: 'Streamed result' }] }],
          },
        }),
      });
    const result = await pool.delegate('http://external:3000', 'Task', { streaming: true });
    expect(result.summary).toBe('Streamed result');
  });

  it('delegate returns SubTaskResult with external model label', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentCard })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { status: { state: 'completed' },
            artifacts: [{ parts: [{ type: 'text', text: 'Result' }] }],
          },
        }),
      });
    const result = await pool.delegate('http://external:3000', 'Task');
    expect(result.model).toBe('external:http://external:3000');
    expect(result.taskId).toBeDefined();
  });
});
