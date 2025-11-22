'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSDK } from './use-sdk';

export interface DiscoveredHost {
  address: string;
  endpoint: string;
  models: string[];
  pricing: number;
  stake: string;
  status: string;
}

/**
 * Host Discovery Hook
 *
 * Discovers active hosts from NodeRegistry and auto-selects one with models.
 * Based on implementation from apps/harness/pages/chat-context-rag-demo.tsx
 */
export function useHostDiscovery() {
  const { managers, isInitialized } = useSDK();
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [selectedHost, setSelectedHost] = useState<DiscoveredHost | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Discover all active hosts with models from NodeRegistry
   */
  const discoverHosts = useCallback(async () => {
    if (!managers || !isInitialized) {
      console.log('[HostDiscovery] SDK not initialized, skipping discovery');
      return;
    }

    setIsDiscovering(true);
    setError(null);

    try {
      console.log('[HostDiscovery] 🔍 Discovering active hosts...');

      const hostManager = managers.hostManager;
      const discoveredHosts = await hostManager.discoverAllActiveHostsWithModels();

      console.log(`[HostDiscovery] ✅ Found ${discoveredHosts.length} total hosts`);

      // Filter hosts that support models
      const hostsWithModels = discoveredHosts.filter(
        (h: any) => h.supportedModels && h.supportedModels.length > 0
      );

      console.log(`[HostDiscovery] ✅ Found ${hostsWithModels.length} hosts with models`);

      // Convert to our interface format
      const formattedHosts: DiscoveredHost[] = hostsWithModels.map((h: any) => ({
        address: h.address,
        endpoint: h.apiUrl,
        models: h.supportedModels || [],
        pricing: Number(h.minPricePerTokenStable || 2000n), // Convert BigInt to number
        stake: h.stake?.toString() || '0',
        status: h.isActive ? 'active' : 'inactive',
      }));

      setHosts(formattedHosts);

      // Auto-select a random host if none selected
      if (!selectedHost && formattedHosts.length > 0) {
        const randomIndex = Math.floor(Math.random() * formattedHosts.length);
        const autoSelectedHost = formattedHosts[randomIndex];
        setSelectedHost(autoSelectedHost);
        console.log(`[HostDiscovery] ✅ Auto-selected host: ${autoSelectedHost.address}`);
      }
    } catch (err: any) {
      console.error('[HostDiscovery] ❌ Discovery failed:', err);
      setError(err.message || 'Failed to discover hosts');
      setHosts([]);
    } finally {
      setIsDiscovering(false);
    }
  }, [managers, isInitialized, selectedHost]);

  /**
   * Manually select a host by address
   */
  const selectHost = useCallback((hostAddress: string) => {
    const host = hosts.find((h) => h.address === hostAddress);
    if (host) {
      setSelectedHost(host);
      console.log(`[HostDiscovery] ✅ Manually selected host: ${hostAddress}`);
    } else {
      console.error(`[HostDiscovery] ❌ Host not found: ${hostAddress}`);
    }
  }, [hosts]);

  /**
   * Clear selected host
   */
  const clearSelectedHost = useCallback(() => {
    setSelectedHost(null);
    console.log('[HostDiscovery] Cleared selected host');
  }, []);

  /**
   * Auto-discover hosts when SDK is initialized
   */
  useEffect(() => {
    if (isInitialized && managers && hosts.length === 0 && !isDiscovering) {
      discoverHosts();
    }
  }, [isInitialized, managers, hosts.length, isDiscovering, discoverHosts]);

  return {
    hosts,
    selectedHost,
    isDiscovering,
    error,
    discoverHosts,
    selectHost,
    clearSelectedHost,
  };
}
