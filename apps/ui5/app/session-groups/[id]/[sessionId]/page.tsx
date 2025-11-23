'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/contexts/wallet-context';
import { useSDK } from '@/hooks/use-sdk';
import { useSessionGroups } from '@/hooks/use-session-groups';
import { useVectorDatabases, type EmbeddingProgress } from '@/hooks/use-vector-databases';
import { downloadFromS5 } from '@/lib/s5-utils';
import { EmbeddingProgressBar } from '@/components/vector-databases/embedding-progress-bar';
import { ChatInterface } from '@/components/chat/chat-interface';
import { SessionHistory } from '@/components/chat/session-history';
import { ChatMessage, MessageBubble } from '@/components/chat/message-bubble';
import { FileUploadProgress } from '@/components/chat/file-upload-progress';
import { Session } from '@/components/chat/session-card';
import { ArrowLeft, Database } from 'lucide-react';

/**
 * Chat Session Page
 *
 * Active chat interface with session history sidebar
 */
export default function ChatSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { isConnected } = useWallet();
  const { managers, isInitialized } = useSDK();
  const {
    selectedGroup,
    selectGroup,
    getChatSession,
    addMessage: sdkAddMessage,
    startChat,
    startAIChat,
    endAISession,
    deleteChat,
  } = useSessionGroups();

  const groupId = params.id as string;
  const sessionId = params.sessionId as string;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupName, setGroupName] = useState('Session Group');
  const [linkedDatabases, setLinkedDatabases] = useState<any[]>([]);

  // --- Phase 4: Session Type Detection ---
  const [sessionType, setSessionType] = useState<'mock' | 'ai'>('mock');
  const [sessionMetadata, setSessionMetadata] = useState<any>(null);

  // --- Sub-phase 8.1.7: Payment Settlement Tracking ---
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [lastCheckpointTokens, setLastCheckpointTokens] = useState(0);
  const PROOF_INTERVAL = 1000; // Checkpoint every 1000 tokens
  const PRICE_PER_TOKEN = 2000; // 0.002 USDC per token (from session config)

  // Embedding progress state
  const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingProgress | null>(null);
  const [documentQueue, setDocumentQueue] = useState<string[]>([]);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [processingStartTimes, setProcessingStartTimes] = useState<Map<string, number>>(new Map());

  // File upload progress state
  const [uploadProgress, setUploadProgress] = useState<{
    currentFile: string;
    filesProcessed: number;
    totalFiles: number;
    status: 'reading' | 'complete' | 'error';
    error?: string;
  } | null>(null);

  // Processing lock to prevent duplicate embedding processing
  const isProcessingEmbeddings = useRef(false);

  // Check if this is a special route (not a session ID)
  const isSpecialRoute = ['settings', 'databases'].includes(sessionId);

  // Embedding Progress Callback Handler
  const handleEmbeddingProgress = useCallback((progress: EmbeddingProgress) => {
    console.debug('[ChatSession-EmbeddingProgress]', progress);
    setEmbeddingProgress(progress);

    // Track processing start time
    if (progress.status === 'processing' && !processingStartTimes.has(progress.documentId)) {
      setProcessingStartTimes(prev => new Map(prev).set(progress.documentId, Date.now()));
    }

    // Update queue position when document completes
    if (progress.status === 'complete' || progress.status === 'failed') {
      setQueuePosition(prev => prev + 1);

      // Remove completed document from queue
      setDocumentQueue(prev => prev.filter(name => name !== progress.fileName));

      // Auto-hide progress bar 3 seconds after completion
      setTimeout(() => {
        setEmbeddingProgress(null);

        // Clear queue state if all documents processed
        setDocumentQueue(prev => {
          if (prev.length <= 1) {
            setQueuePosition(0);
            setProcessingStartTimes(new Map());
            return [];
          }
          return prev;
        });
      }, 3000);
    }
  }, [processingStartTimes]);

  // --- Sub-phase 8.1.7: Token Tracking Helper ---
  const trackTokensAndCost = useCallback((text: string) => {
    // Rough estimate: ~4 characters per token (GPT tokenization)
    const estimatedTokens = Math.ceil(text.length / 4);

    console.debug(`[ChatSession] 💰 Tracking ${estimatedTokens} tokens`);

    setTotalTokens(prev => {
      const newTotal = prev + estimatedTokens;
      console.debug(`[ChatSession] Total tokens: ${prev} → ${newTotal}`);

      // Check if we've crossed a checkpoint threshold
      if (Math.floor(newTotal / PROOF_INTERVAL) > Math.floor(prev / PROOF_INTERVAL)) {
        const checkpointNumber = Math.floor(newTotal / PROOF_INTERVAL);
        console.debug(`[ChatSession] 💎 Checkpoint ${checkpointNumber} reached!`);

        // Add system message for checkpoint
        const checkpointMsg: ChatMessage = {
          role: 'system',
          content: `💎 Checkpoint: ${checkpointNumber * PROOF_INTERVAL} tokens processed`,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, checkpointMsg]);
      }

      return newTotal;
    });

    setTotalCost(prev => {
      const cost = (estimatedTokens * PRICE_PER_TOKEN) / 1_000_000; // Convert to USDC
      const newCost = prev + cost;
      console.debug(`[ChatSession] Cost: $${prev.toFixed(4)} → $${newCost.toFixed(4)} USDC`);
      return newCost;
    });
  }, [PROOF_INTERVAL, PRICE_PER_TOKEN]);

  // Process Pending Embeddings (Background)
  const processPendingEmbeddings = useCallback(async (groupOverride?: any) => {
    // Check if already processing (prevent duplicate calls)
    if (isProcessingEmbeddings.current) {
      console.debug('[ChatSession] Already processing embeddings, skipping duplicate call');
      return;
    }

    if (!managers || !isInitialized) {
      console.debug('[ChatSession] SDK not initialized, skipping embedding processing');
      return;
    }

    // Use passed group or fall back to selectedGroup from state
    const group = groupOverride || selectedGroup;

    if (!group || !group.linkedDatabases || group.linkedDatabases.length === 0) {
      console.debug('[ChatSession] No linked databases, skipping embedding processing');
      return;
    }

    // CRITICAL: Extract session metadata from group data instead of relying on React state
    // This avoids race condition where state hasn't updated yet but group data is fresh
    const freshSessionMetadata = group.chatSessionsData?.[sessionId]?.metadata || sessionMetadata;
    console.debug('[ChatSession] Using metadata:', {
      hasStateMetadata: !!sessionMetadata,
      hasFreshMetadata: !!freshSessionMetadata,
      source: freshSessionMetadata === sessionMetadata ? 'state' : 'group'
    });

    // Set processing lock
    isProcessingEmbeddings.current = true;

    try {
      console.debug('[ChatSession] Checking for pending documents in linked databases...');
      console.debug('[ChatSession] Raw linkedDatabases array:', JSON.stringify(group.linkedDatabases));

      // Filter out invalid database names
      const validDatabases = group.linkedDatabases.filter((db: any) => {
        const isValid = db && typeof db === 'string' && db !== 'undefined' && db !== 'null';
        console.debug(`[ChatSession] Database "${db}" - type: ${typeof db}, isValid: ${isValid}`);
        return isValid;
      });

      if (validDatabases.length === 0) {
        console.debug('[ChatSession] No valid database names found in linkedDatabases:', group.linkedDatabases);
        return;
      }

      console.debug('[ChatSession] Valid databases to check:', validDatabases);

      // Get all pending documents from linked databases
      const allPendingDocs: any[] = [];

      for (const dbName of validDatabases) {
        try {
          const pendingDocs = await managers.vectorRAGManager.getPendingDocuments(dbName);
          if (pendingDocs && pendingDocs.length > 0) {
            console.debug(`[ChatSession] Found ${pendingDocs.length} pending documents in database: ${dbName}`);
            allPendingDocs.push(...pendingDocs.map(doc => ({ ...doc, databaseName: dbName })));
          }
        } catch (error) {
          console.error(`[ChatSession] Failed to get pending documents from ${dbName}:`, error);
        }
      }

      if (allPendingDocs.length === 0) {
        console.debug('[ChatSession] No pending documents found, checking for ready documents to upload...');

        // Even if no pending documents, we need to upload existing "ready" vectors to THIS session
        // so they're available for search
        try {
          const blockchainSessionId = freshSessionMetadata?.blockchainSessionId;
          if (!blockchainSessionId) {
            console.warn('[ChatSession] ⚠️ No blockchain session ID, cannot upload vectors');
            return;
          }

          // Check all linked databases for ready documents
          for (const dbName of validDatabases) {
            try {
              const allVectors = await managers.vectorRAGManager.listVectors(dbName);
              if (allVectors.length > 0) {
                console.debug(`[ChatSession] 📤 Uploading ${allVectors.length} existing vectors from "${dbName}" to session...`);
                await managers.sessionManager.uploadVectors(blockchainSessionId, allVectors);
                console.debug(`[ChatSession] ✅ Uploaded ${allVectors.length} vectors from "${dbName}"`);
              }
            } catch (dbError) {
              console.warn(`[ChatSession] Failed to upload vectors from "${dbName}":`, dbError);
            }
          }
        } catch (error) {
          console.error('[ChatSession] Failed to upload existing vectors:', error);
        }

        return;
      }

      console.debug(`[ChatSession] Found ${allPendingDocs.length} total pending documents, starting background processing...`);
      setDocumentQueue(allPendingDocs.map(doc => doc.fileName || doc.name));
      setQueuePosition(1);

      // Process each pending document
      for (const doc of allPendingDocs) {
        try {
          // Emit progress: processing
          handleEmbeddingProgress({
            sessionId: sessionId,
            databaseName: doc.databaseName,
            documentId: doc.id,
            fileName: doc.fileName || doc.name,
            totalChunks: 0,
            processedChunks: 0,
            percentage: 0,
            status: 'processing',
            error: null
          });

          // Download document from S5
          console.debug(`[ChatSession] Downloading document from S5: ${doc.s5Cid}`);
          const s5Client = managers.storageManager.s5Client;
          const fileContent = await downloadFromS5(s5Client, doc.s5Cid);

          if (!fileContent) {
            throw new Error(`Failed to download document from S5: ${doc.s5Cid}`);
          }

          // Convert to text (fileContent can be string or Uint8Array)
          const text = typeof fileContent === 'string'
            ? fileContent
            : new TextDecoder().decode(fileContent);

          console.debug(`[ChatSession] Generating embeddings for: ${doc.fileName || doc.name} (${text.length} chars)`);

          // Get host endpoint from fresh session metadata (not React state) with fallback
          let hostEndpoint = freshSessionMetadata?.hostEndpoint;

          if (!hostEndpoint) {
            console.debug('[ChatSession] hostEndpoint not in UI metadata, trying fallbacks...');

            // Fallback 1: Try SessionManager's endpoint field (different metadata structure)
            const blockchainSessionId = freshSessionMetadata?.blockchainSessionId;
            if (blockchainSessionId && managers?.sessionManager) {
              const sessionState = managers.sessionManager.getSession(blockchainSessionId.toString());
              if (sessionState && (sessionState as any).endpoint) {
                hostEndpoint = (sessionState as any).endpoint;
                console.debug('[ChatSession] ✅ Derived hostEndpoint from SessionManager:', hostEndpoint);
              }
            }

            // Fallback 2: Query NodeRegistry contract for host's apiUrl
            if (!hostEndpoint && freshSessionMetadata?.hostAddress && managers?.hostManager) {
              try {
                const hostInfo = await managers.hostManager.getHostInfo(freshSessionMetadata.hostAddress);
                if (hostInfo?.metadata?.apiUrl) {
                  hostEndpoint = hostInfo.metadata.apiUrl;
                  console.debug('[ChatSession] ✅ Derived hostEndpoint from NodeRegistry:', hostEndpoint);
                }
              } catch (err) {
                console.warn('[ChatSession] Failed to query NodeRegistry:', err);
              }
            }

            if (!hostEndpoint) {
              throw new Error('Host endpoint not available in session metadata. Please ensure session was created with AI mode enabled.');
            }
          }

          // Generate embeddings via host's /v1/embed endpoint
          const { generateDocumentEmbeddings } = await import('@/lib/embedding-utils');
          const vectors = await generateDocumentEmbeddings(
            hostEndpoint,
            text,
            doc.id,
            84532, // Base Sepolia
            // CRITICAL: Pass metadata for UI display (fileName, fileSize, etc.)
            {
              fileName: doc.fileName || doc.name || 'Unknown',
              fileSize: doc.fileSize || text.length,
              folderPath: doc.folderPath || '/',
              createdAt: doc.createdAt || Date.now()
            }
          );

          console.debug(`[ChatSession] ✅ Generated ${vectors.length} vectors for: ${doc.fileName || doc.name}`);

          // Store vectors in S5VectorStore (for persistence)
          console.debug(`[ChatSession] Storing vectors in database: ${doc.databaseName}`);
          await managers.vectorRAGManager.addVectorsToDatabase(doc.databaseName, vectors);
          console.debug(`[ChatSession] ✅ Stored ${vectors.length} vectors in S5`);

          // Upload vectors to host session (for search)
          const blockchainSessionId = freshSessionMetadata?.blockchainSessionId;
          if (!blockchainSessionId) {
            throw new Error('No blockchain session ID available for vector upload');
          }
          console.debug(`[ChatSession] Uploading ${vectors.length} vectors to host session (blockchain ID: ${blockchainSessionId})...`);
          await managers.sessionManager.uploadVectors(blockchainSessionId, vectors);
          console.debug(`[ChatSession] ✅ Uploaded ${vectors.length} vectors to host`);

          // Update document status to 'ready'
          await managers.vectorRAGManager.updateDocumentStatus(doc.id, 'ready', {
            embeddingStatus: 'ready',
            embeddingProgress: 100,
            vectorCount: vectors.length
          });

          // Emit progress: complete
          handleEmbeddingProgress({
            sessionId: sessionId,
            databaseName: doc.databaseName,
            documentId: doc.id,
            fileName: doc.fileName || doc.name,
            totalChunks: 0,
            processedChunks: 0,
            percentage: 100,
            status: 'complete',
            error: null
          });

          console.debug(`[ChatSession] ✅ Embedding complete for: ${doc.fileName || doc.name}`);
        } catch (error) {
          console.error(`[ChatSession] ❌ Failed to process document: ${doc.fileName || doc.name}`, error);

          // Emit progress: failed
          handleEmbeddingProgress({
            sessionId: sessionId,
            databaseName: doc.databaseName,
            documentId: doc.id,
            fileName: doc.fileName || doc.name,
            totalChunks: 0,
            processedChunks: 0,
            percentage: 0,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      console.debug('[ChatSession] ✅ All pending embeddings processed');
    } catch (error) {
      console.error('[ChatSession] ❌ Background embedding processing failed:', error);
    } finally {
      // Release processing lock
      isProcessingEmbeddings.current = false;
    }
  }, [managers, isInitialized, selectedGroup, sessionId, handleEmbeddingProgress]);

  // Load messages for current session
  const loadMessages = useCallback(async () => {
    // Skip loading for special routes
    if (isSpecialRoute) return;

    try {
      console.debug('[ChatSession] 🔄 Loading messages from storage...', {
        groupId,
        sessionId,
        timestamp: new Date().toISOString(),
        stackTrace: new Error().stack?.split('\n')[2] // Log where this was called from
      });
      const session = await getChatSession(groupId, sessionId);
      console.debug('[ChatSession] 🔍 getChatSession result:', {
        found: !!session,
        hasMessages: !!session?.messages,
        messageCount: session?.messages?.length || 0
      });
      if (session) {
        console.debug('[ChatSession] 📦 Loaded messages from storage:', {
          count: session.messages?.length || 0
        });

        // Log each message in detail with JSON.stringify
        session.messages?.forEach((m, idx) => {
          console.debug(`MESSAGE ${idx} [LOADED]:`, JSON.stringify({
            role: m.role,
            contentLength: m.content.length,
            contentPreview: m.content.substring(0, 100),
            hasFileMarkers: m.content.includes('=== FILE:'),
            displayContent: (m as any).displayContent,
            displayContentType: typeof (m as any).displayContent,
            hasAttachments: !!(m as any).attachments,
            attachments: (m as any).attachments,
            timestamp: m.timestamp,
            id: (m as any).id
          }, null, 2));
        });

        console.debug('[ChatSession] 📌 About to call setMessages with', session.messages?.length || 0, 'messages');
        setMessages(session.messages || []);
        console.debug('[ChatSession] ✅ setMessages completed');

        // --- Phase 4: Detect session type from metadata ---
        const metadata = (session as any).metadata;
        console.debug('[ChatSession] 🔍 Session metadata loaded:', {
          hasMetadata: !!metadata,
          sessionType: metadata?.sessionType,
          blockchainSessionId: metadata?.blockchainSessionId,
          fullMetadata: metadata
        });
        if (metadata && metadata.sessionType === 'ai') {
          console.debug('[ChatSession] ✅ AI session detected:', {
            jobId: metadata.blockchainSessionId,
            hostAddress: metadata.hostAddress,
            model: metadata.model,
          });
          setSessionType('ai');

          // Check if blockchain session is still active
          // If metadata says 'active' but session is actually ended, update metadata
          if (managers?.sessionManager && metadata.blockchainSessionId && metadata.blockchainStatus !== 'ended') {
            try {
              const blockchainSessionId = BigInt(metadata.blockchainSessionId);
              const sessionState = managers.sessionManager.getSession(blockchainSessionId.toString());
              console.debug('[ChatSession] 🔍 Blockchain session state:', {
                exists: !!sessionState,
                status: sessionState?.status
              });

              // Session is ended if:
              // 1. Not in memory (undefined) - can't send messages
              // 2. Status is 'ended', 'completed', or 'failed'
              if (!sessionState || sessionState.status === 'ended' || sessionState.status === 'completed' || sessionState.status === 'failed') {
                console.debug('[ChatSession] 🔴 Session already ended - updating metadata...');
                const updatedMetadata = {
                  ...metadata,
                  blockchainStatus: 'ended' as const,
                };

                // Update S5 storage
                const updatedSession = {
                  ...session,
                  metadata: updatedMetadata,
                };
                const group = await managers.sessionGroupManager!.getSessionGroup(
                  groupId,
                  managers.authManager!.getUserAddress()!
                );
                if (group && group.chatSessionsData && group.chatSessionsData[sessionId]) {
                  group.chatSessionsData[sessionId] = updatedSession;
                  (managers.sessionGroupManager as any).chatStorage.set(sessionId, updatedSession);
                  await managers.sessionGroupManager!.updateSessionGroup(
                    groupId,
                    managers.authManager!.getUserAddress()!,
                    { chatSessionsData: group.chatSessionsData }
                  );
                  console.debug('[ChatSession] ✅ Metadata updated to "ended"');
                }

                setSessionMetadata(updatedMetadata);
                (window as any).__activeSessionMetadata = updatedMetadata;
                console.debug('[ChatSession] 💾 Updated window.__activeSessionMetadata with ended status');
              } else {
                setSessionMetadata(metadata);
                // CRITICAL: Store in window for cleanup (survives navigation)
                (window as any).__activeSessionMetadata = metadata;
                console.debug('[ChatSession] 💾 Stored in window.__activeSessionMetadata:', {
                  blockchainSessionId: metadata.blockchainSessionId,
                  hasWindow: !!window,
                  stored: !!(window as any).__activeSessionMetadata
                });
              }
            } catch (error) {
              console.error('[ChatSession] ❌ Failed to check session status:', error);
              // Fallback to using metadata as-is
              setSessionMetadata(metadata);
              (window as any).__activeSessionMetadata = metadata;
            }
          } else {
            setSessionMetadata(metadata);
            // CRITICAL: Store in window for cleanup (survives navigation)
            (window as any).__activeSessionMetadata = metadata;
            console.debug('[ChatSession] 💾 Stored in window.__activeSessionMetadata:', {
              blockchainSessionId: metadata.blockchainSessionId,
              hasWindow: !!window,
              stored: !!(window as any).__activeSessionMetadata
            });
          }
        } else {
          console.debug('[ChatSession] Mock session detected');
          setSessionType('mock');
          setSessionMetadata(null);
          (window as any).__activeSessionMetadata = null;
        }
      } else {
        // Session not found in storage - could be timing issue with S5 save
        // Don't clear messages if we already have some (preserve optimistic updates)
        console.debug('[ChatSession] ⚠️  Session not found in storage, preserving any existing messages');
        // Note: We don't call setMessages([]) here to preserve optimistic updates
        // The session might still be saving to S5 in the background
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    }
  }, [getChatSession, groupId, sessionId, isSpecialRoute]);

  // Load session data on mount and when route changes
  // Note: Only reload when groupId/sessionId change, NOT when function refs change
  useEffect(() => {
    console.debug('[ChatSession] useEffect triggered:', {
      isConnected,
      isInitialized,
      isSpecialRoute,
      groupId,
      sessionId
    });
    if (!isConnected) return;
    if (!isInitialized) {
      console.debug('[ChatSession] ⏳ Waiting for SDK initialization...');
      return;
    }
    if (isSpecialRoute) return; // Skip for special routes

    const loadData = async () => {
      console.debug('[ChatSession] 📥 Loading data for session...');
      const freshGroup = await selectGroup(groupId);
      await loadMessages();

      // Trigger background embedding processing with fresh group data (non-blocking)
      // Pass fresh group to avoid race condition with React state updates
      processPendingEmbeddings(freshGroup).catch((error) => {
        console.error('[ChatSession] Background embedding processing failed:', error);
        // Don't throw - user can still chat even if embeddings fail
      });
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isInitialized, groupId, sessionId, isSpecialRoute]);

  // Debug: Log messages state whenever it changes
  useEffect(() => {
    console.debug('[ChatSession] 📋 Messages state changed:', {
      count: messages.length,
      timestamp: new Date().toISOString()
    });
    messages.forEach((m, idx) => {
      if (m.role === 'user') {
        console.debug(`[ChatSession] MESSAGE ${idx} [STATE]:`, {
          role: m.role,
          hasDisplayContent: !!(m as any).displayContent,
          displayContent: (m as any).displayContent,
          hasAttachments: !!(m as any).attachments,
          contentLength: m.content.length,
          contentPreview: m.content.substring(0, 100),
          timestamp: m.timestamp
        });
      }
    });
  }, [messages]);

  // Update local state when selectedGroup changes
  useEffect(() => {
    if (selectedGroup) {
      setGroupName(selectedGroup.name);
      setLinkedDatabases(selectedGroup.linkedDatabases || []);

      // Helper to extract display text from content with embedded markers
      const extractDisplayText = (content: string): string => {
        const displayMatch = content.match(new RegExp('<<DISPLAY>>([\\s\\S]*?)<</DISPLAY>>'));
        if (displayMatch) {
          return displayMatch[1];
        }
        return content;
      };

      // Load full session objects from session IDs
      const loadSessions = async () => {
        if (selectedGroup.chatSessions && selectedGroup.chatSessions.length > 0) {
          const sessionObjects = await Promise.all(
            selectedGroup.chatSessions.map(async (sessionId: string) => {
              try {
                const chatSession = await getChatSession(groupId, sessionId);
                if (chatSession && chatSession.messages && chatSession.messages.length > 0) {
                  // Get first user message for title (skip system messages)
                  const firstUserMsg = chatSession.messages.find(m => m.role === 'user');
                  const rawTitle = firstUserMsg?.content || chatSession.messages[0]?.content || '';
                  const cleanTitle = extractDisplayText(rawTitle).substring(0, 50).trim();

                  // Get last message for preview
                  const lastMsg = chatSession.messages[chatSession.messages.length - 1];
                  const rawLastMsg = lastMsg?.content || '';
                  const cleanLastMsg = extractDisplayText(rawLastMsg).substring(0, 100).trim();

                  console.debug(`[SessionLoad] ${sessionId.substring(0, 15)}... - Title: "${cleanTitle.substring(0, 30)}..." - Messages: ${chatSession.messages.length}`);

                  return {
                    id: sessionId,
                    title: cleanTitle || 'Untitled Session',
                    lastMessage: cleanLastMsg,
                    updated: chatSession.metadata?.updatedAt || Date.now(),
                  };
                }
                return null;
              } catch (error) {
                console.error(`[ChatSession] Failed to load session ${sessionId}:`, error);
                return null;
              }
            })
          );
          setSessions(sessionObjects.filter((s): s is Session => s !== null));
        } else {
          setSessions([]);
        }
      };

      loadSessions();
    }
  }, [selectedGroup, groupId, getChatSession]);

  // Re-run embedding processing when linked databases change
  useEffect(() => {
    if (selectedGroup?.linkedDatabases && selectedGroup.linkedDatabases.length > 0) {
      console.debug('[ChatSession] 🔄 Linked databases detected, processing embeddings...');
      processPendingEmbeddings().catch((error) => {
        console.error('[ChatSession] Embedding processing failed:', error);
      });
    }
  }, [selectedGroup?.linkedDatabases, processPendingEmbeddings]);

  // Store latest values in ref for cleanup (avoids stale closure)
  const cleanupDataRef = useRef({ sessionMetadata, managers });
  useEffect(() => {
    cleanupDataRef.current = { sessionMetadata, managers };
  }, [sessionMetadata, managers]);

  // Cleanup: Close WebSocket when navigating away from page
  useEffect(() => {
    console.debug('[ChatSession] 🔍 Cleanup effect mounted', {
      hasSessionMetadata: !!sessionMetadata,
      blockchainSessionId: sessionMetadata?.blockchainSessionId,
      hasManagers: !!managers,
      hasSessionManager: !!managers?.sessionManager
    });

    return () => {
      // Read latest values from ref to avoid stale closure
      const { sessionMetadata: currentMetadata, managers: currentManagers } = cleanupDataRef.current;

      // CRITICAL: Fallback to window object if state was cleared during navigation
      const windowMetadata = (window as any).__activeSessionMetadata;
      const metadata = currentMetadata || windowMetadata;
      const managers = currentManagers;

      console.debug('[ChatSession] 🔍 Cleanup function called on unmount', {
        hasCurrentMetadata: !!currentMetadata,
        hasWindowMetadata: !!windowMetadata,
        hasFinalMetadata: !!metadata,
        blockchainSessionId: metadata?.blockchainSessionId,
        hasManagers: !!managers,
        hasSessionManager: !!managers?.sessionManager,
        usedWindowFallback: !!(!currentMetadata && windowMetadata)
      });

      if (metadata?.blockchainSessionId && managers?.sessionManager) {
        const blockchainSessionId = BigInt(metadata.blockchainSessionId);
        console.debug('[ChatSession] 🧹 Cleanup: Ending WebSocket session on unmount', {
          blockchainSessionId: blockchainSessionId.toString()
        });
        managers.sessionManager.endSession(blockchainSessionId).catch(err => {
          console.error('[ChatSession] Failed to end session on cleanup:', err);
        });
        // Clear window storage after cleanup
        (window as any).__activeSessionMetadata = null;
      } else {
        console.debug('[ChatSession] ❌ Cleanup skipped - missing required data', {
          missingSessionMetadata: !metadata,
          missingBlockchainSessionId: !metadata?.blockchainSessionId,
          missingManagers: !managers,
          missingSessionManager: !managers?.sessionManager
        });
      }
    };
  }, []); // Empty deps - cleanup function always uses latest values from ref

  // --- Phase 4: Handle AI Message via WebSocket ---
  const handleAIMessage = async (message: string, files?: File[], metadata?: any) => {
    // Use provided metadata or fall back to state (for backward compatibility)
    const activeMetadata = metadata || sessionMetadata;

    if (!activeMetadata || !activeMetadata.blockchainSessionId) {
      throw new Error('AI session metadata not available');
    }

    try {
      // Process attached files FIRST (before creating user message)
      let fileContext = '';
      let userMessageContent = message;
      if (files && files.length > 0) {
        console.debug(`[ChatSession] 📎 Processing ${files.length} attached file(s)...`);

        let filesProcessed = 0;
        for (const file of files) {
          try {
            // Update progress - show current file being processed
            setUploadProgress({
              currentFile: file.name,
              filesProcessed,
              totalFiles: files.length,
              status: 'reading',
            });

            // Validate file type (only text-based files)
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (!['txt', 'md', 'html', 'json', 'csv'].includes(ext || '')) {
              setUploadProgress({
                currentFile: file.name,
                filesProcessed,
                totalFiles: files.length,
                status: 'error',
                error: `Invalid file type: .${ext}. Only txt, md, html, json, csv are supported.`,
              });
              // Wait a bit so user can see the error
              await new Promise(resolve => setTimeout(resolve, 2000));
              console.warn(`[ChatSession] ⚠️ Skipping non-text file: ${file.name}`);
              filesProcessed++;
              continue;
            }

            // Validate file size (max 1 MB for direct injection)
            if (file.size > 1024 * 1024) {
              setUploadProgress({
                currentFile: file.name,
                filesProcessed,
                totalFiles: files.length,
                status: 'error',
                error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)} MB. Maximum 1 MB allowed.`,
              });
              // Wait a bit so user can see the error
              await new Promise(resolve => setTimeout(resolve, 2000));
              console.warn(`[ChatSession] ⚠️ File too large (${file.size} bytes): ${file.name}`);
              filesProcessed++;
              continue;
            }

            // Read file content
            const content = await file.text();
            console.debug(`[ChatSession] ✅ Read file: ${file.name} (${content.length} chars)`);

            // Append to file context
            fileContext += `\n\n=== FILE: ${file.name} ===\n${content}\n=== END OF FILE ===\n`;

            filesProcessed++;
          } catch (error) {
            console.error(`[ChatSession] ❌ Failed to read file ${file.name}:`, error);
            setUploadProgress({
              currentFile: file.name,
              filesProcessed,
              totalFiles: files.length,
              status: 'error',
              error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
            // Wait a bit so user can see the error
            await new Promise(resolve => setTimeout(resolve, 2000));
            filesProcessed++;
          }
        }

        // Clear progress indicator
        setUploadProgress({
          currentFile: '',
          filesProcessed: files.length,
          totalFiles: files.length,
          status: 'complete',
        });

        if (fileContext) {
          console.debug(`[ChatSession] ✅ File context prepared (${fileContext.length} chars)`);
          // Include file content in user message so it's available for follow-up questions
          userMessageContent = `${fileContext}\n\nUser question: ${message}`;
        }
      }

      // Create user message with embedded metadata (survives S5 serialization)
      // Embed displayContent and attachments in content field using markers
      const attachmentsJSON = files && files.length > 0
        ? JSON.stringify(files.map(f => ({ name: f.name, size: f.size, type: f.type })))
        : '';

      const contentWithMetadata = attachmentsJSON
        ? `<<DISPLAY>>${message}<</DISPLAY>><<ATTACHMENTS>>${attachmentsJSON}<</ATTACHMENTS>>\n${userMessageContent}`
        : userMessageContent;

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content: contentWithMetadata,
        timestamp: Date.now(),
      };

      console.debug('[ChatSession] 📝 Adding user message to state:', {
        currentMessageCount: messages.length,
        newMessage: { role: userMessage.role, content: userMessage.content.substring(0, 100) }
      });
      setMessages(prev => {
        console.debug('[ChatSession] 📝 User message - prev state:', prev.length);
        const newState = [...prev, userMessage];
        console.debug('[ChatSession] 📝 User message - new state:', newState.length);
        return newState;
      });

      // Create placeholder for AI response (for streaming)
      const aiMessageId = Date.now();
      const aiMessagePlaceholder: ChatMessage = {
        id: `msg-${aiMessageId}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: '',
        timestamp: aiMessageId,
      };

      console.debug('[ChatSession] 📝 Adding AI placeholder to state');
      setMessages(prev => {
        console.debug('[ChatSession] 📝 AI placeholder - prev state:', prev.length);
        const newState = [...prev, aiMessagePlaceholder];
        console.debug('[ChatSession] 📝 AI placeholder - new state:', newState.length);
        return newState;
      });

      // Send message via SessionManager (WebSocket to production host)
      const blockchainSessionId = BigInt(activeMetadata.blockchainSessionId);

      // CRITICAL: Store metadata immediately for cleanup (don't wait for S5 reload)
      setSessionMetadata(activeMetadata);
      (window as any).__activeSessionMetadata = activeMetadata;
      console.debug('[ChatSession] ✅ Stored session metadata for cleanup:', {
        blockchainSessionId: activeMetadata.blockchainSessionId,
        sessionType: activeMetadata.sessionType
      });

      console.debug('[ChatSession] 🚀 Sending AI message via WebSocket...', {
        sessionId: blockchainSessionId.toString(),
        message: message.substring(0, 50) + '...',
      });

      // Build conversation context - hosts are STATELESS, client maintains conversation state
      // For GPT-OSS-20B, node expects Harmony format multi-turn conversation
      // Format: <|start|>user<|message|>...<|end|><|start|>assistant<|channel|>final<|message|>...<|end|>

      // Get previous exchanges (filter out system messages)
      const previousExchanges = messages.filter(m => m.role !== 'system');

      // Build Harmony format conversation history
      let fullPrompt = '';

      if (previousExchanges.length > 0) {
        // Include previous conversation in Harmony format
        const harmonyHistory = previousExchanges
          .map(m => {
            if (m.role === 'user') {
              return `<|start|>user<|message|>${m.content}<|end|>`;
            } else {
              // assistant
              return `<|start|>assistant<|channel|>final<|message|>${m.content}<|end|>`;
            }
          })
          .join('\n');

        // Add current user message (node will add assistant prompt)
        // Use userMessageContent which includes file context if files were attached
        fullPrompt = `${harmonyHistory}\n<|start|>user<|message|>${userMessageContent}<|end|>`;
      } else {
        // First message - use userMessageContent which includes file context if files were attached
        fullPrompt = userMessageContent;
      }

      console.debug('[ChatSession] 📜 Conversation context:', {
        previousMessageCount: previousExchanges.length,
        fullPromptLength: fullPrompt.length,
        fullPromptPreview: fullPrompt.substring(0, 200) + '...'
      });

      // RAG Context Retrieval - Search linked databases for relevant content
      let ragContext = '';
      if (selectedGroup?.linkedDatabases && selectedGroup.linkedDatabases.length > 0) {
        try {
          console.debug('[ChatSession] 🔍 Searching linked databases for RAG context...');
          const allRelevantChunks: Array<{ content: string; metadata: any; score: number; database: string }> = [];

          // Generate query embedding via host endpoint
          let hostEndpoint = sessionMetadata?.hostEndpoint;

          // Try fallbacks if not in UI metadata
          if (!hostEndpoint) {
            const blockchainSessionId = sessionMetadata?.blockchainSessionId;
            if (blockchainSessionId && managers?.sessionManager) {
              const sessionState = managers.sessionManager.getSession(blockchainSessionId.toString());
              if (sessionState && (sessionState as any).endpoint) {
                hostEndpoint = (sessionState as any).endpoint;
                console.debug('[ChatSession] ✅ Derived hostEndpoint from SessionManager for RAG');
              }
            }

            if (!hostEndpoint && sessionMetadata?.hostAddress && managers?.hostManager) {
              try {
                const hostInfo = await managers.hostManager.getHostInfo(sessionMetadata.hostAddress);
                if (hostInfo?.metadata?.apiUrl) {
                  hostEndpoint = hostInfo.metadata.apiUrl;
                  console.debug('[ChatSession] ✅ Derived hostEndpoint from NodeRegistry for RAG');
                }
              } catch (err) {
                console.warn('[ChatSession] Failed to query NodeRegistry for RAG:', err);
              }
            }
          }

          if (!hostEndpoint) {
            console.warn('[ChatSession] ⚠️ Host endpoint not available, skipping RAG search');
          } else {
            const { generateEmbeddings } = await import('@/lib/embedding-utils');
            console.debug(`[ChatSession] Generating query embedding for: "${message.substring(0, 50)}..."`);
            const embedResult = await generateEmbeddings(hostEndpoint, [message], 84532);
            const queryVector = embedResult.embeddings[0].embedding;
            console.debug(`[ChatSession] ✅ Query embedding generated (${queryVector.length} dimensions)`);

            // Search host session for relevant vectors (host-side search, not client-side!)
            try {
              // CRITICAL: searchVectors expects blockchain session ID, not S5 session ID
              const blockchainSessionId = sessionMetadata?.blockchainSessionId;
              if (!blockchainSessionId) {
                console.warn('[ChatSession] ⚠️ No blockchain session ID available for RAG search');
                throw new Error('No blockchain session ID available');
              }

              console.debug(`[ChatSession] Searching host session for relevant vectors (blockchain session: ${blockchainSessionId})...`);
              const searchResults = await managers!.sessionManager.searchVectors(
                blockchainSessionId,  // Use blockchain session ID, not S5 session ID!
                queryVector,
                5, // Top 5 results overall
                0.2 // Minimum similarity threshold (lowered for better recall)
              );

              if (searchResults && searchResults.length > 0) {
                console.debug(`[ChatSession] Found ${searchResults.length} relevant chunks from host`);
                searchResults.forEach(result => {
                  allRelevantChunks.push({
                    content: result.text || result.content || result.metadata?.text || 'No text found',
                    metadata: result.metadata,
                    score: result.score,
                    database: result.metadata?.databaseName || 'unknown'
                  });
                });
              } else {
                console.debug(`[ChatSession] No relevant chunks found (documents may not be uploaded yet)`);
              }
            } catch (searchError) {
              console.warn(`[ChatSession] Host search failed:`, searchError);
            }
          }

          // Sort by relevance score and take top 5 overall
          allRelevantChunks.sort((a, b) => b.score - a.score);
          const topChunks = allRelevantChunks.slice(0, 5);

          if (topChunks.length > 0) {
            console.debug(`[ChatSession] ✅ Using ${topChunks.length} relevant chunks as RAG context`);

            // Build RAG context string
            ragContext = '\n\n--- Relevant Information from Knowledge Base ---\n';
            topChunks.forEach((chunk, index) => {
              ragContext += `\n[${index + 1}] From "${chunk.database}":\n${chunk.content}\n`;
            });
            ragContext += '\n--- End of Knowledge Base Context ---\n\n';

            // Inject RAG context into the prompt (before the current user message)
            if (previousExchanges.length > 0) {
              // Insert context before the final user message
              const harmonyHistory = previousExchanges
                .map(m => {
                  if (m.role === 'user') {
                    return `<|start|>user<|message|>${m.content}<|end|>`;
                  } else {
                    return `<|start|>assistant<|channel|>final<|message|>${m.content}<|end|>`;
                  }
                })
                .join('\n');
              fullPrompt = `${harmonyHistory}\n<|start|>user<|message|>${ragContext}${message}<|end|>`;
            } else {
              // First message - prepend RAG context
              fullPrompt = ragContext + message;
            }

            console.debug('[ChatSession] 📝 Enhanced prompt with RAG context:', {
              originalLength: message.length,
              contextLength: ragContext.length,
              enhancedLength: fullPrompt.length
            });
          } else {
            console.debug('[ChatSession] No relevant chunks found in linked databases');
          }
        } catch (ragError) {
          console.error('[ChatSession] Failed to retrieve RAG context:', ragError);
          // Continue without RAG context
        }
      }

      // NOTE: File context is now included in userMessage.content, so it's automatically
      // part of the conversation history. No need for separate injection.

      // Sub-phase 8.1.6: Use SessionManager.sendPromptStreaming with streaming callback
      let streamedContent = '';

      // Get timeout from environment (default 120 seconds = 2 minutes)
      const aiResponseTimeout = parseInt(process.env.NEXT_PUBLIC_AI_RESPONSE_TIMEOUT || '120', 10) * 1000;

      // Add configurable timeout for WebSocket connection and first response
      const sendPromptWithTimeout = () => {
        return Promise.race([
          managers!.sessionManager.sendPromptStreaming(
            blockchainSessionId,
            fullPrompt, // Send full conversation history, not just current message
            // Streaming callback - updates UI in real-time as tokens arrive
            (token: string) => {
              streamedContent += token;
              // Update the AI message with accumulated content
              // CRITICAL: Also check role to prevent updating user messages if timestamps collide
              setMessages(prev =>
                prev.map(msg =>
                  msg.timestamp === aiMessageId && msg.role === 'assistant'
                    ? { ...msg, content: streamedContent }
                    : msg
                )
              );
            }
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`AI response timeout after ${aiResponseTimeout / 1000} seconds (WebSocket connection issue)`)), aiResponseTimeout)
          )
        ]);
      };

      const response = await sendPromptWithTimeout() as string;

      console.debug('[ChatSession] ✅ AI response complete:', response.substring(0, 100) + '...');

      // Check if response is an error from the host
      if (response.includes('Error:') && (response.includes('NoKvCacheSlot') || response.includes('Decode failed'))) {
        console.debug('[ChatSession] 🔴 Host returned error in response - treating as exception');

        // Remove placeholder message
        setMessages(prev => prev.filter(msg => msg.timestamp !== aiMessageId));

        // Add error message as system message
        const errorMessage: ChatMessage = {
          id: `msg-error-${Date.now()}`,
          role: 'system',
          content: '⚠️ Host is at capacity (no available cache slots). This usually happens when the host is serving many concurrent sessions. Please try:\n\n1. Wait a few minutes and retry your message\n2. Select a different host from the dashboard\n3. End and restart this session to get a fresh cache slot\n\nYour message was not processed, but you can retry it once capacity is available.',
          timestamp: Date.now()
        };

        setMessages(prev => [...prev, errorMessage]);
        throw new Error('Host at capacity - no KV cache slots available. Please retry or select a different host.');
      }

      // Final update with complete response (in case streaming missed anything)
      const finalAIMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: aiMessageId,
      };

      console.debug('[ChatSession] 📝 Updating AI placeholder with final response');
      setMessages(prev => {
        console.debug('[ChatSession] 📝 Final update - prev state:', prev.length, prev.map(m => m.role));
        // CRITICAL: Also check role to prevent replacing user messages if timestamps collide
        const newState = prev.map(msg =>
          msg.timestamp === aiMessageId && msg.role === 'assistant' ? finalAIMessage : msg
        );
        console.debug('[ChatSession] 📝 Final update - new state:', newState.length, newState.map(m => m.role));
        return newState;
      });

      // Sub-phase 8.1.7: Track tokens and cost for user message + AI response
      trackTokensAndCost(message); // User input tokens
      trackTokensAndCost(response); // AI response tokens

      // Save messages to session group storage
      console.debug('[ChatSession] 💾 Saving messages to S5...');
      console.debug('USER MESSAGE:', JSON.stringify({
        role: userMessage.role,
        contentLength: userMessage.content.length,
        contentPreview: userMessage.content.substring(0, 100),
        hasFileMarkers: userMessage.content.includes('=== FILE:'),
        displayContent: userMessage.displayContent,
        attachments: userMessage.attachments,
        timestamp: userMessage.timestamp
      }, null, 2));
      console.debug('AI MESSAGE:', JSON.stringify({
        role: finalAIMessage.role,
        contentPreview: finalAIMessage.content.substring(0, 100)
      }, null, 2));

      await sdkAddMessage(groupId, sessionId, userMessage);
      await sdkAddMessage(groupId, sessionId, finalAIMessage);

      // Note: Don't call selectGroup here - it triggers useEffect which reloads messages
      // Messages are already in state via optimistic updates, and SDK saves handle persistence
      console.debug('[ChatSession] ✅ Messages saved to storage');

      return response;
    } catch (error: any) {
      console.error('[ChatSession] ❌ AI message failed:', error);

      // Remove placeholder message on error
      setMessages(prev => prev.filter(msg => msg.timestamp !== aiMessageId));

      // Check for NoKvCacheSlot error - host resource limitation
      if (error.message && (error.message.includes('NoKvCacheSlot') || error.message.includes('Decode failed'))) {
        console.debug('[ChatSession] 🔴 Host KV cache full - adding helpful error message');

        // Add error message as system message to help user understand what happened
        const errorMessage: ChatMessage = {
          id: `msg-error-${Date.now()}`,
          role: 'system',
          content: '⚠️ Host is at capacity (no available cache slots). This usually happens when the host is serving many concurrent sessions. Please try:\n\n1. Wait a few minutes and retry your message\n2. Select a different host from the dashboard\n3. End and restart this session to get a fresh cache slot\n\nYour message was not processed, but you can retry it once capacity is available.',
          timestamp: Date.now()
        };

        setMessages(prev => [...prev, errorMessage]);
        throw new Error('Host at capacity - no KV cache slots available. Please retry or select a different host.');
      }

      // Check if session ended error - update metadata and trigger UI update
      if (error.message && error.message.includes('Session is ended')) {
        console.debug('[ChatSession] 🔴 Session ended - updating metadata...');

        // Update session metadata to 'ended' status
        try {
          // This will update metadata and trigger UI to show Continue Chat button
          if (managers?.sessionGroupManager && managers?.authManager) {
            const session = await managers.sessionGroupManager.getChatSession(
              groupId,
              sessionId,
              managers.authManager.getUserAddress()!
            );
            if (session && session.metadata) {
              const updatedMetadata = {
                ...session.metadata,
                blockchainStatus: 'ended' as const,
              };

              const updatedSession = {
                ...session,
                metadata: updatedMetadata,
              };

              const group = await managers.sessionGroupManager.getSessionGroup(
                groupId,
                managers.authManager.getUserAddress()!
              );
              if (group && group.chatSessionsData && group.chatSessionsData[sessionId]) {
                group.chatSessionsData[sessionId] = updatedSession;
                (managers.sessionGroupManager as any).chatStorage.set(sessionId, updatedSession);
                await managers.sessionGroupManager.updateSessionGroup(
                  groupId,
                  managers.authManager.getUserAddress()!,
                  { chatSessionsData: group.chatSessionsData }
                );
                console.debug('[ChatSession] ✅ Session status updated to "ended"');

                // Update local state to trigger Continue Chat UI (no page reload needed)
                setSessionMetadata(updatedMetadata);
              }
            }
          }
        } catch (updateError) {
          console.error('[ChatSession] ❌ Failed to update session status:', updateError);
        }
      }

      // Add error message
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `❌ Error: ${error.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);

      throw error;
    }
  };

  // --- Sub-phase 8.1.8: End Session and Cleanup ---
  const handleEndSession = useCallback(async () => {
    if (!managers || !sessionMetadata || !sessionMetadata.blockchainSessionId) {
      console.error('[ChatSession] Cannot end session: missing managers or session metadata');
      return;
    }

    setLoading(true);

    try {
      const blockchainSessionId = BigInt(sessionMetadata.blockchainSessionId);

      console.debug('[ChatSession] 🛑 Ending session...', {
        sessionId: blockchainSessionId.toString(),
        totalTokens,
        totalCost: totalCost.toFixed(4),
      });

      // Add system message for session ending
      const endingMsg: ChatMessage = {
        role: 'system',
        content: '🛑 Ending session...',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, endingMsg]);

      // Step 1: Save conversation to S5 (already done via sdkAddMessage, but ensure it's saved)
      console.debug('[ChatSession] 💾 Conversation already saved to S5 via session group');

      // Step 2: Display final payment breakdown
      const hostPayment = totalCost * 0.9; // 90% to host
      const treasuryPayment = totalCost * 0.1; // 10% to treasury

      const summaryMsg: ChatMessage = {
        role: 'system',
        content: `📊 Final Session Summary:
💎 Total tokens: ${totalTokens.toLocaleString()}
💰 Total cost: $${totalCost.toFixed(6)} USDC
📈 Host earns: $${hostPayment.toFixed(6)} USDC (90%)
🏦 Treasury fee: $${treasuryPayment.toFixed(6)} USDC (10%)`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, summaryMsg]);

      // Step 3: End the session (close WebSocket and update status in S5)
      console.debug('[ChatSession.handleEndSession] 🔴 About to call endAISession...');
      console.debug('[ChatSession.handleEndSession] 📊 Current messages count BEFORE endAISession:', messages.length);
      await endAISession(groupId, sessionId);
      console.debug('[ChatSession.handleEndSession] ✅ endAISession completed');
      console.debug('[ChatSession.handleEndSession] 📊 Current messages count AFTER endAISession:', messages.length);

      const successMsg: ChatMessage = {
        role: 'system',
        content: '✅ Session ended successfully\n🔐 WebSocket disconnected\n📝 Status updated to "ended"\n⏳ Host will finalize payment on blockchain',
        timestamp: Date.now(),
      };
      console.debug('[ChatSession.handleEndSession] 📌 Adding success message to state');
      setMessages(prev => {
        console.debug('[ChatSession.handleEndSession] 📊 Previous messages count:', prev.length);
        return [...prev, successMsg];
      });

      // Step 4: Update session status in local state (keep metadata for Continue Chat button)
      setSessionMetadata(prev => ({
        ...prev,
        blockchainStatus: 'ended',
      }));
      // Note: Don't clear sessionType or metadata - needed for Continue Chat button
      setTotalTokens(0);
      setTotalCost(0);
      setLastCheckpointTokens(0);

      console.debug('[ChatSession] ✅ Session ended and cleaned up');
    } catch (error: any) {
      console.error('[ChatSession] ❌ Failed to end session:', error);

      const errorMsg: ChatMessage = {
        role: 'system',
        content: `❌ Error ending session: ${error.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [managers, sessionMetadata, totalTokens, totalCost]);

  // Handle sending a message (routes to mock or AI based on session type)
  const handleSendMessage = async (message: string, files?: File[]) => {
    setLoading(true);

    try {
      // --- Phase 4: Route to AI or mock based on session type ---
      // Check session metadata directly to avoid stale state issues
      const session = await getChatSession(groupId, sessionId);
      const isAISession = session?.metadata?.sessionType === 'ai';

      console.debug('[ChatSession] 🔍 Session type check:', {
        stateValue: sessionType,
        metadataValue: session?.metadata?.sessionType,
        sessionFound: !!session,
        hasMetadata: !!session?.metadata,
        willRouteToAI: isAISession
      });

      if (isAISession) {
        console.debug('[ChatSession] Routing to AI message handler');
        // Use session metadata if available, otherwise fall back to state
        const metadata = session?.metadata || sessionMetadata;
        console.debug('[ChatSession] Using metadata:', {
          fromSession: !!session?.metadata,
          fromState: !session?.metadata && !!sessionMetadata,
          hasBlockchainSessionId: !!metadata?.blockchainSessionId
        });
        await handleAIMessage(message, files, metadata);
      } else {
        console.debug('[ChatSession] Routing to mock message handler');

        // Build message content with file info
        let messageContent = message;
        if (files && files.length > 0) {
          const fileList = files.map(f => f.name).join(', ');
          messageContent = message
            ? `${message}\n\n📎 Attached: ${fileList}`
            : `📎 Attached: ${fileList}`;
        }

        // Add user message (optimistic update)
        const userMessage: ChatMessage = {
          role: 'user',
          content: messageContent,
          timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMessage]);

        // TODO: Upload files to session-specific database via SDK
        // For now, just log them
        if (files && files.length > 0) {
          console.debug('[Mock] Uploading files to session database:', files.map(f => f.name));
        }

        // Send message via SDK - this will automatically generate AI response in mock SDK
        await sdkAddMessage(groupId, sessionId, userMessage);

        // Wait for SDK to generate AI response (mock SDK adds response automatically)
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Reload messages from SDK to get the AI-generated response
        await loadMessages();

        // Note: Don't call selectGroup - it triggers useEffect which causes extra reloads
        console.debug('[ChatSession] ✅ Mock message saved and AI response loaded');
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);

      // Add error message
      const errorMessage: ChatMessage = {
        role: 'system',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Handle session click
  const handleSessionClick = (newSessionId: string) => {
    router.push(`/session-groups/${groupId}/${newSessionId}`);
  };

  // Handle new session
  const handleNewSession = async () => {
    try {
      const session = await startChat(groupId);
      router.push(`/session-groups/${groupId}/${session.sessionId}`);
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
  };

  // Handle continue chat - creates new AI session with same host/model
  const handleContinueChat = async () => {
    if (!sessionMetadata || sessionType !== 'ai') {
      console.error('[ChatSession] Cannot continue: not an AI session');
      return;
    }

    try {
      setLoading(true);
      console.debug('[ChatSession] 🔄 Continuing chat with same host/model...');

      // Save current conversation history to copy to new session
      const conversationHistory = [...messages];
      console.debug('[ChatSession] 💾 Preserving conversation history:', {
        messageCount: conversationHistory.length
      });

      // Derive host endpoint with fallback mechanisms
      let hostEndpoint = sessionMetadata.hostEndpoint;

      if (!hostEndpoint) {
        console.debug('[ChatSession] hostEndpoint not in UI metadata, trying fallbacks for continue...');

        // Fallback 1: Try SessionManager's endpoint field
        const blockchainSessionId = sessionMetadata?.blockchainSessionId;
        if (blockchainSessionId && managers?.sessionManager) {
          const sessionState = managers.sessionManager.getSession(blockchainSessionId.toString());
          if (sessionState && (sessionState as any).endpoint) {
            hostEndpoint = (sessionState as any).endpoint;
            console.debug('[ChatSession] ✅ Derived hostEndpoint from SessionManager for continue');
          }
        }

        // Fallback 2: Query NodeRegistry contract
        if (!hostEndpoint && sessionMetadata?.hostAddress && managers?.hostManager) {
          try {
            const hostInfo = await managers.hostManager.getHostInfo(sessionMetadata.hostAddress);
            if (hostInfo?.metadata?.apiUrl) {
              hostEndpoint = hostInfo.metadata.apiUrl;
              console.debug('[ChatSession] ✅ Derived hostEndpoint from NodeRegistry for continue');
            }
          } catch (err) {
            console.warn('[ChatSession] Failed to query NodeRegistry for continue:', err);
          }
        }

        if (!hostEndpoint) {
          throw new Error('Cannot continue chat: Host endpoint not available in session metadata');
        }
      }

      // Get host config from current session metadata
      const hostConfig = {
        address: sessionMetadata.hostAddress,
        endpoint: hostEndpoint,
        models: [sessionMetadata.model],
        pricing: sessionMetadata.pricing,
      };

      console.debug('[ChatSession] 🔍 Using host config:', {
        address: hostConfig.address,
        endpoint: hostConfig.endpoint,
        model: hostConfig.models[0]
      });

      // Create new AI session with same configuration
      const depositAmount = '10.0'; // Default deposit amount (could be configurable)
      const newSession = await startAIChat(groupId, hostConfig, depositAmount);

      console.debug('[ChatSession] ✅ New session created:', newSession.sessionId);

      // Copy conversation history to new session
      console.debug('[ChatSession] 📋 Copying conversation history to new session...');
      for (const message of conversationHistory) {
        await sdkAddMessage(groupId, newSession.sessionId, message);
      }
      console.debug('[ChatSession] ✅ Conversation history copied');

      // Navigate to new session (conversation history will now be loaded)
      router.push(`/session-groups/${groupId}/${newSession.sessionId}`);
    } catch (error) {
      console.error('[ChatSession] ❌ Failed to continue chat:', error);
      alert(`Failed to continue chat: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle delete session
  const handleDeleteSession = async (deleteSessionId: string) => {
    try {
      await deleteChat(groupId, deleteSessionId);

      // If deleting current session, navigate to first remaining session or group
      if (deleteSessionId === sessionId) {
        const remainingSessions = sessions.filter((s) => s.id !== deleteSessionId);
        if (remainingSessions.length > 0) {
          router.push(`/session-groups/${groupId}/${remainingSessions[0].id}`);
        } else {
          router.push(`/session-groups/${groupId}`);
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Not Connected</h2>
          <p className="text-gray-600">Please connect your wallet to continue</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* Session History Sidebar */}
      <div className="w-80 flex-shrink-0">
        <SessionHistory
          sessions={sessions}
          activeSessionId={sessionId}
          onSessionClick={handleSessionClick}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href={`/session-groups/${groupId}`}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to {groupName}
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                {/* Phase 5: AI session indicator */}
                {sessionType === 'ai' && (
                  <span className="text-purple-600" title="AI Session (Blockchain)">💎</span>
                )}
                {sessions.find((s) => s.id === sessionId)?.title ||
                  sessions.find((s) => s.id === sessionId)?.lastMessage ||
                  'New Session'}
              </h1>
              {/* Phase 5: Show JobID for AI sessions */}
              {sessionType === 'ai' && sessionMetadata && (
                <p className="text-sm text-gray-600 mt-1">
                  Job ID: {sessionMetadata.blockchainSessionId?.substring(0, 10)}...
                  {' '} • Model: {sessionMetadata.model}
                  {' '} • Host: {sessionMetadata.hostAddress?.substring(0, 8)}...
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              {linkedDatabases.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Database className="h-4 w-4" />
                  <span>{linkedDatabases.length} database(s) linked</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                {/* Phase 5: AI session badge - only show if session is actually active */}
                {sessionType === 'ai' && sessionMetadata?.blockchainStatus !== 'ended' && (
                  <div className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                    AI Session (Live)
                  </div>
                )}
                {/* Show pending state for AI sessions without blockchain session */}
                {sessionType === 'ai' && !sessionMetadata?.blockchainSessionId && (
                  <div className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                    Not Started
                  </div>
                )}
                {/* Sub-phase 8.1.8: End Session button - only if session is active */}
                {sessionType === 'ai' && sessionMetadata?.blockchainSessionId && sessionMetadata?.blockchainStatus !== 'ended' && (
                  <button
                    onClick={handleEndSession}
                    disabled={loading}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    End Session
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sub-phase 8.1.7: Payment Cost Display */}
        {sessionType === 'ai' && totalTokens > 0 && (
          <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">💎 Tokens:</span>
                  <span className="text-sm font-bold text-purple-700">{totalTokens.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">💰 Cost:</span>
                  <span className="text-sm font-bold text-blue-700">${totalCost.toFixed(4)} USDC</span>
                </div>
              </div>
              {totalTokens >= PROOF_INTERVAL && (
                <div className="text-xs text-gray-500">
                  Next checkpoint: {PROOF_INTERVAL - (totalTokens % PROOF_INTERVAL)} tokens
                </div>
              )}
            </div>
          </div>
        )}

        {/* Embedding Progress Bar */}
        {embeddingProgress && (
          <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-gray-50">
            <EmbeddingProgressBar
              progress={embeddingProgress}
              queueSize={documentQueue.length > 0 ? documentQueue.length + queuePosition - 1 : undefined}
              queuePosition={queuePosition > 0 ? queuePosition : undefined}
              remainingDocuments={documentQueue.filter(name => name !== embeddingProgress.fileName)}
              estimatedTimeRemaining={(() => {
                // Calculate estimated time based on average processing time
                if (processingStartTimes.size === 0 || documentQueue.length <= 1) return undefined;

                // Calculate average time per document from completed documents
                const completedCount = processingStartTimes.size;
                const totalTime = Array.from(processingStartTimes.values()).reduce((sum, startTime) => {
                  return sum + (Date.now() - startTime);
                }, 0);
                const avgTimePerDoc = totalTime / completedCount / 1000; // Convert to seconds

                // Estimate remaining time
                const remainingDocs = documentQueue.length - 1; // Exclude current document
                return Math.round(avgTimePerDoc * remainingDocs);
              })()}
            />
          </div>
        )}

        {/* Chat Interface or Continue Chat UI */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {sessionMetadata?.blockchainStatus === 'ended' ? (
            /* Session Ended - Show Continue Chat UI */
            <div className="flex flex-col h-full">
              {/* Conversation History (Read-Only) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                  <MessageBubble key={idx} message={msg} />
                ))}
              </div>

              {/* Session Ended Banner + Continue Button */}
              <div className="border-t border-gray-200 bg-gray-50 p-6">
                <div className="max-w-3xl mx-auto space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      🔴 This session has ended
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      The AI session was closed. You can continue this conversation with a new blockchain job.
                    </p>
                  </div>

                  <button
                    onClick={handleContinueChat}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {loading ? '🔄 Creating New Session...' : '💎 Continue Chat (New AI Session)'}
                  </button>

                  <p className="text-xs text-center text-gray-500">
                    A new blockchain job will be created with the same host and model.
                    {' '}Your conversation history will be preserved.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Active Session - Normal Chat Interface */
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              loading={loading}
              sessionTitle={groupName}
              uploadProgress={uploadProgress}
            />
          )}
        </div>
      </div>
    </div>
  );
}
