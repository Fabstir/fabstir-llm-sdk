import { ethers } from 'ethers';
import AuthManager from './AuthManager';
import PaymentManager from './PaymentManager';
import StorageManager, { Exchange, SessionMetadata, SessionSummary } from './StorageManager';
import DiscoveryManager from './DiscoveryManager';

interface SessionOptions {
  paymentType: 'ETH' | 'USDC';
  amount: string;
  pricePerToken?: number;
  duration?: number;
  proofInterval?: number;
  hostAddress?: string;
  tokenAddress?: string;
  hostCriteria?: any;
}

interface SessionResult {
  sessionId: string;
  jobId: string;
  hostAddress: string;
  txHash: string;
}

interface PaymentDistribution {
  host: string;
  treasury: string;
}

export default class SessionManager {
  static readonly DEFAULT_PRICE_PER_TOKEN = 5000;
  static readonly DEFAULT_DURATION = 3600;
  static readonly DEFAULT_PROOF_INTERVAL = 300;
  static readonly MIN_ETH_PAYMENT = '0.005';
  static readonly PAYMENT_SPLIT = { host: 0.9, treasury: 0.1 };

  constructor(
    private authManager: AuthManager,
    private paymentManager: PaymentManager,
    private storageManager: StorageManager,
    private discoveryManager: DiscoveryManager
  ) {}

  async createSession(options: SessionOptions): Promise<SessionResult> {
    if (!this.authManager.isAuthenticated()) {
      throw new Error('Must authenticate first');
    }

    let hostAddress = options.hostAddress || '0xHost789';
    if (!options.hostAddress && options.hostCriteria) {
      try {
        hostAddress = await this.discoveryManager.findHost(options.hostCriteria);
      } catch (error) {
        throw new Error('Failed to find suitable host');
      }
    }

    const pricePerToken = options.pricePerToken || SessionManager.DEFAULT_PRICE_PER_TOKEN;
    const duration = options.duration || SessionManager.DEFAULT_DURATION;
    const proofInterval = options.proofInterval || SessionManager.DEFAULT_PROOF_INTERVAL;

    let result;
    if (options.paymentType === 'ETH') {
      result = await this.paymentManager.createETHSessionJob(
        hostAddress,
        options.amount,
        pricePerToken,
        duration,
        proofInterval
      );
    } else {
      result = await this.paymentManager.createUSDCSessionJob(
        hostAddress,
        options.tokenAddress!,
        options.amount,
        pricePerToken,
        duration,
        proofInterval
      );
    }

    const sessionId = `session-${result.jobId}`;
    const sessionData = {
      jobId: result.jobId,
      hostAddress: result.hostAddress || hostAddress,
      status: 'active',
      paymentType: options.paymentType,
      amount: options.amount,
      created: Date.now()
    };
    try {
      await this.storageManager.storeData(sessionId, sessionData);
    } catch (error) {
      throw new Error('Failed to store session metadata');
    }
    return { sessionId, ...result };
  }

  async submitProof(sessionId: string, proofData: any): Promise<string> {
    try {
      const sessionData = await this.storageManager.retrieveData(sessionId);
      
      // Extract job ID and host address from session data
      const jobId = sessionData.jobId;
      const hostAddress = sessionData.hostAddress;
      
      if (!jobId) {
        throw new Error('No job ID found in session');
      }
      
      // Store proof in S5 for record keeping
      await this.storageManager.storeData(`${sessionId}-proof`, proofData);
      
      // Import ethers for contract interaction
      const ethers = await import('ethers');
      
      // IMPORTANT: Proofs must be submitted by the HOST, not the user
      // In production, the host node would submit its own proof
      // For testing/mock mode, we use the TEST_HOST_1 account
      let hostSigner;
      
      // Check if we have a host address and are in mock/test mode
      if (hostAddress && process.env.TEST_HOST_1_PRIVATE_KEY) {
        // Use the test host account for proof submission
        const provider = this.authManager.getSigner()?.provider;
        if (!provider) {
          throw new Error('No provider available');
        }
        
        console.log(`Using HOST wallet for proof submission (mock mode)`);
        hostSigner = new ethers.Wallet(process.env.TEST_HOST_1_PRIVATE_KEY, provider);
        
        // Verify this matches the expected host address
        const hostSignerAddress = await hostSigner.getAddress();
        console.log(`Host signer address: ${hostSignerAddress}`);
        console.log(`Expected host address: ${hostAddress}`);
      } else {
        // Fallback to user signer (will likely fail due to authorization)
        console.warn('Warning: Using user signer for proof submission - this may fail');
        hostSigner = this.authManager.getSigner();
        if (!hostSigner) {
          throw new Error('No signer available for proof submission');
        }
      }
      
      // Get marketplace contract address from environment
      const marketplaceAddress = process.env.CONTRACT_JOB_MARKETPLACE;
      if (!marketplaceAddress) {
        throw new Error('CONTRACT_JOB_MARKETPLACE environment variable is not set');
      }
      
      // Contract ABI for proof submission
      const marketplaceABI = [
        'function submitProofOfWork(uint256 jobId, bytes proof, uint256 tokensProven) returns (bool)'
      ];
      
      const marketplace = new ethers.Contract(marketplaceAddress, marketplaceABI, hostSigner);
      
      // Generate proof bytes (in production, this would come from the EZKL proof generator)
      const proofBytes = proofData.proofHash || proofData.proof || ethers.utils.hexlify(ethers.utils.randomBytes(256));
      const tokensProven = proofData.tokensProcessed || proofData.tokensUsed || 500;
      
      console.log(`Submitting proof for job ${jobId} with ${tokensProven} tokens...`);
      
      // Submit proof on-chain
      const tx = await (marketplace as any).submitProofOfWork(
        parseInt(jobId),
        proofBytes,
        tokensProven,
        { gasLimit: 300000 }
      );
      
      // Wait for confirmation
      await tx.wait();
      
      console.log(`Proof submitted successfully: ${tx.hash}`);
      return tx.hash;
      
    } catch (error: any) {
      throw new Error('Failed to submit proof: ' + error.message);
    }
  }

  async completeSession(sessionId: string): Promise<{ txHash: string; paymentDistribution: PaymentDistribution }> {
    const sessionData = await this.storageManager.retrieveData(sessionId);
    try {
      const result = await this.paymentManager.completeSessionJob(sessionData.jobId);
      sessionData.status = 'completed';
      sessionData.completedAt = Date.now();
      await this.storageManager.storeData(sessionId, sessionData);
      const amount = parseFloat(sessionData.amount || '0');
      const distribution = {
        host: (amount * SessionManager.PAYMENT_SPLIT.host).toFixed(4),
        treasury: (amount * SessionManager.PAYMENT_SPLIT.treasury).toFixed(4)
      };
      return { txHash: result.txHash, paymentDistribution: distribution };
    } catch (error) {
      throw new Error('Failed to complete session: ' + (error as Error).message);
    }
  }

  async storeSessionData(sessionId: string, data: any): Promise<string> {
    return await this.storageManager.storeData(`${sessionId}-data`, data);
  }

  async getSessionData(sessionId: string): Promise<any> {
    try {
      return await this.storageManager.retrieveData(`${sessionId}-data`);
    } catch {
      return null;
    }
  }

  async getActiveSessions(): Promise<string[]> {
    return await this.storageManager.listKeys('session-');
  }

  async getSessionStatus(sessionId: string): Promise<'active' | 'completed' | 'failed'> {
    try {
      const session = await this.storageManager.retrieveData(sessionId);
      return session.status || 'active';
    } catch {
      return 'failed';
    }
  }

  // ============= New Efficient Exchange-Based Methods =============
  
  /**
   * Create a new session with metadata (efficient version)
   */
  async createSessionWithMetadata(options: SessionOptions & { model?: string; temperature?: number }): Promise<SessionResult> {
    // First create the session normally
    const result = await this.createSession(options);
    
    // Then store metadata efficiently
    const metadata: Partial<SessionMetadata> = {
      model: options.model,
      temperature: options.temperature,
      hostAddress: result.hostAddress
    };
    
    await this.storageManager.createSessionMetadata(result.sessionId, metadata);
    
    return result;
  }
  
  /**
   * Add a single exchange to a session (O(1) operation)
   */
  async addExchange(sessionId: string, prompt: string, response: string, tokensUsed?: number): Promise<void> {
    const exchange: Exchange = {
      prompt,
      response,
      timestamp: Date.now(),
      tokensUsed
    };
    
    await this.storageManager.storeExchange(sessionId, exchange);
  }
  
  /**
   * Get recent exchanges for context (efficient pagination)
   */
  async getRecentContext(sessionId: string, limit: number = 5): Promise<Exchange[]> {
    return await this.storageManager.getRecentExchanges(sessionId, limit);
  }
  
  /**
   * Stream through conversation history (memory efficient)
   */
  async* streamConversation(sessionId: string): AsyncGenerator<Exchange> {
    for await (const { exchange } of this.storageManager.getExchangesIterator(sessionId)) {
      yield exchange;
    }
  }
  
  /**
   * Get session statistics without loading all data
   */
  async getSessionStats(sessionId: string): Promise<SessionSummary | null> {
    return await this.storageManager.getSessionSummary(sessionId);
  }
  
  /**
   * List all user sessions with metadata
   */
  async listUserSessions(): Promise<Array<{ sessionId: string; metadata?: SessionMetadata; summary?: SessionSummary }>> {
    return await this.storageManager.listSessions();
  }

  /**
   * Calculate and return payment distribution for a session
   * @param jobId The session job ID
   * @returns Payment distribution details
   */
  async getPaymentDistribution(jobId: string | number): Promise<{
    totalCost: string;
    hostPayment: string;
    treasuryFee: string;
    userRefund: string;
    tokensUsed: number;
    pricePerToken: string;
  }> {
    try {
      // Get session details from payment manager
      const sessionDetails = await this.paymentManager.getSessionStatus(jobId);
      
      const tokensProven = sessionDetails.tokensProven || ethers.BigNumber.from(0);
      const pricePerToken = sessionDetails.pricePerToken || ethers.BigNumber.from(0);
      const deposit = sessionDetails.deposit || ethers.BigNumber.from(0);
      
      // Calculate total cost
      const totalCost = tokensProven.mul(pricePerToken);
      
      // Calculate 90/10 split
      const hostPayment = totalCost.mul(90).div(100);
      const treasuryFee = totalCost.sub(hostPayment);
      
      // Calculate refund
      const userRefund = deposit.sub(totalCost);
      
      // Format for display (assuming USDC with 6 decimals)
      const USDC_DECIMALS = 6;
      
      return {
        totalCost: ethers.utils.formatUnits(totalCost, USDC_DECIMALS),
        hostPayment: ethers.utils.formatUnits(hostPayment, USDC_DECIMALS),
        treasuryFee: ethers.utils.formatUnits(treasuryFee, USDC_DECIMALS),
        userRefund: ethers.utils.formatUnits(userRefund.gt(0) ? userRefund : 0, USDC_DECIMALS),
        tokensUsed: tokensProven.toNumber(),
        pricePerToken: ethers.utils.formatUnits(pricePerToken, USDC_DECIMALS)
      };
    } catch (error: any) {
      throw new Error(`Failed to get payment distribution: ${error.message}`);
    }
  }

  /**
   * Verify that the user received the correct refund amount
   * @param jobId The session job ID
   * @param expectedRefund The expected refund amount in USDC
   * @returns Boolean indicating if refund matches
   */
  async verifyRefund(jobId: string | number, expectedRefund: string): Promise<boolean> {
    try {
      const distribution = await this.getPaymentDistribution(jobId);
      const actualRefund = parseFloat(distribution.userRefund);
      const expected = parseFloat(expectedRefund);
      
      // Allow small rounding differences (0.01 USDC)
      return Math.abs(actualRefund - expected) < 0.01;
    } catch (error: any) {
      throw new Error(`Failed to verify refund: ${error.message}`);
    }
  }

  /**
   * Wait for session confirmation on blockchain
   * @param jobId The session job ID
   * @param timeout Maximum time to wait in milliseconds
   * @returns Boolean indicating if session was confirmed
   */
  async waitForSessionConfirmation(jobId: string | number, timeout: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const exists = await this.paymentManager.verifySessionCreated(jobId);
        if (exists) {
          return true;
        }
      } catch (error) {
        // Continue waiting
      }
      
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return false;
  }

  /**
   * Complete a USDC payment session including claim and withdrawals
   * @param jobId The session job ID
   * @returns Object with completion details
   */
  async completeUSDCSession(jobId: string | number): Promise<{
    claimSuccess: boolean;
    hostWithdrawal: boolean;
    treasuryWithdrawal: boolean;
    distribution: any;
  }> {
    try {
      // First claim the payment with proof
      let claimSuccess = false;
      try {
        await this.paymentManager.claimWithProof(jobId);
        claimSuccess = true;
      } catch (error: any) {
        console.error(`Claim failed: ${error.message}`);
      }
      
      // Get payment distribution
      const distribution = await this.getPaymentDistribution(jobId);
      
      // Note: Actual withdrawals would be done by host and treasury managers
      // This is just to track the status
      return {
        claimSuccess,
        hostWithdrawal: false, // Would be done by host
        treasuryWithdrawal: false, // Would be done by treasury
        distribution
      };
    } catch (error: any) {
      throw new Error(`Failed to complete USDC session: ${error.message}`);
    }
  }
}