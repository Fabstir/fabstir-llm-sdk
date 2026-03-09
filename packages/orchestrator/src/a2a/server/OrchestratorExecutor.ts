import type { OrchestratorManager } from '../../core/OrchestratorManager';
import type { OrchestrationResult } from '../../types';

export interface RequestContext {
  task: { id: string };
  message: { parts: Array<{ type: string; text?: string }> };
}

export interface EventBus {
  publish(event: StatusEvent | ArtifactEvent): void;
}

export interface StatusEvent {
  type: 'status-update';
  taskId: string;
  state: 'working' | 'completed' | 'failed' | 'cancelled';
  message: string;
}

export interface ArtifactEvent {
  type: 'artifact-update';
  taskId: string;
  artifact: { type: string; text: string };
}

export class OrchestratorExecutor {
  private readonly manager: OrchestratorManager;
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(manager: OrchestratorManager) {
    this.manager = manager;
  }

  async execute(ctx: RequestContext, bus: EventBus): Promise<void> {
    const taskId = ctx.task.id;
    const textParts = ctx.message.parts.filter((p) => p.type === 'text');
    const goal = textParts.map((p) => p.text).join(' ');

    const controller = new AbortController();
    this.abortControllers.set(taskId, controller);

    bus.publish({
      type: 'status-update',
      taskId,
      state: 'working',
      message: 'Starting orchestration',
    });

    try {
      const result: OrchestrationResult = await this.manager.orchestrate(goal, {
        signal: controller.signal,
        onProgress: (update) => {
          bus.publish({
            type: 'status-update',
            taskId,
            state: 'working',
            message: update.message,
          });
        },
      });

      bus.publish({
        type: 'artifact-update',
        taskId,
        artifact: { type: 'text', text: result.synthesis },
      });

      bus.publish({
        type: 'status-update',
        taskId,
        state: 'completed',
        message: 'Orchestration complete',
      });
    } catch (err) {
      bus.publish({
        type: 'status-update',
        taskId,
        state: 'failed',
        message: (err as Error).message,
      });
    } finally {
      this.abortControllers.delete(taskId);
    }
  }

  cancelTask(taskId: string, bus: EventBus): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      bus.publish({
        type: 'status-update',
        taskId,
        state: 'cancelled',
        message: 'Task cancelled',
      });
    }
  }
}
