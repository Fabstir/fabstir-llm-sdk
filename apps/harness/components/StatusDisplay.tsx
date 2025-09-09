import React from 'react';

type Status = 'idle' | 'pending' | 'success' | 'error';

interface StatusDisplayProps {
  status: Status;
  message?: string;
  transactionHash?: string;
}

export function StatusDisplay({ status, message, transactionHash }: StatusDisplayProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'pending': return '⏳';
      case 'success': return '✓';
      case 'error': return '✗';
      default: return '•';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'pending': return '#ff9800';
      case 'success': return '#4caf50';
      case 'error': return '#f44336';
      default: return '#666';
    }
  };

  const getStatusMessage = () => {
    if (message) return message;
    switch (status) {
      case 'pending': return 'Submitting transaction...';
      case 'success': return 'Transaction successful!';
      case 'error': return 'Transaction failed';
      default: return 'Ready to start';
    }
  };

  return (
    <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '24px' }}>{getStatusIcon()}</span>
        <span style={{ color: getStatusColor(), fontWeight: 'bold' }}>
          {getStatusMessage()}
        </span>
      </div>
      {transactionHash && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
          TX: {transactionHash}
        </div>
      )}
    </div>
  );
}