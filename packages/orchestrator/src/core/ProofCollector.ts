import type { SubTaskResult } from '../types';

/**
 * Collects proof CIDs from completed sub-task results.
 *
 * Each sub-task may optionally produce a proofCID (an S5 content
 * identifier for the on-chain proof blob). ProofCollector accumulates
 * these CIDs so the orchestrator can include them in the final
 * OrchestrationResult.
 */
export class ProofCollector {
  private cids: string[] = [];

  /** Store the proofCID from a sub-task result (skips if undefined). */
  collect(result: SubTaskResult): void {
    if (result.proofCID) {
      this.cids.push(result.proofCID);
    }
  }

  /** Return a defensive copy of all collected CIDs. */
  getProofCIDs(): string[] {
    return [...this.cids];
  }

  /** Remove all collected CIDs. */
  clear(): void {
    this.cids = [];
  }
}
