// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

#!/usr/bin/env node

/**
 * Example Bridge Server
 * Demonstrates how to run the unified bridge server for browser clients
 */

import { UnifiedBridgeServer } from '../bridge/UnifiedBridgeServer';

async function startBridgeServer() {
  console.log('Starting Fabstir SDK Bridge Server...\n');
  
  // Configure the bridge server
  const config = {
    port: process.env.BRIDGE_PORT ? parseInt(process.env.BRIDGE_PORT) : 3000,
    corsOrigin: process.env.CORS_ORIGIN || '*',
    
    // P2P configuration
    p2pConfig: {
      bootstrapNodes: process.env.P2P_BOOTSTRAP_NODES?.split(',') || [],
      enableDHT: process.env.P2P_ENABLE_DHT === 'true',
      enableMDNS: process.env.P2P_ENABLE_MDNS === 'true',
      listen: process.env.P2P_LISTEN?.split(',') || ['/ip4/127.0.0.1/tcp/0']
    },
    
    // Proof generation configuration
    proofConfig: {
      cacheDir: process.env.PROOF_CACHE_DIR || './proofs',
      modelPath: process.env.EZKL_MODEL_PATH,
      settingsPath: process.env.EZKL_SETTINGS_PATH
    }
  };
  
  // Create and start the server
  const server = new UnifiedBridgeServer(config);
  
  // Handle events
  server.on('client:connected', (clientId: string) => {
    console.log(`Client connected: ${clientId}`);
  });
  
  server.on('client:disconnected', (clientId: string) => {
    console.log(`Client disconnected: ${clientId}`);
  });
  
  server.on('proof:ready', (data: any) => {
    console.log(`Proof ready for session: ${data.sessionId}`);
  });
  
  server.on('p2p:message', (message: any) => {
    console.log(`P2P message received:`, message);
  });
  
  try {
    await server.start();
    
    console.log('\nBridge Server is running!');
    console.log('================================');
    console.log(`HTTP API: http://localhost:${config.port}`);
    console.log(`WebSocket: ws://localhost:${config.port}/ws`);
    console.log(`Health: http://localhost:${config.port}/health`);
    console.log(`Info: http://localhost:${config.port}/info`);
    console.log('================================\n');
    
    console.log('Available endpoints:');
    console.log('  POST /api/proof/generate - Generate EZKL proof');
    console.log('  GET  /api/proof/status/:id - Check proof status');
    console.log('  GET  /api/proof/result/:id - Get proof result');
    console.log('  GET  /api/p2p/status - Get P2P network status');
    console.log('  POST /api/p2p/discover - Discover P2P nodes');
    console.log('\nPress Ctrl+C to stop the server\n');
    
  } catch (error) {
    console.error('Failed to start bridge server:', error);
    process.exit(1);
  }
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down bridge server...');
    await server.stop();
    console.log('Bridge server stopped');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\nShutting down bridge server...');
    await server.stop();
    console.log('Bridge server stopped');
    process.exit(0);
  });
}

// Run if executed directly
if (require.main === module) {
  startBridgeServer().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { startBridgeServer };