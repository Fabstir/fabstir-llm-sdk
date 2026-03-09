import { describe, it, expect } from 'vitest';
import { buildAgentCard } from '../../src/a2a/server/agentCard';

describe('buildAgentCard', () => {
  const defaultConfig = { publicUrl: 'https://example.com' };

  it('returns valid AgentCard', () => {
    const card = buildAgentCard(defaultConfig);
    expect(card.name).toBeTruthy();
    expect(card.description).toBeTruthy();
    expect(card.url).toBe('https://example.com');
    expect(card.version).toBeTruthy();
    expect(Array.isArray(card.skills)).toBe(true);
    expect(card.skills.length).toBeGreaterThan(0);
  });

  it('includes encrypted-orchestration skill', () => {
    const card = buildAgentCard(defaultConfig);
    const skill = card.skills.find((s) => s.id === 'encrypted-orchestration');
    expect(skill).toBeDefined();
    expect(skill!.tags).toContain('orchestration');
    expect(skill!.tags).toContain('encrypted');
  });

  it('uses config agentName and publicUrl', () => {
    const card = buildAgentCard({
      agentName: 'Custom Agent',
      publicUrl: 'https://custom.io',
    });
    expect(card.name).toBe('Custom Agent');
    expect(card.url).toBe('https://custom.io');
  });

  it('includes wallet-auth security scheme', () => {
    const card = buildAgentCard(defaultConfig);
    const scheme = card.securitySchemes.find(
      (s) => s.scheme === 'bearer' && s.type === 'http',
    );
    expect(scheme).toBeDefined();
    expect(scheme!.description).toContain('Wallet');
  });
});
