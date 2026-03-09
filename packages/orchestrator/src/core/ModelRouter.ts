import type { FabstirSDKCore } from '@fabstir/sdk-core';
import type { OrchestratorTask, ModelAssignment } from '../types';

export class ModelRouter {
  private readonly sdk: FabstirSDKCore;
  private readonly models: { fast?: string; deep?: string };
  private availableModels: string[] = [];

  constructor(sdk: FabstirSDKCore, models: { fast?: string; deep?: string }) {
    this.sdk = sdk;
    this.models = models;
  }

  async initialize(): Promise<void> {
    const modelManager = this.sdk.getModelManager();
    const modelsWithHosts = await modelManager.getAvailableModelsWithHosts();
    const toStr = (m: any) => `${m.model.huggingfaceRepo}:${m.model.fileName}`;

    this.availableModels = modelsWithHosts.map(toStr);
    const availableSet = new Set(
      modelsWithHosts.filter((m: any) => m.hostCount > 0).map(toStr),
    );

    for (const [role, model] of Object.entries(this.models)) {
      if (model && !availableSet.has(model)) {
        throw new Error(`Configured ${role} model "${model}" has no available hosts`);
      }
    }
  }

  private mk(target: 'internal' | 'external-a2a', model: string, reason: string): ModelAssignment {
    return { target, model, reason };
  }

  assign(task: OrchestratorTask): ModelAssignment {
    const hints = task.hints;

    // External agent delegation
    if (hints?.externalAgentUrl) {
      return this.mk('external-a2a', hints.externalAgentUrl, 'Task delegated to external agent');
    }

    // Explicit preferred model hint
    if (hints?.preferredModel) {
      const model = this.models[hints.preferredModel] ?? this.models.fast!;
      return this.mk('internal', model, `Explicit hint: ${hints.preferredModel}`);
    }

    // Tool-calling always needs deep (small models unreliable at JSON)
    if (task.taskType === 'tool-calling') {
      return this.mk('internal', this.models.deep!, 'Tool-calling requires deep model for reliable JSON');
    }

    // Analysis: small tasks go to fast, larger to deep
    if (task.taskType === 'analysis') {
      if (hints?.estimatedTokens !== undefined && hints.estimatedTokens < 2000) {
        return this.mk('internal', this.models.fast!, `Small analysis (${hints.estimatedTokens} tokens) routed to fast`);
      }
      return this.mk('internal', this.models.deep!, 'Analysis task routed to deep model');
    }

    // Synthesis always deep
    if (task.taskType === 'synthesis') {
      return this.mk('internal', this.models.deep!, 'Synthesis task routed to deep model');
    }

    // Default: fast model for unknown task types
    return this.mk('internal', this.models.fast!, `Default routing for taskType "${task.taskType}"`);
  }

  getAvailableModels(): string[] {
    return [...this.availableModels];
  }
}
