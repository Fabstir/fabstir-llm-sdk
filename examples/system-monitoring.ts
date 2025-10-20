// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * System Monitoring Example
 * 
 * This example demonstrates how to monitor system health, performance metrics,
 * and implement automated responses to system conditions.
 */

import { FabstirSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';
import type { 
  SystemHealthReport, 
  PerformanceMetrics,
  NodeReliabilityRecord 
} from '@fabstir/llm-sdk';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

async function main() {
  console.log('📊 Fabstir SDK System Monitoring Example\n');

  const sdk = new FabstirSDK({
    mode: 'production',
    p2pConfig: {
      bootstrapNodes: [
        '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg'
      ],
    },
    enablePerformanceTracking: true,
    enableMetrics: true,
  });

  const provider = new ethers.providers.JsonRpcProvider(
    'https://base-sepolia.public.blastapi.io'
  );
  await sdk.connect(provider);
  console.log('✅ Connected to SDK with monitoring enabled\n');

  // Example 1: Real-time health monitoring
  console.log('🏥 Example 1: Real-time Health Monitoring\n');
  await realtimeHealthMonitoring(sdk);

  // Example 2: Performance dashboard
  console.log('\n📈 Example 2: Performance Dashboard\n');
  await performanceDashboard(sdk);

  // Example 3: Node reliability tracking
  console.log('\n🎯 Example 3: Node Reliability Tracking\n');
  await nodeReliabilityTracking(sdk);

  // Example 4: Automated health responses
  console.log('\n🤖 Example 4: Automated Health Responses\n');
  await automatedHealthResponses(sdk);

  // Example 5: Alert system
  console.log('\n🚨 Example 5: Alert System\n');
  await alertSystem(sdk);

  // Example 6: Resource monitoring
  console.log('\n💾 Example 6: Resource Monitoring\n');
  await resourceMonitoring(sdk);

  // Example 7: Historical analysis
  console.log('\n📊 Example 7: Historical Analysis\n');
  await historicalAnalysis(sdk);

  await sdk.disconnect();
  console.log('\n✅ Monitoring examples completed!');
}

// Example 1: Real-time health monitoring
async function realtimeHealthMonitoring(sdk: FabstirSDK) {
  console.log('Starting health monitor (30 second demo)...\n');

  const healthHistory: SystemHealthReport[] = [];
  let previousStatus: string | null = null;

  // Health check function
  async function checkHealth() {
    const health = await sdk.getSystemHealthReport();
    healthHistory.push(health);

    // Keep only last 10 reports
    if (healthHistory.length > 10) {
      healthHistory.shift();
    }

    // Clear console and display health
    console.clear();
    console.log('📊 System Health Monitor\n');
    console.log('─'.repeat(50));

    // Status indicator
    const statusColor = getStatusColor(health.status);
    console.log(`${statusColor}● System Status: ${health.status.toUpperCase()}${colors.reset}`);
    console.log(`Mode: ${health.mode}`);
    console.log(`Connected: ${health.isConnected ? '✅' : '❌'}`);

    // Alert on status change
    if (previousStatus && previousStatus !== health.status) {
      console.log(`\n${colors.yellow}⚠️  Status changed: ${previousStatus} → ${health.status}${colors.reset}`);
    }
    previousStatus = health.status;

    // P2P Health
    console.log('\n🌐 P2P Network:');
    console.log(`  Status: ${health.p2p.status}`);
    console.log(`  Connected Peers: ${health.p2p.connectedPeers}`);
    console.log(`  Discovered Nodes: ${health.p2p.discoveredNodes}`);
    if (health.p2p.activeStreams !== undefined) {
      console.log(`  Active Streams: ${health.p2p.activeStreams}`);
    }

    // Blockchain Health
    console.log('\n⛓️  Blockchain:');
    console.log(`  Status: ${health.blockchain.status}`);
    console.log(`  Chain ID: ${health.blockchain.chainId}`);
    console.log(`  Latest Block: ${health.blockchain.latestBlock}`);

    // Job Statistics
    console.log('\n📋 Jobs:');
    console.log(`  Active: ${health.jobs.active}`);
    console.log(`  Completed: ${health.jobs.completed}`);
    console.log(`  Failed: ${health.jobs.failed}`);
    console.log(`  Queued: ${health.jobs.queued}`);

    // Performance Summary
    console.log('\n⚡ Performance:');
    console.log(`  Avg Connection Time: ${health.performance.averageConnectionTime}ms`);
    console.log(`  Avg Discovery Time: ${health.performance.averageDiscoveryTime}ms`);
    console.log(`  Avg Job Submission: ${health.performance.averageJobSubmissionTime}ms`);
    console.log(`  Avg Token Latency: ${health.performance.averageTokenLatency}ms`);

    // Issues and Recommendations
    if (health.issues && health.issues.length > 0) {
      console.log(`\n${colors.red}❌ Issues:${colors.reset}`);
      health.issues.forEach(issue => console.log(`  - ${issue}`));
    }

    if (health.recommendations && health.recommendations.length > 0) {
      console.log(`\n${colors.blue}💡 Recommendations:${colors.reset}`);
      health.recommendations.forEach(rec => console.log(`  - ${rec}`));
    }

    // Health trend
    if (healthHistory.length > 1) {
      console.log('\n📈 Trend (last 10 checks):');
      const trend = healthHistory.map(h => 
        h.status === 'healthy' ? '🟢' : h.status === 'degraded' ? '🟡' : '🔴'
      ).join(' ');
      console.log(`  ${trend}`);
    }

    console.log('\n─'.repeat(50));
    console.log('Press Ctrl+C to stop monitoring');
  }

  // Monitor for 30 seconds
  const interval = setInterval(checkHealth, 3000);
  await checkHealth(); // Initial check

  setTimeout(() => {
    clearInterval(interval);
    console.log('\n✅ Health monitoring demo completed');
  }, 30000);

  await new Promise(resolve => setTimeout(resolve, 31000));
}

// Example 2: Performance dashboard
async function performanceDashboard(sdk: FabstirSDK) {
  // Perform some operations to generate metrics
  console.log('Generating performance data...\n');

  // Discovery operations
  for (let i = 0; i < 3; i++) {
    await sdk.discoverNodes({ modelId: 'llama-3.2-1b-instruct' });
  }

  // Job submissions
  for (let i = 0; i < 2; i++) {
    try {
      await sdk.submitJobWithNegotiation({
        prompt: `Performance test ${i}`,
        modelId: 'llama-3.2-1b-instruct',
        maxTokens: 20,
      });
    } catch (error) {
      // Ignore errors for demo
    }
  }

  // Get performance metrics
  const metrics = await sdk.getPerformanceMetrics();

  // Display dashboard
  console.log('═'.repeat(60));
  console.log(`${colors.bright}              PERFORMANCE DASHBOARD${colors.reset}`);
  console.log('═'.repeat(60));

  console.log(`\n${colors.cyan}📊 Overall Statistics${colors.reset}`);
  console.log(`Total Operations: ${metrics.totalOperations}`);
  console.log(`Timestamp: ${new Date(metrics.timestamp).toLocaleString()}`);

  // Operation metrics table
  console.log(`\n${colors.cyan}⚡ Operation Performance${colors.reset}`);
  console.log('┌─────────────┬───────┬─────────┬─────────┬─────────┬──────────┬─────────┐');
  console.log('│ Operation   │ Count │ Avg (ms)│ Min (ms)│ Max (ms)│ Errors   │ Success │');
  console.log('├─────────────┼───────┼─────────┼─────────┼─────────┼──────────┼─────────┤');

  const operations = ['connect', 'discover', 'submitJob', 'stream'] as const;
  operations.forEach(op => {
    const m = metrics.operations[op];
    console.log(
      `│ ${op.padEnd(11)} │ ${m.count.toString().padStart(5)} │ ${
        m.averageTime.toFixed(0).padStart(7)
      } │ ${m.minTime.toString().padStart(7)} │ ${
        m.maxTime.toString().padStart(7)
      } │ ${m.errors.toString().padStart(8)} │ ${
        `${m.successRate.toFixed(1)}%`.padStart(7)
      } │`
    );
  });
  console.log('└─────────────┴───────┴─────────┴─────────┴─────────┴──────────┴─────────┘');

  // Streaming metrics
  console.log(`\n${colors.cyan}🌊 Streaming Performance${colors.reset}`);
  console.log(`Average Token Latency: ${metrics.streaming.averageTokenLatency}ms`);
  console.log(`Total Tokens Processed: ${metrics.streaming.totalTokensProcessed}`);
  console.log(`Average Throughput: ${metrics.streaming.averageThroughput.toFixed(2)} tokens/sec`);

  // Performance indicators
  console.log(`\n${colors.cyan}🎯 Performance Indicators${colors.reset}`);
  const indicators = [
    {
      name: 'Connection Speed',
      value: metrics.operations.connect.averageTime,
      threshold: 500,
      unit: 'ms',
    },
    {
      name: 'Discovery Speed',
      value: metrics.operations.discover.averageTime,
      threshold: 1000,
      unit: 'ms',
    },
    {
      name: 'Job Submission',
      value: metrics.operations.submitJob.averageTime,
      threshold: 2000,
      unit: 'ms',
    },
    {
      name: 'Token Latency',
      value: metrics.streaming.averageTokenLatency,
      threshold: 200,
      unit: 'ms',
    },
  ];

  indicators.forEach(ind => {
    const status = ind.value <= ind.threshold ? '✅' : '⚠️';
    const color = ind.value <= ind.threshold ? colors.green : colors.yellow;
    console.log(
      `${status} ${ind.name}: ${color}${ind.value.toFixed(0)}${ind.unit}${colors.reset} (target: <${ind.threshold}${ind.unit})`
    );
  });

  console.log('\n' + '═'.repeat(60));
}

// Example 3: Node reliability tracking
async function nodeReliabilityTracking(sdk: FabstirSDK) {
  // Simulate some job history
  const testNodes = [
    { id: '12D3KooWNode1', successes: 45, failures: 5 },
    { id: '12D3KooWNode2', successes: 38, failures: 12 },
    { id: '12D3KooWNode3', successes: 50, failures: 0 },
    { id: '12D3KooWNode4', successes: 20, failures: 30 },
  ];

  console.log('Recording node performance history...\n');

  // Record simulated history
  for (const node of testNodes) {
    for (let i = 0; i < node.successes; i++) {
      sdk.recordJobOutcome(node.id, true, 1000 + Math.random() * 2000);
    }
    for (let i = 0; i < node.failures; i++) {
      sdk.recordJobOutcome(node.id, false, 0);
    }
  }

  // Display reliability report
  console.log('═'.repeat(70));
  console.log(`${colors.bright}                    NODE RELIABILITY REPORT${colors.reset}`);
  console.log('═'.repeat(70));

  console.log('\n┌──────────────────┬────────┬──────────┬────────┬─────────┬────────────┐');
  console.log('│ Node ID          │ Total  │ Success  │ Failed │ Success │ Reliability│');
  console.log('│                  │ Jobs   │ Jobs     │ Jobs   │ Rate    │ Score      │');
  console.log('├──────────────────┼────────┼──────────┼────────┼─────────┼────────────┤');

  for (const node of testNodes) {
    const reliability = await sdk.getNodeReliability(node.id);
    const scoreColor = getReliabilityColor(reliability.reliability);
    const rateColor = getReliabilityColor(reliability.successRate);

    console.log(
      `│ ${node.id.slice(-16).padEnd(16)} │ ${
        reliability.totalJobs.toString().padStart(6)
      } │ ${reliability.successfulJobs.toString().padStart(8)} │ ${
        reliability.failedJobs.toString().padStart(6)
      } │ ${rateColor}${`${reliability.successRate}%`.padStart(7)}${colors.reset} │ ${
        scoreColor
      }${reliability.reliability.toFixed(1).padStart(10)}${colors.reset} │`
    );
  }
  console.log('└──────────────────┴────────┴──────────┴────────┴─────────┴────────────┘');

  // Recommendations
  console.log(`\n${colors.cyan}📋 Recommendations:${colors.reset}`);
  for (const node of testNodes) {
    const reliability = await sdk.getNodeReliability(node.id);
    if (reliability.reliability < 70) {
      console.log(`${colors.red}⚠️  Consider blacklisting ${node.id.slice(-8)} (reliability: ${reliability.reliability})${colors.reset}`);
    } else if (reliability.reliability < 85) {
      console.log(`${colors.yellow}👀 Monitor ${node.id.slice(-8)} closely (reliability: ${reliability.reliability})${colors.reset}`);
    } else if (reliability.reliability > 95) {
      console.log(`${colors.green}⭐ Prefer ${node.id.slice(-8)} for critical jobs (reliability: ${reliability.reliability})${colors.reset}`);
    }
  }

  // Top performers
  const reliabilities = await Promise.all(
    testNodes.map(async node => ({
      nodeId: node.id,
      ...(await sdk.getNodeReliability(node.id)),
    }))
  );

  const topPerformers = reliabilities
    .sort((a, b) => b.reliability - a.reliability)
    .slice(0, 3);

  console.log(`\n${colors.cyan}🏆 Top Performers:${colors.reset}`);
  topPerformers.forEach((node, index) => {
    console.log(`  ${index + 1}. ${node.nodeId.slice(-8)} - ${node.reliability.toFixed(1)}% reliability`);
  });
}

// Example 4: Automated health responses
async function automatedHealthResponses(sdk: FabstirSDK) {
  console.log('Setting up automated health responses...\n');

  class HealthResponseSystem {
    private responses = new Map<string, () => Promise<void>>();
    private cooldowns = new Map<string, number>();

    constructor(private sdk: FabstirSDK) {
      this.setupResponses();
    }

    private setupResponses() {
      // Response for degraded P2P connectivity
      this.responses.set('p2p-degraded', async () => {
        console.log('🔧 P2P degraded - refreshing peer connections...');
        await this.sdk.discoverNodes({ 
          modelId: 'llama-3.2-1b-instruct',
          forceRefresh: true 
        });
      });

      // Response for high latency
      this.responses.set('high-latency', async () => {
        console.log('🔧 High latency detected - optimizing node selection...');
        // Prefer lower latency nodes
      });

      // Response for low node availability
      this.responses.set('low-nodes', async () => {
        console.log('🔧 Low node availability - expanding search criteria...');
        // Relax node requirements
      });

      // Response for high failure rate
      this.responses.set('high-failures', async () => {
        console.log('🔧 High failure rate - updating node blacklist...');
        // Update blacklist based on recent failures
      });
    }

    async checkAndRespond() {
      const health = await this.sdk.getSystemHealthReport();
      const now = Date.now();

      // Check P2P health
      if (health.p2p.status !== 'connected' && this.canRespond('p2p-degraded', now)) {
        await this.responses.get('p2p-degraded')!();
        this.cooldowns.set('p2p-degraded', now);
      }

      // Check performance
      if (health.performance.averageTokenLatency > 300 && this.canRespond('high-latency', now)) {
        await this.responses.get('high-latency')!();
        this.cooldowns.set('high-latency', now);
      }

      // Check node availability
      if (health.p2p.discoveredNodes < 3 && this.canRespond('low-nodes', now)) {
        await this.responses.get('low-nodes')!();
        this.cooldowns.set('low-nodes', now);
      }

      // Check job failures
      const failureRate = health.jobs.failed / (health.jobs.completed + health.jobs.failed || 1);
      if (failureRate > 0.2 && this.canRespond('high-failures', now)) {
        await this.responses.get('high-failures')!();
        this.cooldowns.set('high-failures', now);
      }

      return {
        triggered: Array.from(this.cooldowns.keys()),
        health: health.status,
      };
    }

    private canRespond(action: string, now: number): boolean {
      const lastResponse = this.cooldowns.get(action) || 0;
      return now - lastResponse > 60000; // 1 minute cooldown
    }
  }

  const responseSystem = new HealthResponseSystem(sdk);

  // Monitor and respond for 20 seconds
  console.log('Monitoring system health and applying automated responses...\n');

  for (let i = 0; i < 4; i++) {
    const result = await responseSystem.checkAndRespond();
    
    console.log(`\nCheck ${i + 1}:`);
    console.log(`  Health: ${result.health}`);
    console.log(`  Responses triggered: ${result.triggered.length > 0 ? result.triggered.join(', ') : 'none'}`);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log('\n✅ Automated response demo completed');
}

// Example 5: Alert system
async function alertSystem(sdk: FabstirSDK) {
  console.log('Configuring alert system...\n');

  interface Alert {
    id: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: number;
    data?: any;
  }

  class AlertManager {
    private alerts: Alert[] = [];
    private handlers = new Map<string, (alert: Alert) => void>();

    constructor() {
      this.setupHandlers();
    }

    private setupHandlers() {
      // Critical alert handler
      this.handlers.set('critical', (alert) => {
        console.log(`\n${colors.red}🚨 CRITICAL ALERT: ${alert.message}${colors.reset}`);
        console.log(`   ID: ${alert.id}`);
        console.log(`   Time: ${new Date(alert.timestamp).toLocaleTimeString()}`);
        if (alert.data) {
          console.log(`   Data: ${JSON.stringify(alert.data)}`);
        }
      });

      // Warning handler
      this.handlers.set('warning', (alert) => {
        console.log(`\n${colors.yellow}⚠️  WARNING: ${alert.message}${colors.reset}`);
      });

      // Info handler
      this.handlers.set('info', (alert) => {
        console.log(`\n${colors.blue}ℹ️  INFO: ${alert.message}${colors.reset}`);
      });
    }

    trigger(alert: Alert) {
      this.alerts.push(alert);
      const handler = this.handlers.get(alert.severity);
      if (handler) {
        handler(alert);
      }

      // Keep only last 100 alerts
      if (this.alerts.length > 100) {
        this.alerts = this.alerts.slice(-100);
      }
    }

    getAlerts(severity?: Alert['severity']): Alert[] {
      if (severity) {
        return this.alerts.filter(a => a.severity === severity);
      }
      return this.alerts;
    }

    summary() {
      const counts = {
        critical: this.alerts.filter(a => a.severity === 'critical').length,
        warning: this.alerts.filter(a => a.severity === 'warning').length,
        info: this.alerts.filter(a => a.severity === 'info').length,
      };

      console.log('\n📊 Alert Summary:');
      console.log(`  Critical: ${counts.critical}`);
      console.log(`  Warnings: ${counts.warning}`);
      console.log(`  Info: ${counts.info}`);
      console.log(`  Total: ${this.alerts.length}`);
    }
  }

  const alertManager = new AlertManager();

  // Set up SDK event monitoring
  sdk.on('node:failure', (data) => {
    alertManager.trigger({
      id: `node-fail-${Date.now()}`,
      severity: 'warning',
      message: `Node ${data.nodeId} failed: ${data.reason}`,
      timestamp: Date.now(),
      data,
    });
  });

  sdk.on('job:failed', (data) => {
    alertManager.trigger({
      id: `job-fail-${Date.now()}`,
      severity: 'warning',
      message: `Job ${data.jobId} failed: ${data.error}`,
      timestamp: Date.now(),
      data,
    });
  });

  sdk.on('payment:disputed', (data) => {
    alertManager.trigger({
      id: `payment-dispute-${Date.now()}`,
      severity: 'critical',
      message: `Payment disputed for job ${data.jobId}`,
      timestamp: Date.now(),
      data,
    });
  });

  // Simulate some alerts
  console.log('Simulating system events...\n');

  alertManager.trigger({
    id: 'sys-001',
    severity: 'info',
    message: 'Alert system initialized',
    timestamp: Date.now(),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  alertManager.trigger({
    id: 'perf-001',
    severity: 'warning',
    message: 'High latency detected: 450ms average',
    timestamp: Date.now(),
    data: { averageLatency: 450, threshold: 200 },
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  alertManager.trigger({
    id: 'conn-001',
    severity: 'critical',
    message: 'Lost connection to all bootstrap nodes',
    timestamp: Date.now(),
    data: { bootstrapNodes: 0, requiredNodes: 1 },
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Show summary
  alertManager.summary();

  // Recent critical alerts
  const criticalAlerts = alertManager.getAlerts('critical');
  if (criticalAlerts.length > 0) {
    console.log('\n🚨 Recent Critical Alerts:');
    criticalAlerts.slice(-3).forEach(alert => {
      console.log(`  - ${alert.message} (${new Date(alert.timestamp).toLocaleTimeString()})`);
    });
  }
}

// Example 6: Resource monitoring
async function resourceMonitoring(sdk: FabstirSDK) {
  console.log('Monitoring SDK resource usage...\n');

  interface ResourceMetrics {
    memory: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
    connections: {
      p2p: number;
      websocket: number;
      total: number;
    };
    cache: {
      size: number;
      entries: number;
      hitRate: number;
    };
  }

  function getResourceMetrics(): ResourceMetrics {
    const memUsage = process.memoryUsage();
    
    return {
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      connections: {
        p2p: Math.floor(Math.random() * 10) + 5, // Simulated
        websocket: Math.floor(Math.random() * 5) + 1,
        total: 0,
      },
      cache: {
        size: Math.floor(Math.random() * 50) + 10, // MB, simulated
        entries: Math.floor(Math.random() * 1000) + 100,
        hitRate: Math.random() * 0.3 + 0.7, // 70-100%
      },
    };
  }

  function formatBytes(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  // Monitor resources for 15 seconds
  const interval = setInterval(() => {
    const metrics = getResourceMetrics();
    metrics.connections.total = metrics.connections.p2p + metrics.connections.websocket;

    console.clear();
    console.log('💾 Resource Monitor\n');
    console.log('─'.repeat(50));

    // Memory usage
    console.log('📊 Memory Usage:');
    console.log(`  Heap Used: ${formatBytes(metrics.memory.heapUsed)}`);
    console.log(`  Heap Total: ${formatBytes(metrics.memory.heapTotal)}`);
    console.log(`  RSS: ${formatBytes(metrics.memory.rss)}`);
    console.log(`  External: ${formatBytes(metrics.memory.external)}`);

    // Memory usage bar
    const heapPercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
    const barLength = 30;
    const filledLength = Math.round((heapPercent / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    const barColor = heapPercent > 80 ? colors.red : heapPercent > 60 ? colors.yellow : colors.green;
    console.log(`  Usage: ${barColor}[${bar}] ${heapPercent.toFixed(1)}%${colors.reset}`);

    // Connections
    console.log('\n🔌 Active Connections:');
    console.log(`  P2P: ${metrics.connections.p2p}`);
    console.log(`  WebSocket: ${metrics.connections.websocket}`);
    console.log(`  Total: ${metrics.connections.total}`);

    // Cache statistics
    console.log('\n💾 Cache Statistics:');
    console.log(`  Size: ${metrics.cache.size} MB`);
    console.log(`  Entries: ${metrics.cache.entries}`);
    console.log(`  Hit Rate: ${(metrics.cache.hitRate * 100).toFixed(1)}%`);

    // Warnings
    if (heapPercent > 80) {
      console.log(`\n${colors.red}⚠️  High memory usage detected!${colors.reset}`);
    }
    if (metrics.connections.total > 20) {
      console.log(`${colors.yellow}⚠️  High connection count${colors.reset}`);
    }

    console.log('\n─'.repeat(50));
    console.log('Monitoring... (15 second demo)');
  }, 2000);

  await new Promise(resolve => setTimeout(resolve, 15000));
  clearInterval(interval);

  console.log('\n✅ Resource monitoring completed');
}

// Example 7: Historical analysis
async function historicalAnalysis(sdk: FabstirSDK) {
  console.log('Analyzing historical performance data...\n');

  // Simulate historical data collection
  const historicalData = [];
  const dataPoints = 24; // 24 hours of hourly data

  for (let i = 0; i < dataPoints; i++) {
    historicalData.push({
      timestamp: Date.now() - (dataPoints - i) * 3600000, // Hourly
      jobs: {
        submitted: Math.floor(Math.random() * 50) + 10,
        completed: Math.floor(Math.random() * 45) + 8,
        failed: Math.floor(Math.random() * 5),
      },
      performance: {
        avgLatency: Math.random() * 100 + 50,
        avgJobTime: Math.random() * 5000 + 2000,
      },
      nodes: {
        online: Math.floor(Math.random() * 20) + 10,
        utilized: Math.floor(Math.random() * 15) + 5,
      },
      costs: {
        total: Math.random() * 0.1 + 0.01,
        average: Math.random() * 0.01 + 0.001,
      },
    });
  }

  // Analysis
  console.log('📊 24-Hour Historical Analysis\n');

  // Job statistics
  const totalJobs = historicalData.reduce((sum, d) => sum + d.jobs.submitted, 0);
  const totalCompleted = historicalData.reduce((sum, d) => sum + d.jobs.completed, 0);
  const totalFailed = historicalData.reduce((sum, d) => sum + d.jobs.failed, 0);
  const successRate = (totalCompleted / totalJobs) * 100;

  console.log('📋 Job Statistics:');
  console.log(`  Total Submitted: ${totalJobs}`);
  console.log(`  Completed: ${totalCompleted} (${successRate.toFixed(1)}%)`);
  console.log(`  Failed: ${totalFailed} (${((totalFailed / totalJobs) * 100).toFixed(1)}%)`);

  // Performance trends
  const avgLatency = historicalData.reduce((sum, d) => sum + d.performance.avgLatency, 0) / dataPoints;
  const minLatency = Math.min(...historicalData.map(d => d.performance.avgLatency));
  const maxLatency = Math.max(...historicalData.map(d => d.performance.avgLatency));

  console.log('\n⚡ Performance Trends:');
  console.log(`  Average Latency: ${avgLatency.toFixed(1)}ms`);
  console.log(`  Min/Max Latency: ${minLatency.toFixed(1)}ms / ${maxLatency.toFixed(1)}ms`);

  // Peak hours
  const peakHour = historicalData.reduce((peak, current, index) => 
    current.jobs.submitted > historicalData[peak].jobs.submitted ? index : peak, 0
  );

  console.log(`  Peak Hour: ${new Date(historicalData[peakHour].timestamp).toLocaleTimeString()} (${historicalData[peakHour].jobs.submitted} jobs)`);

  // Cost analysis
  const totalCost = historicalData.reduce((sum, d) => sum + d.costs.total, 0);
  const avgCostPerJob = totalCost / totalJobs;

  console.log('\n💰 Cost Analysis:');
  console.log(`  Total Spent: ${totalCost.toFixed(4)} ETH`);
  console.log(`  Average per Job: ${avgCostPerJob.toFixed(6)} ETH`);
  console.log(`  Projected Monthly: ${(totalCost * 30).toFixed(3)} ETH`);

  // Node utilization
  const avgNodesOnline = historicalData.reduce((sum, d) => sum + d.nodes.online, 0) / dataPoints;
  const avgUtilization = historicalData.reduce((sum, d) => sum + (d.nodes.utilized / d.nodes.online), 0) / dataPoints * 100;

  console.log('\n🌐 Node Utilization:');
  console.log(`  Average Nodes Online: ${avgNodesOnline.toFixed(1)}`);
  console.log(`  Average Utilization: ${avgUtilization.toFixed(1)}%`);

  // Hourly chart
  console.log('\n📈 Hourly Job Volume (last 24h):');
  const maxJobs = Math.max(...historicalData.map(d => d.jobs.submitted));
  const scale = 20 / maxJobs;

  historicalData.forEach((data, i) => {
    const hour = new Date(data.timestamp).getHours();
    const barLength = Math.round(data.jobs.submitted * scale);
    const bar = '█'.repeat(barLength);
    console.log(`  ${hour.toString().padStart(2, '0')}:00 ${bar} ${data.jobs.submitted}`);
  });

  // Recommendations
  console.log(`\n${colors.cyan}💡 Recommendations based on analysis:${colors.reset}`);
  if (successRate < 90) {
    console.log('  - Success rate below 90%, investigate common failure causes');
  }
  if (avgUtilization < 50) {
    console.log('  - Low node utilization, consider reducing active node count');
  }
  if (avgLatency > 100) {
    console.log('  - High average latency, optimize node selection criteria');
  }
  console.log('  - Peak usage at ' + new Date(historicalData[peakHour].timestamp).toLocaleTimeString() + ', schedule non-critical jobs outside this time');
}

// Helper functions
function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return colors.green;
    case 'degraded':
      return colors.yellow;
    case 'unhealthy':
      return colors.red;
    default:
      return colors.reset;
  }
}

function getReliabilityColor(score: number): string {
  if (score >= 90) return colors.green;
  if (score >= 70) return colors.yellow;
  return colors.red;
}

// Run the example
main().catch(console.error);