/**
 * React adapter for FabstirSDKHeadless
 * This file CAN use React - it's an adapter for React applications
 * Provides a convenient hook for using the SDK with wagmi/viem
 */

import { useMemo, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { FabstirSDKHeadless, HeadlessSDKConfig } from '../../fabstir-sdk-headless.js';

// Type definitions for wallet clients (compatible with wagmi/viem)
interface WalletClient {
  account?: { address: string };
  chain?: { id: number };
  transport?: any;
  request?: (args: any) => Promise<any>;
}

interface UseSDKOptions extends Omit<HeadlessSDKConfig, 'signer'> {
  walletClient?: WalletClient | null;
  autoConnect?: boolean;
}

interface UseSDKReturn {
  sdk: FabstirSDKHeadless | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  reconnect: () => Promise<void>;
}

/**
 * React hook for using FabstirSDKHeadless
 * Automatically manages signer updates when wallet changes
 */
export function useSDK(options: UseSDKOptions = {}): UseSDKReturn {
  const { walletClient, autoConnect = true, ...sdkConfig } = options;
  
  const [sdk, setSdk] = useState<FabstirSDKHeadless | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Create SDK instance (memoized to prevent recreation)
  const sdkInstance = useMemo(() => {
    return new FabstirSDKHeadless(sdkConfig);
  }, [
    sdkConfig.network,
    sdkConfig.mode,
    sdkConfig.debug,
    // Stringify to properly compare objects
    JSON.stringify(sdkConfig.contractAddresses),
    JSON.stringify(sdkConfig.p2pConfig)
  ]);

  // Handle wallet client changes
  useEffect(() => {
    if (!autoConnect || !walletClient) {
      setSdk(null);
      setIsConnected(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const connectSdk = async () => {
      try {
        setIsConnecting(true);
        setError(null);

        // Convert wallet client to ethers signer
        const provider = new ethers.providers.Web3Provider(walletClient as any);
        const signer = provider.getSigner();

        if (!cancelled) {
          await sdkInstance.setSigner(signer);
          setSdk(sdkInstance);
          setIsConnected(true);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err);
          setSdk(null);
          setIsConnected(false);
          console.error('[useSDK] Failed to connect:', err);
        }
      } finally {
        if (!cancelled) {
          setIsConnecting(false);
        }
      }
    };

    connectSdk();

    // Cleanup function
    return () => {
      cancelled = true;
      // Don't disconnect SDK here as it might be used elsewhere
    };
  }, [walletClient, autoConnect, sdkInstance]);

  // Listen for SDK events
  useEffect(() => {
    if (!sdkInstance) return;

    const handleConnected = (data: any) => {
      setIsConnected(true);
      if (sdkConfig.debug) {
        console.log('[useSDK] Connected:', data);
      }
    };

    const handleDisconnected = () => {
      setIsConnected(false);
      setSdk(null);
      if (sdkConfig.debug) {
        console.log('[useSDK] Disconnected');
      }
    };

    sdkInstance.on('connected', handleConnected);
    sdkInstance.on('disconnected', handleDisconnected);

    return () => {
      sdkInstance.off('connected', handleConnected);
      sdkInstance.off('disconnected', handleDisconnected);
    };
  }, [sdkInstance, sdkConfig.debug]);

  // Reconnect function
  const reconnect = async () => {
    if (!walletClient) {
      setError(new Error('No wallet client available'));
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      const provider = new ethers.providers.Web3Provider(walletClient as any);
      const signer = provider.getSigner();

      await sdkInstance.setSigner(signer);
      setSdk(sdkInstance);
      setIsConnected(true);
    } catch (err: any) {
      setError(err);
      setSdk(null);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  return {
    sdk,
    isConnected,
    isConnecting,
    error,
    reconnect
  };
}

/**
 * Alternative hook that accepts an ethers signer directly
 */
export function useSDKWithSigner(
  signer: ethers.Signer | undefined,
  config: Omit<HeadlessSDKConfig, 'signer'> = {}
): UseSDKReturn {
  const [sdk, setSdk] = useState<FabstirSDKHeadless | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Create SDK instance
  const sdkInstance = useMemo(() => {
    return new FabstirSDKHeadless(config);
  }, [
    config.network,
    config.mode,
    config.debug,
    JSON.stringify(config.contractAddresses),
    JSON.stringify(config.p2pConfig)
  ]);

  // Handle signer changes
  useEffect(() => {
    if (!signer) {
      setSdk(null);
      setIsConnected(false);
      return;
    }

    let cancelled = false;

    const connectSdk = async () => {
      try {
        setIsConnecting(true);
        setError(null);

        if (!cancelled) {
          await sdkInstance.setSigner(signer);
          setSdk(sdkInstance);
          setIsConnected(true);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err);
          setSdk(null);
          setIsConnected(false);
        }
      } finally {
        if (!cancelled) {
          setIsConnecting(false);
        }
      }
    };

    connectSdk();

    return () => {
      cancelled = true;
    };
  }, [signer, sdkInstance]);

  const reconnect = async () => {
    if (!signer) {
      setError(new Error('No signer available'));
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      await sdkInstance.setSigner(signer);
      setSdk(sdkInstance);
      setIsConnected(true);
    } catch (err: any) {
      setError(err);
      setSdk(null);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  return {
    sdk,
    isConnected,
    isConnecting,
    error,
    reconnect
  };
}

// Export types for convenience
export type { FabstirSDKHeadless, HeadlessSDKConfig } from '../../fabstir-sdk-headless.js';