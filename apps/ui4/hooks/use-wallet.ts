'use client';

import { useState, useEffect, useCallback } from 'react';
import { mockWallet, type WalletState } from '@/lib/mock-wallet';

export interface UseWalletReturn {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

/**
 * Hook for managing wallet connection state
 *
 * Provides wallet connection, disconnection, and state management.
 * Uses mock wallet for development without blockchain connectivity.
 */
export function useWallet(): UseWalletReturn {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
  });
  const [isConnecting, setIsConnecting] = useState(false);

  // Initialize wallet state on mount
  useEffect(() => {
    const currentState = mockWallet.getState();
    setState(currentState);

    // Listen for wallet state changes from other components
    const handleWalletStateChange = (event: Event) => {
      const customEvent = event as CustomEvent<WalletState>;
      setState(customEvent.detail);
    };

    window.addEventListener('wallet-state-changed', handleWalletStateChange);

    return () => {
      window.removeEventListener('wallet-state-changed', handleWalletStateChange);
    };
  }, []);

  const connect = useCallback(async () => {
    try {
      setIsConnecting(true);
      const address = await mockWallet.connect();
      setState({
        address,
        isConnected: true,
      });
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    mockWallet.disconnect();
    setState({
      address: null,
      isConnected: false,
    });
  }, []);

  return {
    address: state.address,
    isConnected: state.isConnected,
    isConnecting,
    connect,
    disconnect,
  };
}
