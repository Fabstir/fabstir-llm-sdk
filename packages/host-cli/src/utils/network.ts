// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Network utilities
 * Public endpoint verification and URL validation
 *
 * Sub-phase 1.1: Public Endpoint Verification
 */

import chalk from 'chalk';

/**
 * Verify a public URL is accessible via HTTP health check
 * @param url - Base URL to verify (e.g., 'http://example.com:8080')
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns true if /health endpoint returns 200 OK, false otherwise
 */
export async function verifyPublicEndpoint(url: string, timeout: number = 5000): Promise<boolean> {
  try {
    // Ensure URL is properly formatted
    const parsedUrl = new URL(url);

    // Build health check URL
    const healthUrl = `${parsedUrl.protocol}//${parsedUrl.host}/health`;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(healthUrl, {
        signal: controller.signal,
        method: 'GET',
      });

      clearTimeout(timeoutId);

      // Return true only for 200 OK
      return response.ok;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      // Handle timeout, network errors, etc.
      return false;
    }
  } catch (error) {
    // Handle URL parsing errors
    return false;
  }
}

/**
 * Check if URL points to localhost
 * @param url - URL to check
 * @returns true if hostname is localhost/127.0.0.1/::1/0.0.0.0
 */
export function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Manually strip IPv6 brackets if present (some Node versions don't auto-strip)
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    const localhostIdentifiers = [
      'localhost',
      '127.0.0.1',
      '::1',       // IPv6 localhost
      '0.0.0.0',
    ];

    return localhostIdentifiers.includes(hostname);
  } catch (error) {
    // Invalid URL - throw error
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Show warning if URL is localhost
 * @param url - URL to check
 */
export function warnIfLocalhost(url: string): void {
  if (!isLocalhostUrl(url)) {
    return; // No warning needed for public URLs
  }

  console.warn(chalk.yellow('⚠️  WARNING: Using localhost URL'));
  console.warn(chalk.yellow('   This host will NOT be accessible to clients.'));
  console.warn(chalk.yellow('   Use your public IP or domain for production.'));
}

/**
 * Extract host and port from URL
 * @param url - URL to parse
 * @returns Object with host and port (defaults to 8080 if not specified)
 */
export function extractHostPort(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url);

    // Get hostname - manually strip IPv6 brackets (some Node versions don't auto-strip)
    const host = parsed.hostname.replace(/^\[|\]$/g, '');

    // Get port - parsed.port returns empty string for default protocol ports
    // Check if port is explicitly in URL string (even if it's the default)
    let port: number;

    if (parsed.port) {
      // Port explicitly specified and not default
      port = parseInt(parsed.port, 10);
    } else {
      // Check if port is in the original URL string (handles :443 for https, :80 for http)
      const portMatch = url.match(/:(\d+)(\/|$)/);
      if (portMatch) {
        port = parseInt(portMatch[1], 10);
      } else {
        // No port in URL - use 8080 as default
        port = 8080;
      }
    }

    return { host, port };
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }
}
