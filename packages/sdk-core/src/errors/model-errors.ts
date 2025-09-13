/**
 * Model governance specific error types
 */

export class ModelGovernanceError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ModelGovernanceError';
  }
}

export class ModelNotApprovedError extends ModelGovernanceError {
  constructor(public modelId: string, public repo?: string, public file?: string) {
    const message = repo && file
      ? `Model ${repo}/${file} (ID: ${modelId}) is not approved for use`
      : `Model with ID ${modelId} is not approved for use`;
    super(message, 'MODEL_NOT_APPROVED');
    this.name = 'ModelNotApprovedError';
  }
}

export class InvalidModelIdError extends ModelGovernanceError {
  constructor(public modelId: string, message?: string) {
    super(message || `Invalid model ID: ${modelId}`, 'INVALID_MODEL_ID');
    this.name = 'InvalidModelIdError';
  }
}

export class ModelHashMismatchError extends ModelGovernanceError {
  constructor(
    public expectedHash: string,
    public actualHash: string,
    public modelFile: string
  ) {
    super(
      `SHA-256 hash mismatch for ${modelFile}. Expected: ${expectedHash}, Got: ${actualHash}`,
      'MODEL_HASH_MISMATCH'
    );
    this.name = 'ModelHashMismatchError';
  }
}

export class NoHostsForModelError extends ModelGovernanceError {
  constructor(public modelId: string, public modelName?: string) {
    const message = modelName
      ? `No hosts available for model ${modelName} (ID: ${modelId})`
      : `No hosts available for model ID: ${modelId}`;
    super(message, 'NO_HOSTS_FOR_MODEL');
    this.name = 'NoHostsForModelError';
  }
}

export class ModelRegistryError extends ModelGovernanceError {
  constructor(message: string, public contractAddress?: string) {
    super(message, 'MODEL_REGISTRY_ERROR');
    this.name = 'ModelRegistryError';
  }
}

export class ModelValidationError extends ModelGovernanceError {
  constructor(message: string, public validationDetails?: any) {
    super(message, 'MODEL_VALIDATION_ERROR');
    this.name = 'ModelValidationError';
  }
}