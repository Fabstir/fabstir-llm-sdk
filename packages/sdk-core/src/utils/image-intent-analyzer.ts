/** Image generation intent analyzer — detects intent and extracts parameters from prompts. */

import { ALLOWED_IMAGE_SIZES, type ImageSize, type ImageGenerationOptions } from '../types/image-generation.types';
import { hasRagContext } from './rag-prompt';

export interface ImageIntentResult {
  isImageIntent: boolean;
  cleanPrompt?: string;
  extractedOptions?: ImageGenerationOptions;
}

/** Trigger patterns — must match at START of prompt (after optional polite prefix). */
const IMAGE_TRIGGERS: RegExp[] = [
  /^(?:please\s+|can\s+you\s+)?generate\s+(?:an?\s+)?image/i,
  /^(?:please\s+|can\s+you\s+)?draw\s+(?:me\s+)?\w/i,
  /^(?:please\s+|can\s+you\s+)?create\s+(?:an?\s+)?(?:picture|image|illustration)/i,
  /^(?:please\s+|can\s+you\s+)?paint\s+(?:me\s+)?\w/i,
  /^(?:please\s+|can\s+you\s+)?sketch\s+(?:me\s+)?\w/i,
  /^(?:please\s+|can\s+you\s+)?make\s+(?:an?\s+)?image/i,
  /^(?:please\s+|can\s+you\s+)?render\s+\w/i,
];

const SIZE_PATTERN = /(\d{3,4})x(\d{3,4})/i;
const STEPS_PATTERN = /(\d{1,3})\s*steps?/i;

/** Extracts the last user message from multi-turn prompt formats, and where its turn starts in the prompt */
function extractLastUserMessage(prompt: string): { text: string; start: number } {
  // Harmony format: <|start|>user<|message|>CONTENT<|end|>
  const harmonyMatches = [...prompt.matchAll(/<\|start\|>user<\|message\|>([\s\S]*?)<\|end\|>/g)];
  const last = harmonyMatches.length > 0 ? harmonyMatches[harmonyMatches.length - 1]
    // "User: ..." format: last occurrence
    : [...prompt.matchAll(/(?:^|\n)User:\s*([\s\S]*?)(?=\nAssistant:|\n<|$)/gi)].pop();
  return last ? { text: last[1].trim(), start: last.index! } : { text: prompt, start: 0 };
}

/** Strips trigger prefix, size, steps, and filler words from prompt */
function extractCleanPrompt(prompt: string): string {
  let clean = prompt;
  clean = clean.replace(/^(?:please\s+|can\s+you\s+)/i, '');
  clean = clean.replace(/^(?:generate|draw|create|paint|sketch|make|render)\s+/i, '');
  clean = clean.replace(/^(?:me\s+)/i, '');
  clean = clean.replace(/^(?:an?\s+)?(?:image|picture|illustration)\s+(?:of\s+)?/i, '');
  clean = clean.replace(/\s*(?:in\s+)?\d{3,4}x\d{3,4}\s*(?:resolution|res|px)?\s*/gi, '');
  clean = clean.replace(/\s*(?:with\s+)?\d{1,3}\s*steps?\s*/gi, '');
  clean = clean.replace(/[\s,.?!]+$/g, '').trim();
  return clean;
}

/**
 * Analyzes a prompt to detect image generation intent and extract parameters.
 * @param prompt - The user's prompt text
 * @returns ImageIntentResult with detection status, cleaned prompt, and options
 */
export function analyzePromptForImageIntent(prompt: string): ImageIntentResult {
  if (!prompt || prompt.trim().length === 0) {
    return { isImageIntent: false };
  }
  // Extract last user message from multi-turn prompts (User:/Assistant: or Harmony format)
  const { text: lastMessage, start } = extractLastUserMessage(prompt);
  // Never on a turn that carries RAG context: a document could have forged it (1.39.2). The block's end marker
  // follows any turn forged inside it; a block in an earlier turn of the history does not count, and a user turn
  // after the block is analysed as before. (A request written BEFORE the block, in the same turn, now stands down.)
  if (hasRagContext(prompt, start)) {
    return { isImageIntent: false };
  }
  const isImageIntent = IMAGE_TRIGGERS.some((trigger) => trigger.test(lastMessage));
  if (!isImageIntent) {
    return { isImageIntent: false };
  }

  const extractedOptions: ImageGenerationOptions = {};
  const sizeMatch = lastMessage.match(SIZE_PATTERN);
  if (sizeMatch) {
    const sizeStr = `${sizeMatch[1]}x${sizeMatch[2]}`;
    if ((ALLOWED_IMAGE_SIZES as readonly string[]).includes(sizeStr)) {
      extractedOptions.size = sizeStr as ImageSize;
    }
  }
  const stepsMatch = lastMessage.match(STEPS_PATTERN);
  if (stepsMatch) {
    const steps = parseInt(stepsMatch[1], 10);
    if (steps >= 1 && steps <= 100) extractedOptions.steps = steps;
  }

  const cleanPrompt = extractCleanPrompt(lastMessage);
  return {
    isImageIntent: true,
    cleanPrompt: cleanPrompt || lastMessage,
    extractedOptions: Object.keys(extractedOptions).length > 0 ? extractedOptions : undefined,
  };
}
