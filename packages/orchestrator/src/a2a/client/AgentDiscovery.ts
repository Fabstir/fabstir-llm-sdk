import type { A2AAgentCard } from '../types';

export class AgentDiscovery {
  private readonly agents: Map<string, A2AAgentCard> = new Map();

  async register(agentUrl: string): Promise<void> {
    const response = await fetch(`${agentUrl}/.well-known/agent.json`);
    if (!response.ok) {
      throw new Error(`Failed to discover agent at ${agentUrl}: ${response.status}`);
    }
    const card = (await response.json()) as A2AAgentCard;
    this.agents.set(agentUrl, card);
  }

  findBySkill(skillTag: string): A2AAgentCard[] {
    const matches: A2AAgentCard[] = [];
    for (const card of this.agents.values()) {
      const hasSkill = card.skills.some(s => s.tags.includes(skillTag));
      if (hasSkill) matches.push(card);
    }
    return matches;
  }

  getRegistered(): A2AAgentCard[] {
    return [...this.agents.values()];
  }
}
