import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 3.3: WebAuthn Automation', () => {
  const e2eDir = path.resolve(__dirname);
  
  describe('WebAuthn Setup Module', () => {
    test('should have webauthn-setup.ts file', () => {
      const setupPath = path.join(e2eDir, 'webauthn-setup.ts');
      expect(fs.existsSync(setupPath)).toBe(true);
    });

    test('should export enableWebAuthn function', () => {
      const setupPath = path.join(e2eDir, 'webauthn-setup.ts');
      const content = fs.readFileSync(setupPath, 'utf8');
      
      expect(content).toContain('export async function enableWebAuthn');
      expect(content).toContain('CDPSession');
      expect(content).toContain('WebAuthn.enable');
    });

    test('should create virtual authenticator', () => {
      const setupPath = path.join(e2eDir, 'webauthn-setup.ts');
      const content = fs.readFileSync(setupPath, 'utf8');
      
      expect(content).toContain('addVirtualAuthenticator');
      expect(content).toContain('hasResidentKey: true');
      expect(content).toContain('hasUserVerification: true');
      expect(content).toContain('isUserVerified: true');
    });

    test('should export cleanup function', () => {
      const setupPath = path.join(e2eDir, 'webauthn-setup.ts');
      const content = fs.readFileSync(setupPath, 'utf8');
      
      expect(content).toContain('export async function cleanupWebAuthn');
      expect(content).toContain('removeVirtualAuthenticator');
    });
  });

  describe('CDP Configuration Module', () => {
    test('should have cdp-config.ts file', () => {
      const cdpPath = path.join(e2eDir, 'cdp-config.ts');
      expect(fs.existsSync(cdpPath)).toBe(true);
    });

    test('should setup CDP session', () => {
      const cdpPath = path.join(e2eDir, 'cdp-config.ts');
      const content = fs.readFileSync(cdpPath, 'utf8');
      
      expect(content).toContain('export async function setupCDP');
      expect(content).toContain('context.newCDPSession');
      expect(content).toContain('BrowserContext');
    });

    test('should handle CDP commands', () => {
      const cdpPath = path.join(e2eDir, 'cdp-config.ts');
      const content = fs.readFileSync(cdpPath, 'utf8');
      
      expect(content).toContain('cdp.send');
      expect(content).toContain('protocol');
      expect(content).toContain('transport');
    });
  });

  describe('Passkey Automation', () => {
    test('should configure authenticator options', () => {
      const setupPath = path.join(e2eDir, 'webauthn-setup.ts');
      const content = fs.readFileSync(setupPath, 'utf8');
      
      expect(content).toContain('protocol:');
      expect(content).toContain('transport:');
      expect(content).toContain('u2f');
      expect(content).toContain('usb');
    });

    test('should export passkey helper', () => {
      const setupPath = path.join(e2eDir, 'webauthn-setup.ts');
      const content = fs.readFileSync(setupPath, 'utf8');
      
      expect(content).toContain('export function getAuthenticatorId');
      expect(content).toContain('authenticatorId');
      expect(content).toContain('string');
    });
  });

  describe('Test Integration', () => {
    test('should provide test helper', () => {
      const setupPath = path.join(e2eDir, 'webauthn-setup.ts');
      const content = fs.readFileSync(setupPath, 'utf8');
      
      expect(content).toContain('export async function setupWebAuthnForTest');
      expect(content).toContain('context');
      expect(content).toContain('page');
    });
  });
});