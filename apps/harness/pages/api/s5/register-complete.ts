// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * S5 User Registration API Route - Step 2: Complete Registration
 *
 * This route completes S5 registration by submitting the signed challenge,
 * keeping the master token server-side only.
 *
 * Flow:
 * 1. Frontend signs challenge with S5 key
 * 2. Backend submits signed challenge to S5 portal with master token
 * 3. Backend returns user's auth token to frontend
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const S5_PORTAL_URL = 'https://s5.platformlessai.ai';
const S5_MASTER_TOKEN = process.env.S5_MASTER_TOKEN;

interface CompleteResponse {
  authToken?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CompleteResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify master token is configured
  if (!S5_MASTER_TOKEN) {
    console.error('[S5 Register Complete] S5_MASTER_TOKEN not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { pubKey, response, signature, label } = req.body;

  // Validate required fields
  if (!pubKey || !response || !signature) {
    return res.status(400).json({
      error: 'pubKey, response, and signature required',
    });
  }

  try {
    console.log(`[S5 Register Complete] Completing registration for pubKey: ${pubKey.substring(0, 20)}...`);
    console.log(`[S5 Register Complete] pubKey length: ${pubKey.length}, type: ${typeof pubKey}`);
    console.log(`[S5 Register Complete] response length: ${response.length}, type: ${typeof response}`);
    console.log(`[S5 Register Complete] signature length: ${signature.length}, type: ${typeof signature}`);
    console.log(`[S5 Register Complete] Full pubKey: ${pubKey}`);
    console.log(`[S5 Register Complete] Full response: ${response}`);
    console.log(`[S5 Register Complete] Full signature: ${signature}`);

    // Complete registration with S5 portal
    // Portal expects: pubKey, response (the signed message), signature, and optional label
    const requestBody = {
      pubKey,
      response,
      signature,
      label: label || 'fabstir-sdk',
    };
    console.log(`[S5 Register Complete] Sending to ${S5_PORTAL_URL}/s5/account/register`);

    const registerRes = await fetch(`${S5_PORTAL_URL}/s5/account/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${S5_MASTER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[S5 Register Complete] Portal response status: ${registerRes.status}`);
    const responseText = await registerRes.text();
    console.log(`[S5 Register Complete] Portal response body: ${responseText}`);

    if (!registerRes.ok) {
      console.error(`[S5 Register Complete] Portal error ${registerRes.status}: ${responseText}`);
      return res.status(500).json({
        error: `Portal error: ${registerRes.status}`,
        details: responseText,
      });
    }

    const data = JSON.parse(responseText);

    const { authToken } = data;

    console.log('[S5 Register Complete] Registration successful, authToken received');

    // Return user's auth token for subsequent S5 operations
    return res.status(200).json({ authToken });
  } catch (error: any) {
    console.error('[S5 Register Complete] Error:', error.message);
    return res.status(500).json({ error: 'Registration completion failed' });
  }
}
