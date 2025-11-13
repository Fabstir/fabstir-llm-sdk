'use client';

import { useState, useEffect, useCallback } from 'react';
import { ui4SDK, type SDKManagers } from '@/lib/sdk';

export interface UseSDKReturn {
  managers: SDKManagers | null;
  isInitialized: boolean;
  isInitializing: boolean;
  error: Error | null;
  initialize: (walletAddress: string) => Promise<void>;
  disconnect: () => void;
}

/**
 * Hook for managing SDK initialization and access to managers
 *
 * Provides access to all SDK managers (SessionGroupManager, VectorRAGManager, etc.)
 * after wallet connection and SDK initialization.
 */
export function useSDK(): UseSDKReturn {
  const [managers, setManagers] = useState<SDKManagers | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const initialize = useCallback(async (walletAddress: string) => {
    if (isInitialized || isInitializing) {
      return; // Already initialized or initializing
    }

    try {
      setIsInitializing(true);
      setError(null);

      await ui4SDK.initialize(walletAddress);
      const sdkManagers = await ui4SDK.getManagers();

      setManagers(sdkManagers);
      setIsInitialized(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to initialize SDK');
      setError(error);
      console.error('SDK initialization error:', error);
    } finally {
      setIsInitializing(false);
    }
  }, [isInitialized, isInitializing]);

  const disconnect = useCallback(() => {
    ui4SDK.disconnect();
    setManagers(null);
    setIsInitialized(false);
    setError(null);
  }, []);

  // Subscribe to SDK initialization events
  useEffect(() => {
    const checkAndUpdateSDKState = async () => {
      // Only call getManagers if SDK is truly initialized
      // This prevents race condition where useEffect runs before authenticate() completes
      if (ui4SDK.isInitialized()) {
        try {
          const sdkManagers = await ui4SDK.getManagers();
          setManagers(sdkManagers);
          setIsInitialized(true);
        } catch (err) {
          // If getManagers fails, SDK may not be fully authenticated yet
          console.error('[useSDK] Failed to get SDK managers:', err);
          setManagers(null);
          setIsInitialized(false);
        }
      } else {
        setManagers(null);
        setIsInitialized(false);
      }
    };

    // Check initial state in case SDK was already initialized (e.g., from localStorage)
    checkAndUpdateSDKState();

    // Subscribe to SDK changes (will be notified when initialize() completes)
    const unsubscribe = ui4SDK.subscribe(checkAndUpdateSDKState);

    return unsubscribe;
  }, []); // Only run once on mount

  return {
    managers,
    isInitialized,
    isInitializing,
    error,
    initialize,
    disconnect,
  };
}
