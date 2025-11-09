/**
 * SessionManagerMock
 *
 * Mock implementation of ISessionManager for UI development
 * Simulates LLM chat sessions with streaming responses
 */

import type {
  ISessionManager,
  SessionConfig,
  SessionInfo,
  Vector,
  SearchResult
} from '../types';

export class SessionManagerMock implements ISessionManager {
  private activeSessions: Map<string, SessionInfo> = new Map();
  private userAddress: string;

  constructor(userAddress: string) {
    this.userAddress = userAddress;
  }

  async startSession(config: SessionConfig): Promise<SessionInfo> {
    await this.delay(800); // Simulate connection time

    const sessionId = this.generateId('sess');
    const sessionInfo: SessionInfo = {
      sessionId,
      hostUrl: config.hostUrl,
      jobId: config.jobId,
      modelName: config.modelName,
      chainId: config.chainId,
      status: 'active',
      createdAt: Date.now(),
      groupId: config.groupId
    };

    this.activeSessions.set(sessionId.toString(), sessionInfo);
    console.log('[Mock] Started session:', sessionId);

    return sessionInfo;
  }

  async endSession(sessionId: string | BigInt): Promise<void> {
    await this.delay(300);

    const id = sessionId.toString();
    this.activeSessions.delete(id);
    console.log('[Mock] Ended session:', id);
  }

  async sendPromptStreaming(
    sessionId: string | BigInt,
    prompt: string,
    onChunk: (chunk: { content: string; done: boolean }) => void
  ): Promise<void> {
    const id = sessionId.toString();

    if (!this.activeSessions.has(id)) {
      throw new Error(`[Mock] Session not found: ${id}`);
    }

    console.log('[Mock] Streaming response for prompt:', prompt.substring(0, 50) + '...');

    // Generate mock response
    const mockResponse = this.generateMockResponse(prompt);
    const words = mockResponse.split(' ');

    // Simulate streaming by sending word-by-word
    for (let i = 0; i < words.length; i++) {
      await this.delay(50); // Simulate streaming delay

      onChunk({
        content: words[i] + ' ',
        done: i === words.length - 1
      });
    }
  }

  async sendPrompt(sessionId: string | BigInt, prompt: string): Promise<string> {
    const id = sessionId.toString();

    if (!this.activeSessions.has(id)) {
      throw new Error(`[Mock] Session not found: ${id}`);
    }

    console.log('[Mock] Processing prompt:', prompt.substring(0, 50) + '...');

    await this.delay(1500); // Simulate response time
    return this.generateMockResponse(prompt);
  }

  // RAG Methods

  async uploadVectors(
    sessionId: string | BigInt,
    vectors: Vector[],
    replace?: boolean
  ): Promise<{ success: boolean; count: number }> {
    await this.delay(500);

    console.log(`[Mock] Uploaded ${vectors.length} vectors (replace: ${replace})`);

    return {
      success: true,
      count: vectors.length
    };
  }

  async searchVectors(
    sessionId: string | BigInt,
    queryVector: number[],
    k?: number,
    threshold?: number
  ): Promise<SearchResult[]> {
    await this.delay(300);

    const topK = k || 5;
    const results: SearchResult[] = [];

    // Generate mock search results
    for (let i = 0; i < topK; i++) {
      results.push({
        id: `vec-${i + 1}`,
        score: 0.95 - (i * 0.08),
        metadata: {
          text: `Mock search result ${i + 1}...`,
          source: `document-${i + 1}.pdf`,
          folderPath: `/documents/category-${i % 3}`
        }
      });
    }

    console.log(`[Mock] Found ${results.length} vectors`);
    return results;
  }

  async askWithContext(
    sessionId: string | BigInt,
    question: string,
    topK?: number
  ): Promise<{ answer: string; sources: SearchResult[] }> {
    await this.delay(1200);

    // Mock RAG-enhanced response
    const sources = await this.searchVectors(sessionId, [], topK || 3);
    const answer = this.generateMockResponse(question) + ' [Based on retrieved context]';

    console.log(`[Mock] Generated answer with ${sources.length} sources`);

    return { answer, sources };
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.activeSessions.get(sessionId);
  }

  listActiveSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values());
  }

  // Helper Methods

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMockResponse(prompt: string): string {
    // Generate contextual mock responses based on keywords
    if (prompt.toLowerCase().includes('explain') || prompt.toLowerCase().includes('what')) {
      return 'This is a detailed explanation of the concept. First, let me break down the key components. The main idea is to understand how these elements interact with each other in a systematic way.';
    }

    if (prompt.toLowerCase().includes('how')) {
      return 'To accomplish this, you would follow these steps: First, prepare the necessary prerequisites. Second, execute the main operation carefully. Finally, verify the results to ensure correctness.';
    }

    if (prompt.toLowerCase().includes('list') || prompt.toLowerCase().includes('enumerate')) {
      return '1. First important point to consider\n2. Second key aspect\n3. Third critical element\n4. Fourth essential factor\n5. Fifth significant detail';
    }

    // Default response
    return 'Based on the information provided, here is a comprehensive response. The analysis suggests several key insights that are worth exploring further.';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
