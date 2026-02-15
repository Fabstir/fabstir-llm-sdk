import type { ImageGenerationCapabilities } from '../types/image-generation.types';

/**
 * Fetch image generation capabilities from a host's /v1/version endpoint.
 */
export async function getImageGenerationCapabilitiesFromHost(
  hostApiUrl: string
): Promise<ImageGenerationCapabilities> {
  const noCapabilities: ImageGenerationCapabilities = {
    supportsImageGeneration: false,
    supportsEncryptedWebSocket: false,
    supportsHttp: false,
    hasSafetyClassifier: false,
    hasOutputClassifier: false,
    hasBilling: false,
    hasContentHashes: false,
  };

  try {
    const response = await fetch(`${hostApiUrl}/v1/version`);
    if (!response.ok) return noCapabilities;

    const data = await response.json();
    const features = data.features as string[] | undefined;

    if (!features || features.length === 0) return noCapabilities;

    return {
      supportsImageGeneration: features.includes('image-generation'),
      supportsEncryptedWebSocket: features.includes('websocket-image-generation'),
      supportsHttp: features.includes('http-image-generation'),
      hasSafetyClassifier: features.includes('prompt-safety-classifier'),
      hasOutputClassifier: features.includes('output-safety-classifier'),
      hasBilling: features.includes('image-generation-billing'),
      hasContentHashes: features.includes('image-content-hashes'),
    };
  } catch {
    return noCapabilities;
  }
}
