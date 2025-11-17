'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/hooks/use-wallet';
import { useSDK } from '@/hooks/use-sdk';
import { useSessionGroups } from '@/hooks/use-session-groups';
import { useVectorDatabases, type EmbeddingProgress } from '@/hooks/use-vector-databases';
import { downloadFromS5 } from '@/lib/s5-utils';
import { EmbeddingProgressBar } from '@/components/vector-databases/embedding-progress-bar';
import { ChatInterface } from '@/components/chat/chat-interface';
import { SessionHistory } from '@/components/chat/session-history';
import { ChatMessage } from '@/components/chat/message-bubble';
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

  // Embedding progress state
  const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingProgress | null>(null);
  const [documentQueue, setDocumentQueue] = useState<string[]>([]);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [processingStartTimes, setProcessingStartTimes] = useState<Map<string, number>>(new Map());

  // Check if this is a special route (not a session ID)
  const isSpecialRoute = ['settings', 'databases'].includes(sessionId);

  // Embedding Progress Callback Handler
  const handleEmbeddingProgress = useCallback((progress: EmbeddingProgress) => {
    console.log('[ChatSession-EmbeddingProgress]', progress);
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

  // Process Pending Embeddings (Background)
  const processPendingEmbeddings = useCallback(async () => {
    if (!managers || !isInitialized) {
      console.log('[ChatSession] SDK not initialized, skipping embedding processing');
      return;
    }

    if (!selectedGroup || !selectedGroup.linkedDatabases || selectedGroup.linkedDatabases.length === 0) {
      console.log('[ChatSession] No linked databases, skipping embedding processing');
      return;
    }

    try {
      console.log('[ChatSession] Checking for pending documents in linked databases...');

      // Get all pending documents from linked databases
      const allPendingDocs: any[] = [];

      for (const dbName of selectedGroup.linkedDatabases) {
        try {
          const pendingDocs = await managers.vectorRAGManager.getPendingDocuments(dbName);
          if (pendingDocs && pendingDocs.length > 0) {
            console.log(`[ChatSession] Found ${pendingDocs.length} pending documents in database: ${dbName}`);
            allPendingDocs.push(...pendingDocs.map(doc => ({ ...doc, databaseName: dbName })));
          }
        } catch (error) {
          console.error(`[ChatSession] Failed to get pending documents from ${dbName}:`, error);
        }
      }

      if (allPendingDocs.length === 0) {
        console.log('[ChatSession] No pending documents found, skipping embedding processing');
        return;
      }

      console.log(`[ChatSession] Found ${allPendingDocs.length} total pending documents, starting background processing...`);
      setDocumentQueue(allPendingDocs.map(doc => doc.name || doc.fileName));
      setQueuePosition(1);

      // Process each pending document
      for (const doc of allPendingDocs) {
        try {
          // Emit progress: processing
          handleEmbeddingProgress({
            sessionId: sessionId,
            databaseName: doc.databaseName,
            documentId: doc.id,
            fileName: doc.name || doc.fileName,
            totalChunks: 0,
            processedChunks: 0,
            percentage: 0,
            status: 'processing',
            error: null
          });

          // Download document from S5
          console.log(`[ChatSession] Downloading document from S5: ${doc.s5Cid}`);
          const fileContent = await downloadFromS5(doc.s5Cid);

          // Generate embeddings (mock - replace with real implementation)
          console.log(`[ChatSession] Generating embeddings for: ${doc.name}`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate embedding generation

          // Update document status to 'ready'
          await managers.vectorRAGManager.updateDocumentStatus(doc.id, 'ready', {
            embeddingStatus: 'ready',
            embeddingProgress: 100
          });

          // Emit progress: complete
          handleEmbeddingProgress({
            sessionId: sessionId,
            databaseName: doc.databaseName,
            documentId: doc.id,
            fileName: doc.name || doc.fileName,
            totalChunks: 0,
            processedChunks: 0,
            percentage: 100,
            status: 'complete',
            error: null
          });

          console.log(`[ChatSession] ✅ Embedding complete for: ${doc.name}`);
        } catch (error) {
          console.error(`[ChatSession] ❌ Failed to process document: ${doc.name}`, error);

          // Emit progress: failed
          handleEmbeddingProgress({
            sessionId: sessionId,
            databaseName: doc.databaseName,
            documentId: doc.id,
            fileName: doc.name || doc.fileName,
            totalChunks: 0,
            processedChunks: 0,
            percentage: 0,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      console.log('[ChatSession] ✅ All pending embeddings processed');
    } catch (error) {
      console.error('[ChatSession] ❌ Background embedding processing failed:', error);
    }
  }, [managers, isInitialized, selectedGroup, sessionId, handleEmbeddingProgress]);

  // Load messages for current session
  const loadMessages = useCallback(async () => {
    // Skip loading for special routes
    if (isSpecialRoute) return;

    try {
      const session = await getChatSession(groupId, sessionId);
      if (session) {
        setMessages(session.messages || []);

        // --- Phase 4: Detect session type from metadata ---
        const metadata = (session as any).metadata;
        if (metadata && metadata.sessionType === 'ai') {
          console.log('[ChatSession] ✅ AI session detected:', {
            jobId: metadata.blockchainSessionId,
            hostAddress: metadata.hostAddress,
            model: metadata.model,
          });
          setSessionType('ai');
          setSessionMetadata(metadata);
        } else {
          console.log('[ChatSession] Mock session detected');
          setSessionType('mock');
          setSessionMetadata(null);
        }
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    }
  }, [getChatSession, groupId, sessionId, isSpecialRoute]);

  // Load session data on mount
  useEffect(() => {
    if (!isConnected) return;
    if (isSpecialRoute) return; // Skip for special routes

    const loadData = async () => {
      await selectGroup(groupId);
      await loadMessages();

      // Trigger background embedding processing (non-blocking)
      processPendingEmbeddings().catch((error) => {
        console.error('[ChatSession] Background embedding processing failed:', error);
        // Don't throw - user can still chat even if embeddings fail
      });
    };

    loadData();
  }, [isConnected, groupId, sessionId, selectGroup, loadMessages, processPendingEmbeddings, isSpecialRoute]);

  // Update local state when selectedGroup changes
  useEffect(() => {
    if (selectedGroup) {
      setGroupName(selectedGroup.name);
      setLinkedDatabases(selectedGroup.linkedDatabases || []);

      // Note: chatSessions is now string[] (just IDs), not full objects
      // Sessions sidebar is not used in this layout, so we can skip loading them
      setSessions([]);
    }
  }, [selectedGroup, groupId]);

  // --- Phase 4: Handle AI Message via WebSocket ---
  const handleAIMessage = async (message: string, files?: File[]) => {
    if (!sessionMetadata || !sessionMetadata.blockchainSessionId) {
      throw new Error('AI session metadata not available');
    }

    // Add user message (optimistic update)
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      // Send message via SessionManager (WebSocket to production host)
      const blockchainSessionId = BigInt(sessionMetadata.blockchainSessionId);

      console.log('[ChatSession] 🚀 Sending AI message via WebSocket...', {
        sessionId: blockchainSessionId.toString(),
        message: message.substring(0, 50) + '...',
      });

      // Use SessionManager.sendPromptStreaming for real-time responses
      const response = await managers!.sessionManager.sendPromptStreaming(
        blockchainSessionId,
        message
      );

      console.log('[ChatSession] ✅ AI response received:', response.substring(0, 100) + '...');

      // Add AI response message
      const aiMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, aiMessage]);

      // Save messages to session group storage
      await sdkAddMessage(groupId, sessionId, userMessage);
      await sdkAddMessage(groupId, sessionId, aiMessage);

      // Refresh group to update session metadata
      await selectGroup(groupId);

      return response;
    } catch (error: any) {
      console.error('[ChatSession] ❌ AI message failed:', error);
      throw error;
    }
  };

  // Handle sending a message (routes to mock or AI based on session type)
  const handleSendMessage = async (message: string, files?: File[]) => {
    setLoading(true);

    try {
      // --- Phase 4: Route to AI or mock based on session type ---
      if (sessionType === 'ai') {
        console.log('[ChatSession] Routing to AI message handler');
        await handleAIMessage(message, files);
      } else {
        console.log('[ChatSession] Routing to mock message handler');

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
          console.log('[Mock] Uploading files to session database:', files.map(f => f.name));
        }

        // Send message via SDK - this will automatically generate AI response in mock SDK
        await sdkAddMessage(groupId, sessionId, userMessage);

        // Wait for SDK to generate AI response (mock SDK adds response automatically)
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Reload messages from SDK to get the AI-generated response
        await loadMessages();

        // Refresh group to update session metadata
        await selectGroup(groupId);
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
    <div className="flex h-screen">
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
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
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
              {/* Phase 5: AI session badge */}
              {sessionType === 'ai' && (
                <div className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                  AI Session (Live)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Embedding Progress Bar */}
        {embeddingProgress && (
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
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

        {/* Chat Interface */}
        <div className="flex-1 overflow-hidden">
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            loading={loading}
            sessionTitle={groupName}
          />
        </div>
      </div>
    </div>
  );
}
