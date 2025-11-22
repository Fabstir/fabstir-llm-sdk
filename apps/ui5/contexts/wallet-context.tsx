'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useWallet as useWalletHook, type UseWalletReturn } from '@/hooks/use-wallet';

/**
 * Wallet Context - provides shared wallet state across all components
 *
 * This prevents the bug where each component calling useWallet() gets separate state.
 * Now all components share the same wallet connection state.
 */
const WalletContext = createContext<UseWalletReturn | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletHook();

  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
}

/**
 * Hook to access shared wallet state
 * Must be used inside a WalletProvider
 */
export function useWallet(): UseWalletReturn {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }

  return context;
}
