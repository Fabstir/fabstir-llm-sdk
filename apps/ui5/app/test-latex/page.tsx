'use client';

import { MarkdownRenderer } from '@/components/chat/markdown-renderer';

/**
 * Test page for LaTeX rendering
 * No wallet connection required - just renders sample LaTeX equations
 */
export default function TestLatexPage() {
  const testMessages = [
    {
      title: "Inline Math (Einstein's Equation)",
      content: "Einstein's famous equation is \\(E = mc^2\\), which relates energy to mass."
    },
    {
      title: "Block Math (Quadratic Formula)",
      content: "The quadratic formula is:\n\n\\[x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\]"
    },
    {
      title: "Dollar Syntax Inline",
      content: "The Pythagorean theorem states that $a^2 + b^2 = c^2$ for right triangles."
    },
    {
      title: "Dollar Syntax Block",
      content: "Maxwell's equations:\n\n$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\epsilon_0}$$"
    },
    {
      title: "Complex Math (Schrödinger)",
      content: "The time-dependent Schrödinger equation:\n\n\\[i\\hbar\\frac{\\partial}{\\partial t}\\Psi(\\mathbf{r},t) = \\hat{H}\\Psi(\\mathbf{r},t)\\]"
    },
    {
      title: "Mixed Content",
      content: "Consider a function $f(x) = x^2$. The derivative is:\n\n\\[\\frac{df}{dx} = 2x\\]\n\nThis is a fundamental result in calculus."
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            LaTeX Rendering Test
          </h1>
          <p className="text-gray-600">
            Testing mathematical equation rendering with KaTeX
          </p>
        </div>

        <div className="space-y-6">
          {testMessages.map((msg, idx) => (
            <div key={idx} className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-3">
                {idx + 1}. {msg.title}
              </h2>
              <div className="bg-gray-100 rounded-lg p-4 mb-4">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {msg.content}
                </pre>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-medium text-gray-600 mb-2">Rendered Output:</p>
                <div className="bg-blue-50 rounded-lg p-4">
                  <MarkdownRenderer content={msg.content} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">
            ✅ What to Look For:
          </h3>
          <ul className="list-disc list-inside text-yellow-800 space-y-1">
            <li>Inline math should have proper superscripts: E = mc²</li>
            <li>Block math should be centered and larger</li>
            <li>Fractions should render with proper horizontal lines</li>
            <li>Greek letters (∇, ρ, ε) should display correctly</li>
            <li>Square roots should have proper radical symbols (√)</li>
            <li>Math should NOT show raw LaTeX syntax like \(...\) or $$...$$</li>
          </ul>
        </div>

        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-900 mb-2">
            ❌ Signs of Broken LaTeX:
          </h3>
          <ul className="list-disc list-inside text-red-800 space-y-1">
            <li>Seeing raw \(...\) or $$...$$ delimiters</li>
            <li>Backslashes visible in equations</li>
            <li>Plain text "E = mc^2" instead of proper superscript</li>
            <li>Fractions displayed as "a / b" instead of stacked</li>
            <li>Missing KaTeX styling (no proper font, spacing)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
