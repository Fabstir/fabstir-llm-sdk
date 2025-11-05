/**
 * RAG End-to-End Manual Test
 * Tests document upload, vector search, and LLM response with RAG context
 *
 * Run with: npx vitest run tests/integration/rag-e2e-manual
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { FabstirSDKCore } from '../../src/FabstirSDKCore.js';
import { DocumentManager } from '../../src/documents/DocumentManager.js';
import { HostAdapter } from '../../src/embeddings/adapters/HostAdapter.js';
import { ChainId } from '../../src/types/chain.types.js';
import 'fake-indexeddb/auto';
import WS from 'ws';

// Polyfill WebSocket for Node.js
if (typeof global.WebSocket === 'undefined') {
  (global as any).WebSocket = WS;
}

const TEST_QUERY = "I wish to watch a film about a lonely fat man. What film would you recommend?";
const EXPECTED_RESPONSE_KEYWORD = "The Whale";
const HOST_ENDPOINT = 'http://localhost:8083';

describe('RAG End-to-End Test', () => {
  let sdk: FabstirSDKCore;
  let documentManager: DocumentManager;
  let sessionManager: any;
  let sessionId: bigint;

  beforeAll(async () => {
    console.log('\n🧪 Starting RAG End-to-End Test...\n');

    // 1. Initialize SDK
    console.log('📦 Step 1: Initialize SDK...');
    sdk = new FabstirSDKCore({
      mode: 'production' as const,
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!,
      contractAddresses: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
        proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
        hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
        modelRegistry: process.env.CONTRACT_MODEL_REGISTRY!,
        usdcToken: process.env.CONTRACT_USDC_TOKEN!,
        fabToken: process.env.CONTRACT_FAB_TOKEN!,
      }
    });

    await sdk.authenticate('privatekey', {
      privateKey: process.env.TEST_USER_1_PRIVATE_KEY!
    });
    console.log('✅ SDK authenticated\n');

    // 2. Create DocumentManager with HostAdapter
    console.log('📦 Step 2: Initialize DocumentManager with host embeddings...');
    const embeddingService = new HostAdapter({
      hostUrl: HOST_ENDPOINT,
      modelName: 'all-MiniLM-L6-v2'
    });
    documentManager = new DocumentManager({ embeddingService });
    console.log(`✅ DocumentManager ready (host: ${HOST_ENDPOINT})\n`);

    // 3. Get SessionManager
    sessionManager = await sdk.getSessionManager();
  }, 30000);

  it('should process document and extract chunks', async () => {
    console.log('📄 Step 3: Read and process document...');
    const filePath = '/workspace/temp/The Whale v2.txt';
    const fileContent = readFileSync(filePath, 'utf-8');

    // Create File-like object
    const file = {
      name: 'The Whale v2.txt',
      size: Buffer.from(fileContent).length,
      type: 'text/plain',
      arrayBuffer: async () => Buffer.from(fileContent),
      text: async () => fileContent,
      slice: () => Buffer.from(fileContent)
    } as unknown as File;

    console.log(`   File: ${file.name} (${file.size} bytes)`);
    const chunks = await documentManager.processDocument(file, {
      chunkSize: 500,
      overlap: 50
    });

    console.log(`✅ Document processed: ${chunks.length} chunks\n`);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toHaveProperty('embedding');
    expect(chunks[0].embedding.length).toBe(384);
  }, 60000);

  it('should start session and upload vectors', async () => {
    console.log('🚀 Step 4: Start LLM session...');
    const hostManager = sdk.getHostManager();

    // Discover hosts
    const hosts = await hostManager.discoverActiveHosts();
    expect(hosts.length).toBeGreaterThan(0);

    const host = hosts[0];
    console.log(`   Host: ${host.address}`);
    const modelName = host.supportedModels?.[0]?.name || 'llama-3';
    console.log(`   Model: ${modelName}`);

    // Start session
    const result = await sessionManager.startSession({
      hostUrl: HOST_ENDPOINT,
      jobId: BigInt(Date.now()),
      modelName,
      chainId: ChainId.BASE_SEPOLIA,
      encryption: false
    });

    sessionId = result.sessionId;
    console.log(`✅ Session started: ${sessionId}\n`);
    expect(sessionId).toBeGreaterThan(0n);

    // 5. Upload vectors
    console.log('📤 Step 5: Upload vectors to host...');
    const filePath = '/workspace/temp/The Whale v2.txt';
    const fileContent = readFileSync(filePath, 'utf-8');
    const file = {
      name: 'The Whale v2.txt',
      size: Buffer.from(fileContent).length,
      type: 'text/plain',
      arrayBuffer: async () => Buffer.from(fileContent),
      text: async () => fileContent,
      slice: () => Buffer.from(fileContent)
    } as unknown as File;

    const chunks = await documentManager.processDocument(file, {
      chunkSize: 500,
      overlap: 50
    });

    const vectors = chunks.map(chunk => ({
      id: chunk.id,
      vector: chunk.embedding,
      metadata: chunk.metadata
    }));

    const uploadResult = await sessionManager.uploadVectors(
      sessionId.toString(),
      vectors,
      false
    );

    console.log(`✅ Vectors uploaded: ${uploadResult.uploaded} uploaded, ${uploadResult.rejected} rejected\n`);
    expect(uploadResult.uploaded).toBe(chunks.length);
    expect(uploadResult.rejected).toBe(0);
  }, 90000);

  it('should search vectors and get relevant results', async () => {
    console.log('🔍 Step 6: Search vectors with query...');
    console.log(`   Query: "${TEST_QUERY}"`);

    // Embed query
    const { embedding: queryEmbedding } = await documentManager.embedText(TEST_QUERY, 'query');
    console.log(`   Query vector: ${queryEmbedding.length} dimensions`);
    expect(queryEmbedding.length).toBe(384);

    // Search
    const searchResults = await sessionManager.searchVectors(
      sessionId.toString(),
      queryEmbedding,
      3,
      0.5
    );

    console.log(`✅ Search complete: ${searchResults.length} results found`);
    expect(searchResults.length).toBeGreaterThan(0);

    if (searchResults.length > 0) {
      console.log('   Top results:');
      searchResults.forEach((result: any, idx: number) => {
        console.log(`     ${idx + 1}. Score: ${result.score.toFixed(3)} - ${result.metadata.text?.substring(0, 60)}...`);
      });
    }
    console.log();
  }, 30000);

  it('should send prompt with RAG context and get correct response', async () => {
    console.log('💬 Step 7: Send prompt with RAG context...');

    // Get RAG context
    const { embedding: queryEmbedding } = await documentManager.embedText(TEST_QUERY, 'query');
    const searchResults = await sessionManager.searchVectors(
      sessionId.toString(),
      queryEmbedding,
      3,
      0.5
    );

    let ragContext = '';
    if (searchResults.length > 0) {
      ragContext = "Relevant information from uploaded documents:\n\n";
      searchResults.forEach((result: any, idx: number) => {
        ragContext += `[Document ${idx + 1}] ${result.metadata.text}\n\n`;
      });
      ragContext += "---\n\n";
    }

    const fullPrompt = `${ragContext}User: ${TEST_QUERY}\nAssistant:`;
    console.log(`   RAG context: ${ragContext.length} characters`);

    // Send prompt
    let fullResponse = '';
    await sessionManager.sendPromptStreaming(
      sessionId,
      fullPrompt,
      (chunk: string) => {
        fullResponse += chunk;
        process.stdout.write(chunk);
      }
    );
    console.log('\n');

    // 8. Verify response
    console.log('✅ Step 8: Verify response...');
    const containsExpectedKeyword = fullResponse.toLowerCase().includes(EXPECTED_RESPONSE_KEYWORD.toLowerCase());

    if (containsExpectedKeyword) {
      console.log(`✅ SUCCESS! Response contains "${EXPECTED_RESPONSE_KEYWORD}"`);
      console.log('\n🎉 RAG End-to-End Test PASSED!');
    } else {
      console.log(`❌ FAILURE! Response does NOT contain "${EXPECTED_RESPONSE_KEYWORD}"`);
      console.log(`   Response: ${fullResponse}`);
    }

    expect(containsExpectedKeyword).toBe(true);
  }, 60000);
});
