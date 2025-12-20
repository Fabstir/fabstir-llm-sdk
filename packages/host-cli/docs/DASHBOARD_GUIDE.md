# Host Dashboard Guide

> Terminal-based dashboard for managing Fabstir host nodes

## Overview

The Host Dashboard provides a **terminal-based interface (TUI)** for managing your Fabstir host node. It displays real-time status, logs, and earnings, with keyboard shortcuts for common operations.

**Use Case**: Headless servers accessed via SSH where a browser UI is not available.

## Quick Start

```bash
# 1. Start your Docker container (if using Docker)
./start-fabstir-docker.sh

# 2. Start the management server
fabstir-host serve --port 3001

# 3. Open the dashboard (in another terminal/screen)
fabstir-host dashboard
```

## Command Options

```bash
fabstir-host dashboard [options]

Options:
  --mgmt-url <url>           Management server URL (default: http://localhost:3001)
  --refresh-interval <ms>    Status refresh interval in milliseconds (default: 5000)
```

### Examples

```bash
# Default configuration
fabstir-host dashboard

# Custom management server URL
fabstir-host dashboard --mgmt-url http://192.168.1.100:3001

# Faster refresh rate
fabstir-host dashboard --refresh-interval 2000
```

## Screen Layout

```
┌─ Fabstir Host Dashboard ─────────────────────────────────────────┐
│ Host: 0x1234...abcd | Chain: Base Sepolia | Stake: 1000 FAB      │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Node Status ──────────────────────────────────────────────┐   │
│ │ Status: 🟢 RUNNING                                         │   │
│ │ PID: 1234                                                  │   │
│ │ Uptime: 5h 32m                                             │   │
│ │ URL: http://localhost:8080                                 │   │
│ │ Version: v1.2.3                                            │   │
│ └────────────────────────────────────────────────────────────┘   │
│ ┌─ Earnings ──────────┐ ┌─ Live Logs ───────────────────────┐   │
│ │ Today:  $12.45      │ │ 07:30:15 [INFO] Model loaded      │   │
│ │ Week:   $87.23      │ │ 07:30:16 [INFO] Session started   │   │
│ │ Total:  $1,234.56   │ │ 07:30:17 [INFO] Inference: 128    │   │
│ │                     │ │ 07:30:18 [INFO] Session completed │   │
│ │                     │ │ 07:30:19 [INFO] Health check OK   │   │
│ └─────────────────────┘ └────────────────────────────────────┘   │
│ ┌─ Actions ──────────────────────────────────────────────────┐   │
│ │ [R]efresh  [S]tart  [X]Stop  [P]ricing  [W]ithdraw  [Q]uit │   │
│ └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## Keyboard Shortcuts

| Key | Action | Description |
|-----|--------|-------------|
| `q` | Quit | Exit the dashboard |
| `Ctrl+C` | Quit | Alternative exit |
| `r` | Refresh | Manually refresh status |
| `s` | Start | Start the inference node |
| `x` | Stop | Stop the inference node |
| `p` | Pricing | Update pricing (coming soon) |
| `w` | Withdraw | Withdraw earnings (coming soon) |

## Panels

### Header Panel

Displays:
- **Host Address**: Your Ethereum address (truncated)
- **Chain**: Current blockchain network (e.g., Base Sepolia)
- **Stake**: Amount of FAB tokens staked

### Node Status Panel

Shows real-time node information:
- **Status**: Running (🟢) or Stopped (🔴)
- **PID**: Process ID of the running node
- **Uptime**: How long the node has been running
- **URL**: Public API endpoint
- **Version**: fabstir-llm-node version

### Earnings Panel

Displays accumulated earnings:
- **Today**: Earnings for current day
- **Week**: Earnings for current week
- **Total**: All-time earnings

*(Earnings feature coming in future update)*

### Live Logs Panel

Streams real-time logs from the node:
- WebSocket connection to management server
- Color-coded by level (INFO/WARN/ERROR)
- Auto-scrolls to show latest entries
- Keeps last 50 log lines in buffer

### Actions Bar

Shows available keyboard shortcuts at the bottom of the screen.

## Requirements

### Terminal Support

- **UTF-8 support**: Required for box drawing characters
- **Color support**: 256-color terminal recommended
- **Minimum size**: 80x24 characters

Tested terminals:
- ✅ iTerm2 (macOS)
- ✅ GNOME Terminal (Linux)
- ✅ Windows Terminal
- ✅ PuTTY (SSH)
- ✅ screen/tmux sessions

### Management Server

The dashboard requires the management server to be running:

```bash
# Start management server
fabstir-host serve --port 3001
```

Verify it's running:
```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"..."}
```

## Docker Usage

When running inside a Docker container:

```bash
# Enter container
docker exec -it fabstir-host bash

# Start management server (background)
fabstir-host serve &

# Launch dashboard
fabstir-host dashboard
```

**Important**: Ensure `TERM` environment variable is set:

```bash
export TERM=xterm-256color
```

## Troubleshooting

### Dashboard Won't Render

**Symptoms**: Box characters show as question marks or garbled text

**Solutions**:
1. Set terminal to UTF-8:
   ```bash
   export LANG=en_US.UTF-8
   export LC_ALL=en_US.UTF-8
   ```
2. Set TERM variable:
   ```bash
   export TERM=xterm-256color
   ```
3. If using screen/tmux:
   ```bash
   # In .screenrc
   defutf8 on

   # In .tmux.conf
   set -g default-terminal "screen-256color"
   ```

### Cannot Connect to Management Server

**Symptoms**: Status shows "Unable to connect to management server"

**Solutions**:
1. Verify server is running:
   ```bash
   curl http://localhost:3001/health
   ```
2. Check port 3001 is accessible
3. Verify Docker port mapping if using containers:
   ```bash
   docker port fabstir-host
   ```

### Logs Not Streaming

**Symptoms**: Log panel shows "Disconnected from log stream"

**Solutions**:
1. WebSocket connection may have dropped - auto-reconnects in 3 seconds
2. Check if node is actually running
3. Verify management server WebSocket endpoint:
   ```bash
   websocat ws://localhost:3001/ws/logs
   ```

### Terminal Too Small

**Symptoms**: Layout is broken or elements overlap

**Solution**: Resize terminal to at least 80x24 characters

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     fabstir-host dashboard                       │
│                        (blessed TUI)                             │
├─────────────────────────────────────────────────────────────────┤
│           │                              │                       │
│     HTTP REST                      WebSocket                     │
│    /api/status                     /ws/logs                      │
│    /api/start                                                    │
│    /api/stop                                                     │
│           │                              │                       │
│           ▼                              ▼                       │
├─────────────────────────────────────────────────────────────────┤
│                   fabstir-host serve                             │
│               (Management Server :3001)                          │
├─────────────────────────────────────────────────────────────────┤
│                       │                                          │
│                       ▼                                          │
│                 fabstir-llm-node                                 │
│              (Inference Server :8080)                            │
└─────────────────────────────────────────────────────────────────┘
```

## Multi-GPU Extension (Future)

The dashboard is designed to support multiple GPU workers in a future update:

```
┌─ GPU Workers ──────────────────────────────────────────────┐
│ #  │ Model          │ GPU   │ Status  │ Port │ Tokens/s   │
│ 1  │ LLaMA-70B      │ GPU:0 │ 🟢 Run  │ 8080 │ 45.2       │
│ 2  │ Mixtral-8x7B   │ GPU:1 │ 🟢 Run  │ 8081 │ 38.7       │
│ 3  │ (Available)    │ GPU:2 │ ⚫ Off  │ 8082 │ -          │
└────────────────────────────────────────────────────────────┘
```

This will require updates to the fabstir-host-mgmt management server.

---

**See Also**:
- [API Reference](API_REFERENCE.md) - REST and WebSocket API documentation
- [Getting Started](GETTING_STARTED.md) - Initial setup guide
- [Browser Management](BROWSER_MANAGEMENT.md) - Browser-based UI alternative
