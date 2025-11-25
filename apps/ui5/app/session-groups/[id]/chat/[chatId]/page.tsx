'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSessionGroups } from '@/hooks/use-session-groups';
import type { ChatSession, ChatMessage } from '@fabstir/sdk-core';
import { formatDistanceToNow } from 'date-fns';

/**
 * Generate a mock AI response based on the user's message
 */
function generateMockResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();

  // Simple keyword-based responses
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return "Hello! I'm a simulated AI assistant. In production, I would be powered by a real language model. How can I help you today?";
  }

  if (lowerMessage.includes('relativity')) {
    return "Relativity refers to Einstein's theories: Special Relativity (1905) deals with objects moving at constant speeds, showing that time and space are relative to the observer. General Relativity (1915) describes gravity as the curvature of spacetime caused by mass and energy. Together, they revolutionized our understanding of physics.\n\n(Note: This is a simulated response. In production, the actual AI model would provide more detailed and contextual answers.)";
  }

  if (lowerMessage.includes('how') && lowerMessage.includes('work')) {
    return "In a production environment, this chat system would:\n\n1. Send your message to a decentralized compute node\n2. The node runs an AI model (like Llama, GPT, etc.)\n3. Context from your linked vector databases would be injected\n4. The model generates a response\n5. You're charged based on tokens used\n\nRight now, you're seeing a simulated response for UI testing purposes.";
  }

  if (lowerMessage.includes('database') || lowerMessage.includes('vector')) {
    return "This session group can be linked to vector databases containing your documents. When you ask questions, relevant context is automatically retrieved and provided to the AI model. This is called Retrieval-Augmented Generation (RAG).\n\n(Simulated response - production would use actual vector search results)";
  }

  // Default response
  return `I understand you said: "${userMessage}"\n\nIn production, this would be a contextual response from a real AI model, potentially enhanced with information from your linked vector databases.\n\nFor now, this is a simulated response for UI testing. The actual implementation will connect to decentralized compute nodes running models like Llama, GPT, or others.`;
}

/**
 * Chat Session Page
 *
 * View and interact with a specific chat session
 */
export default function ChatSessionPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params?.id as string || '';
  const chatId = params?.chatId as string || '';

  const { getChatSession, addMessage } = useSessionGroups();

  const [session, setSession] = useState<ChatSession | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastLoadedChatId = useRef<string | null>(null);
  const initialResponseGenerated = useRef<Set<string>>(new Set());

  // Load chat session (only when chat ID changes)
  useEffect(() => {
    // Only reload if we're loading a different chat
    if (lastLoadedChatId.current === chatId) {
      console.debug('[ChatSession] Skipping reload - already loaded this chat');
      return;
    }

    const loadSession = async () => {
      try {
        console.debug('[ChatSession] Loading session:', { groupId, chatId });
        const chatSession = await getChatSession(groupId, chatId);
        console.debug('[ChatSession] Session loaded:', chatSession);

        if (chatSession) {
          setSession(chatSession);
          setError(null); // Clear any previous errors
          lastLoadedChatId.current = chatId;

          // If this is a newly created chat with only one user message, generate AI response
          if (chatSession.messages.length === 1 && chatSession.messages[0].role === 'user') {
            // Prevent duplicate generation (e.g., from React StrictMode)
            if (initialResponseGenerated.current.has(chatId)) {
              console.debug('[ChatSession] Initial response already generated for this chat');
            } else {
              console.debug('[ChatSession] New chat detected - generating initial AI response');
              initialResponseGenerated.current.add(chatId);

              setTimeout(async () => {
                try {
                  const userMessage = chatSession.messages[0];
                  const aiResponse: ChatMessage = {
                    role: 'assistant',
                    content: generateMockResponse(userMessage.content),
                    timestamp: Date.now(),
                  };

                  console.debug('[ChatSession] Adding initial AI response');
                  await addMessage(groupId, chatId, aiResponse);

                  // Update local state
                  setSession(prev => {
                    if (!prev) return null;
                    return {
                      ...prev,
                      messages: [...prev.messages, aiResponse],
                    };
                  });
                } catch (err) {
                  console.error('[ChatSession] Failed to generate initial AI response:', err);
                }
              }, 1500);
            }
          }
        } else {
          setError('Chat session not found');
        }
      } catch (err) {
        console.error('[ChatSession] Failed to load chat session:', err);
        setError('Failed to load chat session');
      }
    };

    loadSession();
  }, [groupId, chatId, getChatSession, addMessage]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim() || !session) {
      return;
    }

    const newMessage: ChatMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: Date.now(),
    };

    try {
      setIsSending(true);
      setError(null);

      // Optimistically add user message to UI
      const updatedSession = {
        ...session,
        messages: [...session.messages, newMessage],
      };
      setSession(updatedSession);
      setMessage('');

      // Send message to backend
      console.debug('[ChatSession] Adding message to backend:', newMessage.content);
      await addMessage(groupId, chatId, newMessage);
      console.debug('[ChatSession] Message added successfully');

      // Simulate AI response (in real implementation, this would come from the backend)
      console.debug('[ChatSession] Setting up AI response timer...');
      const generateAIResponse = async () => {
        try {
          console.debug('[ChatSession] Timer fired - generating simulated AI response');
          const aiResponse: ChatMessage = {
            role: 'assistant',
            content: generateMockResponse(newMessage.content),
            timestamp: Date.now(),
          };

          console.debug('[ChatSession] AI response created:', aiResponse.content.substring(0, 50));

          // Persist AI response to backend
          console.debug('[ChatSession] Persisting AI response to backend');
          await addMessage(groupId, chatId, aiResponse);
          console.debug('[ChatSession] AI response persisted successfully');

          // Update local state
          console.debug('[ChatSession] Updating local state with AI response');
          setSession(prev => {
            if (!prev) {
              console.error('[ChatSession] No session in state - cannot add AI response');
              return null;
            }
            console.debug('[ChatSession] Current message count:', prev.messages.length);
            const updated = {
              ...prev,
              messages: [...prev.messages, aiResponse],
            };
            console.debug('[ChatSession] Updated message count:', updated.messages.length);
            return updated;
          });
          console.debug('[ChatSession] AI response added to state');
        } catch (err) {
          console.error('[ChatSession] Error in AI response generation:', err);
        } finally {
          console.debug('[ChatSession] Clearing sending state');
          setIsSending(false);
        }
      };

      setTimeout(generateAIResponse, 1500);

    } catch (err) {
      console.error('[ChatSession] Failed to send message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsSending(false);
    }
  };

  if (error && !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/session-groups/${groupId}`)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to Group
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Chat Session
              </h1>
              <p className="text-xs text-gray-500">
                Started {session.created && !isNaN(new Date(session.created).getTime())
                  ? formatDistanceToNow(new Date(session.created), { addSuffix: true })
                  : 'recently'}
              </p>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            {session.messages.length} messages
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {session.messages.map((msg, index) => (
            <div
              key={`${msg.timestamp}-${index}`}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}
                >
                  {msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())
                    ? formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })
                    : 'just now'}
                </p>
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="animate-pulse">●</div>
                  <div className="animate-pulse delay-100">●</div>
                  <div className="animate-pulse delay-200">●</div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isSending}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isSending || !message.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Send
            </button>
          </form>

          <p className="mt-2 text-xs text-gray-500">
            Press Enter to send • Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
