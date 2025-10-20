// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { WebSocketServer } from 'ws';

// Create servers on ports 8080-8088 for different test hosts
const ports = [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088];

ports.forEach(port => {
  const wss = new WebSocketServer({ port });
  
  wss.on('connection', (ws) => {
    console.log(`Client connected on port ${port}`);
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        // Handle different message types
        if (msg.type === 'prompt') {
          // Send back mock response
          ws.send(JSON.stringify({
            type: 'response',
            index: msg.index || 0,
            content: `Mock response to: ${msg.content}`,
            timestamp: Date.now()
          }));
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.type === 'startSession') {
          ws.send(JSON.stringify({
            type: 'sessionStarted',
            sessionId: `session-${port}-${Date.now()}`
          }));
        } else if (msg.type === 'endSession') {
          ws.send(JSON.stringify({
            type: 'sessionEnded',
            receipt: { tokensUsed: 100, cost: '1000000000' }
          }));
        }
      } catch (err) {
        console.error(`Error parsing message on port ${port}:`, err);
      }
    });
    
    ws.on('close', () => {
      console.log(`Client disconnected from port ${port}`);
    });
  });
  
  console.log(`WebSocket server running on port ${port}`);
});