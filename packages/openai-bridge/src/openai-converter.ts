import type { OpenAIChatMessage, OpenAITool, OpenAIContentPart, ImageAttachment } from './types';

const MEDIA_TYPE_MAP: Record<string, ImageAttachment['format']> = {
  'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp',
};

async function fetchImageAsBase64(url: string): Promise<ImageAttachment | null> {
  try {
    const res = await globalThis.fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    const format = MEDIA_TYPE_MAP[ct] || 'png';
    const buf = await res.arrayBuffer();
    const data = Buffer.from(buf).toString('base64');
    return { data, format };
  } catch { return null; }
}

async function extractContent(content: string | OpenAIContentPart[] | null): Promise<{ text: string; images: ImageAttachment[] }> {
  if (content === null) return { text: '', images: [] };
  if (typeof content === 'string') return { text: content, images: [] };

  const parts: string[] = [];
  const images: ImageAttachment[] = [];
  const fetches: Promise<void>[] = [];
  for (const part of content) {
    if (part.type === 'text' && part.text) {
      parts.push(part.text);
    } else if (part.type === 'image_url' && part.image_url) {
      const url = part.image_url.url;
      const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        const format = MEDIA_TYPE_MAP[match[1]] || 'png';
        images.push({ data: match[2], format });
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        fetches.push(fetchImageAsBase64(url).then(img => { if (img) images.push(img); }));
      }
    }
  }
  if (fetches.length > 0) await Promise.all(fetches);
  return { text: parts.join(''), images };
}

function formatToolsForPrompt(tools: OpenAITool[]): string {
  const lines = ['# Tools'];
  for (const tool of tools) {
    const desc = tool.function.description?.split('\n')[0]?.slice(0, 80) || '';
    const params = tool.function.parameters?.required?.join(', ') || '';
    lines.push(`- ${tool.function.name}: ${desc}${params ? ` [${params}]` : ''}`);
  }
  lines.push('');
  lines.push('IMPORTANT: To perform actions, you MUST output <tool_call> tags.');
  lines.push('Format: <tool_call>ToolName<arg_key>param</arg_key><arg_value>value</arg_value></tool_call>');
  lines.push('Example: <tool_call>Bash<arg_key>command</arg_key><arg_value>npm install</arg_value></tool_call>');
  return lines.join('\n');
}

export async function convertOpenAIMessages(
  messages: OpenAIChatMessage[],
  tools?: OpenAITool[]
): Promise<{ prompt: string; images: ImageAttachment[] }> {
  const allImages: ImageAttachment[] = [];
  let prompt = '';

  // Separate system messages and build system block
  const systemParts: string[] = [];
  const nonSystemMessages: OpenAIChatMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      systemParts.push(content.length > 1000 ? content.slice(0, 1000) : content);
    } else {
      nonSystemMessages.push(msg);
    }
  }
  if (tools && tools.length > 0) systemParts.push(formatToolsForPrompt(tools));
  if (systemParts.length > 0) {
    prompt += `<|im_start|>system\n${systemParts.join('\n\n')}\n<|im_end|>\n`;
  }

  for (const msg of nonSystemMessages) {
    if (msg.role === 'tool') {
      const text = typeof msg.content === 'string' ? msg.content : '';
      prompt += `<|im_start|>observation\n${text}\n<|im_end|>\n`;
      continue;
    }

    const { text, images } = await extractContent(msg.content);
    allImages.push(...images);

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const toolText = msg.tool_calls.map(tc =>
        `<tool_call>${tc.function.name}<arg_key>arguments</arg_key><arg_value>${tc.function.arguments}</arg_value></tool_call>`
      ).join('');
      prompt += `<|im_start|>assistant\n${text}${toolText}\n<|im_end|>\n`;
    } else if (text) {
      prompt += `<|im_start|>${msg.role}\n${text}\n<|im_end|>\n`;
    }
  }

  prompt += '<|im_start|>assistant\n';
  return { prompt, images: allImages };
}

export function estimateInputTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}
