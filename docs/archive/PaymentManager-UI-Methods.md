# PaymentManager UI Methods Documentation

This document lists all the utility methods added to PaymentManager for UI integration.

## Payment Methods

### `getSupportedPaymentMethods(): string[]`
Returns the list of supported payment methods.
- Returns: `['ETH', 'USDC']`

## Cost Calculation

### `calculateJobCost(tokenCount: number, pricePerToken: number): string`
Calculates the total cost for a given number of tokens.
- `tokenCount`: Number of tokens
- `pricePerToken`: Price per token in wei (ETH) or smallest unit (USDC)
- Returns: Total cost as string in wei/smallest unit

### `estimateTokensForDeposit(depositAmount: string, pricePerToken: string): number`
Estimates how many tokens can be purchased with a given deposit.
- `depositAmount`: Amount in wei/smallest unit
- `pricePerToken`: Price per token in wei/smallest unit
- Returns: Estimated number of tokens

## Contract Addresses

### `getJobMarketplaceAddress(): string`
Returns the JobMarketplace contract address.

### `getUSDCTokenAddress(): string`
Returns the USDC token contract address.

## Deposit Limits

### ETH Limits
- `getMinimumDeposit(): string` - Returns minimum ETH deposit in wei (0.001 ETH)
- `getMaximumDeposit(): string` - Returns maximum ETH deposit in wei (10 ETH)

### USDC Limits
- `getUSDCMinimumDeposit(): string` - Returns minimum USDC deposit (1 USDC)
- `getUSDCMaximumDeposit(): string` - Returns maximum USDC deposit (10,000 USDC)

## Formatting Helpers

### For Display
- `formatETHAmount(weiAmount: string): string` - Converts wei to ETH string (e.g., "1.5")
- `formatUSDCAmount(amount: string): string` - Converts USDC smallest unit to USDC string

### For Input
- `parseETHAmount(etherAmount: string): string` - Converts ETH string to wei
- `parseUSDCAmount(usdcAmount: string): string` - Converts USDC string to smallest unit

## Validation

### `validateETHDeposit(amount: string): { valid: boolean; error?: string }`
Validates an ETH deposit amount.
- `amount`: Amount in wei
- Returns: Object with `valid` boolean and optional `error` message

### `validateUSDCDeposit(amount: string): { valid: boolean; error?: string }`
Validates a USDC deposit amount.
- `amount`: Amount in USDC smallest unit
- Returns: Object with `valid` boolean and optional `error` message

## Recommended Prices

### `getRecommendedPricePerToken(): string`
Returns recommended ETH price per token (0.00001 ETH).

### `getRecommendedUSDCPricePerToken(): string`
Returns recommended USDC price per token (0.001 USDC).

## Example Usage in UI

```typescript
// Get payment manager
const paymentManager = sdk.getPaymentManager();

// Show supported payment methods
const methods = paymentManager.getSupportedPaymentMethods();
console.log('Available payment methods:', methods); // ['ETH', 'USDC']

// User enters 0.1 ETH deposit
const depositETH = '0.1';
const depositWei = paymentManager.parseETHAmount(depositETH);

// Validate the deposit
const validation = paymentManager.validateETHDeposit(depositWei);
if (!validation.valid) {
  alert(validation.error);
  return;
}

// Calculate how many tokens they can get
const pricePerToken = paymentManager.getRecommendedPricePerToken();
const estimatedTokens = paymentManager.estimateTokensForDeposit(depositWei, pricePerToken);
console.log(`You will get approximately ${estimatedTokens} tokens`);

// Display limits to user
const minETH = paymentManager.formatETHAmount(paymentManager.getMinimumDeposit());
const maxETH = paymentManager.formatETHAmount(paymentManager.getMaximumDeposit());
console.log(`ETH deposit limits: ${minETH} - ${maxETH} ETH`);

// For USDC
const minUSDC = paymentManager.formatUSDCAmount(paymentManager.getUSDCMinimumDeposit());
const maxUSDC = paymentManager.formatUSDCAmount(paymentManager.getUSDCMaximumDeposit());
console.log(`USDC deposit limits: ${minUSDC} - ${maxUSDC} USDC`);
```

## React UI Component Example

```jsx
function PaymentForm({ sdk }) {
  const [paymentMethod, setPaymentMethod] = useState('ETH');
  const [depositAmount, setDepositAmount] = useState('');
  const [error, setError] = useState('');
  
  const paymentManager = sdk.getPaymentManager();
  
  const handleAmountChange = (value) => {
    setDepositAmount(value);
    
    // Parse and validate
    const amountWei = paymentMethod === 'ETH' 
      ? paymentManager.parseETHAmount(value)
      : paymentManager.parseUSDCAmount(value);
      
    const validation = paymentMethod === 'ETH'
      ? paymentManager.validateETHDeposit(amountWei)
      : paymentManager.validateUSDCDeposit(amountWei);
      
    setError(validation.error || '');
  };
  
  const getDepositLimits = () => {
    if (paymentMethod === 'ETH') {
      return {
        min: paymentManager.formatETHAmount(paymentManager.getMinimumDeposit()),
        max: paymentManager.formatETHAmount(paymentManager.getMaximumDeposit()),
        unit: 'ETH'
      };
    } else {
      return {
        min: paymentManager.formatUSDCAmount(paymentManager.getUSDCMinimumDeposit()),
        max: paymentManager.formatUSDCAmount(paymentManager.getUSDCMaximumDeposit()),
        unit: 'USDC'
      };
    }
  };
  
  const limits = getDepositLimits();
  
  return (
    <div>
      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
        {paymentManager.getSupportedPaymentMethods().map(method => (
          <option key={method} value={method}>{method}</option>
        ))}
      </select>
      
      <input
        type="number"
        value={depositAmount}
        onChange={e => handleAmountChange(e.target.value)}
        placeholder={`Enter amount (${limits.min} - ${limits.max} ${limits.unit})`}
      />
      
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

## Notes

- All amounts are stored as strings to avoid precision issues with large numbers
- ETH amounts are in wei internally, but displayed as ETH to users
- USDC uses 6 decimal places
- Validation includes both minimum and maximum limits
- The recommended prices can be adjusted based on market conditions