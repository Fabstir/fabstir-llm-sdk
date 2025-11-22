'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Loader2, Paperclip, X } from 'lucide-react';

interface AttachedFile {
  file: File;
  id: string;
}

interface MessageInputProps {
  onSend: (message: string, files?: File[]) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
}

/**
 * MessageInput - Text input with send button
 *
 * Features:
 * - Auto-resize textarea
 * - Enter to send, Shift+Enter for newline
 * - Disabled state while loading
 */
export function MessageInput({
  onSend,
  disabled = false,
  loading = false,
  placeholder = 'Type your message...',
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles: AttachedFile[] = Array.from(files).map(file => ({
        file,
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      }));
      setAttachedFiles(prev => [...prev, ...newFiles]);
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle file removal
  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Handle send
  const handleSend = () => {
    const trimmed = message.trim();
    const hasContent = trimmed || attachedFiles.length > 0;

    if (hasContent && !disabled && !loading) {
      const files = attachedFiles.map(af => af.file);
      onSend(trimmed, files.length > 0 ? files : undefined);
      setMessage('');
      setAttachedFiles([]);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      {/* Attached Files Preview */}
      {attachedFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachedFiles.map((attachedFile) => (
            <div
              key={attachedFile.id}
              className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm"
            >
              <Paperclip className="h-4 w-4 text-blue-600" />
              <span className="text-blue-900 truncate max-w-[200px]">
                {attachedFile.file.name}
              </span>
              <span className="text-blue-600 text-xs">
                ({Math.round(attachedFile.file.size / 1024)}KB)
              </span>
              <button
                onClick={() => handleRemoveFile(attachedFile.id)}
                disabled={disabled || loading}
                className="p-1 hover:bg-blue-100 rounded transition-colors"
                title="Remove file"
              >
                <X className="h-3 w-3 text-blue-600" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="flex gap-3 items-end">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.md"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Paperclip Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || loading}
          className="flex-shrink-0 w-12 h-12 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          title="Attach files"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || loading}
          rows={1}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          style={{ minHeight: '52px', maxHeight: '200px' }}
        />

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={(!message.trim() && attachedFiles.length === 0) || disabled || loading}
          className="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Press Enter to send, Shift+Enter for new line
        {attachedFiles.length > 0 && ` • ${attachedFiles.length} file(s) attached`}
      </p>
    </div>
  );
}
