'use client';

import { formatDistanceToNow } from 'date-fns';
import { User, Bot, AlertCircle } from 'lucide-react';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;  // Full content (includes file context for AI)
  displayContent?: string;  // Optional: Original message for display (without file context)
  timestamp: number;
  tokens?: number;
  sources?: {
    documentName: string;
    chunkText: string;
    similarityScore: number;
    filePath?: string;
    vectorId?: string;
  }[];
  attachments?: {
    name: string;
    size: number;
    type: string;
  }[];
}

interface MessageBubbleProps {
  message: ChatMessage;
  onSourceClick?: (source: any) => void;
}

/**
 * Parse message content to extract display text and attachments from embedded markers
 * Format: <<DISPLAY>>text<</DISPLAY>><<ATTACHMENTS>>[...]<</ATTACHMENTS>>...rest of content
 */
function parseMessageContent(content: string): {
  displayText: string;
  attachments: Array<{ name: string; size: number; type: string }>;
} {
  // Check for embedded markers using RegExp constructor
  const displayMatch = content.match(new RegExp('<<DISPLAY>>([\\s\\S]*?)<</DISPLAY>>'));
  const attachmentsMatch = content.match(new RegExp('<<ATTACHMENTS>>([\\s\\S]*?)<</ATTACHMENTS>>'));

  if (displayMatch) {
    // Has embedded metadata
    const displayText = displayMatch[1];
    const attachments = attachmentsMatch
      ? JSON.parse(attachmentsMatch[1])
      : [];
    return { displayText, attachments };
  }

  // No embedded metadata - return full content
  return { displayText: content, attachments: [] };
}

/**
 * Get what should be displayed in the message bubble
 */
function getDisplayContent(message: ChatMessage): string {
  const { displayText } = parseMessageContent(message.content);
  return displayText;
}

/**
 * MessageBubble - Display a single chat message
 *
 * Supports user, assistant, and system messages with different styling
 */
export function MessageBubble({ message, onSourceClick }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  // Parse message content to get display text and attachments
  const { displayText: parsedDisplayText, attachments: parsedAttachments } = parseMessageContent(message.content);
  const displayText = isUser || isAssistant ? parsedDisplayText : message.content;
  const attachments = isUser ? parsedAttachments : [];

  if (isSystem) {
    // Sub-phase 8.1.7: Different styling for checkpoint vs other system messages
    const isCheckpoint = message.content.includes('💎 Checkpoint');
    const bgColor = isCheckpoint ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800';

    return (
      <div className="flex justify-center my-4">
        <div className={`${bgColor} border rounded-lg px-4 py-2 flex items-center gap-2 text-sm`}>
          <AlertCircle className="h-4 w-4" />
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-6`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
        }`}
      >
        {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-lg px-4 py-3 ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900 border border-gray-200'
          }`}
        >
          <div>
            <p className="whitespace-pre-wrap break-words">
              {displayText}
            </p>
          </div>

          {/* Attachments (only for user messages) */}
          {isUser && attachments.length > 0 && (
            <div className="mt-3 space-y-1">
              {attachments.map((attachment, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs bg-blue-500 bg-opacity-20 rounded px-2 py-1"
                >
                  <span className="font-mono">📎</span>
                  <span className="font-medium">{attachment.name}</span>
                  <span className="text-blue-200">
                    ({(attachment.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div
            className={`flex items-center gap-2 mt-2 text-xs ${
              isUser ? 'text-blue-100' : 'text-gray-500'
            }`}
          >
            <span>{formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}</span>
            {message.tokens && (
              <>
                <span>•</span>
                <span>{message.tokens} tokens</span>
              </>
            )}
          </div>
        </div>

        {/* Sources (only for assistant messages) */}
        {isAssistant && message.sources && message.sources.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-gray-600 mb-2">
              Sources ({message.sources.length})
            </div>
            <div className="space-y-2">
              {message.sources.map((source, idx) => (
                <button
                  key={idx}
                  onClick={() => onSourceClick?.(source)}
                  className="w-full text-left bg-white border border-gray-200 rounded-md p-3 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      {source.documentName}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        source.similarityScore >= 0.8
                          ? 'bg-green-100 text-green-700'
                          : source.similarityScore >= 0.6
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {(source.similarityScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{source.chunkText}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
