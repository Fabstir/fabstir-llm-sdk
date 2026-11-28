// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * S5 User Registration API Route - Step 1: Get Challenge
 *
 * This route proxies S5 registration requests to the portal,
 * keeping the master token server-side only.
 *
 * Flow:
 * 1. Frontend sends S5 public key
 * 2. Backend requests challenge from S5 portal with master token
 * 3. Backend returns challenge to frontend for signing
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { regionPortal, regionEcho } from '../../../lib/s5-region-portals';

interface RegisterResponse {
  challenge?: string;
  region?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RegisterResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // The region's portal and token (sdk-core 1.39.27): no region = Global; a region without a token is refused
  const portal = regionPortal(req.body?.region);
  if (!portal.ok) {
    console.error(`[S5 Register] ${portal.error}`);
    return res.status(portal.status).json({ error: portal.error });
  }
  const S5_PORTAL_URL = portal.portalUrl;
  const S5_MASTER_TOKEN = portal.token;

  const { pubKey } = req.body;

  // Validate required field
  if (!pubKey) {
    return res.status(400).json({ error: 'pubKey required' });
  }

  try {
    console.log(`[S5 Register] Requesting challenge for pubKey: ${pubKey.substring(0, 20)}...`);

    // Request challenge from S5 portal
    const challengeRes = await fetch(
      `${S5_PORTAL_URL}/s5/account/register?pubKey=${encodeURIComponent(pubKey)}`,
      {
        headers: {
          Authorization: `Bearer ${S5_MASTER_TOKEN}`,
        },
      }
    );

    if (!challengeRes.ok) {
      const errorText = await challengeRes.text();
      console.error(`[S5 Register] Portal error ${challengeRes.status}: ${errorText}`);
      return res.status(challengeRes.status).json({
        error: `S5 portal error: ${errorText}`,
      });
    }

    const { challenge } = await challengeRes.json();

    console.log('[S5 Register] Challenge received successfully');

    // Return challenge for frontend to sign with S5 key
    return res.status(200).json({ challenge, ...regionEcho(req.body?.region) });
  } catch (error: any) {
    console.error('[S5 Register] Error:', error.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
}
