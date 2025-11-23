'use client';

import { useState, useEffect, useCallback } from 'react';
import { getBaseWallet } from '@/lib/base-wallet';
import { ui5SDK } from '@/lib/sdk';
import type { Signer } from 'ethers';

export interface UseWalletReturn {
  address: string | null;
  subAccountAddress: string | null;
  signer: Signer | null;
  isConnected: boolean;
  isConnecting: boolean;
  isInitialized: boolean;
  walletMode: 'base-account-kit' | 'metamask' | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Hook for managing wallet connection state
 *
 * Provides wallet connection, disconnection, and state management.
 * Supports both MetaMask and Base Account Kit (when configured).
 * Automatically initializes SDK after successful wallet connection.
 */
export function useWallet(): UseWalletReturn {
  const [address, setAddress] = useState<string | null>(null);
  const [subAccountAddress, setSubAccountAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [walletMode, setWalletMode] = useState<'base-account-kit' | 'metamask' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for existing wallet connection on mount
  useEffect(() => {
    // CHECK FOR TEST MODE FIRST
    const testWallet = typeof window !== 'undefined' ? (window as any).__TEST_WALLET__ : null;
    if (testWallet && testWallet.autoApprove) {
      console.debug('[useWallet] 🧪 Test mode detected - auto-connecting test wallet');
      setAddress(testWallet.address);
      setIsConnected(true);
      setWalletMode('metamask'); // Use metamask mode for test wallet

      // Initialize SDK with test signer - create from privateKey
      console.debug(`[useWallet] 🔍 Debug: testWallet.privateKey exists? ${!!testWallet.privateKey}`);
      if (testWallet.privateKey) {
        // Create signer from private key using TestWalletAdapter
        import('../lib/wallet-adapter').then(({ TestWalletAdapter }) => {
          const adapter = new TestWalletAdapter(
            {
              chainId: testWallet.chainId,
              rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org',
            },
            testWallet.privateKey
          );

          adapter.getSigner().then((testSigner) => {
            console.debug('[useWallet] ✅ Test signer created from privateKey');
            setSigner(testSigner);

            const isAlreadyInitialized = ui5SDK.isInitialized();
            console.debug(`[useWallet] 🔍 Debug: SDK already initialized? ${isAlreadyInitialized}`);

            if (!isAlreadyInitialized) {
              console.debug('[useWallet] Auto-initializing SDK with test wallet...');
              ui5SDK.initialize(testSigner)
                .then(() => {
                  setIsInitialized(true);
                  console.debug('[useWallet] SDK initialized successfully in test mode');
                })
                .catch((err) => {
                  console.error('[useWallet] Failed to initialize SDK in test mode:', err);
                  setError(err.message);
                });
            } else {
              console.debug('[useWallet] ⚠️ SDK already initialized - skipping initialization');
              setIsInitialized(true);
            }
          }).catch((err) => {
            console.error('[useWallet] Failed to get test signer:', err);
            setError(err.message);
          });
        }).catch((err) => {
          console.error('[useWallet] Failed to load TestWalletAdapter:', err);
          setError(err.message);
        });
      } else {
        console.error('[useWallet] ❌ Test wallet privateKey is missing!');
      }
      return;
    }

    // Normal production flow - check for existing Base Account Kit connection
    const baseWallet = getBaseWallet();

    if (baseWallet.isConnected()) {
      const walletAddress = baseWallet.getAddress();
      const mode = baseWallet.getMode();

      console.debug('[useWallet] Wallet already connected:', walletAddress);
      setAddress(walletAddress);
      setIsConnected(true);
      setWalletMode(mode);

      // Get signer and initialize SDK
      baseWallet.getSigner()
        .then(async (walletSigner) => {
          setSigner(walletSigner);

          // Initialize SDK if not already initialized
          if (!ui5SDK.isInitialized()) {
            console.debug('[useWallet] Auto-initializing SDK...');
            await ui5SDK.initialize(walletSigner);
            setIsInitialized(true);
            console.debug('[useWallet] SDK initialized successfully');
          } else {
            setIsInitialized(true);
          }
        })
        .catch((err) => {
          console.error('[useWallet] Failed to get signer or initialize SDK:', err);
          setError(err instanceof Error ? err.message : 'Failed to initialize');
        });
    }
  }, []);

  /**
   * Connect wallet (MetaMask or Base Account Kit)
   */
  const connect = useCallback(async () => {
    if (isConnecting || isConnected) {
      console.debug('[useWallet] Already connected or connecting');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const baseWallet = getBaseWallet();
      const mode = baseWallet.getMode();

      console.debug(`[useWallet] Connecting wallet via ${mode}...`);

      // Step 1: Connect wallet
      const walletAddress = await baseWallet.connect();
      setAddress(walletAddress);
      setIsConnected(true);
      setWalletMode(mode);
      console.debug('[useWallet] Wallet connected:', walletAddress);

      // Step 2: Try to create sub-account (only works with Base Account Kit)
      if (mode === 'base-account-kit') {
        console.debug('[useWallet] Setting up sub-account with spend permissions...');
        try {
          const subAccountResult = await baseWallet.ensureSubAccount({
            tokenAddress: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
            tokenDecimals: 6,
            maxAllowance: '1000000', // 1M USDC
            periodDays: 365,
          });
          setSubAccountAddress(subAccountResult.address);

          if (subAccountResult.isExisting) {
            console.debug('[useWallet] Using existing sub-account');
          } else {
            console.debug('[useWallet] Created new sub-account');
          }
        } catch (subAccountError) {
          console.warn('[useWallet] Sub-account creation failed, continuing anyway:', subAccountError);
        }
      } else {
        // MetaMask doesn't support sub-accounts
        setSubAccountAddress(walletAddress); // Use primary address
      }

      // Step 3: Get signer
      const walletSigner = await baseWallet.getSigner();
      setSigner(walletSigner);
      console.debug('[useWallet] Got signer from wallet');

      // Step 4: Initialize SDK
      console.debug('[useWallet] Initializing SDK with wallet signer...');
      await ui5SDK.initialize(walletSigner);
      setIsInitialized(true);
      console.debug('[useWallet] SDK initialized successfully!');

      console.debug('[useWallet] Connection complete!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      console.error('[useWallet] Connection error:', errorMessage);
      setError(errorMessage);

      // Reset state on error
      setIsConnected(false);
      setAddress(null);
      setSubAccountAddress(null);
      setSigner(null);
      setWalletMode(null);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected]);

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(async () => {
    try {
      const baseWallet = getBaseWallet();
      await baseWallet.disconnect();

      ui5SDK.disconnect();

      setIsConnected(false);
      setAddress(null);
      setSubAccountAddress(null);
      setSigner(null);
      setIsInitialized(false);
      setWalletMode(null);
      setError(null);

      console.debug('[useWallet] Disconnected successfully');
    } catch (err) {
      console.error('[useWallet] Disconnect error:', err);
    }
  }, []);

  return {
    address,
    subAccountAddress,
    signer,
    isConnected,
    isConnecting,
    isInitialized,
    walletMode,
    error,
    connect,
    disconnect,
  };
}
