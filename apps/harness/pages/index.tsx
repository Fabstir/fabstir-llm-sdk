// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { NextPage } from 'next';
import Link from 'next/link';

const Home: NextPage = () => {
  return (
    <main style={{ padding: '24px', fontFamily: 'system-ui' }}>
      <h1>Fabstir Harness</h1>
      <p>Browser testing harness for gasless transactions on Base Sepolia.</p>
      <div>
        <p>Chain: Base Sepolia (ID: {process.env.NEXT_PUBLIC_CHAIN_ID})</p>
        <p>Ready for wallet integration.</p>
      </div>
      
      <div style={{ marginTop: '32px' }}>
        <h2>Available Demos</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '12px' }}>
            <Link href="/run" style={{ color: '#0052cc', textDecoration: 'none', fontSize: '18px' }}>
              → Basic Batch Transaction Demo
            </Link>
          </li>
          <li style={{ marginBottom: '12px' }}>
            <Link href="/usdc-demo" style={{ color: '#0052cc', textDecoration: 'none', fontSize: '18px' }}>
              → USDC Demo (Session Jobs with Gasless Transactions)
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
};

export default Home;