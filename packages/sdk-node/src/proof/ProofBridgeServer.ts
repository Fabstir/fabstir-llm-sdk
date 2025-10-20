// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Proof Bridge Server - HTTP/WebSocket server for proof generation
 * Handles proof requests from browser clients
 */

import express, { Request, Response } from 'express';
import { Server as HTTPServer } from 'http';
import { EZKLProofGenerator, ProofInput } from './EZKLProofGenerator';
import { EventEmitter } from 'events';

interface ProofJob {
  id: string;
  request: ProofInput;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  createdAt: number;
}

export class ProofBridgeServer extends EventEmitter {
  private app: express.Application;
  private server?: HTTPServer;
  private proofGenerator: EZKLProofGenerator;
  private jobs = new Map<string, ProofJob>();
  private running = false;
  
  constructor(proofConfig?: any) {
    super();
    this.app = express();
    this.proofGenerator = new EZKLProofGenerator(proofConfig);
    this.setupRoutes();
  }
  
  private setupRoutes(): void {
    // Middleware
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      // CORS headers for browser clients
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        running: this.running,
        jobsInProgress: Array.from(this.jobs.values())
          .filter(j => j.status === 'generating').length
      });
    });
    
    // Generate proof
    this.app.post('/proof/generate', async (req: Request, res: Response) => {
      try {
        const request = req.body;
        
        // Validate request
        if (!request.sessionId || !request.jobId || !request.tokensUsed) {
          return res.status(400).json({
            error: 'Invalid proof request'
          });
        }
        
        // Create job
        const jobId = this.generateJobId();
        const job: ProofJob = {
          id: jobId,
          request: {
            sessionId: request.sessionId,
            jobId: request.jobId,
            tokensUsed: request.tokensUsed,
            modelHash: request.modelHash || this.generateModelHash(),
            inputData: request.inputData || [],
            outputData: request.outputData || [],
            timestamp: request.timestamp || Date.now()
          },
          status: 'pending',
          progress: 0,
          createdAt: Date.now()
        };
        
        this.jobs.set(jobId, job);
        
        // Start generation async
        this.generateProofAsync(jobId);
        
        res.json({
          proofId: jobId,
          status: 'pending'
        });
        
      } catch (error: any) {
        console.error('Error handling proof request:', error);
        res.status(500).json({
          error: error.message
        });
      }
    });
    
    // Get proof status
    this.app.get('/proof/status/:id', (req: Request, res: Response) => {
      const job = this.jobs.get(req.params.id);
      
      if (!job) {
        return res.status(404).json({
          error: 'Proof job not found'
        });
      }
      
      res.json({
        sessionId: job.request.sessionId,
        status: job.status,
        progress: job.progress,
        error: job.error
      });
    });
    
    // Get proof result
    this.app.get('/proof/result/:id', (req: Request, res: Response) => {
      const job = this.jobs.get(req.params.id);
      
      if (!job) {
        return res.status(404).json({
          error: 'Proof job not found'
        });
      }
      
      if (job.status !== 'ready') {
        return res.status(400).json({
          error: 'Proof not ready',
          status: job.status
        });
      }
      
      res.json(job.result);
    });
    
    // List jobs (for debugging)
    this.app.get('/proof/jobs', (req: Request, res: Response) => {
      const jobs = Array.from(this.jobs.values()).map(j => ({
        id: j.id,
        sessionId: j.request.sessionId,
        status: j.status,
        progress: j.progress,
        createdAt: j.createdAt
      }));
      
      res.json(jobs);
    });
  }
  
  private async generateProofAsync(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    try {
      // Update status
      job.status = 'generating';
      job.progress = 10;
      this.jobs.set(jobId, job);
      
      // Monitor progress
      this.proofGenerator.on('proof:generation:started', () => {
        job.progress = 25;
        this.jobs.set(jobId, job);
      });
      
      // Generate proof
      const proofOutput = await this.proofGenerator.generateProof(job.request);
      
      // Update job with result
      job.status = 'ready';
      job.progress = 100;
      job.result = {
        proof: proofOutput.proof,
        publicInputs: proofOutput.publicInputs,
        verified: true,
        timestamp: Date.now(),
        proofType: proofOutput.proofType
      };
      
      this.jobs.set(jobId, job);
      
      this.emit('proof:ready', {
        jobId,
        sessionId: job.request.sessionId
      });
      
      // Clean up old jobs after 1 hour
      setTimeout(() => {
        this.jobs.delete(jobId);
      }, 3600000);
      
    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      this.jobs.set(jobId, job);
      
      this.emit('proof:failed', {
        jobId,
        sessionId: job.request.sessionId,
        error: error.message
      });
    }
  }
  
  async start(port: number = 3001): Promise<void> {
    if (this.running) {
      throw new Error('Server already running');
    }
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, () => {
        this.running = true;
        console.log(`Proof Bridge Server listening on port ${port}`);
        resolve();
      }).on('error', reject);
    });
  }
  
  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }
    
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        console.log('Proof Bridge Server stopped');
        resolve();
      });
    });
  }
  
  private generateJobId(): string {
    return `proof-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
  
  private generateModelHash(): string {
    // Generate a deterministic model hash for testing
    return Array(64).fill(0).map(() => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}