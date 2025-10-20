// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface ProofRecord {
  sessionId: string;
  jobId: bigint;
  checkpoint: number;
  tokensClaimed: number;
  proof: string;
  txHash?: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  timestamp: number;
  blockNumber?: number;
  gasUsed?: bigint;
  error?: string;
}

export interface ProofSummary {
  totalProofs: number;
  successfulProofs: number;
  failedProofs: number;
  pendingProofs: number;
  totalTokensClaimed: number;
  totalGasUsed: bigint;
  averageGasPerProof: bigint;
}

export class ProofTracker extends EventEmitter {
  private proofs: Map<string, ProofRecord> = new Map();
  private historyFile: string;
  private autoSave: boolean = true;
  private saveDebounceTimer?: NodeJS.Timeout;

  constructor(historyFile?: string) {
    super();
    this.historyFile = historyFile || path.join(
      os.homedir(),
      '.fabstir',
      'host-cli',
      'proof-history.json'
    );
  }

  /**
   * Add a new proof record
   */
  async addProof(record: ProofRecord): Promise<void> {
    const id = this.generateProofId(record.sessionId, record.checkpoint);
    this.proofs.set(id, record);

    this.emit('proof-added', record);

    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Update proof status
   */
  async updateProofStatus(
    sessionId: string,
    checkpoint: number,
    status: ProofRecord['status'],
    updates?: Partial<ProofRecord>
  ): Promise<void> {
    const id = this.generateProofId(sessionId, checkpoint);
    const proof = this.proofs.get(id);

    if (!proof) {
      throw new Error(`Proof not found: ${id}`);
    }

    proof.status = status;
    if (updates) {
      Object.assign(proof, updates);
    }

    this.emit('proof-updated', proof);

    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Get proof by ID
   */
  getProof(sessionId: string, checkpoint: number): ProofRecord | undefined {
    const id = this.generateProofId(sessionId, checkpoint);
    return this.proofs.get(id);
  }

  /**
   * Get all proofs for a session
   */
  getSessionProofs(sessionId: string): ProofRecord[] {
    const proofs: ProofRecord[] = [];
    this.proofs.forEach(proof => {
      if (proof.sessionId === sessionId) {
        proofs.push(proof);
      }
    });
    return proofs.sort((a, b) => a.checkpoint - b.checkpoint);
  }

  /**
   * Get proofs by status
   */
  getProofsByStatus(status: ProofRecord['status']): ProofRecord[] {
    const proofs: ProofRecord[] = [];
    this.proofs.forEach(proof => {
      if (proof.status === status) {
        proofs.push(proof);
      }
    });
    return proofs;
  }

  /**
   * Get all proofs
   */
  getAllProofs(): ProofRecord[] {
    return Array.from(this.proofs.values());
  }

  /**
   * Get proof summary
   */
  getSummary(): ProofSummary {
    let totalProofs = 0;
    let successfulProofs = 0;
    let failedProofs = 0;
    let pendingProofs = 0;
    let totalTokensClaimed = 0;
    let totalGasUsed = BigInt(0);

    this.proofs.forEach(proof => {
      totalProofs++;
      totalTokensClaimed += proof.tokensClaimed;

      if (proof.gasUsed) {
        totalGasUsed += proof.gasUsed;
      }

      switch (proof.status) {
        case 'confirmed':
          successfulProofs++;
          break;
        case 'failed':
          failedProofs++;
          break;
        case 'pending':
        case 'submitted':
          pendingProofs++;
          break;
      }
    });

    const averageGasPerProof = successfulProofs > 0
      ? totalGasUsed / BigInt(successfulProofs)
      : BigInt(0);

    return {
      totalProofs,
      successfulProofs,
      failedProofs,
      pendingProofs,
      totalTokensClaimed,
      totalGasUsed,
      averageGasPerProof
    };
  }

  /**
   * Generate audit trail
   */
  generateAuditTrail(
    sessionId?: string,
    startTime?: number,
    endTime?: number
  ): ProofRecord[] {
    let proofs = sessionId
      ? this.getSessionProofs(sessionId)
      : this.getAllProofs();

    if (startTime || endTime) {
      proofs = proofs.filter(proof => {
        if (startTime && proof.timestamp < startTime) return false;
        if (endTime && proof.timestamp > endTime) return false;
        return true;
      });
    }

    return proofs.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Export to CSV
   */
  async exportToCSV(filePath: string): Promise<void> {
    const proofs = this.getAllProofs();
    const headers = [
      'SessionID',
      'JobID',
      'Checkpoint',
      'Tokens',
      'Status',
      'TxHash',
      'BlockNumber',
      'GasUsed',
      'Timestamp'
    ];

    const rows = proofs.map(proof => [
      proof.sessionId,
      proof.jobId.toString(),
      proof.checkpoint.toString(),
      proof.tokensClaimed.toString(),
      proof.status,
      proof.txHash || '',
      proof.blockNumber?.toString() || '',
      proof.gasUsed?.toString() || '',
      new Date(proof.timestamp).toISOString()
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    await fs.writeFile(filePath, csv, 'utf-8');
    this.emit('export-completed', { filePath, records: proofs.length });
  }

  /**
   * Load history from file
   */
  async loadHistory(): Promise<void> {
    try {
      const dir = path.dirname(this.historyFile);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.historyFile, 'utf-8');
      const records = JSON.parse(data, this.reviver);

      this.proofs.clear();
      records.forEach((record: ProofRecord) => {
        const id = this.generateProofId(record.sessionId, record.checkpoint);
        this.proofs.set(id, record);
      });

      this.emit('history-loaded', { records: records.length });

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, start with empty history
        this.proofs.clear();
      } else {
        throw error;
      }
    }
  }

  /**
   * Save history to file
   */
  async saveHistory(): Promise<void> {
    const dir = path.dirname(this.historyFile);
    await fs.mkdir(dir, { recursive: true });

    const records = Array.from(this.proofs.values());
    const json = JSON.stringify(records, this.replacer, 2);

    await fs.writeFile(this.historyFile, json, 'utf-8');
    this.emit('history-saved', { records: records.length });
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.proofs.clear();
    this.emit('history-cleared');

    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Set auto-save
   */
  setAutoSave(enabled: boolean): void {
    this.autoSave = enabled;
    if (!enabled && this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = undefined;
    }
  }

  /**
   * Generate proof ID
   */
  private generateProofId(sessionId: string, checkpoint: number): string {
    return `${sessionId}-${checkpoint}`;
  }

  /**
   * Schedule save with debounce
   */
  private scheduleSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      try {
        await this.saveHistory();
      } catch (error) {
        console.error('Failed to save proof history:', error);
        this.emit('save-error', error);
      }
    }, 1000);
  }

  /**
   * JSON replacer for BigInt serialization
   */
  private replacer(key: string, value: any): any {
    if (typeof value === 'bigint') {
      return { type: 'BigInt', value: value.toString() };
    }
    return value;
  }

  /**
   * JSON reviver for BigInt deserialization
   */
  private reviver(key: string, value: any): any {
    if (value && typeof value === 'object' && value.type === 'BigInt') {
      return BigInt(value.value);
    }
    return value;
  }
}