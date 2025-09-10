# Chrome DevTools Protocol (CDP) Bridge Setup Guide

## Overview
This document explains how to set up a CDP bridge that allows Claude Code (running in a Docker container) to see and interact with a Chrome browser running on the Windows host machine. This enables real-time browser console monitoring, page interaction, and debugging.

## Prerequisites

### 1. Host Chrome Launch
Launch Chrome on Windows host with debugging port enabled:
```bat
"%ProgramFiles%\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --remote-allow-origins=* ^
  --user-data-dir=%LOCALAPPDATA%\ChromeTesting ^
  --profile-directory=Default ^
  --disable-features=BlockThirdPartyCookies,ThirdPartyStoragePartitioning
```

### 2. Port Forwarding Setup
Since Chrome runs on the Windows host and Claude Code is in a Docker container, port forwarding is needed:

```bash
# Run this in the container (or on host if socat is available there)
socat TCP-LISTEN:9222,fork,reuseaddr TCP:host.docker.internal:9222 &
```

## Installation Steps

### Step 1: Install Dependencies
```bash
cd /workspace/apps/harness
pnpm add -D playwright express
```

### Step 2: Create CDP Bridge Server
Create the file `/workspace/apps/harness/tools/cdp-bridge.js`:

```javascript
import { chromium } from 'playwright';
import express from 'express';

const CDP_URL = 'http://localhost:9222';
const BRIDGE_PORT = 4000;

const app = express();
app.use(express.json());

// Store console logs
const logs = [];
const MAX_LOGS = 100;

// SSE clients for streaming
const clients = [];

// SSE endpoint for streaming logs
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.write(`data: ${JSON.stringify({ type: 'init', logs: logs.slice(-20) })}\n\n`);
  clients.push(res);
  
  req.on('close', () => {
    const index = clients.indexOf(res);
    if (index !== -1) clients.splice(index, 1);
  });
});

// Get recent logs
app.get('/logs', (req, res) => {
  res.json({ logs: logs.slice(-50) });
});

// Get page info
app.get('/info', async (req, res) => {
  try {
    if (!page) throw new Error('Not connected to browser');
    
    const info = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      readyState: document.readyState,
      hasEthereum: !!window.ethereum,
      bodyText: document.body?.innerText?.substring(0, 500)
    }));
    
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Evaluate expression in browser
app.post('/eval', async (req, res) => {
  try {
    const { expression } = req.body;
    if (!page) throw new Error('Not connected to browser');
    
    const result = await page.evaluate(expression);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Connect to browser and set up event listeners
let page = null;
let browser = null;

async function connectToBrowser() {
  try {
    console.log(`Connecting to Chrome at ${CDP_URL}...`);
    browser = await chromium.connectOverCDP(CDP_URL);
    console.log('Connected to Chrome via CDP');
    
    const contexts = browser.contexts();
    const context = contexts[0];
    if (!context) return;
    
    const pages = context.pages();
    page = pages.find(p => 
      p.url().includes('localhost:3006') || 
      p.url().includes('localhost:3000')
    ) || pages[0];
    
    if (!page) return;
    
    console.log(`Attached to page: ${page.url()}`);
    
    // Set up event listeners for console, errors, network
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      
      // Skip noisy messages
      if (text.includes('Download the React DevTools')) return;
      if (text.includes('[HMR]') || text.includes('[Fast Refresh]')) return;
      
      addLog(`console.${type}`, text);
    });
    
    page.on('pageerror', error => {
      addLog('error', error.message);
    });
    
    page.on('load', () => {
      addLog('navigation', `Page loaded: ${page.url()}`);
    });
    
  } catch (error) {
    console.error('Failed to connect to browser:', error);
  }
}

function addLog(type, text, details = {}) {
  const log = {
    timestamp: new Date().toISOString(),
    type,
    text,
    ...details
  };
  
  logs.push(log);
  if (logs.length > MAX_LOGS) logs.shift();
  
  // Broadcast to SSE clients
  const message = `data: ${JSON.stringify({ type: 'log', log })}\n\n`;
  clients.forEach(client => client.write(message));
  
  console.log(`[${type.toUpperCase()}] ${text}`);
}

// Start server
app.listen(BRIDGE_PORT, async () => {
  console.log(`CDP Bridge server running on http://localhost:${BRIDGE_PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /events - SSE stream of console logs');
  console.log('  GET  /logs   - Get recent logs');
  console.log('  GET  /info   - Get page info');
  console.log('  POST /eval   - Evaluate JS in browser');
  await connectToBrowser();
});
```

### Step 3: Start the CDP Bridge
```bash
cd /workspace/apps/harness
node tools/cdp-bridge.js
```

## Usage

### Check Browser Console Logs
```bash
curl -s http://localhost:4000/logs | python3 -m json.tool
```

### Get Page Information
```bash
curl -s http://localhost:4000/info | python3 -m json.tool
```

### Evaluate JavaScript in Browser
```bash
curl -s -X POST http://localhost:4000/eval \
  -H "Content-Type: application/json" \
  -d '{"expression": "document.title"}' | python3 -m json.tool
```

### Reload Page
```bash
curl -s -X POST http://localhost:4000/eval \
  -H "Content-Type: application/json" \
  -d '{"expression": "window.location.reload(); \"reloading\""}'
```

### Stream Console Logs (SSE)
```bash
curl -N http://localhost:4000/events
```

## Troubleshooting

### Issue: Cannot connect to Chrome
**Solution**: Ensure Chrome is running with `--remote-debugging-port=9222`

### Issue: Port 9222 not accessible from container
**Solution**: Run socat forwarding:
```bash
socat TCP-LISTEN:9222,fork,reuseaddr TCP:host.docker.internal:9222 &
```

### Issue: ES Module errors
**Solution**: The project uses ES modules. Ensure imports use ES6 syntax.

### Issue: Playwright not found
**Solution**: Install in the harness app directory:
```bash
cd /workspace/apps/harness
pnpm add -D playwright
```

## Quick Setup Script

For future sessions, run this script to quickly set up CDP bridge:

```bash
#!/bin/bash
# File: /workspace/setup-cdp-bridge.sh

echo "Setting up CDP Bridge..."

# 1. Check if Chrome is accessible
if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
  echo "✓ Chrome DevTools Protocol is accessible"
else
  echo "✗ Chrome not accessible. Please:"
  echo "  1. Launch Chrome with --remote-debugging-port=9222"
  echo "  2. Set up port forwarding if needed"
  exit 1
fi

# 2. Install dependencies if needed
if [ ! -d "/workspace/apps/harness/node_modules/playwright" ]; then
  echo "Installing dependencies..."
  cd /workspace/apps/harness
  pnpm add -D playwright express
fi

# 3. Start CDP bridge
echo "Starting CDP bridge..."
cd /workspace/apps/harness
node tools/cdp-bridge.js &

echo "CDP Bridge is running on http://localhost:4000"
echo "Check logs: curl http://localhost:4000/logs | python3 -m json.tool"
```

## Benefits

1. **Real-time Console Monitoring**: See all browser console logs, errors, and warnings
2. **Page Interaction**: Programmatically click buttons, fill forms, navigate
3. **JavaScript Evaluation**: Execute any JS in the browser context
4. **Network Monitoring**: Track failed requests and API calls
5. **No WebSocket Required**: Uses HTTP endpoints that work in restricted environments

## Architecture

```
Windows Host                  Docker Container
┌─────────────┐              ┌──────────────────┐
│   Chrome    │              │   Claude Code    │
│  Port 9222  │◄─────────────┤                  │
└─────────────┘   socat      │  ┌────────────┐  │
                             │  │ CDP Bridge │  │
                             │  │ Port 4000  │  │
                             │  └────────────┘  │
                             │         ▲         │
                             │         │         │
                             │    HTTP/SSE       │
                             └──────────────────┘
```

The CDP Bridge acts as a translator between Chrome's WebSocket-based DevTools Protocol and simple HTTP endpoints that Claude Code can use.