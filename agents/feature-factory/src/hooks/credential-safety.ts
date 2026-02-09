// ABOUTME: Credential safety hook for Feature Factory.
// ABOUTME: Blocks writes containing hardcoded Twilio credentials.

import type { HookResult } from '../types.js';

/**
 * Credential violation details
 */
export interface CredentialViolation {
  type: 'account_sid' | 'api_key' | 'auth_token' | 'api_secret';
  pattern: string;
  suggestion: string;
}

/**
 * Result of credential validation
 */
export interface CredentialValidationResult extends HookResult {
  violations?: CredentialViolation[];
}

/**
 * Patterns that indicate safe usage (env vars, context references)
 */
const SAFE_PATTERNS = [
  /process\.env\./,
  /context\./,
  /TWILIO_ACCOUNT_SID/,
  /TWILIO_AUTH_TOKEN/,
  /TWILIO_API_KEY/,
  /TWILIO_API_SECRET/,
  /ACCOUNT_SID/,
  /AUTH_TOKEN/,
  /API_KEY/,
  /API_SECRET/,
  /\.env/,
  /getenv/,
  /environ/,
];

/**
 * Check if a line contains a safe pattern (env var reference)
 */
function lineContainsSafePattern(line: string): boolean {
  return SAFE_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Check for hardcoded Twilio Account SID
 * Pattern: AC followed by 32 hex characters
 */
function checkAccountSid(content: string): CredentialViolation | null {
  const pattern = /AC[a-f0-9]{32}/gi;
  const lines = content.split('\n');

  for (const line of lines) {
    if (pattern.test(line) && !lineContainsSafePattern(line)) {
      return {
        type: 'account_sid',
        pattern: 'AC[a-f0-9]{32}',
        suggestion: 'Use process.env.TWILIO_ACCOUNT_SID or context.TWILIO_ACCOUNT_SID',
      };
    }
    pattern.lastIndex = 0;
  }

  return null;
}

/**
 * Check for hardcoded Twilio API Key SID
 * Pattern: SK followed by 32 hex characters
 */
function checkApiKeySid(content: string): CredentialViolation | null {
  const pattern = /SK[a-f0-9]{32}/gi;
  const lines = content.split('\n');

  for (const line of lines) {
    if (pattern.test(line) && !lineContainsSafePattern(line)) {
      return {
        type: 'api_key',
        pattern: 'SK[a-f0-9]{32}',
        suggestion: 'Use process.env.TWILIO_API_KEY or context.TWILIO_API_KEY',
      };
    }
    pattern.lastIndex = 0;
  }

  return null;
}

/**
 * Check for hardcoded auth token assignment
 * Pattern: authToken or AUTH_TOKEN assigned to 32-char hex string
 */
function checkAuthToken(content: string): CredentialViolation | null {
  // Look for assignments like: authToken = "abc123..." or AUTH_TOKEN: "abc123..."
  const pattern = /(authToken|AUTH_TOKEN|auth_token)['"]?\s*[:=]\s*['"][a-f0-9]{32}['"]/gi;

  if (pattern.test(content)) {
    return {
      type: 'auth_token',
      pattern: 'authToken = "[32-char hex]"',
      suggestion: 'Use process.env.TWILIO_AUTH_TOKEN or context.TWILIO_AUTH_TOKEN',
    };
  }

  return null;
}

/**
 * Check for hardcoded API secret assignment
 * Pattern: apiSecret or API_SECRET assigned to 32-char hex string
 */
function checkApiSecret(content: string): CredentialViolation | null {
  const pattern = /(apiSecret|API_SECRET|api_secret)['"]?\s*[:=]\s*['"][a-zA-Z0-9]{32}['"]/gi;

  if (pattern.test(content)) {
    return {
      type: 'api_secret',
      pattern: 'apiSecret = "[32-char string]"',
      suggestion: 'Use process.env.TWILIO_API_SECRET or context.TWILIO_API_SECRET',
    };
  }

  return null;
}

/**
 * Validate content for hardcoded credentials
 *
 * Called by Write and Edit tools before executing to prevent
 * agents from writing hardcoded Twilio credentials.
 */
export function validateCredentials(content: string): CredentialValidationResult {
  const violations: CredentialViolation[] = [];

  // Run all checks
  const accountSidViolation = checkAccountSid(content);
  if (accountSidViolation) {violations.push(accountSidViolation);}

  const apiKeyViolation = checkApiKeySid(content);
  if (apiKeyViolation) {violations.push(apiKeyViolation);}

  const authTokenViolation = checkAuthToken(content);
  if (authTokenViolation) {violations.push(authTokenViolation);}

  const apiSecretViolation = checkApiSecret(content);
  if (apiSecretViolation) {violations.push(apiSecretViolation);}

  if (violations.length > 0) {
    const errorMessages = violations.map(v =>
      `Hardcoded ${v.type.replace('_', ' ')} detected (${v.pattern}). ${v.suggestion}`
    );

    return {
      passed: false,
      error: `CREDENTIAL SAFETY VIOLATION:\n${errorMessages.join('\n')}`,
      violations,
    };
  }

  return {
    passed: true,
  };
}

/**
 * Check if a file path should be excluded from credential validation
 * (e.g., test files, documentation, env examples)
 */
export function shouldSkipValidation(filePath: string): boolean {
  const skipPatterns = [
    /\.env\.example$/,
    /\.env\.sample$/,
    /\.md$/,
    /CLAUDE\.md$/,
    /README/,
    /\.test\.(ts|js)$/,
    /\.spec\.(ts|js)$/,
    /__tests__\//,
    /test\//,
    /docs\//,
  ];

  return skipPatterns.some(pattern => pattern.test(filePath));
}
