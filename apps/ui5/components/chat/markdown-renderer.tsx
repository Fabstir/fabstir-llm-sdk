'use client';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Convert LaTeX-style math delimiters to markdown-style
 * remarkMath expects $...$ and $$...$$ but AI sends \(...\) and \[...\]
 */
function convertLatexDelimiters(content: string): string {
  // Convert display math: \[...\] → $$...$$
  // Use callback function to avoid dollar sign escaping hell
  content = content.replace(/\\\[([\s\S]*?)\\\]/g, (match, equation) => {
    return `$$${equation}$$`;
  });

  // Convert inline math: \(...\) → $...$
  content = content.replace(/\\\(([\s\S]*?)\\\)/g, (match, equation) => {
    return `$${equation}$`;
  });

  return content;
}

/**
 * MarkdownRenderer - Renders markdown with LaTeX math support
 *
 * Supports:
 * - GitHub Flavored Markdown (tables, strikethrough, task lists, etc.)
 * - Inline math: \(...\) or $...$
 * - Block math: \[...\] or $$...$$
 * - Code blocks with syntax highlighting
 * - Links, images, lists, blockquotes, etc.
 */
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  // Convert LaTeX-style delimiters to markdown-style for remarkMath
  const processedContent = convertLatexDelimiters(content);

  // Debug logging (uncomment for troubleshooting)
  // if (content.includes('Einstein') || content.includes('boxed')) {
  //   console.debug('[MarkdownRenderer] Original:', content.substring(0, 300));
  //   console.debug('[MarkdownRenderer] Converted:', processedContent.substring(0, 300));
  // }

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Style code blocks
          code: ({ node, inline, className, children, ...props }: any) => {
            return inline ? (
              <code
                className="bg-gray-800 bg-opacity-10 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            ) : (
              <pre className="bg-gray-800 bg-opacity-10 rounded-lg p-3 overflow-x-auto my-2">
                <code className="text-sm font-mono" {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          // Style links
          a: ({ node, children, ...props }: any) => (
            <a
              className="text-blue-600 hover:text-blue-800 underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          // Style lists
          ul: ({ node, children, ...props }: any) => (
            <ul className="list-disc list-inside my-2 space-y-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ node, children, ...props }: any) => (
            <ol className="list-decimal list-inside my-2 space-y-1" {...props}>
              {children}
            </ol>
          ),
          // Style blockquotes
          blockquote: ({ node, children, ...props }: any) => (
            <blockquote
              className="border-l-4 border-gray-300 pl-4 my-2 italic text-gray-700"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // Style tables (GitHub Flavored Markdown)
          table: ({ node, children, ...props }: any) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border border-gray-300" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ node, children, ...props }: any) => (
            <th className="border border-gray-300 px-3 py-2 bg-gray-100 font-semibold text-left" {...props}>
              {children}
            </th>
          ),
          td: ({ node, children, ...props }: any) => (
            <td className="border border-gray-300 px-3 py-2" {...props}>
              {children}
            </td>
          ),
          // Style paragraphs
          p: ({ node, children, ...props }: any) => (
            <p className="my-2 last:mb-0" {...props}>
              {children}
            </p>
          ),
          // Style headings
          h1: ({ node, children, ...props }: any) => (
            <h1 className="text-2xl font-bold my-3" {...props}>
              {children}
            </h1>
          ),
          h2: ({ node, children, ...props }: any) => (
            <h2 className="text-xl font-bold my-3" {...props}>
              {children}
            </h2>
          ),
          h3: ({ node, children, ...props }: any) => (
            <h3 className="text-lg font-bold my-2" {...props}>
              {children}
            </h3>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
