import type { EventBus, StatusEvent, ArtifactEvent } from './OrchestratorExecutor';
import type { Response } from 'express';

export class SSEEventBus implements EventBus {
  private closed = false;

  constructor(private readonly res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  publish(event: StatusEvent | ArtifactEvent): void {
    if (this.closed || this.res.destroyed) return;
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.res.destroyed) this.res.end();
  }
}
