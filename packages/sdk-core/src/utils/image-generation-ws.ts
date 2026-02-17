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
    timeoutMs = 120000,
  } = params;

  console.warn(`[SDK:imageWs:1] ENTER sessionId=${sessionId} prompt="${prompt.substring(0, 50)}..." msgIdx=${messageIndex.value} timeout=${timeoutMs}ms`);

  // Client-side validation
  if (!prompt || prompt.trim().length === 0) {
    console.error(`[SDK:imageWs:2] VALIDATION_FAILED: empty prompt`);
    throw new ImageGenerationError('Prompt cannot be empty', 'VALIDATION_FAILED');
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    console.error(`[SDK:imageWs:2] VALIDATION_FAILED: prompt too long (${prompt.length} > ${MAX_PROMPT_LENGTH})`);
    throw new ImageGenerationError(
      `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
      'VALIDATION_FAILED',
    );
  }
  if (options?.size && !isValidImageSize(options.size)) {
    console.error(`[SDK:imageWs:2] VALIDATION_FAILED: invalid size ${options.size}`);
    throw new ImageGenerationError(
      `Invalid image size: ${options.size}`,
      'VALIDATION_FAILED',
    );
  }
  if (options?.steps !== undefined && (options.steps < 1 || options.steps > 100)) {
    console.error(`[SDK:imageWs:2] VALIDATION_FAILED: steps ${options.steps} out of range`);
    throw new ImageGenerationError(
      'Steps must be between 1 and 100',
      'VALIDATION_FAILED',
    );
  }

  // Check rate limiter
  if (!rateLimiter.canGenerate()) {
    console.error(`[SDK:imageWs:3] RATE_LIMIT_EXCEEDED`);
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

  console.warn(`[SDK:imageWs:4] Inner payload: action=${innerPayload.action} size=${innerPayload.size} steps=${innerPayload.steps}`);

  // Encrypt payload
  const encrypted = encryptionManager.encryptMessage(
    sessionKey,
    JSON.stringify(innerPayload),
    messageIndex.value++,
  );
  console.warn(`[SDK:imageWs:5] Encrypted OK, msgIdx now=${messageIndex.value}`);

  // Build envelope
  const envelope = {
    type: 'encrypted_message',
    session_id: sessionId,
    id: `img-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    payload: encrypted,
  };
  console.warn(`[SDK:imageWs:6] Envelope built: type=${envelope.type} session_id=${envelope.session_id} id=${envelope.id}`);

  // Send and wait for response
  return new Promise<ImageGenerationResult>((resolve, reject) => {
    let isResolved = false;

    const safeResolve = (result: ImageGenerationResult) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        unsubscribe();
        rateLimiter.recordRequest();
        console.warn(`[SDK:imageWs:9] RESOLVED OK size=${result.size} seed=${result.seed}`);
        resolve(result);
      }
    };

    const safeReject = (err: Error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        unsubscribe();
        console.error(`[SDK:imageWs:10] REJECTED: ${err.message}`);
        reject(err);
      }
    };

    const timeout = setTimeout(() => {
      console.error(`[SDK:imageWs:11] TIMEOUT after ${timeoutMs}ms waiting for image response`);
      safeReject(new ImageGenerationError('Image generation timed out', 'IMAGE_GENERATION_FAILED'));
    }, timeoutMs);

    const unsubscribe = wsClient.onMessage((data: any) => {
      if (isResolved) return;

      console.warn(`[SDK:imageWs:7] Received message type=${data.type} hasPayload=${!!data.payload}`);

      if (data.type === 'encrypted_response' && data.payload) {
        try {
          const decrypted = encryptionManager.decryptMessage(sessionKey, data.payload);
          const parsed = JSON.parse(decrypted);
          console.warn(`[SDK:imageWs:8] Decrypted response: type=${parsed.type}`);

          if (parsed.type === 'image_generation_result') {
            // Extract the result without the internal 'type' field
            const { type: _type, ...result } = parsed;
            safeResolve(result as ImageGenerationResult);
          } else if (parsed.type === 'image_generation_error') {
            console.error(`[SDK:imageWs:8b] Image gen error from node: ${parsed.error || parsed.message}`);
            safeReject(
              new ImageGenerationError(
                parsed.error || parsed.message || 'Image generation failed',
                (parsed.error_code || parsed.code || 'IMAGE_GENERATION_FAILED') as ImageGenerationErrorCode,
              ),
            );
          } else {
            console.warn(`[SDK:imageWs:8c] Unexpected decrypted type: ${parsed.type} (ignoring)`);
          }
        } catch (err: any) {
          console.error(`[SDK:imageWs:8d] Decrypt/parse failed: ${err.message}`);
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
        console.error(`[SDK:imageWs:7b] Node error: ${data.message}`);
        safeReject(
          new ImageGenerationError(
            data.message || 'Image generation failed',
            'IMAGE_GENERATION_FAILED',
          ),
        );
      }
    });

    // Send the encrypted message
    console.warn(`[SDK:imageWs:6b] Sending encrypted_message via sendWithoutResponse...`);
    wsClient.sendWithoutResponse(envelope).then(() => {
      console.warn(`[SDK:imageWs:6c] Encrypted message sent OK, waiting for response...`);
    }).catch((err: any) => {
      console.error(`[SDK:imageWs:6d] sendWithoutResponse FAILED: ${err.message}`);
      safeReject(new ImageGenerationError(
        `Failed to send image generation request: ${err.message}`,
        'ENCRYPTION_FAILED',
      ));
    });
  });
}
