import { describe, it, expect } from 'vitest';
import { leadAgentSystemPrompt } from '../../src/prompts/leadAgent';
import { decompositionPrompt } from '../../src/prompts/taskDecomposition';
import { synthesisPrompt } from '../../src/prompts/synthesis';

describe('Prompt Templates', () => {
  it('leadAgentSystemPrompt includes model names from config', () => {
    const prompt = leadAgentSystemPrompt({ fast: 'model-A', deep: 'model-B' });
    expect(prompt).toContain('model-A');
    expect(prompt).toContain('model-B');
  });

  it('leadAgentSystemPrompt includes orchestration patterns', () => {
    const prompt = leadAgentSystemPrompt({ fast: 'f', deep: 'd' });
    expect(prompt).toContain('Fan-Out');
    expect(prompt).toContain('Pipeline');
    expect(prompt).toContain('Map-Reduce');
  });

  it('leadAgentSystemPrompt includes JSON output format', () => {
    const prompt = leadAgentSystemPrompt({ fast: 'f' });
    expect(prompt).toContain('tasks');
    expect(prompt).toMatch(/JSON/i);
  });

  it('decompositionPrompt includes the goal', () => {
    const goal = 'Summarize the quarterly earnings report';
    const prompt = decompositionPrompt(goal);
    expect(prompt).toContain(goal);
  });

  it('decompositionPrompt includes maxSubTasks from options', () => {
    const prompt = decompositionPrompt('Do something', { maxSubTasks: 5 });
    expect(prompt).toContain('5');
  });

  it('synthesisPrompt includes goal and results', () => {
    const goal = 'Analyze market trends';
    const results = new Map<string, { taskId: string; summary: string }>([
      ['task-1', { taskId: 'task-1', summary: 'Revenue grew 12%' }],
      ['task-2', { taskId: 'task-2', summary: 'Costs decreased 5%' }],
    ]);
    const prompt = synthesisPrompt(goal, results);
    expect(prompt).toContain(goal);
    expect(prompt).toContain('Revenue grew 12%');
    expect(prompt).toContain('Costs decreased 5%');
  });
});
