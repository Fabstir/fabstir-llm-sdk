// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * EZKL Proof Generator - Server-side proof generation
 * Handles heavy cryptographic operations for zero-knowledge proofs
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface EZKLConfig {
  modelPath?: string;
  settingsPath?: string;
  vkPath?: string; // Verification key path
  pkPath?: string; // Proving key path
  srsPath?: string; // Structured reference string path
  cacheDir?: string;
}

export interface ProofInput {
  sessionId: string;
  jobId: string | bigint;
  tokensUsed: number;
  modelHash: string;
  inputData: any[];
  outputData: any[];
  timestamp?: number;
}

export interface ProofOutput {
  proof: string; // Hex-encoded proof
  publicInputs: string[];
  verificationKey?: string;
  proofType: 'ezkl';
  generationTime: number;
}

export class EZKLProofGenerator extends EventEmitter {
  private config: EZKLConfig;
  private proofCache = new Map<string, ProofOutput>();
  private generating = new Map<string, Promise<ProofOutput>>();
  
  constructor(config: EZKLConfig = {}) {
    super();
    this.config = {
      cacheDir: config.cacheDir || './proofs',
      ...config
    };
  }
  
  /**
   * Generate EZKL proof for inference verification
   */
  async generateProof(input: ProofInput): Promise<ProofOutput> {
    const proofId = this.getProofId(input);
    
    // Check cache
    if (this.proofCache.has(proofId)) {
      return this.proofCache.get(proofId)!;
    }
    
    // Check if already generating
    if (this.generating.has(proofId)) {
      return this.generating.get(proofId)!;
    }
    
    // Start generation
    const generationPromise = this.doGenerateProof(input);
    this.generating.set(proofId, generationPromise);
    
    try {
      const result = await generationPromise;
      this.proofCache.set(proofId, result);
      this.generating.delete(proofId);
      return result;
    } catch (error) {
      this.generating.delete(proofId);
      throw error;
    }
  }
  
  private async doGenerateProof(input: ProofInput): Promise<ProofOutput> {
    const startTime = Date.now();
    
    this.emit('proof:generation:started', { sessionId: input.sessionId });
    
    try {
      // In production, this would call actual EZKL binary or library
      // For now, create a deterministic mock proof
      
      // Create witness from input/output data
      const witness = this.createWitness(input);
      
      // Generate public inputs hash
      const publicInputs = this.generatePublicInputs(input);
      
      // Create proof data structure
      const proofData = {
        sessionId: input.sessionId,
        jobId: input.jobId.toString(),
        tokensUsed: input.tokensUsed,
        modelHash: input.modelHash,
        witness: witness,
        publicInputs: publicInputs,
        timestamp: input.timestamp || Date.now(),
        nonce: Math.random().toString(36).substring(7)
      };
      
      // Generate proof hash (in production, this would be actual ZK proof)
      const proofJson = JSON.stringify(proofData);
      const proofHash = createHash('sha256').update(proofJson).digest('hex');
      
      // Create EZKL-like proof structure
      const proof = this.createEZKLProofStructure(proofHash, publicInputs);
      
      const result: ProofOutput = {
        proof: '0x' + proof,
        publicInputs: publicInputs,
        proofType: 'ezkl',
        generationTime: Date.now() - startTime
      };
      
      // Save to cache directory
      await this.saveProofToCache(proofId, result);
      
      this.emit('proof:generation:completed', {
        sessionId: input.sessionId,
        generationTime: result.generationTime
      });
      
      return result;
      
    } catch (error) {
      this.emit('proof:generation:failed', {
        sessionId: input.sessionId,
        error
      });
      throw error;
    }
  }
  
  private createWitness(input: ProofInput): string {
    // Create deterministic witness from input/output
    const witnessData = {
      input: input.inputData,
      output: input.outputData,
      model: input.modelHash,
      tokens: input.tokensUsed
    };
    
    return createHash('sha256')
      .update(JSON.stringify(witnessData))
      .digest('hex');
  }
  
  private generatePublicInputs(input: ProofInput): string[] {
    // Generate public inputs for the proof
    const inputs: string[] = [];
    
    // Add model hash
    inputs.push('0x' + input.modelHash);
    
    // Add token count as hex
    inputs.push('0x' + input.tokensUsed.toString(16).padStart(64, '0'));
    
    // Add input hash
    const inputHash = createHash('sha256')
      .update(JSON.stringify(input.inputData))
      .digest('hex');
    inputs.push('0x' + inputHash);
    
    // Add output hash
    const outputHash = createHash('sha256')
      .update(JSON.stringify(input.outputData))
      .digest('hex');
    inputs.push('0x' + outputHash);
    
    // Add timestamp
    const timestamp = input.timestamp || Date.now();
    inputs.push('0x' + timestamp.toString(16).padStart(64, '0'));
    
    return inputs;
  }
  
  private createEZKLProofStructure(proofHash: string, publicInputs: string[]): string {
    // Create a structure that mimics EZKL proof format
    // In production, this would be actual Groth16/PLONK proof
    
    const proofStructure = {
      // Proof points (mock values that look like elliptic curve points)
      a: [
        '0x' + proofHash.substring(0, 64),
        '0x' + proofHash.substring(0, 64).split('').reverse().join('')
      ],
      b: [
        [
          '0x' + createHash('sha256').update(proofHash + '1').digest('hex'),
          '0x' + createHash('sha256').update(proofHash + '2').digest('hex')
        ],
        [
          '0x' + createHash('sha256').update(proofHash + '3').digest('hex'),
          '0x' + createHash('sha256').update(proofHash + '4').digest('hex')
        ]
      ],
      c: [
        '0x' + createHash('sha256').update(proofHash + '5').digest('hex'),
        '0x' + createHash('sha256').update(proofHash + '6').digest('hex')
      ],
      public: publicInputs
    };
    
    // Encode as hex
    return Buffer.from(JSON.stringify(proofStructure)).toString('hex');
  }
  
  private getProofId(input: ProofInput): string {
    const idData = {
      sessionId: input.sessionId,
      jobId: input.jobId.toString(),
      tokensUsed: input.tokensUsed,
      modelHash: input.modelHash
    };
    
    return createHash('sha256')
      .update(JSON.stringify(idData))
      .digest('hex');
  }
  
  private async saveProofToCache(proofId: string, proof: ProofOutput): Promise<void> {
    try {
      const cacheDir = this.config.cacheDir!;
      await fs.mkdir(cacheDir, { recursive: true });
      
      const filePath = path.join(cacheDir, `${proofId}.json`);
      await fs.writeFile(filePath, JSON.stringify(proof, null, 2));
    } catch (error) {
      console.error('Failed to save proof to cache:', error);
      // Non-critical error, continue
    }
  }
  
  /**
   * Load proof from cache
   */
  async loadProof(proofId: string): Promise<ProofOutput | null> {
    // Check memory cache
    if (this.proofCache.has(proofId)) {
      return this.proofCache.get(proofId)!;
    }
    
    // Check file cache
    try {
      const filePath = path.join(this.config.cacheDir!, `${proofId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const proof = JSON.parse(data) as ProofOutput;
      
      // Store in memory cache
      this.proofCache.set(proofId, proof);
      
      return proof;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Verify a proof (simplified verification)
   */
  async verifyProof(proof: string, publicInputs: string[]): Promise<boolean> {
    try {
      // Remove 0x prefix if present
      const proofHex = proof.startsWith('0x') ? proof.slice(2) : proof;
      
      // Decode proof structure
      const proofJson = Buffer.from(proofHex, 'hex').toString();
      const proofData = JSON.parse(proofJson);
      
      // Basic validation
      if (!proofData.a || !proofData.b || !proofData.c) {
        return false;
      }
      
      // Check public inputs match
      if (proofData.public) {
        const match = JSON.stringify(proofData.public) === JSON.stringify(publicInputs);
        if (!match) {
          return false;
        }
      }
      
      // In production, would verify against verification key
      // For now, just validate structure
      return true;
      
    } catch (error) {
      console.error('Proof verification failed:', error);
      return false;
    }
  }
  
  /**
   * Clear proof cache
   */
  clearCache(): void {
    this.proofCache.clear();
    this.generating.clear();
  }
}