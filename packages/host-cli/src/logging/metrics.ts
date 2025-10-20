// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { Logger } from './logger';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

export interface PerformanceMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  process?: {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  };
}

export interface SessionMetrics {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  tokensGenerated: number;
  proofsSubmitted: number;
  errors: number;
}

export interface DailySummary {
  date: string;
  totalSessions: number;
  totalTokens: number;
  totalProofs: number;
  totalErrors: number;
  averageSessionDuration: number;
  uptimePercentage: number;
  performanceMetrics: {
    avgCpu: number;
    avgMemory: number;
    peakCpu: number;
    peakMemory: number;
  };
}

export class MetricsLogger {
  private logger: Logger;
  private metricsDir: string;
  private sessionMetrics: Map<string, SessionMetrics> = new Map();
  private performanceHistory: PerformanceMetrics[] = [];
  private collectionInterval?: NodeJS.Timeout;

  constructor(logger: Logger, metricsDir?: string) {
    this.logger = logger;
    this.metricsDir = metricsDir || path.join(
      process.env.HOME || '.',
      '.fabstir',
      'host-cli',
      'metrics'
    );

    // Ensure metrics directory exists
    if (!fs.existsSync(this.metricsDir)) {
      fs.mkdirSync(this.metricsDir, { recursive: true });
    }
  }

  startCollection(intervalMs: number = 60000): void {
    this.collectionInterval = setInterval(() => {
      this.collectPerformanceMetrics();
    }, intervalMs);

    // Collect immediately
    this.collectPerformanceMetrics();
  }

  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
  }

  private collectPerformanceMetrics(): void {
    const metrics: PerformanceMetrics = {
      timestamp: new Date(),
      cpu: {
        usage: this.getCpuUsage(),
        loadAverage: os.loadavg()
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        percentage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };

    this.performanceHistory.push(metrics);

    // Keep only last 24 hours of metrics (at 1-minute intervals)
    const maxMetrics = 24 * 60;
    if (this.performanceHistory.length > maxMetrics) {
      this.performanceHistory = this.performanceHistory.slice(-maxMetrics);
    }

    // Log metrics
    this.logger.debug('Performance metrics collected', metrics);

    // Save to file
    this.saveMetrics(metrics);
  }

  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return usage;
  }

  private saveMetrics(metrics: PerformanceMetrics): void {
    const date = new Date().toISOString().split('T')[0];
    const filename = `metrics-${date}.json`;
    const filepath = path.join(this.metricsDir, filename);

    let existingData: PerformanceMetrics[] = [];
    if (fs.existsSync(filepath)) {
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        existingData = JSON.parse(content);
      } catch (error) {
        this.logger.error('Failed to read existing metrics', error);
      }
    }

    existingData.push(metrics);
    fs.writeFileSync(filepath, JSON.stringify(existingData, null, 2));
  }

  logSessionStart(sessionId: string): void {
    const session: SessionMetrics = {
      sessionId,
      startTime: new Date(),
      tokensGenerated: 0,
      proofsSubmitted: 0,
      errors: 0
    };

    this.sessionMetrics.set(sessionId, session);
    this.logger.info('Session started', { sessionId });
  }

  logSessionEnd(sessionId: string): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.endTime = new Date();
      this.logger.info('Session ended', {
        sessionId,
        duration: session.endTime.getTime() - session.startTime.getTime(),
        tokens: session.tokensGenerated,
        proofs: session.proofsSubmitted,
        errors: session.errors
      });

      // Save session metrics
      this.saveSessionMetrics(session);
    }
  }

  updateSessionTokens(sessionId: string, tokens: number): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.tokensGenerated += tokens;
    }
  }

  updateSessionProofs(sessionId: string): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.proofsSubmitted++;
    }
  }

  logSessionError(sessionId: string, error: any): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.errors++;
    }
    this.logger.error('Session error', { sessionId, error });
  }

  private saveSessionMetrics(session: SessionMetrics): void {
    const date = new Date().toISOString().split('T')[0];
    const filename = `sessions-${date}.json`;
    const filepath = path.join(this.metricsDir, filename);

    let existingData: SessionMetrics[] = [];
    if (fs.existsSync(filepath)) {
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        existingData = JSON.parse(content);
      } catch (error) {
        this.logger.error('Failed to read existing session metrics', error);
      }
    }

    existingData.push(session);
    fs.writeFileSync(filepath, JSON.stringify(existingData, null, 2));
  }

  async generateDailySummary(date?: Date): Promise<DailySummary> {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    // Load metrics for the day
    const metricsFile = path.join(this.metricsDir, `metrics-${dateStr}.json`);
    const sessionsFile = path.join(this.metricsDir, `sessions-${dateStr}.json`);

    let performanceMetrics: PerformanceMetrics[] = [];
    let sessionMetrics: SessionMetrics[] = [];

    if (fs.existsSync(metricsFile)) {
      performanceMetrics = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));
    }

    if (fs.existsSync(sessionsFile)) {
      sessionMetrics = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
    }

    // Calculate summary
    const summary: DailySummary = {
      date: dateStr,
      totalSessions: sessionMetrics.length,
      totalTokens: sessionMetrics.reduce((sum, s) => sum + s.tokensGenerated, 0),
      totalProofs: sessionMetrics.reduce((sum, s) => sum + s.proofsSubmitted, 0),
      totalErrors: sessionMetrics.reduce((sum, s) => sum + s.errors, 0),
      averageSessionDuration: this.calculateAverageSessionDuration(sessionMetrics),
      uptimePercentage: this.calculateUptimePercentage(performanceMetrics),
      performanceMetrics: {
        avgCpu: this.calculateAverageCpu(performanceMetrics),
        avgMemory: this.calculateAverageMemory(performanceMetrics),
        peakCpu: this.calculatePeakCpu(performanceMetrics),
        peakMemory: this.calculatePeakMemory(performanceMetrics)
      }
    };

    // Save summary
    const summaryFile = path.join(this.metricsDir, `summary-${dateStr}.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

    this.logger.info('Daily summary generated', summary);

    return summary;
  }

  private calculateAverageSessionDuration(sessions: SessionMetrics[]): number {
    if (sessions.length === 0) return 0;

    const durations = sessions
      .filter(s => s.endTime)
      .map(s => new Date(s.endTime!).getTime() - new Date(s.startTime).getTime());

    if (durations.length === 0) return 0;

    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  private calculateUptimePercentage(metrics: PerformanceMetrics[]): number {
    if (metrics.length < 2) return 100;

    const firstTime = new Date(metrics[0].timestamp).getTime();
    const lastTime = new Date(metrics[metrics.length - 1].timestamp).getTime();
    const expectedDuration = lastTime - firstTime;

    // Assume metrics are collected every minute
    const expectedMetrics = Math.floor(expectedDuration / 60000) + 1;
    const actualMetrics = metrics.length;

    return Math.min(100, (actualMetrics / expectedMetrics) * 100);
  }

  private calculateAverageCpu(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.cpu.usage, 0) / metrics.length;
  }

  private calculateAverageMemory(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.memory.percentage, 0) / metrics.length;
  }

  private calculatePeakCpu(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    return Math.max(...metrics.map(m => m.cpu.usage));
  }

  private calculatePeakMemory(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    return Math.max(...metrics.map(m => m.memory.percentage));
  }

  getPerformanceHistory(): PerformanceMetrics[] {
    return [...this.performanceHistory];
  }

  getCurrentSessions(): SessionMetrics[] {
    return Array.from(this.sessionMetrics.values());
  }
}