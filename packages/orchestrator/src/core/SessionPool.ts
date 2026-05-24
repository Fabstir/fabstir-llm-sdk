import { FabstirSDKCore } from '@fabstir/sdk-core';
import { SessionAdapter } from './SessionAdapter';
import type { OrchestratorConfig, OrchestratorSession, SessionAdapterConfig } from '../types';

const DEFAULT_PROOF_GRACE_MS = 30_000; // 30 seconds for hosts to submit proofs

interface PoolEntry {
  adapter: SessionAdapter;
  session: OrchestratorSession;
  /** Committed (unsettled) deposit in USDC; refunded to the budget on free. */
  deposit: number;
}

/** Error with a typed SDK cap code (defense-in-depth, Sub-phase 3.3). */
function capError(message: string, code: 'CAP_EXCEEDED_ALLOWANCE' | 'CAP_EXCEEDED_SDK_BUDGET'): Error {
  const e: any = new Error(message);
  e.code = code;
  return e;
}

export class SessionPool {
  private readonly config: OrchestratorConfig;
  private available: number;
  private readonly waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private readonly active: Set<PoolEntry> = new Set();
  private readonly cached = new Map<string, PoolEntry>();
  private txQueue: Promise<void> = Promise.resolve();
  private totalDeposit = 0;
  private readonly pendingSettlements: Promise<void>[] = [];

  constructor(config: OrchestratorConfig) {
    if (!config.privateKey && !config.signer) {
      throw new Error('OrchestratorConfig requires either privateKey or signer');
    }
    if (config.privateKey && config.signer) {
      throw new Error('OrchestratorConfig requires either privateKey or signer, not both');
    }
    this.config = config;
    this.available = config.maxConcurrentSessions;
  }

  private async withTxLock<T>(fn: () => Promise<T>): Promise<T> {
    let resolve: () => void;
    const next = new Promise<void>(r => (resolve = r));
    const prev = this.txQueue;
    this.txQueue = next;
    await prev;
    try {
      return await fn();
    } finally {
      resolve!();
    }
  }

  private async waitForSlot(signal?: AbortSignal): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject };
      this.waitQueue.push(waiter);

      if (signal) {
        const onAbort = () => {
          const idx = this.waitQueue.indexOf(waiter);
          if (idx >= 0) this.waitQueue.splice(idx, 1);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private releaseSlot(): void {
    const waiter = this.waitQueue.shift();
    if (waiter) {
      waiter.resolve();
    } else {
      this.available++;
    }
  }

  async acquire(
    model: string,
    adapterConfig: SessionAdapterConfig,
    signal?: AbortSignal,
  ): Promise<{ adapter: SessionAdapter; session: OrchestratorSession }> {
    await this.waitForSlot(signal);

    const cachedEntry = this.cached.get(model);
    if (cachedEntry) {
      this.cached.delete(model);
      this.active.add(cachedEntry);
      return { adapter: cachedEntry.adapter, session: cachedEntry.session };
    }

    const depositNum = parseFloat(adapterConfig.depositAmount);
    const committed = this.totalDeposit + depositNum;

    // (b) Configured SDK budget cap — pre-flight, typed.
    if (committed > parseFloat(this.config.budget.maxTotalDeposit)) {
      this.releaseSlot();
      throw capError(
        `Budget exceeded: total deposit would be ${committed}, max is ${this.config.budget.maxTotalDeposit}`,
        'CAP_EXCEEDED_SDK_BUDGET',
      );
    }

    // (a) Live on-chain remaining allowance (delegate mode). The on-chain approval
    // is the authoritative ceiling; this refuses cleanly BEFORE any session call.
    if (this.config.delegatePayer) {
      const pm = this.config.sdk.getPaymentManager() as any;
      const delegate = await (this.config.signer as any)?.getAddress();
      const { remaining } = await pm.getDelegateAuthorization({ payer: this.config.delegatePayer, delegate });
      const committedBase = BigInt(Math.round(committed * 1e6)); // USDC base units
      if (committedBase > BigInt(remaining)) {
        this.releaseSlot();
        throw capError(
          `Allowance exceeded: committed ${committedBase} would exceed remaining allowance ${remaining}`,
          'CAP_EXCEEDED_ALLOWANCE',
        );
      }
    }

    try {
      const sdk = new FabstirSDKCore({
        chainId: this.config.chainId,
        rpcUrl: (this.config.sdk as any).config?.rpcUrl ?? '',
        contractAddresses: (this.config.sdk as any).config?.contractAddresses ?? {},
        // Per-acquire SDKs only run sessions (sendPrompt) — no S5 persistence/RAG.
        skipS5: true,
      } as any);
      if (this.config.delegatePayer) {
        // Delegate-pays: the per-acquire SDK spends the payer's capped USDC
        // allowance. Requires a delegate signer (the daemon's hot EOA).
        await sdk.authenticateAsDelegate({
          signer: this.config.signer as any,
          payer: this.config.delegatePayer,
        });
      } else if (this.config.signer) {
        await sdk.authenticate('signer', { signer: this.config.signer } as any);
      } else {
        await sdk.authenticate('privatekey', { privateKey: this.config.privateKey } as any);
      }

      const adapter = new SessionAdapter(sdk);
      const session = await this.withTxLock(() =>
        adapter.createSession(model, adapterConfig),
      );

      this.totalDeposit += depositNum;
      const entry: PoolEntry = { adapter, session, deposit: depositNum };
      this.active.add(entry);

      return { adapter, session };
    } catch (err) {
      this.releaseSlot();
      throw err;
    }
  }

  async release(adapter: SessionAdapter, session: OrchestratorSession): Promise<void> {
    // Find and remove entry from active set
    let matched: PoolEntry | undefined;
    for (const entry of this.active) {
      if (entry.adapter === adapter) { matched = entry; break; }
    }
    if (matched) this.active.delete(matched);

    // Cache for reuse if no entry cached for this model — keep session alive
    if (matched && !this.cached.has(session.model)) {
      this.cached.set(session.model, matched);
      this.releaseSlot();
      return;
    }

    // Duplicate or no match — destroy session fully and refund its committed deposit
    if (matched) this.totalDeposit = Math.max(0, this.totalDeposit - matched.deposit);
    try {
      await adapter.endSession(session.sessionId);
    } finally {
      this.releaseSlot();
    }

    // Settle blockchain job after grace period for host proof submission
    const graceMs = this.config.proofGracePeriodMs ?? DEFAULT_PROOF_GRACE_MS;
    const settle = async () => {
      // Delegate mode: only payer/host may complete — never the delegate.
      // End the WS session (done above) and let the host settle on disconnect.
      if (this.config.delegatePayer) return;
      if (graceMs > 0) await new Promise(r => setTimeout(r, graceMs));
      try {
        await this.withTxLock(async () => {
          const pm = adapter.getSDK().getPaymentManager() as any;
          await pm.completeSessionJob(Number(session.jobId), '', session.chainId);
        });
      } catch {
        // Settlement errors after grace period are non-fatal
      }
    };
    if (graceMs > 0) {
      this.pendingSettlements.push(settle());
    } else {
      await settle();
    }
  }

  async destroy(): Promise<void> {
    // Wait for any deferred settlements to complete
    await Promise.all(this.pendingSettlements);
    this.pendingSettlements.length = 0;

    // Clean up cached sessions — end and (self-funded only) settle each one
    for (const [, entry] of this.cached) {
      if (!this.config.delegatePayer) {
        try {
          const pm = entry.adapter.getSDK().getPaymentManager() as any;
          await pm.completeSessionJob(Number(entry.session.jobId), '', entry.session.chainId).catch(() => {});
        } catch {}
      }
      try { await entry.adapter.endSession(entry.session.sessionId); } catch {}
    }
    this.cached.clear();

    const entries = [...this.active];
    for (const entry of entries) {
      if (!this.config.delegatePayer) {
        try {
          const pm = entry.adapter.getSDK().getPaymentManager() as any;
          await pm.completeSessionJob(Number(entry.session.jobId), '', entry.session.chainId).catch(() => {});
        } catch {
          // Ignore settlement errors during destroy
        }
      }
      try {
        await entry.adapter.endSession(entry.session.sessionId);
      } catch {
        // Ignore teardown errors during destroy
      }
      this.active.delete(entry);
    }
    this.available = this.config.maxConcurrentSessions;
    this.totalDeposit = 0; // all sessions destroyed — committed budget refunded
  }

  getTotalDeposit(): number {
    return this.totalDeposit;
  }
}
