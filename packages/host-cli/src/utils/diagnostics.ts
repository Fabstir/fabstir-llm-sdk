// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Network diagnostics utilities
 * Troubleshooting helpers for network/firewall issues
 *
 * Sub-phase 1.2: Network Diagnostics
 */

import chalk from 'chalk';
import { extractHostPort } from './network';

/**
 * Show network troubleshooting steps
 * @param url - Public URL that's failing to connect
 */
export function showNetworkTroubleshooting(url: string): void {
  const { port } = extractHostPort(url);

  console.log(chalk.yellow('\n🔧 Troubleshooting Steps:\n'));

  console.log(chalk.gray('1. Check if node is running locally:'));
  console.log(chalk.white(`   curl http://localhost:${port}/health\n`));

  console.log(chalk.gray('2. Check firewall allows incoming connections:'));
  console.log(chalk.white(`   ${suggestFirewallCommands(port, process.platform)}\n`));

  console.log(chalk.gray('3. Verify port is listening on all interfaces:'));
  console.log(chalk.white(`   netstat -tuln | grep ${port}\n`));

  console.log(chalk.gray('4. Test from another machine:'));
  console.log(chalk.white(`   curl ${url}/health\n`));
}

/**
 * Test if localhost endpoint is healthy
 * @param port - Port number to check on localhost
 * @returns true if /health endpoint returns 200 OK
 */
export async function checkLocalHealth(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Suggest firewall commands for platform
 * @param port - Port number to allow
 * @param platform - OS platform (linux, darwin, win32)
 * @returns Firewall command suggestions
 */
export function suggestFirewallCommands(port: number, platform: string): string {
  switch (platform) {
    case 'linux':
      return `sudo ufw allow ${port}/tcp\n   sudo iptables -A INPUT -p tcp --dport ${port} -j ACCEPT`;
    case 'darwin':
      return `sudo pfctl -d  # Disable firewall temporarily to test`;
    case 'win32':
      return `netsh advfirewall firewall add rule name="Fabstir Host" dir=in action=allow protocol=TCP localport=${port}`;
    default:
      return 'Check your firewall documentation';
  }
}

/**
 * Format health check error with helpful explanation
 * @param error - Error object from health check
 * @returns Human-readable error explanation with suggestions
 */
export function formatHealthCheckError(error: any): string {
  // Handle Error objects and plain objects with code
  const errorCode = error?.code || error?.errno;

  switch (errorCode) {
    case 'ECONNREFUSED':
      return 'Connection refused - the node is not running or not accepting connections. Check if the process has started.';

    case 'ETIMEDOUT':
      return 'Connection timeout - the node may be unreachable due to firewall rules or network issues. Check your firewall settings.';

    case 'ENOTFOUND':
      return 'Host not found - the hostname could not be resolved. Check your DNS settings or use an IP address.';

    case 'EHOSTUNREACH':
      return 'Host unreachable - the network cannot route to the host. Check your network configuration and routing.';

    case 'ECONNRESET':
      return 'Connection reset by peer - the server closed the connection unexpectedly. The node may have crashed or restarted.';

    default:
      // Handle errors without code property
      const message = error?.message || 'Unknown error';
      return `Network error occurred: ${message}. Check your network connectivity and node status.`;
  }
}
