// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}