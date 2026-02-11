// Anthropic Messages API Types for Claude Bridge

export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp';

export interface ImageAttachment {
  data: string;
  format: ImageFormat;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageSource {
  type: 'base64';
  media_type: string;
  data: string;
}

export interface ImageBlock {
  type: 'image';
  source: ImageSource;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
}

export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

export interface AnthropicMessage {
  role: string;
  content: string | ContentBlock[];
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: Record<string, any>;
}

export interface ResponseBlock {
  type: 'text';
  text: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: string;
  content: ResponseBlock[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: Usage;
}

export interface AnthropicError {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

export interface MessageStartData {
  type: 'message_start';
  message: AnthropicResponse;
}

export interface ContentBlockStartData {
  type: 'content_block_start';
  index: number;
  content_block: { type: 'text'; text: string };
}

export interface ContentBlockDeltaData {
  type: 'content_block_delta';
  index: number;
  delta: { type: 'text_delta'; text: string };
}

export interface ContentBlockStopData {
  type: 'content_block_stop';
  index: number;
}

export interface MessageDeltaData {
  type: 'message_delta';
  delta: { stop_reason: string; stop_sequence: string | null };
  usage: { output_tokens: number };
}

export interface MessageStopData {
  type: 'message_stop';
}
