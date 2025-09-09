import { BrowserContext, Page } from '@playwright/test';
import { setupCDP, sendCDPCommand } from './cdp-config';

let authenticatorId: string | null = null;
let cdpSession: any = null;

export async function enableWebAuthn(context: BrowserContext, page: Page): Promise<void> {
  cdpSession = await setupCDP(context, page);
  await sendCDPCommand(cdpSession, 'WebAuthn.enable');
  
  const result = await sendCDPCommand(cdpSession, 'WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'u2f',
      transport: 'usb',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true
    }
  });
  authenticatorId = result.authenticatorId;
}

export async function cleanupWebAuthn(): Promise<void> {
  if (cdpSession && authenticatorId) {
    await sendCDPCommand(cdpSession, 'WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  }
  authenticatorId = null;
  cdpSession = null;
}

export function getAuthenticatorId(): string | null {
  return authenticatorId;
}

export async function setupWebAuthnForTest(context: BrowserContext, page: Page): Promise<void> {
  await enableWebAuthn(context, page);
}