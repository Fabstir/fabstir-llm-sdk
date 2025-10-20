// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Advanced Job Negotiation Example
 * 
 * This example demonstrates sophisticated job negotiation strategies
 * including price optimization, node selection, and quality requirements.
 */

import { FabstirSDK } from '@fabstir/llm-sdk';
import { ethers, BigNumber } from 'ethers';
import type { DiscoveredNode, NodeCapabilities } from '@fabstir/llm-sdk';

async function main() {
  console.log('🤝 Fabstir SDK Advanced Negotiation Example\n');

  const sdk = new FabstirSDK({
    mode: 'production',
    p2pConfig: {
      bootstrapNodes: [
        '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg'
      ],
    },
  });

  const provider = new ethers.providers.JsonRpcProvider(
    'https://base-sepolia.public.blastapi.io'
  );
  await sdk.connect(provider);
  console.log('✅ Connected to SDK\n');

  // Example 1: Price-optimized negotiation
  console.log('💰 Example 1: Price-Optimized Negotiation\n');
  await priceOptimizedNegotiation(sdk);

  // Example 2: Quality-focused negotiation
  console.log('\n⭐ Example 2: Quality-Focused Negotiation\n');
  await qualityFocusedNegotiation(sdk);

  // Example 3: Multi-criteria negotiation
  console.log('\n🎯 Example 3: Multi-Criteria Negotiation\n');
  await multiCriteriaNegotiation(sdk);

  // Example 4: Auction-style negotiation
  console.log('\n🔨 Example 4: Auction-Style Negotiation\n');
  await auctionStyleNegotiation(sdk);

  // Example 5: Dynamic negotiation with fallbacks
  console.log('\n🔄 Example 5: Dynamic Negotiation\n');
  await dynamicNegotiation(sdk);

  // Example 6: Batch job negotiation
  console.log('\n📦 Example 6: Batch Job Negotiation\n');
  await batchJobNegotiation(sdk);

  // Example 7: Time-sensitive negotiation
  console.log('\n⏰ Example 7: Time-Sensitive Negotiation\n');
  await timeSensitiveNegotiation(sdk);

  await sdk.disconnect();
  console.log('\n✅ Negotiation examples completed!');
}

// Example 1: Price-optimized negotiation
async function priceOptimizedNegotiation(sdk: FabstirSDK) {
  // Discover all available nodes
  const nodes = await sdk.discoverNodes({
    modelId: 'llama-3.2-1b-instruct',
  });

  console.log(`Found ${nodes.length} nodes offering the model`);

  // Sort by price
  const sortedByPrice = nodes.sort((a, b) => 
    BigNumber.from(a.capabilities.pricePerToken)
      .sub(BigNumber.from(b.capabilities.pricePerToken))
      .toNumber()
  );

  // Show price distribution
  console.log('\nPrice distribution:');
  sortedByPrice.slice(0, 5).forEach(node => {
    console.log(`  ${node.peerId.slice(-8)}: ${
      ethers.utils.formatUnits(node.capabilities.pricePerToken, 18)
    } ETH/token (latency: ${node.latency}ms)`);
  });

  // Negotiate with cheapest acceptable nodes
  const acceptableNodes = sortedByPrice.filter(node => 
    node.latency! < 200 && // Max 200ms latency
    node.reputation! > 80   // Min 80% reputation
  );

  console.log(`\n${acceptableNodes.length} nodes meet quality requirements`);

  // Submit job with price optimization
  try {
    const result = await sdk.submitJobWithNegotiation({
      prompt: 'What is the meaning of life?',
      modelId: 'llama-3.2-1b-instruct',
      maxTokens: 100,
      preferredNodes: acceptableNodes.slice(0, 3).map(n => n.peerId),
      maxBudget: ethers.utils.parseEther('0.0001'), // Very low budget
    });

    console.log('\n✅ Negotiation successful!');
    console.log(`Selected node: ${result.selectedNode.slice(-8)}`);
    console.log(`Final price: ${ethers.utils.formatEther(result.negotiatedPrice)} ETH`);
    console.log(`Savings: ${
      ((1 - result.negotiatedPrice.mul(100).div(ethers.utils.parseEther('0.001')).toNumber() / 100) * 100).toFixed(2)
    }% vs standard price`);
  } catch (error) {
    console.error('❌ Price negotiation failed:', error.message);
  }
}

// Example 2: Quality-focused negotiation
async function qualityFocusedNegotiation(sdk: FabstirSDK) {
  // Custom node scoring function
  function scoreNode(node: DiscoveredNode): number {
    const reputationWeight = 0.5;
    const latencyWeight = 0.3;
    const capabilityWeight = 0.2;

    const reputationScore = (node.reputation || 0) / 100;
    const latencyScore = Math.max(0, 1 - (node.latency || 1000) / 1000);
    const capabilityScore = Math.min(node.capabilities.maxTokens / 8192, 1);

    return (
      reputationScore * reputationWeight +
      latencyScore * latencyWeight +
      capabilityScore * capabilityWeight
    );
  }

  // Discover and score nodes
  const nodes = await sdk.discoverNodes({
    modelId: 'llama-3.2-1b-instruct',
    minReputation: 85, // High reputation requirement
  });

  const scoredNodes = nodes
    .map(node => ({ node, score: scoreNode(node) }))
    .sort((a, b) => b.score - a.score);

  console.log('Top quality nodes:');
  scoredNodes.slice(0, 3).forEach(({ node, score }) => {
    console.log(`  ${node.peerId.slice(-8)}: Score ${(score * 100).toFixed(1)}%`);
    console.log(`    Reputation: ${node.reputation}, Latency: ${node.latency}ms`);
  });

  // Negotiate with quality focus
  const result = await sdk.submitJobWithNegotiation({
    prompt: 'Write a detailed technical explanation of quantum computing.',
    modelId: 'llama-3.2-1b-instruct',
    maxTokens: 500,
    temperature: 0.3, // Lower temperature for technical accuracy
    preferredNodes: scoredNodes.slice(0, 3).map(s => s.node.peerId),
    maxBudget: ethers.utils.parseEther('0.005'), // Willing to pay more for quality
  });

  console.log('\n✅ Quality-focused job submitted');
  console.log(`Selected high-quality node: ${result.selectedNode.slice(-8)}`);
}

// Example 3: Multi-criteria negotiation
async function multiCriteriaNegotiation(sdk: FabstirSDK) {
  interface NegotiationCriteria {
    maxPrice: BigNumber;
    maxLatency: number;
    minReputation: number;
    requiredCapabilities: string[];
    preferredGPU?: string;
  }

  const criteria: NegotiationCriteria = {
    maxPrice: ethers.utils.parseEther('0.000002'), // 2 gwei per token
    maxLatency: 150,
    minReputation: 90,
    requiredCapabilities: ['streaming', 'long-context'],
    preferredGPU: 'RTX 4090',
  };

  console.log('Negotiation criteria:');
  console.log(`  Max price: ${ethers.utils.formatEther(criteria.maxPrice)} ETH/token`);
  console.log(`  Max latency: ${criteria.maxLatency}ms`);
  console.log(`  Min reputation: ${criteria.minReputation}%`);
  console.log(`  Required: ${criteria.requiredCapabilities.join(', ')}`);

  // Complex node filtering
  const nodes = await sdk.discoverNodes({
    modelId: 'llama-3.2-1b-instruct',
  });

  const eligibleNodes = nodes.filter(node => {
    const price = BigNumber.from(node.capabilities.pricePerToken);
    const meetsPrice = price.lte(criteria.maxPrice);
    const meetsLatency = (node.latency || Infinity) <= criteria.maxLatency;
    const meetsReputation = (node.reputation || 0) >= criteria.minReputation;
    
    // Check GPU preference
    const hasPreferredGPU = criteria.preferredGPU ? 
      node.capabilities.gpuModel === criteria.preferredGPU : true;

    return meetsPrice && meetsLatency && meetsReputation && hasPreferredGPU;
  });

  console.log(`\n${eligibleNodes.length} nodes meet all criteria`);

  if (eligibleNodes.length === 0) {
    console.log('Relaxing criteria...');
    // Implement criteria relaxation strategy
    return;
  }

  // Multi-round negotiation
  const negotiationRounds = 3;
  let bestOffer: any = null;

  for (let round = 1; round <= negotiationRounds; round++) {
    console.log(`\nNegotiation round ${round}/${negotiationRounds}`);
    
    try {
      const offers = await Promise.all(
        eligibleNodes.slice(0, 5).map(async node => {
          // Simulate getting offers from nodes
          const basePrice = BigNumber.from(node.capabilities.pricePerToken);
          const discount = Math.random() * 0.2; // Up to 20% discount
          const offeredPrice = basePrice.mul(100 - Math.floor(discount * 100)).div(100);
          
          return {
            nodeId: node.peerId,
            price: offeredPrice,
            guaranteedLatency: node.latency! * 0.9,
            bonusTokens: Math.floor(Math.random() * 50),
          };
        })
      );

      // Select best offer
      bestOffer = offers.reduce((best, current) => 
        current.price.lt(best.price) ? current : best
      );

      console.log(`Best offer: ${ethers.utils.formatEther(bestOffer.price)} ETH/token`);
      console.log(`From node: ${bestOffer.nodeId.slice(-8)}`);
      
    } catch (error) {
      console.error(`Round ${round} failed:`, error.message);
    }
  }

  if (bestOffer) {
    const result = await sdk.submitJobWithNegotiation({
      prompt: 'Complex multi-criteria job',
      modelId: 'llama-3.2-1b-instruct',
      maxTokens: 200,
      preferredNodes: [bestOffer.nodeId],
    });

    console.log('\n✅ Multi-criteria negotiation completed');
    console.log(`Final terms: ${ethers.utils.formatEther(result.negotiatedPrice)} ETH/token`);
  }
}

// Example 4: Auction-style negotiation
async function auctionStyleNegotiation(sdk: FabstirSDK) {
  console.log('Starting reverse auction for job...\n');

  const jobRequirements = {
    prompt: 'Generate a comprehensive business plan for a AI startup',
    modelId: 'llama-3.2-1b-instruct',
    maxTokens: 1000,
    quality: 'high',
    deadline: Date.now() + 300000, // 5 minutes
  };

  // Announce job to network
  const nodes = await sdk.discoverNodes({
    modelId: jobRequirements.modelId,
  });

  console.log(`Announcing job to ${nodes.length} potential providers`);
  console.log('Accepting bids for 30 seconds...\n');

  // Simulate collecting bids
  const bids: Array<{
    nodeId: string;
    price: BigNumber;
    estimatedTime: number;
    reputation: number;
    extras: string[];
  }> = [];

  // Simulate bid collection (in real implementation, this would be async)
  const bidTimeout = 30000; // 30 seconds
  const startTime = Date.now();

  // Generate mock bids
  for (const node of nodes.slice(0, 10)) {
    const baseBid = BigNumber.from(node.capabilities.pricePerToken).mul(jobRequirements.maxTokens);
    const competitiveBid = baseBid.mul(100 - Math.floor(Math.random() * 30)).div(100); // Up to 30% discount
    
    bids.push({
      nodeId: node.peerId,
      price: competitiveBid,
      estimatedTime: 60000 + Math.random() * 120000, // 1-3 minutes
      reputation: node.reputation || 80,
      extras: Math.random() > 0.5 ? ['priority-queue'] : [],
    });
  }

  console.log(`Received ${bids.length} bids:`);
  
  // Sort bids by value score
  const scoredBids = bids.map(bid => ({
    ...bid,
    score: calculateBidScore(bid),
  })).sort((a, b) => b.score - a.score);

  scoredBids.slice(0, 5).forEach((bid, index) => {
    console.log(`  ${index + 1}. Node ${bid.nodeId.slice(-8)}:`);
    console.log(`     Price: ${ethers.utils.formatEther(bid.price)} ETH`);
    console.log(`     Time: ${(bid.estimatedTime / 60000).toFixed(1)} minutes`);
    console.log(`     Score: ${bid.score.toFixed(2)}`);
  });

  // Select winning bid
  const winner = scoredBids[0];
  console.log(`\n🏆 Winner: Node ${winner.nodeId.slice(-8)}`);

  // Submit job to winner
  const result = await sdk.submitJobWithNegotiation({
    ...jobRequirements,
    preferredNodes: [winner.nodeId],
    maxBudget: winner.price.mul(110).div(100), // 10% buffer
  });

  console.log('✅ Auction completed and job submitted');
  console.log(`Final price: ${ethers.utils.formatEther(result.negotiatedPrice)} ETH`);

  function calculateBidScore(bid: typeof bids[0]): number {
    const priceScore = 1 / parseFloat(ethers.utils.formatEther(bid.price));
    const timeScore = 1 / (bid.estimatedTime / 60000);
    const reputationScore = bid.reputation / 100;
    const extrasScore = bid.extras.length * 0.1;

    return (priceScore * 0.4) + (timeScore * 0.2) + (reputationScore * 0.3) + extrasScore;
  }
}

// Example 5: Dynamic negotiation with fallbacks
async function dynamicNegotiation(sdk: FabstirSDK) {
  const negotiationStrategies = [
    {
      name: 'Premium Fast',
      criteria: {
        maxLatency: 50,
        minReputation: 95,
        maxBudget: ethers.utils.parseEther('0.01'),
      },
    },
    {
      name: 'Balanced',
      criteria: {
        maxLatency: 150,
        minReputation: 85,
        maxBudget: ethers.utils.parseEther('0.005'),
      },
    },
    {
      name: 'Budget',
      criteria: {
        maxLatency: 500,
        minReputation: 70,
        maxBudget: ethers.utils.parseEther('0.001'),
      },
    },
    {
      name: 'Emergency',
      criteria: {
        maxLatency: 1000,
        minReputation: 50,
        maxBudget: ethers.utils.parseEther('0.01'),
      },
    },
  ];

  for (const strategy of negotiationStrategies) {
    console.log(`\nTrying strategy: ${strategy.name}`);
    console.log(`  Max latency: ${strategy.criteria.maxLatency}ms`);
    console.log(`  Min reputation: ${strategy.criteria.minReputation}%`);
    console.log(`  Max budget: ${ethers.utils.formatEther(strategy.criteria.maxBudget)} ETH`);

    try {
      const nodes = await sdk.discoverNodes({
        modelId: 'llama-3.2-1b-instruct',
        maxLatency: strategy.criteria.maxLatency,
        minReputation: strategy.criteria.minReputation,
      });

      if (nodes.length === 0) {
        console.log('  ❌ No nodes match criteria');
        continue;
      }

      console.log(`  ✅ Found ${nodes.length} matching nodes`);

      const result = await sdk.submitJobWithNegotiation({
        prompt: 'Dynamic negotiation test',
        modelId: 'llama-3.2-1b-instruct',
        maxTokens: 100,
        maxBudget: strategy.criteria.maxBudget,
        preferredNodes: nodes.slice(0, 3).map(n => n.peerId),
      });

      console.log(`  ✅ Success with ${strategy.name} strategy!`);
      console.log(`  Node: ${result.selectedNode.slice(-8)}`);
      console.log(`  Price: ${ethers.utils.formatEther(result.negotiatedPrice)} ETH`);
      
      return result; // Success, exit
      
    } catch (error) {
      console.log(`  ❌ Strategy failed: ${error.message}`);
    }
  }

  console.log('\n❌ All negotiation strategies exhausted');
}

// Example 6: Batch job negotiation
async function batchJobNegotiation(sdk: FabstirSDK) {
  const batchJobs = [
    { prompt: 'Summarize recent AI developments', maxTokens: 200 },
    { prompt: 'Explain quantum computing basics', maxTokens: 300 },
    { prompt: 'Write a poem about technology', maxTokens: 150 },
    { prompt: 'Analyze cryptocurrency trends', maxTokens: 250 },
    { prompt: 'Describe future of work', maxTokens: 200 },
  ];

  const totalTokens = batchJobs.reduce((sum, job) => sum + job.maxTokens, 0);
  console.log(`Negotiating batch of ${batchJobs.length} jobs (${totalTokens} total tokens)`);

  // Find nodes that can handle the full batch
  const nodes = await sdk.discoverNodes({
    modelId: 'llama-3.2-1b-instruct',
  });

  const capableNodes = nodes.filter(node => 
    node.capabilities.maxConcurrentJobs && 
    node.capabilities.maxConcurrentJobs >= batchJobs.length
  );

  console.log(`${capableNodes.length} nodes can handle concurrent jobs`);

  // Calculate batch pricing
  const batchOffers = capableNodes.map(node => {
    const basePrice = BigNumber.from(node.capabilities.pricePerToken).mul(totalTokens);
    const bulkDiscount = 0.15; // 15% bulk discount
    const discountedPrice = basePrice.mul(100 - Math.floor(bulkDiscount * 100)).div(100);
    
    return {
      nodeId: node.peerId,
      individualPrice: basePrice,
      batchPrice: discountedPrice,
      savings: basePrice.sub(discountedPrice),
      savingsPercent: bulkDiscount * 100,
    };
  });

  // Show savings
  console.log('\nBatch pricing offers:');
  batchOffers.slice(0, 3).forEach(offer => {
    console.log(`  Node ${offer.nodeId.slice(-8)}:`);
    console.log(`    Individual: ${ethers.utils.formatEther(offer.individualPrice)} ETH`);
    console.log(`    Batch: ${ethers.utils.formatEther(offer.batchPrice)} ETH`);
    console.log(`    Savings: ${ethers.utils.formatEther(offer.savings)} ETH (${offer.savingsPercent}%)`);
  });

  // Submit batch
  const bestOffer = batchOffers.reduce((best, current) => 
    current.batchPrice.lt(best.batchPrice) ? current : best
  );

  console.log(`\nSubmitting batch to node ${bestOffer.nodeId.slice(-8)}`);

  // Submit jobs as batch
  const results = await Promise.all(
    batchJobs.map(job => 
      sdk.submitJobWithNegotiation({
        ...job,
        modelId: 'llama-3.2-1b-instruct',
        preferredNodes: [bestOffer.nodeId],
      })
    )
  );

  console.log('✅ Batch submitted successfully');
  console.log(`Total jobs: ${results.length}`);
  console.log(`Total cost: ${ethers.utils.formatEther(
    results.reduce((sum, r) => sum.add(r.negotiatedPrice), BigNumber.from(0))
  )} ETH`);
}

// Example 7: Time-sensitive negotiation
async function timeSensitiveNegotiation(sdk: FabstirSDK) {
  const urgencyLevels = [
    { name: 'Immediate', maxWait: 10000, pricePremium: 2.0 },
    { name: 'Urgent', maxWait: 60000, pricePremium: 1.5 },
    { name: 'Normal', maxWait: 300000, pricePremium: 1.0 },
    { name: 'Flexible', maxWait: 3600000, pricePremium: 0.8 },
  ];

  for (const urgency of urgencyLevels) {
    console.log(`\n⏰ ${urgency.name} job (max wait: ${urgency.maxWait / 1000}s)`);
    
    const startTime = Date.now();
    const deadline = startTime + urgency.maxWait;

    try {
      // Quick discovery with timeout
      const discoveryTimeout = Math.min(urgency.maxWait * 0.2, 5000);
      const nodes = await Promise.race([
        sdk.discoverNodes({
          modelId: 'llama-3.2-1b-instruct',
          forceRefresh: urgency.name === 'Immediate',
        }),
        new Promise<DiscoveredNode[]>((_, reject) => 
          setTimeout(() => reject(new Error('Discovery timeout')), discoveryTimeout)
        ),
      ]);

      console.log(`Found ${nodes.length} nodes in ${Date.now() - startTime}ms`);

      // Filter by response time
      const fastNodes = nodes.filter(node => {
        const estimatedResponseTime = (node.latency || 0) + 2000; // Network + processing
        return estimatedResponseTime < urgency.maxWait * 0.8;
      });

      if (fastNodes.length === 0) {
        console.log('❌ No nodes can meet deadline');
        continue;
      }

      // Adjust budget based on urgency
      const basePrice = ethers.utils.parseEther('0.001');
      const urgentPrice = basePrice.mul(Math.floor(urgency.pricePremium * 100)).div(100);

      console.log(`Offering ${urgency.pricePremium}x premium: ${ethers.utils.formatEther(urgentPrice)} ETH`);

      const result = await sdk.submitJobWithNegotiation({
        prompt: `${urgency.name} priority: Quick response needed`,
        modelId: 'llama-3.2-1b-instruct',
        maxTokens: 50,
        maxBudget: urgentPrice,
        preferredNodes: fastNodes.slice(0, 3).map(n => n.peerId),
        metadata: {
          urgency: urgency.name,
          deadline: deadline,
        },
      });

      const totalTime = Date.now() - startTime;
      console.log(`✅ Job submitted in ${totalTime}ms`);
      console.log(`Time remaining: ${(deadline - Date.now()) / 1000}s`);
      
      break; // Success
      
    } catch (error) {
      console.log(`❌ ${urgency.name} failed: ${error.message}`);
      
      if (Date.now() > deadline) {
        console.log('⏰ Deadline exceeded!');
        break;
      }
    }
  }
}

// Run the example
main().catch(console.error);