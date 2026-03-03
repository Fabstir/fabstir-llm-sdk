import { describe, it, expect } from 'vitest';
import type {
  OrchestratorConfig,
  OrchestratorTask,
  TaskState,
  BudgetConfig,
  ModelAssignment,
  OrchestrationResult,
  OrchestratorSession,
  SessionAdapterConfig,
  TaskGraph,
  SubTaskResult,
  TaskType,
  TaskRecord,
  OrchestrationOptions,
  ProgressUpdate,
} from '../src/types';

describe('Core Types', () => {
  it('OrchestratorConfig requires sdk, models, and budget', () => {
    const config: OrchestratorConfig = {
      sdk: {} as any,
      chainId: 84532,
      privateKey: '0xabc',
      models: { fast: 'model-fast', deep: 'model-deep' },
      maxConcurrentSessions: 3,
      budget: { maxDepositPerSubTask: '0.001', maxTotalDeposit: '0.01', maxSubTasks: 10 },
    };
    expect(config.sdk).toBeDefined();
    expect(config.models).toBeDefined();
    expect(config.budget).toBeDefined();
    expect(config.chainId).toBe(84532);
    expect(config.privateKey).toBe('0xabc');
    expect(config.maxConcurrentSessions).toBe(3);
  });

  it('OrchestratorTask has required fields', () => {
    const task: OrchestratorTask = {
      id: 'task-1',
      name: 'Analyze data',
      prompt: 'Analyze the dataset',
      systemPrompt: 'You are a data analyst',
      taskType: 'analysis',
      blockedBy: [],
    };
    expect(task.id).toBe('task-1');
    expect(task.name).toBe('Analyze data');
    expect(task.prompt).toBe('Analyze the dataset');
    expect(task.taskType).toBe('analysis');
    expect(task.blockedBy).toEqual([]);
  });

  it('TaskState enum has all states', () => {
    const states: TaskState[] = [
      'pending', 'blocked', 'claimed', 'working', 'completed', 'failed', 'cancelled',
    ];
    expect(states).toHaveLength(7);
    expect(states).toContain('pending');
    expect(states).toContain('blocked');
    expect(states).toContain('claimed');
    expect(states).toContain('working');
    expect(states).toContain('completed');
    expect(states).toContain('failed');
    expect(states).toContain('cancelled');
  });

  it('BudgetConfig enforces maxSubTasks and maxTotalDeposit', () => {
    const budget: BudgetConfig = {
      maxDepositPerSubTask: '0.001',
      maxTotalDeposit: '0.01',
      maxSubTasks: 5,
    };
    expect(budget.maxSubTasks).toBe(5);
    expect(budget.maxTotalDeposit).toBe('0.01');
    expect(budget.maxDepositPerSubTask).toBe('0.001');
  });

  it('ModelAssignment target is internal or external-a2a', () => {
    const internal: ModelAssignment = { target: 'internal', model: 'fast-model', reason: 'analysis task' };
    const external: ModelAssignment = { target: 'external-a2a', model: 'ext-agent', reason: 'external delegation' };
    expect(internal.target).toBe('internal');
    expect(external.target).toBe('external-a2a');
  });

  it('OrchestrationResult has required fields', () => {
    const result: OrchestrationResult = {
      taskGraphId: 'graph-1',
      synthesis: 'Final merged answer',
      subTaskResults: new Map(),
      proofCIDs: ['cid-1', 'cid-2'],
      totalTokensUsed: 1500,
    };
    expect(result.taskGraphId).toBe('graph-1');
    expect(result.synthesis).toBe('Final merged answer');
    expect(result.subTaskResults).toBeInstanceOf(Map);
    expect(result.proofCIDs).toHaveLength(2);
    expect(result.totalTokensUsed).toBe(1500);
  });

  it('OrchestratorSession has sessionId, jobId, model, chainId', () => {
    const session: OrchestratorSession = {
      sessionId: 42n,
      jobId: 100n,
      model: 'CohereForAI/TinyVicuna:tiny.gguf',
      chainId: 84532,
    };
    expect(session.sessionId).toBe(42n);
    expect(session.jobId).toBe(100n);
    expect(typeof session.sessionId).toBe('bigint');
    expect(typeof session.jobId).toBe('bigint');
    expect(session.model).toBe('CohereForAI/TinyVicuna:tiny.gguf');
    expect(session.chainId).toBe(84532);
  });

  it('SessionAdapterConfig requires chainId and depositAmount; encryption defaults to true', () => {
    const config: SessionAdapterConfig = {
      chainId: 84532,
      depositAmount: '0.001',
    };
    expect(config.chainId).toBe(84532);
    expect(config.depositAmount).toBe('0.001');
    expect(config.encryption).toBeUndefined();

    const withEncryption: SessionAdapterConfig = {
      chainId: 84532,
      depositAmount: '0.001',
      encryption: true,
    };
    expect(withEncryption.encryption).toBe(true);
  });

  it('ProgressUpdate accepts phase, taskId, and taskName fields', () => {
    const update: ProgressUpdate = {
      phase: 'decomposing',
      message: 'Decomposing goal',
      completedTasks: 0,
      totalTasks: 0,
      taskId: 'task-1',
      taskName: 'Research',
    };
    expect(update.phase).toBe('decomposing');
    expect(update.taskId).toBe('task-1');
    expect(update.taskName).toBe('Research');
  });
});
