'use client';

import { useEffect, useState } from 'react';

/**
 * AppReadyMarker Component
 *
 * Indicates when React has fully hydrated and is ready for interactions.
 * Used in Playwright tests to avoid clicking before React event handlers are attached.
 *
 * Usage in tests:
 * await page.getByTestId("app-ready").waitFor();
 */
export function AppReadyMarker() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    console.debug('[AppReadyMarker] React hydration complete');
    setReady(true);
  }, []);

  if (!ready) return null;

  return <div data-testid="app-ready" style={{ display: 'none' }} />;
}
