'use client';

import { useState, useEffect, useCallback } from 'react';
import { ui5SDK, type SDKManagers } from '@/lib/sdk';
import type { Signer } from 'ethers';

export interface UseSDKReturn {
  managers: SDKManagers | null;
  isInitialized: boolean;
  isInitializing: boolean;
  error: Error | null;
  initialize: (signer: Signer) => Promise<void>;
  disconnect: () => void;
}

/**
 * Hook for managing SDK initialization and access to managers
 *
 * Provides access to all SDK managers (SessionGroupManager, VectorRAGManager, etc.)
 * after wallet connection and SDK initialization.
 *
 * @param signer - Optional ethers Signer from wallet for auto-initialization
 */
export function useSDK(signer?: Signer | null): UseSDKReturn {
  const [managers, setManagers] = useState<SDKManagers | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const initialize = useCallback(async (walletSigner: Signer) => {
    if (isInitialized || isInitializing) {
      return; // Already initialized or initializing
    }

    try {
      setIsInitializing(true);
      setError(null);

      console.log('[useSDK] Initializing SDK with signer...');
      await ui5SDK.initialize(walletSigner);
      const sdkManagers = await ui5SDK.getManagers();

      setManagers(sdkManagers);
      setIsInitialized(true);
      console.log('[useSDK] SDK initialized successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to initialize SDK');
      setError(error);
      console.error('[useSDK] SDK initialization error:', error);
    } finally {
      setIsInitializing(false);
    }
  }, [isInitialized, isInitializing]);

  const disconnect = useCallback(() => {
    ui5SDK.disconnect();
    setManagers(null);
    setIsInitialized(false);
    setError(null);
  }, []);

  // Subscribe to SDK initialization events
  useEffect(() => {
    const checkAndUpdateSDKState = async () => {
      // Only call getManagers if SDK is truly initialized
      if (ui5SDK.isInitialized()) {
        try {
          const sdkManagers = await ui5SDK.getManagers();
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

    // Check initial state in case SDK was already initialized
    checkAndUpdateSDKState();

    // Subscribe to SDK changes (will be notified when initialize() completes)
    const unsubscribe = ui5SDK.subscribe(checkAndUpdateSDKState);

    return unsubscribe;
  }, []); // Only run once on mount

  // Auto-initialize when signer is provided
  useEffect(() => {
    if (signer && !isInitialized && !isInitializing) {
      console.log('[useSDK] Auto-initializing with provided signer');
      initialize(signer);
    }
  }, [signer, isInitialized, isInitializing, initialize]);

  return {
    managers,
    isInitialized,
    isInitializing,
    error,
    initialize,
    disconnect,
  };
}
