// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Chat Context RAG Demo Page
 *
 * This page uses dynamic import with ssr: false to load the ChatContextDemo component
 * only on the client side. This is necessary because:
 *
 * 1. The component imports @fabstir/vector-db-native which has platform-specific
 *    native Node.js bindings (.node files) that cannot be bundled by webpack for SSR
 * 2. RAG functionality (vector database, document chunking, embeddings) is 100% client-side
 * 3. The real vector-db-native module loads in the browser with full functionality
 *
 * This approach:
 * ✅ Avoids native module issues during Next.js build
 * ✅ Preserves 100% real client-side RAG functionality
 * ✅ Enables Playwright tests to work with real vector DB in browser
 */

import dynamic from 'next/dynamic';
import React from 'react';

// Load ChatContextDemo component only on client-side (skip SSR)
const ChatContextDemo = dynamic(
  () => import('../components/ChatContextDemo'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-gray-700 text-lg">Loading RAG demo...</div>
          <div className="text-gray-500 text-sm mt-2">Initializing vector database</div>
        </div>
      </div>
    )
  }
);

export default function ChatContextRAGDemoPage() {
  return <ChatContextDemo />;
}
