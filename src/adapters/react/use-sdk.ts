// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// src/adapters/react/use-sdk.ts
// React adapter for FabstirSDKHeadless - provides React hooks for easy integration
// This adapter is OPTIONAL and only needed for React applications

import { useMemo, useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { FabstirSDKHeadless, HeadlessConfig } from '../../sdk-headless.js';

/**
 * React hook for using FabstirSDKHeadless with automatic signer management
 * 
 * @param config - SDK configuration (without signer)
 * @param signer - Optional ethers.Signer from your app (e.g., from wagmi)
 * @returns SDK instance or null if not connected
 * 
 * @example
 * ```tsx
 * // With wagmi
 * import { useWalletClient } from 'wagmi';
 * import { providers } from 'ethers';
 * import { useSDK } from '@fabstir/llm-sdk/adapters/react';
 * 
 * function MyComponent() {
 *   const { data: walletClient } = useWalletClient();
 *   
 *   const signer = useMemo(() => {
 *     if (!walletClient) return null;
 *     const provider = new providers.Web3Provider(walletClient);
 *     return provider.getSigner();
 *   }, [walletClient]);
 *   
 *   const sdk = useSDK({ mode: 'mock' }, signer);
 *   
 *   const handleSubmit = async () => {
 *     if (!sdk) return;
 *     const job = await sdk.submitJob({ ... });
 *   };
 * }
 * ```
 */
export function useSDK(
  config: HeadlessConfig,
  signer?: ethers.Signer | null
): FabstirSDKHeadless | null {
  const [sdk, setSdk] = useState<FabstirSDKHeadless | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Memoize config to prevent unnecessary re-renders
  const memoizedConfig = useMemo(() => config, [
    config.mode,
    config.network,
    config.debug,
    JSON.stringify(config.contractAddresses),
    JSON.stringify(config.p2pConfig)
  ]);

  useEffect(() => {
    let mounted = true;
    let sdkInstance: FabstirSDKHeadless | null = null;

    const initializeSDK = async () => {
      try {
        setIsConnecting(true);
        
        // Create SDK instance
        sdkInstance = new FabstirSDKHeadless(memoizedConfig);
        
        // Set signer if available
        if (signer && mounted) {
          await sdkInstance.setSigner(signer);
        }
        
        if (mounted) {
          setSdk(sdkInstance);
        }
      } catch (error) {
        console.error('Failed to initialize SDK:', error);
        if (mounted) {
          setSdk(null);
        }
      } finally {
        if (mounted) {
          setIsConnecting(false);
        }
      }
    };

    initializeSDK();

    // Cleanup on unmount or when dependencies change
    return () => {
      mounted = false;
      if (sdkInstance) {
        sdkInstance.disconnect().catch(console.error);
      }
    };
  }, [memoizedConfig, signer]);

  return sdk;
}

/**
 * React hook for SDK state and operations
 * Provides a higher-level interface with loading states and error handling
 */
export function useSDKWithState(
  config: HeadlessConfig,
  signer?: ethers.Signer | null
) {
  const sdk = useSDK(config, signer);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [jobs, setJobs] = useState<Map<string, any>>(new Map());

  // Submit job with error handling
  const submitJob = useCallback(async (jobRequest: any) => {
    if (!sdk) {
      throw new Error('SDK not initialized');
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await sdk.submitJob(jobRequest);
      
      // Track job
      setJobs(prev => {
        const newJobs = new Map(prev);
        newJobs.set(response.requestId, {
          ...jobRequest,
          response,
          status: 'submitted',
          timestamp: Date.now()
        });
        return newJobs;
      });

      return response;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  // Discover nodes with error handling
  const discoverNodes = useCallback(async (options: any) => {
    if (!sdk) {
      throw new Error('SDK not initialized');
    }

    setIsLoading(true);
    setError(null);

    try {
      return await sdk.discoverNodes(options);
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  return {
    sdk,
    isConnected: sdk?.hasSigner() ?? false,
    isLoading,
    error,
    jobs,
    submitJob,
    discoverNodes
  };
}

/**
 * React hook for wagmi integration
 * Automatically converts wagmi's WalletClient to ethers.Signer
 */
export function useSDKWithWagmi(config: HeadlessConfig) {
  // This is a placeholder - actual implementation would depend on wagmi being installed
  // Users should implement their own version based on their wagmi setup
  throw new Error(
    'useSDKWithWagmi requires wagmi to be installed. ' +
    'Please implement your own hook following the pattern in useSDK.'
  );
}

export default useSDK;