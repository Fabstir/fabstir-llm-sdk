/**
 * Browser-only exports without S5 dependencies
 * Used for initial page loads where S5 is not needed
 */

// Export model constants
export * from './constants/models';

// Export managers that don't use S5
export { ModelManager } from './managers/ModelManager';
export { HostManagerEnhanced } from './managers/HostManagerEnhanced';
export { ClientManager } from './managers/ClientManager';

// Export types
export type { HostInfo, ModelSpec } from './types/models';

// Export errors
export * from './errors/model-errors';