'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSDK } from './use-sdk';
import type {
  SessionGroup,
  ChatSession,
  ChatMessage,
} from '@fabstir/sdk-core';

export interface UseSessionGroupsReturn {
  // Session Groups
  sessionGroups: SessionGroup[];
  selectedGroup: SessionGroup | null;
  isLoading: boolean;
  error: string | null;

  // Session Group Operations
  createGroup: (name: string, options?: { description?: string; databases?: string[] }) => Promise<SessionGroup>;
  selectGroup: (groupId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  updateGroup: (groupId: string, updates: Partial<SessionGroup>) => Promise<SessionGroup>;
  linkDatabase: (groupId: string, databaseName: string) => Promise<void>;
  unlinkDatabase: (groupId: string, databaseName: string) => Promise<void>;

  // Chat Session Operations
  startChat: (groupId: string, initialMessage?: string) => Promise<ChatSession>;
  startAIChat: (
    groupId: string,
    hostConfig: {
      address: string;
      endpoint: string;
      models: string[];
      pricing: number;
    },
    depositAmount: string,
    initialMessage?: string
  ) => Promise<ChatSession & { jobId?: bigint }>;
  continueChat: (groupId: string, sessionId: string) => Promise<ChatSession>;
  getChatSession: (groupId: string, sessionId: string) => Promise<ChatSession | null>;
  listChatSessionsWithData: (groupId: string) => Promise<ChatSession[]>;
  addMessage: (groupId: string, sessionId: string, message: ChatMessage) => Promise<void>;
  deleteChat: (groupId: string, sessionId: string) => Promise<void>;
  searchChats: (groupId: string, query: string) => Promise<ChatSession[]>;

  // Sharing Operations
  shareGroup: (groupId: string, userAddress: string, role: 'reader' | 'writer') => Promise<void>;
  unshareGroup: (groupId: string, userAddress: string) => Promise<void>;
  getPermissions: (groupId: string) => Promise<{ readers: string[]; writers: string[] }>;

  // Group Document Operations
  addGroupDocument: (groupId: string, document: { id: string; name: string; size: number; uploaded: number; contentType?: string }) => Promise<void>;
  removeGroupDocument: (groupId: string, documentId: string) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
}

/**
 * Hook for managing session groups and chat sessions
 *
 * Provides operations for:
 * - Creating and managing session groups
 * - Starting and continuing chat sessions
 * - Managing permissions and sharing
 * - Linking vector databases to groups
 */
export function useSessionGroups(): UseSessionGroupsReturn {
  const { managers, isInitialized } = useSDK();
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<SessionGroup | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessionGroups = useCallback(async () => {
    if (!managers?.sessionGroupManager || !managers?.authManager) return;

    const userAddress = managers.authManager.getUserAddress();
    if (!userAddress) return;

    try {
      setIsLoading(true);
      setError(null);
      const groups = await managers.sessionGroupManager.listSessionGroups(userAddress);
      setSessionGroups(groups);
    } catch (err) {
      console.error('[useSessionGroups] Failed to load groups:', err);
      setError(err instanceof Error ? err.message : 'Failed to load session groups');
    } finally {
      setIsLoading(false);
    }
  }, [managers]);

  // Load session groups on initialization
  useEffect(() => {
    if (isInitialized && managers) {
      loadSessionGroups();
    }
  }, [isInitialized, managers, loadSessionGroups]);

  const createGroup = useCallback(async (
    name: string,
    options?: { description?: string; databases?: string[] }
  ): Promise<SessionGroup> => {
    if (!managers?.sessionGroupManager || !managers?.authManager) {
      throw new Error('SDK not initialized');
    }

    const userAddress = managers.authManager.getUserAddress();
    if (!userAddress) {
      throw new Error('User address not available');
    }

    try {
      setIsLoading(true);
      setError(null);
      const group = await managers.sessionGroupManager.createSessionGroup({
        name,
        description: options?.description || '',
        owner: userAddress,
        metadata: {}
      });
      await loadSessionGroups(); // Refresh list
      return group;
    } catch (err) {
      console.error('[useSessionGroups] Failed to create group:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to create session group';
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [managers, loadSessionGroups]);

  const selectGroup = useCallback(async (groupId: string): Promise<void> => {
    if (!managers?.sessionGroupManager || !managers?.authManager) return;

    try {
      setIsLoading(true);
      setError(null);
      const group = await managers.sessionGroupManager.getSessionGroup(groupId, managers.authManager.getUserAddress());
      setSelectedGroup(group);
    } catch (err) {
      console.error('[useSessionGroups] Failed to select group:', err);
      setError(err instanceof Error ? err.message : 'Failed to load session group');
    } finally {
      setIsLoading(false);
    }
  }, [managers]);

  const deleteGroup = useCallback(async (groupId: string): Promise<void> => {
    if (!managers?.sessionGroupManager || !managers?.authManager) return;

    try {
      setIsLoading(true);
      setError(null);
      await managers.sessionGroupManager.deleteSessionGroup(groupId, managers.authManager.getUserAddress());

      // Clear selected group if it was deleted
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
      }

      await loadSessionGroups(); // Refresh list
    } catch (err) {
      console.error('[useSessionGroups] Failed to delete group:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete session group';
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [managers, selectedGroup, loadSessionGroups]);

  const updateGroup = useCallback(async (
    groupId: string,
    updates: Partial<SessionGroup>
  ): Promise<SessionGroup> => {
    if (!managers?.sessionGroupManager || !managers?.authManager) {
      throw new Error('SDK not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);
      const updated = await managers.sessionGroupManager.updateSessionGroup(
        groupId,
        managers.authManager.getUserAddress(),
        {
          name: updates.name,
          description: updates.description,
          metadata: updates.metadata
        }
      );

      // Update selected group if it was updated
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(updated);
      }

      await loadSessionGroups(); // Refresh list
      return updated;
    } catch (err) {
      console.error('[useSessionGroups] Failed to update group:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to update session group';
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [managers, selectedGroup, loadSessionGroups]);

  const linkDatabase = useCallback(async (
    groupId: string,
    databaseName: string
  ): Promise<void> => {
    if (!managers?.sessionGroupManager || !managers?.authManager) return;

    try {
      setError(null);
      await managers.sessionGroupManager.linkVectorDatabase(groupId, managers.authManager.getUserAddress(), databaseName);

      // Refresh selected group if it was updated
      if (selectedGroup?.id === groupId) {
        await selectGroup(groupId);
      }

      await loadSessionGroups(); // Refresh list
    } catch (err) {
      console.error('[useSessionGroups] Failed to link database:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to link database';
      setError(errorMsg);
      throw err;
    }
  }, [managers, selectedGroup, selectGroup, loadSessionGroups]);

  const unlinkDatabase = useCallback(async (
    groupId: string,
    databaseName: string
  ): Promise<void> => {
    if (!managers?.sessionGroupManager || !managers?.authManager) return;

    try {
      setError(null);
      await managers.sessionGroupManager.unlinkVectorDatabase(groupId, managers.authManager.getUserAddress(), databaseName);

      // Refresh selected group if it was updated
      if (selectedGroup?.id === groupId) {
        await selectGroup(groupId);
      }

      await loadSessionGroups(); // Refresh list
    } catch (err) {
      console.error('[useSessionGroups] Failed to unlink database:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to unlink database';
      setError(errorMsg);
      throw err;
    }
  }, [managers, selectedGroup, selectGroup, loadSessionGroups]);

  // Chat Session Operations

  const startChat = useCallback(async (
    groupId: string,
    initialMessage?: string
  ): Promise<ChatSession> => {
    if (!managers?.sessionGroupManager) {
      throw new Error('SDK not initialized');
    }

    try {
      setError(null);
      const session = await managers.sessionGroupManager.startChatSession(groupId, initialMessage);

      // Refresh selected group to show new session
      if (selectedGroup?.id === groupId) {
        await selectGroup(groupId);
      }

      return session;
    } catch (err) {
      console.error('[useSessionGroups] Failed to start chat:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to start chat session';
      setError(errorMsg);
      throw err;
    }
  }, [managers, selectedGroup, selectGroup]);

  /**
   * Start AI-powered chat session with blockchain payment
   *
   * Creates a blockchain job via SessionManager.startSession() and links it
   * to a session group chat session for persistence.
   *
   * Based on implementation from apps/harness/pages/chat-context-rag-demo.tsx
   */
  const startAIChat = useCallback(async (
    groupId: string,
    hostConfig: {
      address: string;
      endpoint: string;
      models: string[];
      pricing: number;
    },
    depositAmount: string,
    initialMessage?: string
  ): Promise<ChatSession & { jobId?: bigint }> => {
    if (!managers?.sessionManager || !managers?.sessionGroupManager) {
      throw new Error('SDK not initialized');
    }

    try {
      setError(null);
      console.log('[useSessionGroups] 🚀 Starting AI chat session...', {
        groupId,
        host: hostConfig.address,
        model: hostConfig.models[0],
        pricing: hostConfig.pricing,
        deposit: depositAmount,
      });

      // 1. Create blockchain job via SessionManager.startSession()
      const sessionConfig = {
        depositAmount,
        pricePerToken: hostConfig.pricing,
        proofInterval: 1000, // Checkpoint every 1000 tokens
        paymentToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
        provider: hostConfig.address,
        endpoint: hostConfig.endpoint,
        model: hostConfig.models[0],
        chainId: 84532, // Base Sepolia
        useDeposit: false, // Use spend permissions (gasless)
      };

      console.log('[useSessionGroups] Creating blockchain job...');
      const result = await managers.sessionManager.startSession(sessionConfig);
      const { sessionId, jobId } = result;

      console.log('[useSessionGroups] ✅ Blockchain job created:', {
        sessionId: sessionId.toString(),
        jobId: jobId?.toString(),
      });

      // 2. Create S5 chat session metadata linked to blockchain session
      console.log('[useSessionGroups] Creating S5 session metadata...');
      const chatSession = await managers.sessionGroupManager.startChatSession(
        groupId,
        initialMessage
      );

      // 3. Store blockchain metadata in session
      // Note: ChatSession interface may need extension to include jobId
      const aiSession = {
        ...chatSession,
        jobId,
        // Store metadata for UI to distinguish AI vs mock sessions
        metadata: {
          ...chatSession.metadata,
          sessionType: 'ai' as const,
          blockchainSessionId: sessionId.toString(),
          hostAddress: hostConfig.address,
          model: hostConfig.models[0],
          pricing: hostConfig.pricing,
        },
      };

      console.log('[useSessionGroups] ✅ AI chat session created successfully');

      // Refresh selected group to show new session
      if (selectedGroup?.id === groupId) {
        await selectGroup(groupId);
      }

      return aiSession;
    } catch (err) {
      console.error('[useSessionGroups] ❌ Failed to start AI chat:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to start AI chat session';
      setError(errorMsg);
      throw err;
    }
  }, [managers, selectedGroup, selectGroup]);

  const continueChat = useCallback(async (
    groupId: string,
    sessionId: string
  ): Promise<ChatSession> => {
    if (!managers?.sessionGroupManager) {
      throw new Error('SDK not initialized');
    }

    try {
      setError(null);
      return await managers.sessionGroupManager.continueChatSession(groupId, sessionId);
    } catch (err) {
      console.error('[useSessionGroups] Failed to continue chat:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to continue chat session';
      setError(errorMsg);
      throw err;
    }
  }, [managers]);

  const getChatSession = useCallback(async (
    groupId: string,
    sessionId: string
  ): Promise<ChatSession | null> => {
    if (!managers?.sessionGroupManager) return null;

    try {
      setError(null);
      return await managers.sessionGroupManager.getChatSession(groupId, sessionId);
    } catch (err) {
      console.error('[useSessionGroups] Failed to get chat session:', err);
      return null;
    }
  }, [managers]);

  const addMessage = useCallback(async (
    groupId: string,
    sessionId: string,
    message: ChatMessage
  ): Promise<void> => {
    if (!managers?.sessionGroupManager) return;

    try {
      setError(null);
      await managers.sessionGroupManager.addMessage(groupId, sessionId, message);
    } catch (err) {
      console.error('[useSessionGroups] Failed to add message:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to add message';
      setError(errorMsg);
      throw err;
    }
  }, [managers]);

  const deleteChat = useCallback(async (
    groupId: string,
    sessionId: string
  ): Promise<void> => {
    console.log(`[useSessionGroups.deleteChat] START: Deleting session ${sessionId} from group ${groupId}`);

    if (!managers?.sessionGroupManager) {
      console.warn('[useSessionGroups.deleteChat] No sessionGroupManager available');
      return;
    }

    try {
      setError(null);
      console.log('[useSessionGroups.deleteChat] Calling SDK deleteChatSession...');
      await managers.sessionGroupManager.deleteChatSession(groupId, sessionId);
      console.log('[useSessionGroups.deleteChat] SDK deleteChatSession completed');

      // Refresh selected group to remove deleted session
      if (selectedGroup?.id === groupId) {
        console.log('[useSessionGroups.deleteChat] Refreshing selected group...');
        await selectGroup(groupId);
        console.log('[useSessionGroups.deleteChat] Group refreshed');
      } else {
        console.log('[useSessionGroups.deleteChat] Skipping refresh - not currently selected group');
      }
      console.log('[useSessionGroups.deleteChat] COMPLETE');
    } catch (err) {
      console.error('[useSessionGroups.deleteChat] ERROR:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete chat session';
      setError(errorMsg);
      throw err;
    }
  }, [managers, selectedGroup, selectGroup]);

  const searchChats = useCallback(async (
    groupId: string,
    query: string
  ): Promise<ChatSession[]> => {
    if (!managers?.sessionGroupManager) return [];

    try {
      setError(null);
      return await managers.sessionGroupManager.searchChatSessions(groupId, query);
    } catch (err) {
      console.error('[useSessionGroups] Failed to search chats:', err);
      return [];
    }
  }, [managers]);

  const listChatSessionsWithData = useCallback(async (
    groupId: string
  ): Promise<ChatSession[]> => {
    if (!managers?.sessionGroupManager || !managers?.authManager) return [];

    try {
      setError(null);
      // Get session IDs
      const sessionIds = await managers.sessionGroupManager.listChatSessions(groupId, managers.authManager.getUserAddress());

      // Fetch full data for each session
      const sessions: ChatSession[] = [];
      for (const sessionId of sessionIds) {
        const session = await managers.sessionGroupManager.getChatSession(groupId, sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (err) {
      console.error('[useSessionGroups] Failed to list chat sessions:', err);
      return [];
    }
  }, [managers]);

  // Sharing Operations

  const shareGroup = useCallback(async (
    groupId: string,
    userAddress: string,
    role: 'reader' | 'writer'
  ): Promise<void> => {
    if (!managers?.sessionGroupManager) return;

    try {
      setError(null);
      await managers.sessionGroupManager.shareGroup(groupId, userAddress, role);
      await loadSessionGroups(); // Refresh to show updated permissions
    } catch (err) {
      console.error('[useSessionGroups] Failed to share group:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to share group';
      setError(errorMsg);
      throw err;
    }
  }, [managers, loadSessionGroups]);

  const unshareGroup = useCallback(async (
    groupId: string,
    userAddress: string
  ): Promise<void> => {
    if (!managers?.sessionGroupManager) return;

    try {
      setError(null);
      await managers.sessionGroupManager.unshareGroup(groupId, userAddress);
      await loadSessionGroups(); // Refresh to show updated permissions
    } catch (err) {
      console.error('[useSessionGroups] Failed to unshare group:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to unshare group';
      setError(errorMsg);
      throw err;
    }
  }, [managers, loadSessionGroups]);

  const getPermissions = useCallback(async (
    groupId: string
  ): Promise<{ readers: string[]; writers: string[] }> => {
    if (!managers?.sessionGroupManager) {
      return { readers: [], writers: [] };
    }

    try {
      setError(null);
      return await managers.sessionGroupManager.getGroupPermissions(groupId);
    } catch (err) {
      console.error('[useSessionGroups] Failed to get permissions:', err);
      return { readers: [], writers: [] };
    }
  }, [managers]);

  const addGroupDocument = useCallback(async (
    groupId: string,
    document: { id: string; name: string; size: number; uploaded: number; contentType?: string }
  ): Promise<void> => {
    if (!managers?.sessionGroupManager) return;

    try {
      setError(null);
      const updatedGroup = await managers.sessionGroupManager.addGroupDocument(groupId, document);
      // Update selected group if it matches
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(updatedGroup);
      }
    } catch (err) {
      console.error('[useSessionGroups] Failed to add group document:', err);
      setError(err instanceof Error ? err.message : 'Failed to add document');
      throw err;
    }
  }, [managers, selectedGroup]);

  const removeGroupDocument = useCallback(async (
    groupId: string,
    documentId: string
  ): Promise<void> => {
    if (!managers?.sessionGroupManager) return;

    try {
      setError(null);
      const updatedGroup = await managers.sessionGroupManager.removeGroupDocument(groupId, documentId);
      // Update selected group if it matches
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(updatedGroup);
      }
    } catch (err) {
      console.error('[useSessionGroups] Failed to remove group document:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove document');
      throw err;
    }
  }, [managers, selectedGroup]);

  const refresh = useCallback(async () => {
    await loadSessionGroups();
  }, [loadSessionGroups]);

  return {
    sessionGroups,
    selectedGroup,
    isLoading,
    error,
    createGroup,
    selectGroup,
    deleteGroup,
    updateGroup,
    linkDatabase,
    unlinkDatabase,
    startChat,
    startAIChat,
    continueChat,
    getChatSession,
    listChatSessionsWithData,
    addMessage,
    deleteChat,
    searchChats,
    shareGroup,
    unshareGroup,
    getPermissions,
    addGroupDocument,
    removeGroupDocument,
    refresh,
  };
}
