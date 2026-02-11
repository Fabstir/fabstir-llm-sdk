// Anthropic Messages → ChatML Converter
import type { AnthropicMessage, AnthropicTool, ContentBlock, ImageAttachment, ImageFormat } from './types';

const MEDIA_TYPE_MAP: Record<string, ImageFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function extractContent(
  content: string | ContentBlock[]
): { text: string; images: ImageAttachment[]; observations: string[] } {
  if (typeof content === 'string') {
    return { text: content, images: [], observations: [] };
  }

  const parts: string[] = [];
  const images: ImageAttachment[] = [];
  const observations: string[] = [];

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
        parts.push(JSON.stringify({ name: block.name, arguments: block.input }));
        break;
      case 'tool_result': {
        const resultText = typeof block.content === 'string'
          ? block.content
          : block.content.map(b => b.type === 'text' ? b.text : '').join('');
        observations.push(resultText);
        break;
      }
    }
  }

  return { text: parts.join(''), images, observations };
}

function formatToolsForPrompt(tools: AnthropicTool[]): string {
  const lines = ['# Tools'];
  for (const tool of tools) {
    const desc = tool.description?.split('\n')[0]?.slice(0, 80) || '';
    const props = tool.input_schema?.properties as Record<string, any> | undefined;
    const required = (tool.input_schema?.required as string[]) || [];
    const params = props ? required.join(', ') : '';
    lines.push(`- ${tool.name}: ${desc}${params ? ` [${params}]` : ''}`);
  }
  lines.push('');
  lines.push('IMPORTANT: To perform actions, you MUST output <tool_call> tags. Never output commands as text or code blocks.');
  lines.push('Format: <tool_call>ToolName<arg_key>param</arg_key><arg_value>value</arg_value></tool_call>');
  lines.push('Example: <tool_call>Bash<arg_key>command</arg_key><arg_value>npm install</arg_value></tool_call>');
  return lines.join('\n');
}

export function convertMessages(
  messages: AnthropicMessage[],
  system?: string,
  tools?: AnthropicTool[]
): { prompt: string; images: ImageAttachment[] } {
  if (messages.length === 0) {
    throw new Error('Messages array must not be empty');
  }

  const allImages: ImageAttachment[] = [];
  let prompt = '';

  // Build system prompt: user system prompt first, then tool injection last (recency bias)
  const systemParts: string[] = [];
  if (system) {
    // Cap system prompt — Claude Code's instructions are for Claude, not the local model
    systemParts.push(system.length > 1000 ? system.slice(0, 1000) : system);
  }
  if (tools && tools.length > 0) {
    systemParts.push(formatToolsForPrompt(tools));
  }
  if (systemParts.length > 0) {
    prompt += `<|im_start|>system\n${systemParts.join('\n\n')}\n<|im_end|>\n`;
  }

  for (const msg of messages) {
    const { text, images, observations } = extractContent(msg.content);
    allImages.push(...images);
    // Observation blocks (tool results) use <|observation|> role
    for (const obs of observations) {
      prompt += `<|im_start|>observation\n${obs}\n<|im_end|>\n`;
    }
    if (text) {
      prompt += `<|im_start|>${msg.role}\n${text}\n<|im_end|>\n`;
    }
  }

  prompt += '<|im_start|>assistant\n';

  return { prompt, images: allImages };
}

export function estimateInputTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}
