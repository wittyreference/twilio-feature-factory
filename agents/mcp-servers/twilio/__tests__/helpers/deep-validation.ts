// ABOUTME: Test helper for deep validation of Twilio API operations.
// ABOUTME: Provides functions to validate beyond 200 OK using multiple data sources.

import Twilio from 'twilio';
import { DeepValidator, ValidationResult, ValidationOptions } from '../../src/validation';

/**
 * Test helper for deep validation with default test configuration.
 * Uses shorter timeouts suitable for test execution.
 */
export interface TestValidationConfig {
  accountSid: string;
  authToken: string;
  syncServiceSid?: string;
  serverlessServiceSid?: string;
}

const DEFAULT_TEST_CONFIG: Partial<ValidationOptions> = {
  timeout: 10000, // 10 seconds for tests (production default is 30s)
  pollInterval: 1000, // 1 second between polls
};

interface CachedValidator {
  validator: DeepValidator;
  accountSid: string;
  config: TestValidationConfig;
}

let cachedValidator: CachedValidator | null = null;

/**
 * Creates or returns a cached DeepValidator instance for tests.
 * Caches the instance to avoid creating multiple Twilio clients.
 *
 * Note: syncServiceSid and serverlessServiceSid from config are stored
 * and should be passed to validation methods via options.
 */
export function getTestValidator(config: TestValidationConfig): DeepValidator {
  if (!cachedValidator || cachedValidator.accountSid !== config.accountSid) {
    const client = Twilio(config.accountSid, config.authToken);
    cachedValidator = {
      validator: new DeepValidator(client),
      accountSid: config.accountSid,
      config,
    };
  }
  return cachedValidator.validator;
}

/**
 * Gets the stored config for the current validator.
 * Useful for passing syncServiceSid to validation methods.
 */
export function getValidatorConfig(): TestValidationConfig | null {
  return cachedValidator?.config ?? null;
}

/**
 * Validates a message operation with test-appropriate timeouts.
 * Throws assertion-friendly errors on validation failure.
 */
export async function validateMessageInTest(
  validator: DeepValidator,
  messageSid: string,
  options?: Partial<ValidationOptions>
): Promise<ValidationResult> {
  const mergedOptions = { ...DEFAULT_TEST_CONFIG, ...options };
  const result = await validator.validateMessage(messageSid, mergedOptions);

  if (!result.success) {
    throw new TestValidationError('Message validation failed', result);
  }

  return result;
}

/**
 * Validates a call operation with test-appropriate timeouts.
 * Throws assertion-friendly errors on validation failure.
 */
export async function validateCallInTest(
  validator: DeepValidator,
  callSid: string,
  options?: Partial<ValidationOptions>
): Promise<ValidationResult> {
  const mergedOptions = { ...DEFAULT_TEST_CONFIG, ...options };
  const result = await validator.validateCall(callSid, mergedOptions);

  if (!result.success) {
    throw new TestValidationError('Call validation failed', result);
  }

  return result;
}

/**
 * Validates a verification operation with test-appropriate timeouts.
 * Throws assertion-friendly errors on validation failure.
 */
export async function validateVerificationInTest(
  validator: DeepValidator,
  serviceSid: string,
  verificationSid: string,
  options?: Partial<ValidationOptions>
): Promise<ValidationResult> {
  const mergedOptions = { ...DEFAULT_TEST_CONFIG, ...options };
  const result = await validator.validateVerification(serviceSid, verificationSid, mergedOptions);

  if (!result.success) {
    throw new TestValidationError('Verification validation failed', result);
  }

  return result;
}

/**
 * Validates a task operation with test-appropriate timeouts.
 * Throws assertion-friendly errors on validation failure.
 */
export async function validateTaskInTest(
  validator: DeepValidator,
  workspaceSid: string,
  taskSid: string,
  options?: Partial<ValidationOptions>
): Promise<ValidationResult> {
  const mergedOptions = { ...DEFAULT_TEST_CONFIG, ...options };
  const result = await validator.validateTask(workspaceSid, taskSid, mergedOptions);

  if (!result.success) {
    throw new TestValidationError('Task validation failed', result);
  }

  return result;
}

/**
 * Custom error class for test validation failures.
 * Provides detailed information about what checks failed.
 */
export class TestValidationError extends Error {
  public readonly validationResult: ValidationResult;

  constructor(message: string, result: ValidationResult) {
    const errorSummary = result.errors.length > 0 ? `\n  Errors: ${result.errors.join(', ')}` : '';
    const warningSummary =
      result.warnings.length > 0 ? `\n  Warnings: ${result.warnings.join(', ')}` : '';
    const checkSummary = Object.entries(result.checks)
      .filter(([, check]) => check && !check.passed)
      .map(([name, check]) => `\n  - ${name}: ${check?.message || 'failed'}`)
      .join('');

    super(
      `${message}\n` +
        `Resource: ${result.resourceType} ${result.resourceSid}\n` +
        `Status: ${result.primaryStatus}` +
        errorSummary +
        warningSummary +
        (checkSummary ? `\nFailed checks:${checkSummary}` : '')
    );

    this.name = 'TestValidationError';
    this.validationResult = result;
  }
}

/**
 * Assertion helper to check validation result in tests.
 * Use with Jest's expect().
 */
export function expectValidationSuccess(result: ValidationResult): void {
  const failedChecks = Object.entries(result.checks)
    .filter(([, check]) => check && !check.passed)
    .map(([name]) => name);

  if (!result.success || failedChecks.length > 0) {
    throw new TestValidationError('Validation assertion failed', result);
  }
}

/**
 * Creates test expectations for validation results.
 * Returns an object with custom matchers.
 */
export const validationMatchers = {
  /**
   * Checks that validation passed overall.
   */
  toHavePassedValidation(result: ValidationResult) {
    const pass = result.success;
    return {
      pass,
      message: () =>
        pass
          ? `Expected validation to fail but it passed`
          : `Expected validation to pass but it failed: ${result.errors.join(', ')}`,
    };
  },

  /**
   * Checks that a specific check passed.
   */
  toHavePassedCheck(result: ValidationResult, checkName: string) {
    const check = result.checks[checkName as keyof typeof result.checks];
    const pass = check?.passed ?? false;
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${checkName} check to fail but it passed`
          : `Expected ${checkName} check to pass but it failed: ${check?.message || 'check not found'}`,
    };
  },

  /**
   * Checks that no debugger alerts were found.
   */
  toHaveNoDebuggerAlerts(result: ValidationResult) {
    const check = result.checks.debuggerAlerts;
    const pass = check?.passed ?? false;
    return {
      pass,
      message: () =>
        pass
          ? `Expected debugger alerts but none were found`
          : `Expected no debugger alerts but found: ${check?.message || 'unknown'}`,
    };
  },
};

/**
 * Extends Jest's expect with validation matchers.
 * Call this in your test setup file.
 */
export function extendExpectWithValidation(): void {
  expect.extend(validationMatchers);
}

// Type augmentation for Jest
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHavePassedValidation(): R;
      toHavePassedCheck(checkName: string): R;
      toHaveNoDebuggerAlerts(): R;
    }
  }
}
