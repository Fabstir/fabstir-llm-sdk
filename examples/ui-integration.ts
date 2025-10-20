// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * UI Integration Example for Fabstir LLM SDK
 * 
 * This example shows how to integrate the SDK with a React application.
 * Note: The React-specific code (hooks, components) should be implemented
 * in your UI project (fabstir-llm-ui), not in the SDK itself.
 * 
 * This file demonstrates:
 * 1. How to import and initialize the SDK in a UI context
 * 2. Pattern for creating React hooks
 * 3. State management patterns
 * 4. Event handling
 * 5. Real-time updates
 */

// ============================================
// PART 1: SDK Setup (in your UI project)
// ============================================

// File: fabstir-llm-ui/src/lib/sdk.ts
import { FabstirSDK } from '@fabstir/llm-sdk';
import type { 
  SessionOptions, 
  SessionResult,
  SDKConfig 
} from '@fabstir/llm-sdk';

// Create a singleton SDK instance
let sdkInstance: FabstirSDK | null = null;

export function getSDKInstance(config?: SDKConfig): FabstirSDK {
  if (!sdkInstance) {
    sdkInstance = new FabstirSDK(config || {
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
      s5PortalUrl: process.env.NEXT_PUBLIC_S5_PORTAL_URL
    });
  }
  return sdkInstance;
}

// ============================================
// PART 2: React Hooks (in your UI project)
// ============================================

// File: fabstir-llm-ui/src/hooks/useFabstirSDK.ts
import { useState, useEffect, useCallback } from 'react';
import { getSDKInstance } from '../lib/sdk';
import type { AuthResult } from '@fabstir/llm-sdk';

/**
 * React hook for SDK authentication
 */
export function useFabstirAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const sdk = getSDKInstance();
  
  const authenticate = useCallback(async (privateKey: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await sdk.authenticate(privateKey);
      setAuthResult(result);
      setIsAuthenticated(true);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);
  
  const disconnect = useCallback(() => {
    setIsAuthenticated(false);
    setAuthResult(null);
  }, []);
  
  return {
    isAuthenticated,
    isLoading,
    authResult,
    error,
    authenticate,
    disconnect
  };
}

/**
 * React hook for session management
 */
export function useFabstirSession() {
  const [sessions, setSessions] = useState<Map<string, SessionResult>>(new Map());
  const [activeSessions, setActiveSessions] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const sdk = getSDKInstance();
  
  const createSession = useCallback(async (options: SessionOptions) => {
    setIsCreating(true);
    setError(null);
    
    try {
      const sessionManager = await sdk.getSessionManager();
      const session = await sessionManager.createSession(options);
      
      // Update state
      setSessions(prev => new Map(prev).set(session.sessionId, session));
      setActiveSessions(prev => [...prev, session.sessionId]);
      
      return session;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }, [sdk]);
  
  const completeSession = useCallback(async (sessionId: string) => {
    try {
      const sessionManager = await sdk.getSessionManager();
      const result = await sessionManager.completeSession(sessionId);
      
      // Update state
      setActiveSessions(prev => prev.filter(id => id !== sessionId));
      
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, [sdk]);
  
  const refreshSessions = useCallback(async () => {
    try {
      const sessionManager = await sdk.getSessionManager();
      const active = await sessionManager.getActiveSessions();
      setActiveSessions(active);
    } catch (err) {
      setError(err as Error);
    }
  }, [sdk]);
  
  useEffect(() => {
    // Refresh sessions on mount
    refreshSessions();
  }, [refreshSessions]);
  
  return {
    sessions,
    activeSessions,
    isCreating,
    error,
    createSession,
    completeSession,
    refreshSessions
  };
}

/**
 * React hook for storage operations
 */
export function useFabstirStorage() {
  const [isStoring, setIsStoring] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const sdk = getSDKInstance();
  
  const storeData = useCallback(async (key: string, data: any) => {
    setIsStoring(true);
    setError(null);
    
    try {
      const storageManager = await sdk.getStorageManager();
      const cid = await storageManager.storeData(key, data);
      return cid;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsStoring(false);
    }
  }, [sdk]);
  
  const retrieveData = useCallback(async (key: string) => {
    setIsRetrieving(true);
    setError(null);
    
    try {
      const storageManager = await sdk.getStorageManager();
      const data = await storageManager.retrieveData(key);
      return data;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsRetrieving(false);
    }
  }, [sdk]);
  
  return {
    isStoring,
    isRetrieving,
    error,
    storeData,
    retrieveData
  };
}

// ============================================
// PART 3: React Components (in your UI project)
// ============================================

// File: fabstir-llm-ui/src/components/SessionManager.tsx
import React, { useState } from 'react';
import { useFabstirAuth, useFabstirSession } from '../hooks/useFabstirSDK';

export function SessionManager() {
  const { isAuthenticated, authenticate } = useFabstirAuth();
  const { createSession, activeSessions, isCreating } = useFabstirSession();
  const [privateKey, setPrivateKey] = useState('');
  
  const handleAuth = async () => {
    try {
      await authenticate(privateKey);
      console.log('Authenticated successfully');
    } catch (error) {
      console.error('Authentication failed:', error);
    }
  };
  
  const handleCreateSession = async () => {
    try {
      const session = await createSession({
        paymentType: 'ETH',
        amount: '0.005',
        pricePerToken: 5000,
        duration: 3600,
        hostAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7'
      });
      console.log('Session created:', session);
    } catch (error) {
      console.error('Session creation failed:', error);
    }
  };
  
  if (!isAuthenticated) {
    return (
      <div>
        <h2>Connect Wallet</h2>
        <input
          type="password"
          placeholder="Enter private key"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
        />
        <button onClick={handleAuth}>Connect</button>
      </div>
    );
  }
  
  return (
    <div>
      <h2>Session Manager</h2>
      <button 
        onClick={handleCreateSession}
        disabled={isCreating}
      >
        {isCreating ? 'Creating...' : 'Create Session'}
      </button>
      
      <div>
        <h3>Active Sessions ({activeSessions.length})</h3>
        <ul>
          {activeSessions.map(sessionId => (
            <li key={sessionId}>{sessionId}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================
// PART 4: Real-time Updates (in your UI project)
// ============================================

// File: fabstir-llm-ui/src/hooks/useP2PMessages.ts
import { useEffect, useState, useCallback } from 'react';
import { getSDKInstance } from '../lib/sdk';

export function useP2PMessages() {
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const sdk = getSDKInstance();
  
  useEffect(() => {
    let discoveryManager: any;
    
    const setup = async () => {
      try {
        // Get discovery manager
        discoveryManager = sdk.getDiscoveryManager();
        
        // Create P2P node
        await discoveryManager.createNode();
        setIsConnected(true);
        
        // Register message handler
        discoveryManager.onMessage((message: any) => {
          setMessages(prev => [...prev, message]);
        });
      } catch (error) {
        console.error('P2P setup failed:', error);
      }
    };
    
    setup();
    
    // Cleanup
    return () => {
      if (discoveryManager?.isRunning()) {
        discoveryManager.stop();
      }
    };
  }, [sdk]);
  
  const sendMessage = useCallback(async (peerId: string, message: any) => {
    const discoveryManager = sdk.getDiscoveryManager();
    await discoveryManager.sendMessage(peerId, message);
  }, [sdk]);
  
  return {
    messages,
    isConnected,
    sendMessage
  };
}

// ============================================
// PART 5: State Management (in your UI project)
// ============================================

// File: fabstir-llm-ui/src/store/sdkStore.ts
// Example using Zustand for state management
import { create } from 'zustand';
import type { AuthResult, SessionResult } from '@fabstir/llm-sdk';

interface SDKStore {
  // Auth state
  authResult: AuthResult | null;
  isAuthenticated: boolean;
  
  // Session state
  sessions: Map<string, SessionResult>;
  activeSessionId: string | null;
  
  // Actions
  setAuth: (result: AuthResult) => void;
  clearAuth: () => void;
  addSession: (session: SessionResult) => void;
  setActiveSession: (sessionId: string) => void;
}

export const useSDKStore = create<SDKStore>((set) => ({
  // Initial state
  authResult: null,
  isAuthenticated: false,
  sessions: new Map(),
  activeSessionId: null,
  
  // Actions
  setAuth: (result) => set({ 
    authResult: result, 
    isAuthenticated: true 
  }),
  
  clearAuth: () => set({ 
    authResult: null, 
    isAuthenticated: false 
  }),
  
  addSession: (session) => set((state) => ({
    sessions: new Map(state.sessions).set(session.sessionId, session)
  })),
  
  setActiveSession: (sessionId) => set({ 
    activeSessionId: sessionId 
  })
}));

// ============================================
// PART 6: Error Handling (in your UI project)
// ============================================

// File: fabstir-llm-ui/src/utils/errorHandler.ts
export function handleSDKError(error: any): string {
  // Map SDK error codes to user-friendly messages
  const errorMessages: Record<string, string> = {
    'AUTH_FAILED': 'Authentication failed. Please check your credentials.',
    'INSUFFICIENT_BALANCE': 'Insufficient balance to complete this transaction.',
    'MANAGER_NOT_INITIALIZED': 'SDK not properly initialized. Please refresh.',
    'SESSION_NOT_FOUND': 'Session not found. It may have expired.',
    'P2P_CONNECTION_ERROR': 'Failed to connect to P2P network.',
    'STORAGE_ERROR': 'Failed to store/retrieve data.',
    'TRANSACTION_FAILED': 'Blockchain transaction failed.'
  };
  
  if (error.code && errorMessages[error.code]) {
    return errorMessages[error.code];
  }
  
  return error.message || 'An unexpected error occurred';
}

// Usage in component:
// try {
//   await someSDKOperation();
// } catch (error) {
//   const message = handleSDKError(error);
//   toast.error(message);
// }

// ============================================
// EXPORTS
// ============================================

export {
  getSDKInstance,
  useFabstirAuth,
  useFabstirSession,
  useFabstirStorage,
  useP2PMessages,
  useSDKStore,
  handleSDKError
};

/**
 * Installation in UI Project:
 * 
 * 1. Link SDK for development:
 *    cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk
 *    npm link
 *    cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-ui
 *    npm link @fabstir/llm-sdk
 * 
 * 2. Install dependencies in UI project:
 *    npm install zustand react ethers
 * 
 * 3. Add environment variables to .env.local:
 *    NEXT_PUBLIC_RPC_URL=https://base-sepolia.g.alchemy.com/v2/your-key
 *    NEXT_PUBLIC_S5_PORTAL_URL=wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p
 * 
 * 4. Import and use hooks in your components
 */