import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentDiscovery } from '../../src/a2a/client/AgentDiscovery';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockCard(name: string, skillTags: string[]) {
  return {
    name,
    description: `${name} agent`,
    url: `http://${name.toLowerCase()}:3000`,
    version: '0.1.0',
    skills: [{ id: 'skill-1', name: 'Skill', description: 'A skill', tags: skillTags }],
    securitySchemes: [],
  };
}

describe('AgentDiscovery', () => {
  let discovery: AgentDiscovery;

  beforeEach(() => {
    discovery = new AgentDiscovery();
    mockFetch.mockReset();
  });

  it('register adds agent URL to known agents', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockCard('Alpha', ['research']) });
    await discovery.register('http://alpha:3000');
    const all = discovery.getRegistered();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Alpha');
  });

  it('findBySkill returns agents with matching skill tag', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockCard('Alpha', ['research', 'analysis']) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockCard('Beta', ['coding', 'testing']) });
    await discovery.register('http://alpha:3000');
    await discovery.register('http://beta:3000');
    const researchers = discovery.findBySkill('research');
    expect(researchers).toHaveLength(1);
    expect(researchers[0].name).toBe('Alpha');
  });

  it('findBySkill returns empty when no match', () => {
    const results = discovery.findBySkill('nonexistent');
    expect(results).toEqual([]);
  });
});
