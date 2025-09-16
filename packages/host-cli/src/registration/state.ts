/**
 * Registration state management
 * Handles persisting and loading registration state
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getConfigDir } from '../config/paths';

/**
 * Registration state structure
 */
export interface RegistrationState {
  hostAddress: string;
  apiUrl: string;
  models: string[];
  stakedAmount: bigint;
  registrationBlock: number;
  transactionHash: string;
  metadata?: Record<string, any>;
  timestamp: number;
  lastUpdated?: number;
}

/**
 * Get registration state file path
 */
function getStateFilePath(): string {
  const configDir = getConfigDir();
  return path.join(configDir, 'registration.json');
}

/**
 * Save registration state
 */
export async function saveRegistrationState(state: RegistrationState): Promise<void> {
  try {
    const filePath = getStateFilePath();
    const dir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Convert BigInt to string for JSON serialization
    const serializable = {
      ...state,
      stakedAmount: state.stakedAmount.toString(),
      lastUpdated: Date.now()
    };

    // Save state
    await fs.writeFile(
      filePath,
      JSON.stringify(serializable, null, 2),
      'utf-8'
    );
  } catch (error: any) {
    console.error('Failed to save registration state:', error);
    // Don't throw - state persistence is not critical
  }
}

/**
 * Load registration state
 */
export async function loadRegistrationState(): Promise<RegistrationState | null> {
  try {
    const filePath = getStateFilePath();

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return null; // File doesn't exist
    }

    // Read and parse state
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    // Convert string back to BigInt
    if (parsed.stakedAmount) {
      parsed.stakedAmount = BigInt(parsed.stakedAmount);
    }

    return parsed as RegistrationState;
  } catch (error: any) {
    console.error('Failed to load registration state:', error);
    return null;
  }
}

/**
 * Update registration state
 */
export async function updateRegistrationState(
  updates: Partial<RegistrationState>
): Promise<void> {
  try {
    // Load existing state
    const existing = await loadRegistrationState();

    if (!existing) {
      throw new Error('No existing registration state to update');
    }

    // Merge updates
    const updated: RegistrationState = {
      ...existing,
      ...updates,
      lastUpdated: Date.now()
    };

    // Save updated state
    await saveRegistrationState(updated);
  } catch (error: any) {
    console.error('Failed to update registration state:', error);
    throw error;
  }
}

/**
 * Delete registration state
 */
export async function deleteRegistrationState(): Promise<void> {
  try {
    const filePath = getStateFilePath();
    await fs.unlink(filePath);
  } catch (error: any) {
    // Ignore if file doesn't exist
    if (error.code !== 'ENOENT') {
      console.error('Failed to delete registration state:', error);
    }
  }
}

/**
 * Check if registration state exists
 */
export async function hasRegistrationState(): Promise<boolean> {
  try {
    const filePath = getStateFilePath();
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get registration history
 */
export async function getRegistrationHistory(): Promise<Array<{
  timestamp: number;
  event: string;
  details?: any;
}>> {
  // For now, just return empty array
  // Could be enhanced to track history in a separate file
  return [];
}

/**
 * Add registration event to history
 */
export async function addRegistrationEvent(
  event: string,
  details?: any
): Promise<void> {
  // For now, just log
  // Could be enhanced to persist history
  console.log(`[Registration Event] ${event}`, details || '');
}