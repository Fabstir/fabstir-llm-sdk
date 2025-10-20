// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Basic Mock Mode Example
 * 
 * This example demonstrates how to use the Fabstir LLM SDK in mock mode
 * for development and testing without connecting to a real P2P network.
 */

import { FabstirSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

async function main() {
  console.log('🚀 Fabstir SDK Mock Mode Example\n');

  // 1. Initialize SDK in mock mode
  console.log('1️⃣ Initializing SDK in mock mode...');
  const sdk = new FabstirSDK({
    mode: 'mock',
    debug: true, // Enable debug logging
  });

  // 2. Create a mock provider (required even in mock mode)
  console.log('2️⃣ Creating mock provider...');
  const mockProvider = new ethers.providers.JsonRpcProvider();
  
  // Connect the SDK
  await sdk.connect(mockProvider);
  console.log('✅ Connected to SDK\n');

  // 3. Submit a simple job
  console.log('3️⃣ Submitting a job...');
  const jobId = await sdk.submitJob({
    prompt: 'What is the capital of France?',
    modelId: 'llama-3.2-1b-instruct',
    maxTokens: 50,
    temperature: 0.7,
  });
  
  console.log(`✅ Job submitted with ID: ${jobId}\n`);

  // 4. Check job status
  console.log('4️⃣ Checking job status...');
  const status = await sdk.getJobStatus(jobId);
  console.log('Job status:', status);

  // 5. Get job result (in mock mode, results are instant)
  console.log('\n5️⃣ Getting job result...');
  const result = await sdk.getJobResult(jobId);
  console.log('Response:', result.response);
  console.log('Tokens used:', result.tokensUsed);

  // 6. Test streaming (mock mode simulates streaming)
  console.log('\n6️⃣ Testing streaming response...');
  const streamingJob = await sdk.submitJob({
    prompt: 'Tell me a short story about a robot.',
    modelId: 'llama-3.2-1b-instruct',
    maxTokens: 100,
    stream: true,
  });

  // Create a response stream
  const stream = await sdk.createResponseStream({
    jobId: String(streamingJob),
    requestId: `req-${streamingJob}`,
  });

  console.log('Streaming response:');
  let tokenCount = 0;
  
  stream.on('token', (token) => {
    process.stdout.write(token.content);
    tokenCount++;
  });

  stream.on('end', (summary) => {
    console.log(`\n\nStream completed!`);
    console.log(`Total tokens: ${summary.totalTokens}`);
    console.log(`Duration: ${summary.duration}ms`);
  });

  stream.on('error', (error) => {
    console.error('Stream error:', error);
  });

  // Wait for stream to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 7. Test error handling
  console.log('\n7️⃣ Testing error handling...');
  try {
    await sdk.submitJob({
      prompt: 'This will fail',
      modelId: 'non-existent-model',
      maxTokens: 50,
    });
  } catch (error) {
    console.log('✅ Error caught as expected:', error.message);
  }

  // 8. Get system health (mock mode always reports healthy)
  console.log('\n8️⃣ Checking system health...');
  const health = await sdk.getSystemHealthReport();
  console.log('System status:', health.status);
  console.log('Mode:', health.mode);

  // 9. Disconnect
  console.log('\n9️⃣ Disconnecting...');
  await sdk.disconnect();
  console.log('✅ Disconnected\n');

  console.log('🎉 Mock mode example completed!');
}

// Run the example
main().catch(console.error);

/* Example Output:

🚀 Fabstir SDK Mock Mode Example

1️⃣ Initializing SDK in mock mode...
2️⃣ Creating mock provider...
✅ Connected to SDK

3️⃣ Submitting a job...
✅ Job submitted with ID: 1

4️⃣ Checking job status...
Job status: { status: 'COMPLETED', progress: 100 }

5️⃣ Getting job result...
Response: Mock response for: What is the capital of France?
Tokens used: 10

6️⃣ Testing streaming response...
Streaming response:
Once upon a time, there was a friendly robot named Beep. Beep loved to help people and learn new things. Every day, Beep would explore the city, making friends and solving problems with its clever circuits...

Stream completed!
Total tokens: 100
Duration: 2500ms

7️⃣ Testing error handling...
✅ Error caught as expected: Model not found: non-existent-model

8️⃣ Checking system health...
System status: healthy
Mode: mock

9️⃣ Disconnecting...
✅ Disconnected

🎉 Mock mode example completed!
*/