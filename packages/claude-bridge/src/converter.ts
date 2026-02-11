// Anthropic Messages → ChatML Converter
import type { AnthropicMessage, ContentBlock, ImageAttachment, ImageFormat } from './types';

const MEDIA_TYPE_MAP: Record<string, ImageFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function extractContent(
  content: string | ContentBlock[]
): { text: string; images: ImageAttachment[] } {
  if (typeof content === 'string') {
    return { text: content, images: [] };
  }

  const parts: string[] = [];
  const images: ImageAttachment[] = [];

  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push(block.text);
        break;
      case 'image': {
        const format = MEDIA_TYPE_MAP[block.source.media_type] || 'png';
        images.push({ data: block.source.data, format });
        break;
      }
      case 'tool_use':
        parts.push(`[Tool Use: ${block.name}]\n${JSON.stringify(block.input)}`);
        break;
      case 'tool_result': {
        const resultText = typeof block.content === 'string'
          ? block.content
          : block.content.map(b => b.type === 'text' ? b.text : '').join('');
        parts.push(`[Tool Result: ${block.tool_use_id}]\n${resultText}`);
        break;
      }
    }
  }

  return { text: parts.join(''), images };
}

export function convertMessages(
  messages: AnthropicMessage[],
  system?: string
): { prompt: string; images: ImageAttachment[] } {
  if (messages.length === 0) {
    throw new Error('Messages array must not be empty');
  }

  const allImages: ImageAttachment[] = [];
  let prompt = '';

  if (system) {
    prompt += `<|im_start|>system\n${system}\n<|im_end|>\n`;
  }

  for (const msg of messages) {
    const { text, images } = extractContent(msg.content);
    allImages.push(...images);
    prompt += `<|im_start|>${msg.role}\n${text}\n<|im_end|>\n`;
  }

  prompt += '<|im_start|>assistant\n';

  return { prompt, images: allImages };
}

export function estimateInputTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}
