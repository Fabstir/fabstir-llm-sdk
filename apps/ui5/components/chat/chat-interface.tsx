'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageBubble, ChatMessage } from './message-bubble';
import { MessageInput } from './message-input';
import { DocumentViewerModal } from './document-viewer-modal';
import { Loader2 } from 'lucide-react';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  loading?: boolean;
  sessionTitle?: string;
}

/**
 * ChatInterface - Main chat UI combining messages and input
 *
 * Features:
 * - Scrollable message area
 * - Auto-scroll to bottom on new messages
 * - Message input at bottom
 * - Document viewer for RAG sources
 */
export function ChatInterface({
  messages,
  onSendMessage,
  loading = false,
  sessionTitle = 'Chat Session',
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [allSources, setAllSources] = useState<any[]>([]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle source click
  const handleSourceClick = (source: any, messageIndex: number) => {
    // Find all sources from the message
    const message = messages[messageIndex];
    if (message?.sources) {
      setAllSources(message.sources);
      const sourceIdx = message.sources.findIndex(
        (s) => s.documentName === source.documentName && s.chunkText === source.chunkText
      );
      setSelectedSourceIndex(sourceIdx >= 0 ? sourceIdx : 0);
      setSelectedSource(source);
      setViewerOpen(true);
    } else {
      setAllSources([source]);
      setSelectedSourceIndex(0);
      setSelectedSource(source);
      setViewerOpen(true);
    }
  };

  // Navigate between sources in viewer
  const handleNavigateSource = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && selectedSourceIndex > 0) {
      const newIndex = selectedSourceIndex - 1;
      setSelectedSourceIndex(newIndex);
      setSelectedSource(allSources[newIndex]);
    } else if (direction === 'next' && selectedSourceIndex < allSources.length - 1) {
      const newIndex = selectedSourceIndex + 1;
      setSelectedSourceIndex(newIndex);
      setSelectedSource(allSources[newIndex]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{sessionTitle}</h3>
              <p className="text-gray-500">Start a conversation by sending a message below</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {messages.map((message, idx) => (
              <MessageBubble
                key={`${message.timestamp}-${idx}`}
                message={message}
                onSourceClick={(source) => handleSourceClick(source, idx)}
              />
            ))}
            {loading && (
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div className="text-gray-500 text-sm">Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <MessageInput onSend={onSendMessage} disabled={loading} loading={loading} />

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        source={selectedSource}
        allSources={allSources}
        currentIndex={selectedSourceIndex}
        onNavigate={handleNavigateSource}
      />
    </div>
  );
}
