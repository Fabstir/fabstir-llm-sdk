/**
 * Unified Payment Flow Component
 * Handles both EOA (crypto wallets) and Smart Wallet (credit card) users seamlessly
 */

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
// SDK import will be added once build issues are resolved
// For now, this demonstrates the UI/UX flow

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

export function UnifiedPaymentFlow() {
  const [sdk, setSdk] = useState<any>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<'usdc' | 'credit-card' | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [conversation, setConversation] = useState<string[]>([]);
  
  // Initialize SDK (placeholder for now)
  useEffect(() => {
    // SDK initialization will happen here
    // For demo purposes, we're showing the UI flow
    console.log('SDK would be initialized here');
  }, []);

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
    
    // Method 3: Check for known smart wallet signatures
    try {
      // Smart wallets often have specific methods
      if ('sendUserOperation' in signer || 'sendTransaction' in signer) {
        const tx = signer as any;
        if (tx.sendUserOperation) return 'smart';
      }
    } catch {}
    
    return 'eoa';
  }

  /**
   * Connect any wallet type
   */
  async function connectWallet() {
    setIsConnecting(true);
    try {
      // Check for injected wallet
      if (!window.ethereum) {
        // If no wallet, could redirect to Coinbase Wallet creation
        window.open('https://www.coinbase.com/wallet', '_blank');
        return;
      }

      // Request connection
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const type = await detectWalletType(signer);
      
      // Get USDC balance if applicable
      let balance = '0';
      let hasUSDC = false;
      
      // Simulate checking USDC balance
      try {
        // In real implementation, this would query the blockchain
        // For demo, we'll simulate based on wallet type
        if (type === 'eoa') {
          // Simulate some EOA wallets having USDC
          const random = Math.random();
          if (random > 0.5) {
            balance = '2.50';
            hasUSDC = true;
          }
        } else {
          // Smart wallets can always get USDC via credit card
          balance = '0';
          hasUSDC = false;
        }
      } catch (error) {
        console.log('Could not fetch USDC balance:', error);
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
    // For demo, we'll simulate the flow
    
    const paymentWindow = window.open(
      'https://commerce.coinbase.com/checkout/example', // Would be real checkout URL
      'coinbase-pay',
      'width=500,height=600'
    );
    
    // Listen for payment completion
    window.addEventListener('message', async (event) => {
      if (event.data.type === 'payment-complete') {
        // Payment successful, USDC has been added to smart wallet
        await startUSDCSession();
      }
    });
  }

  /**
   * Start session with USDC
   */
  async function startUSDCSession() {
    if (!wallet) return;
    
    // Simulate session creation
    console.log('Creating session with USDC...');
    
    // In real implementation, this would:
    // 1. Call SDK to create session
    // 2. Transfer USDC to smart contract
    // 3. Initialize WebSocket connection
    
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

  // Render UI
  return (
    <div className="unified-payment-flow">
      <style>{`
        .unified-payment-flow {
          max-width: 600px;
          margin: 0 auto;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .connect-section {
          background: #f7f7f7;
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
        }
        
        .connect-button {
          background: #0052ff;
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 8px;
          font-size: 1.1rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .connect-button:hover {
          background: #0041d4;
        }
        
        .connect-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .wallet-info {
          background: #e8f4ff;
          border-radius: 8px;
          padding: 1rem;
          margin: 1rem 0;
        }
        
        .wallet-type {
          display: inline-block;
          background: white;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.85rem;
          margin-left: 0.5rem;
        }
        
        .payment-methods {
          margin: 2rem 0;
        }
        
        .payment-method {
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          padding: 1rem;
          margin: 0.5rem 0;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .payment-method.selected {
          border-color: #0052ff;
          background: #f0f7ff;
        }
        
        .payment-method.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .payment-method-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .payment-icon {
          font-size: 1.5rem;
          margin-right: 0.5rem;
        }
        
        .start-button {
          background: #00d632;
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 8px;
          font-size: 1.1rem;
          cursor: pointer;
          width: 100%;
          margin-top: 1rem;
        }
        
        .start-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .chat-section {
          margin-top: 2rem;
        }
        
        .conversation {
          background: #f7f7f7;
          border-radius: 8px;
          padding: 1rem;
          height: 300px;
          overflow-y: auto;
          margin-bottom: 1rem;
        }
        
        .message {
          margin: 0.5rem 0;
          padding: 0.5rem;
          background: white;
          border-radius: 4px;
        }
        
        .chat-input {
          display: flex;
          gap: 0.5rem;
        }
        
        .chat-input input {
          flex: 1;
          padding: 0.75rem;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          font-size: 1rem;
        }
        
        .send-button {
          background: #0052ff;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .info-box {
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
          padding: 0.75rem;
          margin: 1rem 0;
          font-size: 0.9rem;
        }
        
        .success-box {
          background: #d4edda;
          border: 1px solid #28a745;
          border-radius: 4px;
          padding: 0.75rem;
          margin: 1rem 0;
        }
      `}</style>

      <div className="header">
        <h1>AI Chat Payment</h1>
        <p>Pay once, chat for 100 messages</p>
      </div>

      {!wallet ? (
        <div className="connect-section">
          <h2>Get Started</h2>
          <p>Connect your wallet to begin</p>
          
          <button 
            className="connect-button"
            onClick={connectWallet}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          
          <div className="info-box">
            💡 <strong>New to crypto?</strong> No problem! Connect with Coinbase Wallet 
            to pay with your credit card.
          </div>
        </div>
      ) : (
        <div>
          <div className="wallet-info">
            <strong>Connected:</strong> {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
            <span className="wallet-type">
              {wallet.type === 'smart' ? '🔐 Smart Wallet' : '👛 Crypto Wallet'}
            </span>
          </div>

          {!sessionActive ? (
            <>
              <div className="payment-methods">
                <h3>Choose Payment Method</h3>
                
                {paymentMethods.map(method => (
                  <div
                    key={method.type}
                    className={`payment-method ${
                      selectedMethod === method.type ? 'selected' : ''
                    } ${!method.available ? 'disabled' : ''}`}
                    onClick={() => method.available && setSelectedMethod(method.type)}
                  >
                    <div className="payment-method-header">
                      <div>
                        <span className="payment-icon">{method.icon}</span>
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
                className="start-button"
                onClick={startSession}
                disabled={!selectedMethod}
              >
                Start AI Session ($0.20)
              </button>
              
              {wallet.type === 'smart' && (
                <div className="success-box">
                  ✨ <strong>Gasless transactions enabled!</strong> Your smart wallet 
                  handles all blockchain fees automatically.
                </div>
              )}
            </>
          ) : (
            <div className="chat-section">
              <h3>AI Chat Session Active</h3>
              
              <div className="conversation">
                {conversation.map((msg, i) => (
                  <div key={i} className="message">{msg}</div>
                ))}
              </div>
              
              <div className="chat-input">
                <input 
                  type="text" 
                  placeholder="Type your message..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value) {
                      sendMessage(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
                <button className="send-button">Send</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}