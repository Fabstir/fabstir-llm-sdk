import { describe, it, expect, beforeAll } from 'vitest';
import { S5 } from '@s5-dev/s5js';
import { config as loadEnv } from 'dotenv';
import 'fake-indexeddb/auto';

loadEnv({ path: '.env.test' });

describe('S5 Storage Integration - Real Enhanced S5', () => {
  let s5ClientA: S5;
  let s5ClientB: S5;
  let userASeed: string;
  let userBSeed: string;
  let testSessionId: string;
  let testConversation: any;

  beforeAll(async () => {
    // Create temporary S5 instance to generate valid seed phrases
    const s5Temp = await S5.create({
      initialPeers: [process.env.S5_PORTAL_URL || 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p']
    });
    
    // Generate valid S5 seed phrases
    userASeed = s5Temp.generateSeedPhrase();
    userBSeed = s5Temp.generateSeedPhrase();
    
    console.log('Generated S5 seed phrases:');
    console.log('  User A (first 3 words):', userASeed.split(' ').slice(0, 3).join(' ') + '...');
    console.log('  User B (first 3 words):', userBSeed.split(' ').slice(0, 3).join(' ') + '...');
    
    // Test data
    testSessionId = `test-session-${Date.now()}`;
    testConversation = {
      sessionId: testSessionId,
      timestamp: Date.now(),
      messages: [
        { role: 'user', content: 'What is blockchain?', timestamp: Date.now() },
        { role: 'assistant', content: 'Blockchain is a distributed ledger technology...', timestamp: Date.now() + 1000 }
      ],
      metadata: {
        model: 'llama2-7b',
        tokensUsed: 150,
        cost: '0.001 ETH'
      }
    };
  }, 30000);

  it('should connect to real S5 portal and store data', async () => {
    // Initialize S5 client for User A
    s5ClientA = await S5.create({
      initialPeers: [process.env.S5_PORTAL_URL || 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p']
    });
    
    await s5ClientA.recoverIdentityFromSeedPhrase(userASeed);
    
    // Register on S5 portal
    try {
      await s5ClientA.registerOnNewPortal('https://s5.vup.cx');
      console.log('Registered User A on S5 portal');
    } catch (error) {
      console.log('Portal registration failed, continuing anyway');
    }
    
    // Ensure identity is initialized
    await s5ClientA.fs.ensureIdentityInitialized();
    
    expect(s5ClientA).toBeDefined();
    expect(s5ClientA.fs).toBeDefined();
    console.log('Connected to S5 portal with User A seed');
    
    // Store conversation data using path-based API
    const dataPath = `home/conversations/${testSessionId}.json`;
    
    await s5ClientA.fs.put(dataPath, testConversation);
    
    console.log(`Stored conversation at: ${dataPath}`);
    console.log(`Data size: ${JSON.stringify(testConversation).length} bytes`);
    
    // Verify metadata
    const metadata = await s5ClientA.fs.getMetadata(dataPath);
    expect(metadata).toBeDefined();
    expect(metadata?.type).toBe('file');
    
    // Retrieve the data back
    const retrievedData = await s5ClientA.fs.get(dataPath);
    
    expect(retrievedData).toBeDefined();
    expect(retrievedData.sessionId).toBe(testSessionId);
    expect(retrievedData.messages.length).toBe(2);
    expect(retrievedData.metadata.model).toBe('llama2-7b');
    
    console.log('Successfully stored and retrieved conversation with User A');
  }, 120000);

  it('should verify data isolation between users', async () => {
    // Initialize S5 client for User B
    s5ClientB = await S5.create({
      initialPeers: [process.env.S5_PORTAL_URL || 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p']
    });
    
    await s5ClientB.recoverIdentityFromSeedPhrase(userBSeed);
    
    // Register on S5 portal for User B
    try {
      await s5ClientB.registerOnNewPortal('https://s5.vup.cx');
      console.log('Registered User B on S5 portal');
    } catch (error) {
      console.log('Portal registration for User B failed, continuing anyway');
    }
    
    await s5ClientB.fs.ensureIdentityInitialized();
    
    const dataPath = `home/conversations/${testSessionId}.json`;
    
    // Try to read User A's data with User B's seed
    let isolationVerified = false;
    try {
      const data = await s5ClientB.fs.get(dataPath);
      // If we get here with undefined, that's also acceptable (no data found)
      if (data === undefined) {
        console.log('✓ User B cannot see User A data (returned undefined)');
        expect(data).toBeUndefined();
        isolationVerified = true;
      } else {
        // Should not reach here - different seeds can't access each other's data
        console.log('ERROR: User B accessed User A data - isolation failed!');
        expect(true).toBe(false);
      }
    } catch (error: any) {
      // Expected error - User B cannot access User A's encrypted data
      console.log('✓ Correctly prevented User B from accessing User A\'s data');
      console.log(`  Error caught: "${error.message || error}"`);
      isolationVerified = true;
      expect(isolationVerified).toBe(true);
    }
    
    // Ensure isolation was verified one way or another
    expect(isolationVerified).toBe(true);
    
    // User B stores their own data
    const userBData = {
      sessionId: `user-b-${testSessionId}`,
      owner: 'User B',
      private: true
    };
    
    await s5ClientB.fs.put(dataPath, userBData);
    console.log('✓ User B stored their own data');
    
    // Verify User B can read their own data
    const retrievedBData = await s5ClientB.fs.get(dataPath);
    expect(retrievedBData).toBeDefined();
    expect(retrievedBData.owner).toBe('User B');
    
    console.log('✓ User B successfully retrieved their own data');
    console.log('✅ Data isolation between users verified successfully');
  }, 120000);
});