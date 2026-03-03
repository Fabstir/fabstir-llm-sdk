// @fabstir/orchestrator — public API
export type {
  OrchestratorConfig,
  BudgetConfig,
  TaskGraph,
  OrchestratorTask,
  TaskType,
  TaskHints,
  TaskState,
  TaskRecord,
  ModelAssignment,
  SubTaskResult,
  OrchestrationResult,
  OrchestrationOptions,
  ProgressUpdate,
  OrchestratorSession,
  SessionAdapterConfig,
} from './types';

export { SessionAdapter } from './core/SessionAdapter';
export { SessionPool } from './core/SessionPool';
export { ModelRouter } from './core/ModelRouter';
export { leadAgentSystemPrompt } from './prompts/leadAgent';
export { decompositionPrompt } from './prompts/taskDecomposition';
export { synthesisPrompt } from './prompts/synthesis';
export { TaskPlanner } from './core/TaskPlanner';
export { TaskQueue } from './core/TaskQueue';
export { ProofCollector } from './core/ProofCollector';
export { OrchestratorManager } from './core/OrchestratorManager';
export { fanOut } from './patterns/FanOut';
export { pipeline } from './patterns/Pipeline';
export { mapReduce } from './patterns/MapReduce';
export { OrchestratorExecutor } from './a2a/server/OrchestratorExecutor';
export type { RequestContext, EventBus, StatusEvent, ArtifactEvent } from './a2a/server/OrchestratorExecutor';
export { SSEEventBus } from './a2a/server/SSEEventBus';
export { buildAgentCard } from './a2a/server/agentCard';
export { OrchestratorA2AServer } from './a2a/server/OrchestratorA2AServer';
export type { A2AAgentCard, A2ASkill, A2ASecurityScheme, A2AServerConfig } from './a2a/types';
export { A2AClientPool } from './a2a/client/A2AClientPool';
export { AgentDiscovery } from './a2a/client/AgentDiscovery';
