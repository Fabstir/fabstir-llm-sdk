'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/hooks/use-wallet';
import { useSessionGroups } from '@/hooks/use-session-groups';
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

  // Check if this is a special route (not a session ID)
  const isSpecialRoute = ['settings', 'databases'].includes(sessionId);

  // Load messages for current session
  const loadMessages = useCallback(async () => {
    // Skip loading for special routes
    if (isSpecialRoute) return;

    try {
      const session = await getChatSession(groupId, sessionId);
      if (session) {
        setMessages(session.messages || []);
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
    };

    loadData();
  }, [isConnected, groupId, sessionId, selectGroup, loadMessages, isSpecialRoute]);

  // Update local state when selectedGroup changes
  useEffect(() => {
    if (selectedGroup) {
      setGroupName(selectedGroup.name);
      setLinkedDatabases(selectedGroup.databases || []);

      // Load sessions from group
      const sessionList = selectedGroup.chatSessions || [];
      const formattedSessions: Session[] = sessionList.map((s) => ({
        id: s.sessionId,
        groupId: groupId,
        title: s.title,
        lastMessage: s.lastMessage,
        messageCount: s.messageCount || 0,
        created: s.timestamp,
        updated: s.timestamp,
      }));
      setSessions(formattedSessions);
    }
  }, [selectedGroup, groupId]);

  // Handle sending a message
  const handleSendMessage = async (message: string, files?: File[]) => {
    setLoading(true);

    // Build message content with file info
    let messageContent = message;
    if (files && files.length > 0) {
      const fileList = files.map(f => f.name).join(', ');
      messageContent = message
        ? `${message}\n\n📎 Attached: ${fileList}`
        : `📎 Attached: ${fileList}`;
    }

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    try {
      // TODO: Upload files to session-specific database via SDK
      // For now, just log them
      if (files && files.length > 0) {
        console.log('[Mock] Uploading files to session database:', files.map(f => f.name));
      }

      // Save user message via SDK
      await sdkAddMessage(groupId, sessionId, userMessage);

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Generate mock assistant response with RAG sources
      // Include both linked databases AND attached files as sources
      const mockSources: any[] = [];

      // Add sources from linked databases
      if (linkedDatabases.length > 0) {
        mockSources.push({
          documentName: linkedDatabases[0] || 'Document 1',
          chunkText: `This is a relevant chunk from ${linkedDatabases[0]}. It contains information related to your query about "${message.substring(0, 30)}...".`,
          similarityScore: 0.85,
          filePath: '/documents/example.pdf',
          vectorId: 'vec-' + Math.random().toString(36).substr(2, 9),
        });
      }

      // Add sources from attached files (session-specific)
      if (files && files.length > 0) {
        files.forEach((file, idx) => {
          mockSources.push({
            documentName: file.name,
            chunkText: `Content extracted from ${file.name}. This document was just uploaded and contains relevant information for this specific conversation.`,
            similarityScore: 0.95, // Higher score since it was just attached
            filePath: `/session-docs/${file.name}`,
            vectorId: 'vec-' + Math.random().toString(36).substr(2, 9),
          });
        });
      }

      const finalSources = mockSources.length > 0 ? mockSources : undefined;

      const mockResponses = [
        "That's a great question! Based on the context from your documents, here's what I found:",
        'Let me help you with that. According to the information in your knowledge base:',
        'I can see from your documents that this topic relates to several key points:',
        'Here\'s what I learned from your uploaded documents about "' +
          message.substring(0, 30) +
          '":',
      ];

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: mockResponses[Math.floor(Math.random() * mockResponses.length)],
        timestamp: Date.now(),
        tokens: Math.floor(Math.random() * 50) + 20,
        sources: finalSources,
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);

      // Save assistant message via SDK
      await sdkAddMessage(groupId, sessionId, assistantMessage);

      // Refresh group to update session metadata
      await selectGroup(groupId);
    } catch (error: any) {
      console.error('Failed to send message:', error);

      // Add error message
      const errorMessage: ChatMessage = {
        role: 'system',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      };

      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
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
              <h1 className="text-2xl font-bold text-gray-900">
                {sessions.find((s) => s.id === sessionId)?.title ||
                  sessions.find((s) => s.id === sessionId)?.lastMessage ||
                  'New Session'}
              </h1>
            </div>

            {linkedDatabases.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Database className="h-4 w-4" />
                <span>{linkedDatabases.length} database(s) linked</span>
              </div>
            )}
          </div>
        </div>

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
