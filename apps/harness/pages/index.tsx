import type { NextPage } from 'next';

const Home: NextPage = () => {
  return (
    <main style={{ padding: '24px', fontFamily: 'system-ui' }}>
      <h1>Fabstir Harness</h1>
      <p>Browser testing harness for gasless transactions on Base Sepolia.</p>
      <div>
        <p>Chain: Base Sepolia (ID: {process.env.NEXT_PUBLIC_CHAIN_ID})</p>
        <p>Ready for wallet integration.</p>
      </div>
    </main>
  );
};

export default Home;