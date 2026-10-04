// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * `promise`, or `onTimeout()`'s error once `ms` have passed — whichever comes first. The work itself is not stopped
 * (abort it separately where it can be); this only bounds how long a caller waits (§24 EE4).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(onTimeout()), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * `fetch` that gives up — aborting the request — after `ms`: a server that never answers fails instead of holding its
 * caller (§24 EE4; §30 KK1). The bound ends with the headers unless `read` is given: then the body is read under it too
 * (§31 LL1) — a server that sends its headers and stalls its body fails as well. No `AbortSignal.timeout` (Safari < 16).
 */
export async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response>;
export async function fetchWithTimeout<T>(url: string, init: RequestInit, ms: number, read: (response: Response) => Promise<T>): Promise<T>;
export async function fetchWithTimeout<T>(url: string, init: RequestInit, ms: number, read?: (response: Response) => Promise<T>): Promise<Response | T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return read ? await read(response) : response;
  } finally {
    clearTimeout(timer);
  }
}
