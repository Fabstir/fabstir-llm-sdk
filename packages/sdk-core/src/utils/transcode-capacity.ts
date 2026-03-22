import type { TranscodeCapacity } from '../types/transcode.types';
import { TranscodeError } from '../errors/transcode-errors';

export async function fetchTranscodeCapacity(
  hostUrl: string,
  timeoutMs?: number,
): Promise<TranscodeCapacity> {
  const base = hostUrl.replace(/\/+$/, '');
  const url = `${base}/v1/transcode/capacity`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs ?? 3000) });
  } catch (err) {
    throw new TranscodeError(
      `Failed to fetch transcode capacity from ${base}: ${(err as Error).message}`,
      'TRANSCODE_FAILED',
    );
  }

  if (!res.ok) {
    throw new TranscodeError(
      `Capacity request to ${base} returned ${res.status} ${res.statusText}`,
      'TRANSCODE_FAILED',
    );
  }

  return (await res.json()) as TranscodeCapacity;
}
