/**
 * Response Streaming Example
 * 
 * This example demonstrates how to use the Fabstir LLM SDK's streaming
 * capabilities to receive real-time token-by-token responses.
 */

import { FabstirSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';
import readline from 'readline';

// Create readline interface for interactive prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('🌊 Fabstir SDK Streaming Example\n');

  // Initialize SDK
  const sdk = new FabstirSDK({
    mode: 'production',
    p2pConfig: {
      bootstrapNodes: [
        '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg'
      ],
    },
  });

  // Connect
  const provider = new ethers.providers.JsonRpcProvider(
    'https://base-sepolia.public.blastapi.io'
  );
  await sdk.connect(provider);
  console.log('✅ Connected to SDK\n');

  // Example 1: Basic streaming
  console.log('📝 Example 1: Basic Streaming\n');
  await basicStreaming(sdk);

  // Example 2: Stream with metrics
  console.log('\n📊 Example 2: Streaming with Metrics\n');
  await streamWithMetrics(sdk);

  // Example 3: Stream control (pause/resume)
  console.log('\n⏸️ Example 3: Stream Control\n');
  await streamControl(sdk);

  // Example 4: Stream error handling
  console.log('\n🛡️ Example 4: Error Handling\n');
  await streamErrorHandling(sdk);

  // Example 5: Multiple concurrent streams
  console.log('\n🔀 Example 5: Concurrent Streams\n');
  await concurrentStreams(sdk);

  // Example 6: Resume interrupted stream
  console.log('\n🔄 Example 6: Resume Stream\n');
  await resumeStream(sdk);

  // Disconnect
  await sdk.disconnect();
  console.log('\n✅ Disconnected');
  rl.close();
}

// Example 1: Basic streaming
async function basicStreaming(sdk: FabstirSDK) {
  const result = await sdk.submitJobWithNegotiation({
    prompt: 'Write a haiku about streaming data.',
    modelId: 'llama-3.2-1b-instruct',
    maxTokens: 50,
    stream: true,
  });

  if (result.stream) {
    console.log('Streaming response:\n');
    
    result.stream.on('token', (token) => {
      process.stdout.write(token.content);
    });

    await new Promise(resolve => {
      result.stream.on('end', (summary) => {
        console.log(`\n\nCompleted: ${summary.totalTokens} tokens in ${summary.duration}ms`);
        resolve(undefined);
      });
    });
  }
}

// Example 2: Stream with detailed metrics
async function streamWithMetrics(sdk: FabstirSDK) {
  const result = await sdk.submitJobWithNegotiation({
    prompt: 'Explain TCP/IP in 100 words.',
    modelId: 'llama-3.2-1b-instruct',
    maxTokens: 150,
    stream: true,
  });

  if (result.stream) {
    const metrics = {
      firstTokenTime: 0,
      tokens: [] as number[],
      startTime: Date.now(),
    };

    console.log('Streaming with metrics:\n');

    result.stream.on('token', (token) => {
      const now = Date.now();
      if (metrics.firstTokenTime === 0) {
        metrics.firstTokenTime = now - metrics.startTime;
        console.log(`\n[First token received in ${metrics.firstTokenTime}ms]\n`);
      }
      
      process.stdout.write(token.content);
      metrics.tokens.push(now);
    });

    result.stream.on('metrics', (streamMetrics) => {
      console.log('\n\n[Stream Metrics]');
      console.log(`Tokens/second: ${streamMetrics.tokensPerSecond}`);
      console.log(`Average latency: ${streamMetrics.averageLatency}ms`);
      console.log(`Bytes received: ${streamMetrics.bytesReceived}`);
    });

    await new Promise(resolve => {
      result.stream.on('end', (summary) => {
        // Calculate inter-token latencies
        const latencies = [];
        for (let i = 1; i < metrics.tokens.length; i++) {
          latencies.push(metrics.tokens[i] - metrics.tokens[i-1]);
        }
        
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const minLatency = Math.min(...latencies);
        const maxLatency = Math.max(...latencies);

        console.log('\n\n[Final Metrics]');
        console.log(`Total duration: ${summary.duration}ms`);
        console.log(`First token time: ${metrics.firstTokenTime}ms`);
        console.log(`Average inter-token latency: ${avgLatency.toFixed(2)}ms`);
        console.log(`Min latency: ${minLatency}ms, Max latency: ${maxLatency}ms`);
        
        resolve(undefined);
      });
    });
  }
}

// Example 3: Stream control (pause/resume)
async function streamControl(sdk: FabstirSDK) {
  const result = await sdk.submitJobWithNegotiation({
    prompt: 'Count from 1 to 20 slowly, with descriptions.',
    modelId: 'llama-3.2-1b-instruct',
    maxTokens: 200,
    stream: true,
  });

  if (result.stream) {
    let tokenCount = 0;
    let isPaused = false;

    console.log('Streaming (will pause after 50 tokens):\n');

    result.stream.on('token', (token) => {
      process.stdout.write(token.content);
      tokenCount++;

      // Pause after 50 tokens
      if (tokenCount === 50 && !isPaused) {
        isPaused = true;
        result.stream.pause();
        console.log('\n\n[PAUSED - Resuming in 2 seconds...]\n');
        
        setTimeout(() => {
          result.stream.resume();
          console.log('[RESUMED]\n');
        }, 2000);
      }
    });

    await new Promise(resolve => {
      result.stream.on('end', () => {
        console.log('\n\n[Stream completed]');
        resolve(undefined);
      });
    });
  }
}

// Example 4: Stream error handling
async function streamErrorHandling(sdk: FabstirSDK) {
  try {
    const result = await sdk.submitJobWithNegotiation({
      prompt: 'Generate a response that might encounter errors.',
      modelId: 'llama-3.2-1b-instruct',
      maxTokens: 100,
      stream: true,
    });

    if (result.stream) {
      console.log('Streaming with error handling:\n');

      let retryCount = 0;
      const maxRetries = 3;

      result.stream.on('token', (token) => {
        process.stdout.write(token.content);
      });

      result.stream.on('error', async (error) => {
        console.error(`\n\n[Error: ${error.message}]`);
        
        if (error.recoverable && retryCount < maxRetries) {
          retryCount++;
          console.log(`[Retrying... Attempt ${retryCount}/${maxRetries}]`);
          
          // Try to resume from last checkpoint
          const checkpoint = result.stream.getMetrics().tokensReceived;
          try {
            const resumedStream = await sdk.resumeResponseStream({
              jobId: result.jobId.toString(),
              requestId: `req-${result.jobId}`,
              resumeFrom: checkpoint,
            });
            
            console.log(`[Resumed from token ${checkpoint}]\n`);
            
            // Continue with resumed stream
            resumedStream.on('token', (token) => {
              process.stdout.write(token.content);
            });
            
          } catch (resumeError) {
            console.error('[Resume failed:', resumeError.message);
          }
        } else {
          console.log('[Unrecoverable error or max retries reached]');
        }
      });

      await new Promise(resolve => {
        result.stream.on('end', () => {
          console.log('\n\n[Stream completed successfully]');
          resolve(undefined);
        });
        
        result.stream.on('error', (error) => {
          if (!error.recoverable || retryCount >= maxRetries) {
            resolve(undefined);
          }
        });
      });
    }
  } catch (error) {
    console.error('Job submission failed:', error.message);
  }
}

// Example 5: Multiple concurrent streams
async function concurrentStreams(sdk: FabstirSDK) {
  const prompts = [
    'Write one line about the ocean.',
    'Write one line about the mountains.',
    'Write one line about the forest.',
  ];

  console.log('Starting 3 concurrent streams...\n');

  const streamPromises = prompts.map(async (prompt, index) => {
    const result = await sdk.submitJobWithNegotiation({
      prompt,
      modelId: 'llama-3.2-1b-instruct',
      maxTokens: 30,
      stream: true,
    });

    if (result.stream) {
      console.log(`Stream ${index + 1} started for: "${prompt}"`);
      let content = '';

      result.stream.on('token', (token) => {
        content += token.content;
      });

      return new Promise(resolve => {
        result.stream.on('end', (summary) => {
          console.log(`\nStream ${index + 1} completed (${summary.totalTokens} tokens):`);
          console.log(`> ${content.trim()}`);
          resolve({ index, content, tokens: summary.totalTokens });
        });
      });
    }
  });

  const results = await Promise.all(streamPromises);
  console.log('\nAll streams completed!');
}

// Example 6: Resume interrupted stream
async function resumeStream(sdk: FabstirSDK) {
  // First, start a stream that we'll interrupt
  const result = await sdk.submitJobWithNegotiation({
    prompt: 'List 10 interesting facts about space exploration.',
    modelId: 'llama-3.2-1b-instruct',
    maxTokens: 300,
    stream: true,
  });

  if (result.stream) {
    let checkpoint = 0;
    let interrupted = false;

    console.log('Starting stream (will interrupt after 100 tokens):\n');

    result.stream.on('token', (token) => {
      process.stdout.write(token.content);
      checkpoint = token.index;

      // Simulate interruption after 100 tokens
      if (checkpoint >= 100 && !interrupted) {
        interrupted = true;
        result.stream.close();
        console.log('\n\n[Stream interrupted at token 100]');
      }
    });

    // Wait for interruption
    await new Promise(resolve => setTimeout(resolve, 3000));

    if (interrupted) {
      console.log('[Resuming stream from checkpoint...]\n');
      
      // Resume from checkpoint
      const resumedStream = await sdk.resumeResponseStream({
        jobId: result.jobId.toString(),
        requestId: `req-${result.jobId}`,
        resumeFrom: checkpoint + 1,
      });

      resumedStream.on('token', (token) => {
        process.stdout.write(token.content);
      });

      await new Promise(resolve => {
        resumedStream.on('end', (summary) => {
          console.log(`\n\n[Resumed stream completed: ${summary.totalTokens} additional tokens]`);
          resolve(undefined);
        });
      });
    }
  }
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Run the example
main().catch(console.error);