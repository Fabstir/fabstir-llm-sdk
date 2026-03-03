import type { SessionAdapter } from './SessionAdapter';
import type {
  OrchestratorSession,
  TaskGraph,
  OrchestratorTask,
  SubTaskResult,
  OrchestrationOptions,
} from '../types';
import { leadAgentSystemPrompt } from '../prompts/leadAgent';
import { decompositionPrompt } from '../prompts/taskDecomposition';
import { synthesisPrompt } from '../prompts/synthesis';

export class TaskPlanner {
  private readonly adapter: SessionAdapter;
  private readonly session: OrchestratorSession;
  private readonly models: { fast?: string; deep?: string };

  constructor(
    adapter: SessionAdapter,
    session: OrchestratorSession,
    models: { fast?: string; deep?: string },
  ) {
    this.adapter = adapter;
    this.session = session;
    this.models = models;
  }

  async decompose(goal: string, options?: OrchestrationOptions): Promise<TaskGraph> {
    const systemPrompt = leadAgentSystemPrompt(this.models);
    const userPrompt = decompositionPrompt(goal, {
      maxSubTasks: options?.maxSubTasks,
    });

    const { response } = await this.adapter.sendPrompt(
      this.session.sessionId,
      userPrompt,
      systemPrompt,
      undefined,
      undefined,
    );

    const parsed = this.extractJSON(response);
    const tasks = (parsed as any).tasks as OrchestratorTask[];

    if (!tasks || tasks.length === 0) {
      throw new Error('Decomposition returned empty tasks array');
    }

    const taskIds = new Set(tasks.map(t => t.id));
    for (const task of tasks) {
      for (const dep of task.blockedBy) {
        if (!taskIds.has(dep)) {
          throw new Error(`Invalid blockedBy reference: task "${task.id}" references "${dep}" which does not exist`);
        }
      }
    }

    return {
      id: crypto.randomUUID(),
      goal,
      tasks,
      createdAt: new Date().toISOString(),
    };
  }

  async synthesise(goal: string, results: Map<string, SubTaskResult>): Promise<string> {
    const userPrompt = synthesisPrompt(goal, results);
    const { response } = await this.adapter.sendPrompt(
      this.session.sessionId,
      userPrompt,
      undefined,
      undefined,
      undefined,
    );
    return response;
  }

  private extractJSON(raw: string): object {
    // Strip markdown fences
    let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // Try direct parse first
    try {
      return JSON.parse(cleaned);
    } catch {
      // Find first { ... } block
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(cleaned.slice(start, end + 1));
        } catch {
          throw new Error(`Failed to extract valid JSON from model response: ${raw.slice(0, 200)}`);
        }
      }
      throw new Error(`No JSON object found in model response: ${raw.slice(0, 200)}`);
    }
  }
}
