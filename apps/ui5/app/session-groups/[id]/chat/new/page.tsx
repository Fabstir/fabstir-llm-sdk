'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSessionGroups } from '@/hooks/use-session-groups';

/**
 * Start New Chat Session Page
 *
 * Allows starting a new chat session within a session group
 */
export default function NewChatPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params?.id as string || '';

  const { startChat } = useSessionGroups();
  const [initialMessage, setInitialMessage] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!initialMessage.trim()) {
      setError('Please enter an initial message');
      return;
    }

    try {
      setIsStarting(true);
      setError(null);

      console.debug('[NewChat] Starting chat for group:', groupId);
      const session = await startChat(groupId, initialMessage);
      console.debug('[NewChat] Chat started, session:', session);

      if (!session || !session.sessionId) {
        throw new Error('Failed to create chat session - no session ID returned');
      }

      // Navigate to the chat session
      console.debug('[NewChat] Navigating to:', `/session-groups/${groupId}/chat/${session.sessionId}`);
      router.push(`/session-groups/${groupId}/chat/${session.sessionId}`);
    } catch (err) {
      console.error('Failed to start chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to start chat');
      setIsStarting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={handleCancel}
            className="text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            Start New Chat
          </h1>
          <p className="mt-2 text-gray-600">
            Start a new conversation in this session group
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="mb-6">
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                Initial Message *
              </label>
              <textarea
                id="message"
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
                placeholder="What would you like to discuss?"
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                disabled={isStarting}
              />
              <p className="mt-2 text-sm text-gray-500">
                Start your conversation with a question or topic
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isStarting || !initialMessage.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isStarting ? 'Starting...' : 'Start Chat'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isStarting}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        {/* Tips */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">
            Tips for starting a conversation:
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Be specific about what you want to discuss</li>
            <li>• Include relevant context from linked databases</li>
            <li>• Ask open-ended questions for better responses</li>
            <li>• You can reference previous conversations in this group</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
