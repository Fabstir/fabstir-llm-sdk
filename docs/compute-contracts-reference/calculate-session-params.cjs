#!/usr/bin/env node

const { ethers } = require('ethers');

/**
 * Helper script to calculate valid session parameters
 * Ensures parameters meet all contract validation requirements
 */

function calculateSessionParams(options = {}) {
  const {
    tokenType = 'USDC',      // 'ETH' or 'USDC'
    targetDeposit = null,     // Desired deposit amount in token units
    targetTokens = 1000,      // Desired number of tokens to process
    targetDuration = 86400,   // Duration in seconds (default 1 day)
  } = options;

  console.log('\n📊 Session Parameter Calculator');
  console.log('================================\n');

  console.log('Input Requirements:');
  console.log('  Token Type:', tokenType);
  console.log('  Target Tokens:', targetTokens);
  console.log('  Target Duration:', targetDuration, 'seconds (', (targetDuration / 3600).toFixed(1), 'hours)');
  if (targetDeposit) {
    console.log('  Target Deposit:', targetDeposit, tokenType);
  }
  console.log('');

  // Contract requirements
  const MIN_TOKENS = 100;
  const MIN_PROOF_INTERVAL = 100;
  const MAX_PROOF_INTERVAL = 1000000;
  const MIN_DEPOSIT_ETH = 0.0002;   // For ETH
  const MIN_DEPOSIT_USDC = 0.8;     // For USDC
  const MAX_DURATION = 365 * 86400; // 365 days

  const isETH = tokenType === 'ETH';
  const decimals = isETH ? 18 : 6;
  const minDeposit = isETH ? MIN_DEPOSIT_ETH : MIN_DEPOSIT_USDC;

  console.log('Contract Requirements:');
  console.log('  Minimum deposit:', minDeposit, tokenType);
  console.log('  Minimum tokens per session:', MIN_TOKENS);
  console.log('  Proof interval range:', MIN_PROOF_INTERVAL, '-', MAX_PROOF_INTERVAL);
  console.log('  Maximum duration:', MAX_DURATION, 'seconds (365 days)\n');

  // Calculate price per token based on requirements
  let pricePerToken, deposit, proofInterval;

  if (targetDeposit) {
    // User specified deposit amount
    deposit = targetDeposit;
    
    // Ensure minimum deposit
    if (deposit < minDeposit) {
      console.log('⚠️  Warning: Deposit below minimum, adjusting to', minDeposit, tokenType);
      deposit = minDeposit;
    }

    // Calculate price per token
    pricePerToken = deposit / targetTokens;
    
    // Check if deposit covers minimum tokens
    const maxTokens = Math.floor(deposit / pricePerToken);
    if (maxTokens < MIN_TOKENS) {
      // Adjust price to ensure minimum tokens
      pricePerToken = deposit / MIN_TOKENS;
      console.log('⚠️  Warning: Adjusting price to cover minimum', MIN_TOKENS, 'tokens');
    }
  } else {
    // Calculate deposit based on target tokens
    // Start with a reasonable price per token
    pricePerToken = minDeposit / MIN_TOKENS; // This ensures min deposit covers min tokens
    
    // Scale up for larger token counts
    if (targetTokens > MIN_TOKENS) {
      pricePerToken = pricePerToken * (targetTokens / MIN_TOKENS) * 0.8; // 20% discount for volume
    }
    
    deposit = pricePerToken * targetTokens;
    
    // Ensure minimum deposit
    if (deposit < minDeposit) {
      deposit = minDeposit;
      pricePerToken = deposit / targetTokens;
    }
  }

  // Calculate proof interval
  // Should be reasonable fraction of total tokens, but within limits
  proofInterval = Math.min(
    Math.max(
      MIN_PROOF_INTERVAL,
      Math.floor(targetTokens / 10) // Proof every 10% of tokens
    ),
    targetTokens // Can't exceed total tokens
  );

  // Final validation
  const maxTokensCovered = Math.floor(deposit / pricePerToken);
  const isValid = 
    deposit >= minDeposit &&
    maxTokensCovered >= MIN_TOKENS &&
    proofInterval >= MIN_PROOF_INTERVAL &&
    proofInterval <= maxTokensCovered &&
    targetDuration <= MAX_DURATION;

  console.log('📋 Calculated Parameters:');
  console.log('  Deposit:', deposit.toFixed(6), tokenType);
  console.log('  Price per token:', pricePerToken.toFixed(8), tokenType);
  console.log('  Max tokens covered:', maxTokensCovered);
  console.log('  Proof interval:', proofInterval, 'tokens');
  console.log('  Duration:', targetDuration, 'seconds');
  console.log('');

  // Convert to blockchain values
  const depositWei = ethers.utils.parseUnits(deposit.toString(), decimals);
  const priceWei = ethers.utils.parseUnits(pricePerToken.toString(), decimals);

  console.log('🔧 Contract Call Parameters:');
  console.log('  deposit:', depositWei.toString(), `(${deposit} ${tokenType})`);
  console.log('  pricePerToken:', priceWei.toString(), `(${pricePerToken} ${tokenType})`);
  console.log('  maxDuration:', targetDuration);
  console.log('  proofInterval:', proofInterval);
  console.log('');

  if (isValid) {
    console.log('✅ Parameters are VALID for session creation\n');
    
    // Show example code
    console.log('📝 Example Code:');
    if (isETH) {
      console.log(`
// ETH Session
const jobId = await marketplace.createSessionJob(
  hostAddress,
  "${depositWei.toString()}",     // deposit
  "${priceWei.toString()}",       // pricePerToken  
  ${targetDuration},              // maxDuration
  ${proofInterval},                // proofInterval
  { value: "${depositWei.toString()}" }  // msg.value
);`);
    } else {
      console.log(`
// USDC Session
// First approve USDC
await usdc.approve(marketplaceAddress, "${depositWei.toString()}");

// Then create session
const jobId = await marketplace.createSessionJobWithToken(
  hostAddress,
  usdcAddress,
  "${depositWei.toString()}",     // deposit
  "${priceWei.toString()}",       // pricePerToken
  ${targetDuration},              // maxDuration
  ${proofInterval}                // proofInterval
);`);
    }
  } else {
    console.log('❌ Parameters are INVALID. Issues found:');
    if (deposit < minDeposit) {
      console.log('  - Deposit below minimum');
    }
    if (maxTokensCovered < MIN_TOKENS) {
      console.log('  - Deposit does not cover minimum 100 tokens');
    }
    if (proofInterval < MIN_PROOF_INTERVAL) {
      console.log('  - Proof interval too small');
    }
    if (proofInterval > maxTokensCovered) {
      console.log('  - Proof interval exceeds max tokens');
    }
    if (targetDuration > MAX_DURATION) {
      console.log('  - Duration exceeds maximum');
    }
  }

  return {
    deposit: depositWei.toString(),
    pricePerToken: priceWei.toString(),
    maxDuration: targetDuration,
    proofInterval,
    isValid,
    humanReadable: {
      deposit: `${deposit} ${tokenType}`,
      pricePerToken: `${pricePerToken} ${tokenType}`,
      maxTokens: maxTokensCovered,
      duration: `${(targetDuration / 3600).toFixed(1)} hours`
    }
  };
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node calculate-session-params.js [options]

Options:
  --token <type>      Token type: ETH or USDC (default: USDC)
  --deposit <amount>  Target deposit amount in token units
  --tokens <count>    Target number of tokens to process (default: 1000)
  --duration <secs>   Session duration in seconds (default: 86400)
  --help, -h          Show this help message

Examples:
  # Calculate params for 1000 tokens with USDC
  node calculate-session-params.js --token USDC --tokens 1000

  # Calculate params for 2 USDC deposit
  node calculate-session-params.js --token USDC --deposit 2

  # Calculate params for ETH session lasting 1 hour
  node calculate-session-params.js --token ETH --tokens 500 --duration 3600
`);
    process.exit(0);
  }

  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch(flag) {
      case '--token':
        options.tokenType = value.toUpperCase();
        break;
      case '--deposit':
        options.targetDeposit = parseFloat(value);
        break;
      case '--tokens':
        options.targetTokens = parseInt(value);
        break;
      case '--duration':
        options.targetDuration = parseInt(value);
        break;
    }
  }
  
  calculateSessionParams(options);
  console.log('');
}

module.exports = { calculateSessionParams };