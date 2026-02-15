/**
 * @fileoverview WebSocket-based encrypted image generation utility
 *
 * Standalone function for generating images via encrypted WebSocket.
 * Used by SessionManager.generateImage().
 */

import type { ImageGenerationOptions, ImageGenerationResult, ImageGenerationErrorCode } from '../types/image-generation.types';
import { isValidImageSize, MAX_PROMPT_LENGTH } from '../types/image-generation.types';
import { ImageGenerationError } from '../errors/image-generation-errors';

/** Parameters for generateImageWs */
export interface GenerateImageWsParams {
  wsClient: {
    sendWithoutResponse(data: any): Promise<void>;
    onMessage(handler: (data: any) => void): () => void;
  };
  encryptionManager: {
    encryptMessage(key: Uint8Array, plaintext: string, index: number): {
      ciphertextHex: string;
      nonceHex: string;
      aadHex: string;
    };
    decryptMessage(key: Uint8Array, payload: any): string;
  };
  rateLimiter: {
    canGenerate(): boolean;
    recordRequest(): void;
    getTimeUntilNextSlot(): number;
  };
  sessionId: string;
  sessionKey: Uint8Array;
  messageIndex: { value: number };
  prompt: string;
  options?: ImageGenerationOptions;
  timeoutMs?: number;
}

/**
 * Generate an image via encrypted WebSocket message.
 *
 * @param params - Generation parameters including WS client and encryption
 * @returns Promise resolving to ImageGenerationResult
 */
export async function generateImageWs(params: GenerateImageWsParams): Promise<ImageGenerationResult> {
  const {
    wsClient,
    encryptionManager,
    rateLimiter,
    sessionId,
    sessionKey,
    messageIndex,
    prompt,
    options,
    timeoutMs = 30000,
  } = params;

  // Client-side validation
  if (!prompt || prompt.trim().length === 0) {
    throw new ImageGenerationError('Prompt cannot be empty', 'VALIDATION_FAILED');
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ImageGenerationError(
      `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
      'VALIDATION_FAILED',
    );
  }
  if (options?.size && !isValidImageSize(options.size)) {
    throw new ImageGenerationError(
      `Invalid image size: ${options.size}`,
      'VALIDATION_FAILED',
    );
  }
  if (options?.steps !== undefined && (options.steps < 1 || options.steps > 100)) {
    throw new ImageGenerationError(
      'Steps must be between 1 and 100',
      'VALIDATION_FAILED',
    );
  }

  // Check rate limiter
  if (!rateLimiter.canGenerate()) {
    throw new ImageGenerationError(
      'Rate limit exceeded for image generation',
      'RATE_LIMIT_EXCEEDED',
      rateLimiter.getTimeUntilNextSlot(),
    );
  }

  // Build inner payload
  const innerPayload: Record<string, unknown> = {
    action: 'image_generation',
    prompt,
    size: options?.size || '1024x1024',
    steps: options?.steps || 4,
    safetyLevel: options?.safetyLevel || 'strict',
    chainId: options?.chainId || 84532,
  };
  if (options?.model) innerPayload.model = options.model;
  if (options?.seed !== undefined) innerPayload.seed = options.seed;
  if (options?.negativePrompt) innerPayload.negativePrompt = options.negativePrompt;
  if (options?.guidanceScale !== undefined) innerPayload.guidanceScale = options.guidanceScale;

  // Encrypt payload
  const encrypted = encryptionManager.encryptMessage(
    sessionKey,
    JSON.stringify(innerPayload),
    messageIndex.value++,
  );

  // Build envelope
  const envelope = {
    type: 'encrypted_message',
    session_id: sessionId,
    id: `img-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    payload: encrypted,
  };

  // Send and wait for response
  return new Promise<ImageGenerationResult>((resolve, reject) => {
    let isResolved = false;

    const safeResolve = (result: ImageGenerationResult) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        unsubscribe();
        rateLimiter.recordRequest();
        resolve(result);
      }
    };

    const safeReject = (err: Error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        unsubscribe();
        reject(err);
      }
    };

    const timeout = setTimeout(() => {
      safeReject(new ImageGenerationError('Image generation timed out', 'IMAGE_GENERATION_FAILED'));
    }, timeoutMs);

    const unsubscribe = wsClient.onMessage((data: any) => {
      if (isResolved) return;

      if (data.type === 'encrypted_response' && data.payload) {
        try {
          const decrypted = encryptionManager.decryptMessage(sessionKey, data.payload);
          const parsed = JSON.parse(decrypted);

          if (parsed.type === 'image_generation_result') {
            // Extract the result without the internal 'type' field
            const { type: _type, ...result } = parsed;
            safeResolve(result as ImageGenerationResult);
          } else if (parsed.type === 'image_generation_error') {
            safeReject(
              new ImageGenerationError(
                parsed.error || parsed.message || 'Image generation failed',
                (parsed.error_code || parsed.code || 'IMAGE_GENERATION_FAILED') as ImageGenerationErrorCode,
              ),
            );
          }
        } catch (err: any) {
          if (err instanceof ImageGenerationError) {
            safeReject(err);
          } else {
            safeReject(new ImageGenerationError(
              `Failed to process image response: ${err.message}`,
              'IMAGE_GENERATION_FAILED',
            ));
          }
        }
      } else if (data.type === 'error') {
        safeReject(
          new ImageGenerationError(
            data.message || 'Image generation failed',
            'IMAGE_GENERATION_FAILED',
          ),
        );
      }
    });

    // Send the encrypted message
    wsClient.sendWithoutResponse(envelope).catch((err: any) => {
      safeReject(new ImageGenerationError(
        `Failed to send image generation request: ${err.message}`,
        'ENCRYPTION_FAILED',
      ));
    });
  });
}
