/**
 * Demo page for unified payment flow
 * Handles both EOA and Smart Wallet users seamlessly
 */

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

interface WalletInfo {
  address: string;
  type: 'eoa' | 'smart';
  signer: ethers.Signer;
  balance?: string;
  hasUSDC?: boolean;
}

interface PaymentMethod {
  type: 'usdc' | 'credit-card';
  available: boolean;
  label: string;
  icon: string;
}

function UnifiedPaymentFlow() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<'usdc' | 'credit-card' | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [conversation, setConversation] = useState<string[]>([]);
  const [showWalletSelector, setShowWalletSelector] = useState(false);

  /**
   * Detect wallet type (EOA vs Smart Wallet)
   */
  async function detectWalletType(signer: ethers.Signer): Promise<'eoa' | 'smart'> {
    const address = await signer.getAddress();
    
    // Method 1: Check if address is a contract (smart wallets are contracts)
    if ('provider' in signer && signer.provider) {
      const code = await (signer.provider as ethers.Provider).getCode(address);
      if (code !== '0x') {
        return 'smart';
      }
    }
    
    // Method 2: Check for Coinbase Smart Wallet
    if (typeof window !== 'undefined' && window.ethereum) {
      if ((window.ethereum as any).isCoinbaseWallet && 
          (window.ethereum as any).isSmartWallet) {
        return 'smart';
      }
    }
    
    return 'eoa';
  }

  /**
   * Detect available wallets
   */
  function detectAvailableWallets() {
    const wallets = [];
    
    // Check for MetaMask
    if (window.ethereum?.isMetaMask) {
      wallets.push({
        name: 'MetaMask',
        icon: '🦊',
        provider: window.ethereum
      });
    }
    
    // Check for Coinbase Wallet
    if (window.ethereum?.isCoinbaseWallet || window.coinbaseWalletExtension) {
      wallets.push({
        name: 'Coinbase Wallet',
        icon: '💙',
        provider: window.ethereum?.isCoinbaseWallet ? window.ethereum : window.coinbaseWalletExtension
      });
    }
    
    // Check for generic injected wallet
    if (window.ethereum && wallets.length === 0) {
      wallets.push({
        name: 'Injected Wallet',
        icon: '👛',
        provider: window.ethereum
      });
    }
    
    return wallets;
  }

  /**
   * Connect any wallet type
   */
  async function connectWallet(specificProvider?: any) {
    setIsConnecting(true);
    try {
      let provider;
      
      if (specificProvider) {
        // Use specific wallet provider
        provider = new ethers.BrowserProvider(specificProvider);
      } else if (!window.ethereum) {
        // No wallet detected, redirect to Coinbase Wallet creation
        window.open('https://www.coinbase.com/wallet', '_blank');
        return;
      } else {
        // Use default provider
        provider = new ethers.BrowserProvider(window.ethereum);
      }

      // Request connection
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const type = await detectWalletType(signer);
      
      // Simulate USDC balance check
      let balance = '0';
      let hasUSDC = false;
      
      if (type === 'eoa') {
        // Simulate some EOA wallets having USDC
        const random = Math.random();
        if (random > 0.5) {
          balance = '2.50';
          hasUSDC = true;
        }
      }
      
      // Set wallet info
      const walletInfo: WalletInfo = {
        address,
        type,
        signer,
        balance,
        hasUSDC
      };
      
      setWallet(walletInfo);
      
      // Determine available payment methods
      const methods: PaymentMethod[] = [];
      
      if (type === 'smart') {
        // Smart wallet can use credit card
        methods.push({
          type: 'credit-card',
          available: true,
          label: 'Credit Card',
          icon: '💳'
        });
      }
      
      // Both can use USDC if they have it
      methods.push({
        type: 'usdc',
        available: hasUSDC,
        label: hasUSDC ? `USDC (${balance} available)` : 'USDC (insufficient balance)',
        icon: '🪙'
      });
      
      setPaymentMethods(methods);
      
      // Auto-select best payment method
      if (type === 'smart') {
        setSelectedMethod('credit-card');
      } else if (hasUSDC) {
        setSelectedMethod('usdc');
      }
      
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert('Failed to connect wallet. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  }

  /**
   * Start AI session with selected payment method
   */
  async function startSession() {
    if (!wallet || !selectedMethod) return;
    
    try {
      if (selectedMethod === 'credit-card') {
        // For credit card, initiate Coinbase Pay
        await initiateCardPayment();
      } else {
        // For USDC, use existing balance
        await startUSDCSession();
      }
    } catch (error) {
      console.error('Failed to start session:', error);
      alert('Failed to start session. Please try again.');
    }
  }

  /**
   * Initiate credit card payment via Coinbase Pay
   */
  async function initiateCardPayment() {
    // This would integrate with Coinbase Commerce or Coinbase Pay SDK
    alert('Credit card payment would open here (Coinbase Pay integration)');
    
    // Simulate successful payment
    setTimeout(() => {
      startUSDCSession();
    }, 2000);
  }

  /**
   * Start session with USDC
   */
  async function startUSDCSession() {
    if (!wallet) return;
    
    console.log('Creating session with USDC...');
    
    setSessionActive(true);
    setConversation(['Session started! You can now chat with the AI.']);
  }

  /**
   * Send message to AI
   */
  async function sendMessage(message: string) {
    if (!sessionActive) return;
    
    setConversation(prev => [...prev, `You: ${message}`]);
    
    // Simulate AI response
    setTimeout(() => {
      const responses = [
        'That\'s an interesting question! Let me help you with that.',
        'Based on my analysis, here\'s what I found...',
        'I understand what you\'re asking. Here\'s my response...',
      ];
      const response = responses[Math.floor(Math.random() * responses.length)];
      setConversation(prev => [...prev, `AI: ${response}`]);
    }, 1000);
  }

  // Styles as JavaScript objects
  const styles = {
    container: {
      maxWidth: '600px',
      margin: '0 auto',
      padding: '2rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    header: {
      textAlign: 'center' as const,
      marginBottom: '2rem',
    },
    connectSection: {
      background: '#f7f7f7',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center' as const,
    },
    connectButton: {
      background: '#0052ff',
      color: 'white',
      border: 'none',
      padding: '1rem 2rem',
      borderRadius: '8px',
      fontSize: '1.1rem',
      cursor: 'pointer',
      transition: 'background 0.2s',
    },
    connectButtonDisabled: {
      background: '#ccc',
      cursor: 'not-allowed',
    },
    walletInfo: {
      background: '#e8f4ff',
      borderRadius: '8px',
      padding: '1rem',
      margin: '1rem 0',
    },
    walletType: {
      display: 'inline-block',
      background: 'white',
      padding: '0.25rem 0.5rem',
      borderRadius: '4px',
      fontSize: '0.85rem',
      marginLeft: '0.5rem',
    },
    paymentMethods: {
      margin: '2rem 0',
    },
    paymentMethod: {
      border: '2px solid #e0e0e0',
      borderRadius: '8px',
      padding: '1rem',
      margin: '0.5rem 0',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    paymentMethodSelected: {
      borderColor: '#0052ff',
      background: '#f0f7ff',
    },
    paymentMethodDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    paymentMethodHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    paymentIcon: {
      fontSize: '1.5rem',
      marginRight: '0.5rem',
    },
    startButton: {
      background: '#00d632',
      color: 'white',
      border: 'none',
      padding: '1rem 2rem',
      borderRadius: '8px',
      fontSize: '1.1rem',
      cursor: 'pointer',
      width: '100%',
      marginTop: '1rem',
    },
    startButtonDisabled: {
      background: '#ccc',
      cursor: 'not-allowed',
    },
    chatSection: {
      marginTop: '2rem',
    },
    conversation: {
      background: '#f7f7f7',
      borderRadius: '8px',
      padding: '1rem',
      height: '300px',
      overflowY: 'auto' as const,
      marginBottom: '1rem',
    },
    message: {
      margin: '0.5rem 0',
      padding: '0.5rem',
      background: 'white',
      borderRadius: '4px',
    },
    chatInput: {
      display: 'flex',
      gap: '0.5rem',
    },
    chatInputField: {
      flex: 1,
      padding: '0.75rem',
      border: '1px solid #e0e0e0',
      borderRadius: '4px',
      fontSize: '1rem',
    },
    sendButton: {
      background: '#0052ff',
      color: 'white',
      border: 'none',
      padding: '0.75rem 1.5rem',
      borderRadius: '4px',
      cursor: 'pointer',
    },
    infoBox: {
      background: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: '4px',
      padding: '0.75rem',
      margin: '1rem 0',
      fontSize: '0.9rem',
    },
    successBox: {
      background: '#d4edda',
      border: '1px solid #28a745',
      borderRadius: '4px',
      padding: '0.75rem',
      margin: '1rem 0',
    },
    walletSelector: {
      marginTop: '1rem',
      padding: '1rem',
      background: 'white',
      borderRadius: '8px',
      border: '1px solid #e0e0e0',
    },
    walletOption: {
      display: 'block',
      width: '100%',
      padding: '1rem',
      margin: '0.5rem 0',
      background: 'white',
      border: '2px solid #e0e0e0',
      borderRadius: '8px',
      cursor: 'pointer',
      textAlign: 'left' as const,
      fontSize: '1rem',
      transition: 'all 0.2s',
      '&:hover': {
        borderColor: '#0052ff',
        background: '#f0f7ff',
      }
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>AI Chat Payment</h1>
        <p>Pay once, chat for 100 messages</p>
      </div>

      {!wallet ? (
        <div style={styles.connectSection}>
          <h2>Get Started</h2>
          <p>Connect your wallet to begin</p>
          
          <button 
            style={{
              ...styles.connectButton,
              ...(isConnecting ? styles.connectButtonDisabled : {})
            }}
            onClick={() => {
              const wallets = detectAvailableWallets();
              if (wallets.length > 1) {
                setShowWalletSelector(true);
              } else {
                connectWallet();
              }
            }}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          
          {showWalletSelector && (
            <div style={styles.walletSelector}>
              <h3>Choose Your Wallet</h3>
              {detectAvailableWallets().map(wallet => (
                <button
                  key={wallet.name}
                  style={styles.walletOption}
                  onClick={() => {
                    setShowWalletSelector(false);
                    connectWallet(wallet.provider);
                  }}
                >
                  <span style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>{wallet.icon}</span>
                  {wallet.name}
                  {wallet.name === 'Coinbase Wallet' && (
                    <small style={{ display: 'block', color: '#666', marginTop: '0.25rem' }}>
                      Supports credit card payments
                    </small>
                  )}
                </button>
              ))}
            </div>
          )}
          
          <div style={styles.infoBox}>
            💡 <strong>New to crypto?</strong> No problem! Connect with Coinbase Wallet 
            to pay with your credit card.
          </div>
        </div>
      ) : (
        <div>
          <div style={styles.walletInfo}>
            <strong>Connected:</strong> {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
            <span style={styles.walletType}>
              {wallet.type === 'smart' ? '🔐 Smart Wallet' : '👛 Crypto Wallet'}
            </span>
          </div>

          {!sessionActive ? (
            <>
              <div style={styles.paymentMethods}>
                <h3>Choose Payment Method</h3>
                
                {paymentMethods.map(method => (
                  <div
                    key={method.type}
                    style={{
                      ...styles.paymentMethod,
                      ...(selectedMethod === method.type ? styles.paymentMethodSelected : {}),
                      ...(!method.available ? styles.paymentMethodDisabled : {})
                    }}
                    onClick={() => method.available && setSelectedMethod(method.type)}
                  >
                    <div style={styles.paymentMethodHeader}>
                      <div>
                        <span style={styles.paymentIcon}>{method.icon}</span>
                        <strong>{method.label}</strong>
                      </div>
                      {selectedMethod === method.type && <span>✓</span>}
                    </div>
                    
                    {method.type === 'credit-card' && (
                      <p style={{ fontSize: '0.9rem', margin: '0.5rem 0 0 2rem', color: '#666' }}>
                        Pay $2 with your credit card via Coinbase Pay
                      </p>
                    )}
                    
                    {method.type === 'usdc' && !method.available && (
                      <p style={{ fontSize: '0.9rem', margin: '0.5rem 0 0 2rem', color: '#666' }}>
                        Minimum 0.20 USDC required
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <button 
                style={{
                  ...styles.startButton,
                  ...(!selectedMethod ? styles.startButtonDisabled : {})
                }}
                onClick={startSession}
                disabled={!selectedMethod}
              >
                Start AI Session ($0.20)
              </button>
              
              {wallet.type === 'smart' && (
                <div style={styles.successBox}>
                  ✨ <strong>Gasless transactions enabled!</strong> Your smart wallet 
                  handles all blockchain fees automatically.
                </div>
              )}
            </>
          ) : (
            <div style={styles.chatSection}>
              <h3>AI Chat Session Active</h3>
              
              <div style={styles.conversation}>
                {conversation.map((msg, i) => (
                  <div key={i} style={styles.message}>{msg}</div>
                ))}
              </div>
              
              <div style={styles.chatInput}>
                <input 
                  type="text" 
                  style={styles.chatInputField}
                  placeholder="Type your message..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value) {
                      sendMessage(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
                <button style={styles.sendButton}>Send</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Type augmentation for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function UnifiedPaymentDemo() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '2rem' }}>
      <UnifiedPaymentFlow />
    </div>
  );
}