import type { FabstirSDKCore } from '@fabstir/sdk-core';
import type { X402PricingConfig, X402BudgetConfig } from './x402/types';

// --- Budget ---
export interface BudgetConfig {
  maxDepositPerSubTask: string;
  maxTotalDeposit: string;
  maxSubTasks: number;
}

// --- Orchestrator Configuration ---
export interface OrchestratorConfig {
  sdk: FabstirSDKCore;
  chainId: number;
  privateKey: string;
  models: {
    fast?: string;
    deep?: string;
    planning?: string;
  };
  maxConcurrentSessions: number;
  budget: BudgetConfig;
  taskStoragePrefix?: string;
  x402?: { pricing?: X402PricingConfig; budget?: X402BudgetConfig; signerProvider?: any; usdcAddress?: string };
}

// --- Task Types ---
export type TaskType = 'tool-calling' | 'analysis' | 'synthesis' | 'external';

export type TaskState =
  | 'pending'
  | 'blocked'
  | 'claimed'
  | 'working'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskHints {
  preferredModel?: 'fast' | 'deep';
  estimatedTokens?: number;
  externalAgentUrl?: string;
}

export interface OrchestratorTask {
  id: string;
  name: string;
  prompt: string;
  systemPrompt: string;
  taskType: TaskType;
  blockedBy: string[];
  hints?: TaskHints;
}

// --- Task Graph ---
export interface TaskGraph {
  id: string;
  goal: string;
  tasks: OrchestratorTask[];
  createdAt: string;
}

// --- Task Record (runtime state) ---
export interface TaskRecord {
  id: string;
  graphId: string;
  name: string;
  state: TaskState;
  assignedModel?: string;
  resultSummary?: string;
  proofCID?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Model Assignment ---
export interface ModelAssignment {
  target: 'internal' | 'external-a2a';
  model: string;
  reason: string;
}

// --- Sub-Task Result ---
export interface SubTaskResult {
  taskId: string;
  model: string;
  summary: string;
  artifacts: any[];
  proofCID?: string;
  sessionId?: bigint;
  tokensUsed?: number;
}

// --- Orchestration Result ---
export interface OrchestrationResult {
  taskGraphId: string;
  synthesis: string;
  subTaskResults: Map<string, SubTaskResult>;
  proofCIDs: string[];
  totalTokensUsed: number;
  x402Spend?: string;
}

// --- Orchestration Options ---
export interface OrchestrationOptions {
  signal?: AbortSignal;
  onProgress?: (update: ProgressUpdate) => void;
  maxSubTasks?: number;
}

export interface ProgressUpdate {
  phase: 'decomposing' | 'executing' | 'synthesising';
  message: string;
  completedTasks: number;
  totalTasks: number;
  taskId?: string;
  taskName?: string;
}

// --- Session Types ---
export interface OrchestratorSession {
  sessionId: bigint;
  jobId: bigint;
  model: string;
  chainId: number;
}

export interface SessionAdapterConfig {
  chainId: number;
  depositAmount: string;
  encryption?: boolean;
  paymentToken?: string;
}
