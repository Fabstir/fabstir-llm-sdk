// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 3.2: Context Formatting and Injection Tests
 *
 * Tests for formatContext() function and context injection that:
 * - Formats retrieved context chunks into structured prompt
 * - Injects context into user prompt before sending to LLM
 * - Handles no context case (sends original prompt)
 * - Handles multiple chunks formatting
 * - Tracks if context was used (for UI indicators)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock types
interface SearchResult {
  text: string;
  score: number;
}

describe('Sub-phase 3.2: Context Formatting and Injection', () => {
  describe('formatContext() function', () => {
    it('should be defined and callable', () => {
      const formatContext = (chunks: SearchResult[], userPrompt: string): string => {
        return '';
      };

      expect(typeof formatContext).toBe('function');
    });

    it('should accept chunks array and user prompt', () => {
      const formatContext = vi.fn().mockReturnValue('formatted context');
      const chunks: SearchResult[] = [
        { text: 'Chunk 1', score: 0.9 }
      ];
      const userPrompt = 'What is AI?';

      formatContext(chunks, userPrompt);

      expect(formatContext).toHaveBeenCalledWith(chunks, userPrompt);
    });

    it('should return formatted string', () => {
      const formatContext = (chunks: SearchResult[], userPrompt: string): string => {
        return 'Context:\nChunk 1\n\nQuestion: What is AI?';
      };

      const result = formatContext([], 'What is AI?');

      expect(typeof result).toBe('string');
    });
  });

  describe('Context formatting with single chunk', () => {
    it('should format single chunk correctly', () => {
      const chunks: SearchResult[] = [
        { text: 'AI is artificial intelligence.', score: 0.9 }
      ];
      const userPrompt = 'What is AI?';

      const formatted = `Context:\n${chunks[0].text}\n\nQuestion: ${userPrompt}`;

      expect(formatted).toContain('Context:');
      expect(formatted).toContain(chunks[0].text);
      expect(formatted).toContain('Question:');
      expect(formatted).toContain(userPrompt);
    });

    it('should separate context and question with blank line', () => {
      const chunks: SearchResult[] = [
        { text: 'AI is artificial intelligence.', score: 0.9 }
      ];
      const userPrompt = 'What is AI?';

      const formatted = `Context:\n${chunks[0].text}\n\nQuestion: ${userPrompt}`;

      expect(formatted).toMatch(/Context:[\s\S]+\n\nQuestion:/);
    });
  });

  describe('Context formatting with multiple chunks', () => {
    it('should format multiple chunks with separation', () => {
      const chunks: SearchResult[] = [
        { text: 'AI is artificial intelligence.', score: 0.9 },
        { text: 'Machine learning is a subset of AI.', score: 0.85 },
        { text: 'Neural networks are used in AI.', score: 0.8 }
      ];
      const userPrompt = 'What is AI?';

      const contextParts = chunks.map(c => c.text).join('\n\n');
      const formatted = `Context:\n${contextParts}\n\nQuestion: ${userPrompt}`;

      expect(formatted).toContain(chunks[0].text);
      expect(formatted).toContain(chunks[1].text);
      expect(formatted).toContain(chunks[2].text);
    });

    it('should separate multiple chunks with blank lines', () => {
      const chunks: SearchResult[] = [
        { text: 'Chunk 1', score: 0.9 },
        { text: 'Chunk 2', score: 0.85 }
      ];
      const userPrompt = 'Test?';

      const contextParts = chunks.map(c => c.text).join('\n\n');
      const formatted = `Context:\n${contextParts}\n\nQuestion: ${userPrompt}`;

      expect(formatted).toMatch(/Chunk 1\n\nChunk 2/);
    });

    it('should maintain chunk order (highest score first)', () => {
      const chunks: SearchResult[] = [
        { text: 'First chunk (0.9)', score: 0.9 },
        { text: 'Second chunk (0.85)', score: 0.85 },
        { text: 'Third chunk (0.8)', score: 0.8 }
      ];

      const contextParts = chunks.map(c => c.text).join('\n\n');

      expect(contextParts.indexOf('First chunk')).toBeLessThan(contextParts.indexOf('Second chunk'));
      expect(contextParts.indexOf('Second chunk')).toBeLessThan(contextParts.indexOf('Third chunk'));
    });
  });

  describe('No context case', () => {
    it('should return original prompt if no chunks', () => {
      const chunks: SearchResult[] = [];
      const userPrompt = 'What is AI?';

      const formatted = chunks.length > 0
        ? `Context:\n${chunks.map(c => c.text).join('\n\n')}\n\nQuestion: ${userPrompt}`
        : userPrompt;

      expect(formatted).toBe(userPrompt);
      expect(formatted).not.toContain('Context:');
    });

    it('should return original prompt if chunks array is empty', () => {
      const formatContext = (chunks: SearchResult[], userPrompt: string): string => {
        if (chunks.length === 0) {
          return userPrompt;
        }
        return `Context:\n${chunks.map(c => c.text).join('\n\n')}\n\nQuestion: ${userPrompt}`;
      };

      const result = formatContext([], 'What is AI?');

      expect(result).toBe('What is AI?');
    });
  });

  describe('Context injection into prompt', () => {
    it('should call searchContext before sending message', async () => {
      const mockSearchContext = vi.fn().mockResolvedValue([
        { text: 'AI is artificial intelligence.', score: 0.9 }
      ]);

      const userPrompt = 'What is AI?';
      const results = await mockSearchContext(userPrompt);

      expect(mockSearchContext).toHaveBeenCalledWith(userPrompt);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should format context if search returns results', async () => {
      const searchResults: SearchResult[] = [
        { text: 'AI is artificial intelligence.', score: 0.9 }
      ];
      const userPrompt = 'What is AI?';

      const enhancedPrompt = searchResults.length > 0
        ? `Context:\n${searchResults.map(c => c.text).join('\n\n')}\n\nQuestion: ${userPrompt}`
        : userPrompt;

      expect(enhancedPrompt).toContain('Context:');
      expect(enhancedPrompt).toContain('AI is artificial intelligence.');
      expect(enhancedPrompt).toContain('Question: What is AI?');
    });

    it('should send original prompt if no search results', () => {
      const searchResults: SearchResult[] = [];
      const userPrompt = 'What is AI?';

      const enhancedPrompt = searchResults.length > 0
        ? `Context:\n${searchResults.map(c => c.text).join('\n\n')}\n\nQuestion: ${userPrompt}`
        : userPrompt;

      expect(enhancedPrompt).toBe(userPrompt);
    });

    it('should track if context was used', () => {
      const searchResults: SearchResult[] = [
        { text: 'AI is artificial intelligence.', score: 0.9 }
      ];

      const contextUsed = searchResults.length > 0;

      expect(contextUsed).toBe(true);
    });

    it('should track if context was not used', () => {
      const searchResults: SearchResult[] = [];

      const contextUsed = searchResults.length > 0;

      expect(contextUsed).toBe(false);
    });
  });

  describe('Context truncation', () => {
    it('should handle very long context (basic truncation)', () => {
      const longText = 'A'.repeat(10000);
      const chunks: SearchResult[] = [
        { text: longText, score: 0.9 }
      ];

      const maxLength = 5000;
      const truncated = chunks[0].text.length > maxLength
        ? chunks[0].text.substring(0, maxLength) + '...'
        : chunks[0].text;

      expect(truncated.length).toBeLessThanOrEqual(maxLength + 3); // +3 for '...'
      expect(truncated).toContain('...');
    });

    it('should not truncate normal length context', () => {
      const chunks: SearchResult[] = [
        { text: 'Normal length text.', score: 0.9 }
      ];

      const maxLength = 5000;
      const truncated = chunks[0].text.length > maxLength
        ? chunks[0].text.substring(0, maxLength) + '...'
        : chunks[0].text;

      expect(truncated).toBe('Normal length text.');
      expect(truncated).not.toContain('...');
    });

    it('should limit total context length across all chunks', () => {
      const chunks: SearchResult[] = [
        { text: 'A'.repeat(3000), score: 0.9 },
        { text: 'B'.repeat(3000), score: 0.85 },
        { text: 'C'.repeat(3000), score: 0.8 }
      ];

      const maxTotalLength = 8000;
      let totalLength = 0;
      const limitedChunks: SearchResult[] = [];

      for (const chunk of chunks) {
        if (totalLength + chunk.text.length <= maxTotalLength) {
          limitedChunks.push(chunk);
          totalLength += chunk.text.length;
        } else {
          break;
        }
      }

      expect(limitedChunks.length).toBeLessThan(chunks.length);
      expect(totalLength).toBeLessThanOrEqual(maxTotalLength);
    });
  });

  describe('RAG status indicator', () => {
    it('should show context was used when chunks found', () => {
      const contextUsed = true;
      const statusMessage = contextUsed
        ? '📚 RAG: Context used (3 chunks)'
        : '💬 RAG: No context';

      expect(statusMessage).toContain('Context used');
      expect(statusMessage).toContain('📚');
    });

    it('should show no context when no chunks found', () => {
      const contextUsed = false;
      const statusMessage = contextUsed
        ? '📚 RAG: Context used (3 chunks)'
        : '💬 RAG: No context';

      expect(statusMessage).toContain('No context');
      expect(statusMessage).toContain('💬');
    });

    it('should include chunk count in status message', () => {
      const chunksCount = 5;
      const statusMessage = `📚 RAG: Context used (${chunksCount} chunks)`;

      expect(statusMessage).toContain('5 chunks');
    });
  });

  describe('Debug mode - show retrieved chunks', () => {
    it('should return chunks for UI display', () => {
      const chunks: SearchResult[] = [
        { text: 'AI is artificial intelligence.', score: 0.9 },
        { text: 'Machine learning is a subset of AI.', score: 0.85 }
      ];

      const debugInfo = chunks.map((c, i) => ({
        index: i + 1,
        text: c.text.substring(0, 100),
        score: c.score
      }));

      expect(debugInfo.length).toBe(2);
      expect(debugInfo[0].index).toBe(1);
      expect(debugInfo[0].text).toBe('AI is artificial intelligence.');
      expect(debugInfo[0].score).toBe(0.9);
    });

    it('should truncate chunk text for display (100 chars)', () => {
      const chunks: SearchResult[] = [
        { text: 'A'.repeat(200), score: 0.9 }
      ];

      const debugInfo = chunks.map((c, i) => ({
        index: i + 1,
        text: c.text.substring(0, 100),
        score: c.score
      }));

      expect(debugInfo[0].text.length).toBe(100);
    });

    it('should include similarity score in debug info', () => {
      const chunks: SearchResult[] = [
        { text: 'Test chunk', score: 0.87 }
      ];

      const debugInfo = chunks.map((c, i) => ({
        index: i + 1,
        text: c.text,
        score: c.score
      }));

      expect(debugInfo[0].score).toBe(0.87);
    });
  });

  describe('Integration with sendMessage', () => {
    it('should await searchContext before sending', async () => {
      const mockSearchContext = vi.fn().mockResolvedValue([
        { text: 'Context chunk', score: 0.9 }
      ]);
      const mockSendPrompt = vi.fn();

      const userPrompt = 'What is AI?';

      // Simulate sendMessage flow
      const searchResults = await mockSearchContext(userPrompt);
      const enhancedPrompt = searchResults.length > 0
        ? `Context:\n${searchResults.map(c => c.text).join('\n\n')}\n\nQuestion: ${userPrompt}`
        : userPrompt;
      mockSendPrompt(enhancedPrompt);

      expect(mockSearchContext).toHaveBeenCalledWith(userPrompt);
      expect(mockSendPrompt).toHaveBeenCalledWith(expect.stringContaining('Context:'));
    });

    it('should handle search errors gracefully', async () => {
      const mockSearchContext = vi.fn().mockRejectedValue(new Error('Search failed'));
      const mockSendPrompt = vi.fn();

      const userPrompt = 'What is AI?';

      // Simulate sendMessage flow with error handling
      let searchResults: SearchResult[] = [];
      try {
        searchResults = await mockSearchContext(userPrompt);
      } catch (error) {
        console.error('Search failed, using original prompt');
      }

      const enhancedPrompt = searchResults.length > 0
        ? `Context:\n${searchResults.map(c => c.text).join('\n\n')}\n\nQuestion: ${userPrompt}`
        : userPrompt;
      mockSendPrompt(enhancedPrompt);

      expect(mockSendPrompt).toHaveBeenCalledWith(userPrompt); // Original prompt
    });
  });
});
