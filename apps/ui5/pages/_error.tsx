import { NextPageContext } from 'next';

interface ErrorProps {
  statusCode?: number;
}

function Error({ statusCode }: ErrorProps) {
  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      margin: 0,
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '4rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '1rem' }}>
          {statusCode || 'Error'}
        </h1>
        <p style={{ color: '#6b7280' }}>
          {statusCode
            ? `A ${statusCode} error occurred on the server`
            : 'An error occurred on the client'}
        </p>
      </div>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
