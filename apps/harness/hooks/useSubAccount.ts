// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { useState, useEffect } from 'react';
import { getOrCreateSubAccount, getCurrentSubAccount } from '../lib/sub-account';
import { connectWallet } from '../lib/base-account';

/**
 * React hook for managing sub-account state
 */
export function useSubAccount() {
  const [subAccount, setSubAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    // Check if we already have a sub-account
    const current = getCurrentSubAccount();
    if (current) {
      setSubAccount(current.address);
    }
  }, []);
  
  const initializeSubAccount = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First connect wallet
      const accounts = await connectWallet();
      const universalAccount = accounts[0];
      
      // Get or create sub-account
      const sub = await getOrCreateSubAccount(universalAccount);
      setSubAccount(sub.address);
      
      return sub.address;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  return {
    subAccount,
    loading,
    error,
    initializeSubAccount
  };
}