// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Reconnects to S5 by itself, in every environment (1.39.30, IMPLEMENTATION-S5-RECONNECT.md D1–D4, D8).
 *
 * s5js notices a closed socket but never redials, and its `reconnect()` tells a caller that joined a failed attempt
 * that it succeeded (F3). So this owns the one attempt in flight, judges every attempt by the status the connection
 * events report, and backs off between attempts. `whenConnected()` is the gate a storage call awaits: a write made
 * while disconnected would land only in the local registry and never reach the portal (F4).
 */

import { SDKError } from '../types';

export type S5LinkStatus = 'connected' | 'connecting' | 'disconnected';

/** 1, 2, 4, 8, 16, 32 s, then every 60 s; each with equal jitter (D3). */
export const S5_RECONNECT_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 16000, 32000, 60000];

const PREFIX = '[StorageManager]';
const LAST = S5_RECONNECT_DELAYS_MS.length - 1;

/** A link that stays up this long counts as recovered: the next drop's backoff starts over at 1 s (D3). */
export const S5_STABLE_LINK_MS = 30_000;

export class S5Reconnector {
  /** The status the connection events last reported. */
  status: S5LinkStatus = 'disconnected';
  private lost = false;
  private lostAt = 0;
  /** Dials in this outage (the log line). */
  private attempts = 0;
  /** The backoff step: one more per failed attempt, and per drop soon after a reconnect (a flapping portal). */
  private step = 0;
  private reconnectedAt?: number;
  private capLogged = false;
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<void>;
  private stopped = false;
  private readonly random: () => number;
  private readonly log: (line: string) => void;

  constructor(
    private readonly s5: { reconnect(): Promise<void> },
    opts: { random?: () => number; log?: (line: string) => void } = {},
  ) {
    this.random = opts.random ?? Math.random;
    this.log = opts.log ?? ((line) => console.log(line));
  }

  /** Every status s5js reports. `connecting` is not a state change (D8). */
  onStatus(status: S5LinkStatus): void {
    this.status = status;
    if (this.stopped) return;
    if (status === 'connected') {
      if (!this.lost) return;
      const secs = Math.round((Date.now() - this.lostAt) / 1000);
      const n = this.attempts;
      this.log(n === 0
        ? `${PREFIX} S5 reconnected, ${secs}s`
        : `${PREFIX} S5 reconnected after ${n} attempt${n === 1 ? '' : 's'}, ${secs}s`);
      this.lost = false;
      this.reconnectedAt = Date.now();
      this.clearTimer();
    } else if (status === 'disconnected' && !this.lost) {
      this.markLost();
      this.schedule();
    }
  }

  /** The gate (D4): connected at once; else the attempt in flight, or one started now. Never a second dial. */
  async whenConnected(): Promise<void> {
    if (this.up) return;
    if (!this.stopped) await this.attempt();
    if (this.up) return;
    if (this.stopped) {
      // Nothing reconnects this store any more (cleanup / dispose): retrying cannot help.
      throw new SDKError('This store was cleaned up: S5 is no longer reconnected', 'STORAGE_CLEANUP', { retryable: false });
    }
    throw new SDKError('S5 is not connected: the reconnect attempt did not succeed', 'STORAGE_OFFLINE', { retryable: true });
  }

  /** A browser hint (tab visible, network online): attempt now instead of at the next backoff step. */
  kick(): void {
    if (this.stopped || this.status === 'connected') return;
    void this.attempt();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private attempt(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.markLost();
    this.attempts++;
    this.inFlight = (async () => {
      try {
        await this.s5.reconnect();
      } catch {
        // Judged by the status below, never by the promise (F3).
      } finally {
        this.inFlight = undefined;
      }
      if (this.up) return;
      this.step++;
      this.schedule();
    })();
    return this.inFlight;
  }

  /** At most one timer, and none while an attempt is in flight: that attempt's outcome schedules the next. */
  private schedule(): void {
    if (this.stopped || this.inFlight) return;
    this.clearTimer();
    const i = Math.min(this.step, LAST);
    if (i === LAST && !this.capLogged) {
      this.capLogged = true;
      this.log(`${PREFIX} S5 still unreachable after ${this.attempts} attempts; retrying every ${S5_RECONNECT_DELAYS_MS[i] / 1000}s`);
    }
    const full = S5_RECONNECT_DELAYS_MS[i];
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.attempt();
    }, full / 2 + this.random() * (full / 2));
    // A pending retry must not keep a Node process (a helper, a CLI) alive (F7).
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Read afresh after an await: the events may have changed it meanwhile. */
  private get up(): boolean {
    return this.status === 'connected';
  }

  private markLost(): void {
    if (this.lost) return;
    // A drop soon after a reconnect is the same trouble, so the backoff keeps growing; a stable link starts it over.
    const flapped = this.reconnectedAt !== undefined && Date.now() - this.reconnectedAt < S5_STABLE_LINK_MS;
    this.step = flapped ? this.step + 1 : 0;
    if (!flapped) this.capLogged = false;
    this.attempts = 0;
    this.lost = true;
    this.lostAt = Date.now();
    this.log(`${PREFIX} S5 connection lost; reconnecting`);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
