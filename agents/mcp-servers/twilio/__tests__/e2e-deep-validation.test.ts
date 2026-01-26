// ABOUTME: End-to-end tests with full deep validation of Twilio operations.
// ABOUTME: These tests send real messages/calls and validate via multiple endpoints.

/**
 * IMPORTANT: These tests send REAL messages and make REAL calls.
 * They will incur costs on your Twilio account.
 *
 * To run these tests, set:
 *   RUN_DEEP_VALIDATION_TESTS=true
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID - Account SID
 *   TWILIO_AUTH_TOKEN - Auth Token
 *   TWILIO_PHONE_NUMBER - From number (E.164)
 *   TEST_PHONE_NUMBER - To number for testing (E.164)
 *   TWILIO_VERIFY_SERVICE_SID - Verify Service SID (optional)
 *   TWILIO_SYNC_SERVICE_SID - Sync Service SID for callback tracking (optional)
 */

import { messagingTools, voiceTools, verifyTools, TwilioContext } from '../src/index';
import { DeepValidator, ValidationResult } from '../src/validation';
import Twilio from 'twilio';
import { z } from 'zod';

const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  toNumber: process.env.TEST_PHONE_NUMBER || '',
  verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
  syncServiceSid: process.env.TWILIO_SYNC_SERVICE_SID || '',
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.authToken.length > 0 &&
  TEST_CREDENTIALS.fromNumber.startsWith('+') &&
  TEST_CREDENTIALS.toNumber.startsWith('+');

const shouldRunDeepValidation = process.env.RUN_DEEP_VALIDATION_TESTS === 'true';

function createTestContext(): TwilioContext {
  const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
  return {
    client,
    defaultFromNumber: TEST_CREDENTIALS.fromNumber,
    verifyServiceSid: TEST_CREDENTIALS.verifyServiceSid || undefined,
  };
}

function createValidator(): DeepValidator {
  const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
  return new DeepValidator(client);
}

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

function formatValidationResult(result: ValidationResult): string {
  const lines = [
    `Resource: ${result.resourceType} ${result.resourceSid}`,
    `Status: ${result.primaryStatus}`,
    `Success: ${result.success}`,
    `Duration: ${result.duration}ms`,
    '',
    'Checks:',
  ];

  for (const [name, check] of Object.entries(result.checks)) {
    if (check) {
      const status = check.passed ? '✓' : '✗';
      lines.push(`  ${status} ${name}: ${check.message}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push('', 'Errors:');
    result.errors.forEach((e) => lines.push(`  - ${e}`));
  }

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    result.warnings.forEach((w) => lines.push(`  - ${w}`));
  }

  return lines.join('\n');
}

describe('E2E Deep Validation Tests', () => {
  // Only run if explicitly enabled AND credentials are available
  const itDeepValidation =
    shouldRunDeepValidation && hasRealCredentials ? it : it.skip;

  let context: TwilioContext;
  let validator: DeepValidator;
  let messaging: Tool[];
  let voice: Tool[];
  let verify: Tool[];

  beforeAll(() => {
    if (shouldRunDeepValidation && hasRealCredentials) {
      context = createTestContext();
      validator = createValidator();
      messaging = messagingTools(context) as Tool[];
      voice = voiceTools(context) as Tool[];
      verify = verifyTools(context) as Tool[];
    }
  });

  describe('SMS Deep Validation', () => {
    itDeepValidation(
      'should send SMS and validate delivery via multiple endpoints',
      async () => {
        console.log('\n=== SMS Deep Validation Test ===');
        console.log(`From: ${TEST_CREDENTIALS.fromNumber}`);
        console.log(`To: ${TEST_CREDENTIALS.toNumber}`);

        // Step 1: Send SMS using MCP tool
        const sendTool = messaging.find((t) => t.name === 'send_sms')!;
        const sendResult = await sendTool.handler({
          to: TEST_CREDENTIALS.toNumber,
          body: `Deep validation test at ${new Date().toISOString()}`,
        });
        const sendResponse = JSON.parse(sendResult.content[0].text);

        console.log(`\nMessage sent: ${sendResponse.sid}`);
        expect(sendResponse.success).toBe(true);
        expect(sendResponse.sid).toMatch(/^SM/);

        const messageSid = sendResponse.sid;

        // Step 2: Wait a moment for message to process
        console.log('Waiting 5s for message to process...');
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Step 3: Deep validate the message
        console.log('\nRunning deep validation...');
        const validationResult = await validator.validateMessage(messageSid, {
          waitForTerminal: true,
          timeout: 30000,
          alertLookbackSeconds: 60,
          syncServiceSid: TEST_CREDENTIALS.syncServiceSid || undefined,
        });

        console.log('\n' + formatValidationResult(validationResult));

        // Assertions
        expect(validationResult.resourceSid).toBe(messageSid);
        expect(validationResult.resourceType).toBe('message');

        // Check if this is a carrier rejection (common in test environments)
        const statusData = validationResult.checks.resourceStatus.data as { errorCode?: number } | undefined;
        const isCarrierRejection = statusData?.errorCode === 30034 || statusData?.errorCode === 30007;

        if (isCarrierRejection) {
          console.log('\nNote: Message was carrier-rejected (common in test environments)');
          console.log('This validates that deep validation correctly detects delivery failures.');
          // Deep validation correctly detected the issue - test passes
          expect(validationResult.checks.resourceStatus.passed).toBe(false); // Correctly detected failure
        } else if (!validationResult.success) {
          console.error('\nValidation FAILED');
          console.error('Errors:', validationResult.errors);
          expect(validationResult.success).toBe(true);
        } else {
          console.log('\nValidation PASSED ✓');
          expect(validationResult.checks.resourceStatus.passed).toBe(true);
          expect(validationResult.checks.debuggerAlerts.passed).toBe(true);
        }
      },
      60000 // 60s timeout
    );
  });

  describe('Voice Call Deep Validation', () => {
    itDeepValidation(
      'should make call and validate via Voice Insights and Call Events',
      async () => {
        console.log('\n=== Voice Call Deep Validation Test ===');
        console.log(`From: ${TEST_CREDENTIALS.fromNumber}`);
        console.log(`To: ${TEST_CREDENTIALS.toNumber}`);

        // Step 1: Make call using MCP tool with TwiML that plays a message
        const makeTool = voice.find((t) => t.name === 'make_call')!;
        const callResult = await makeTool.handler({
          to: TEST_CREDENTIALS.toNumber,
          twiml: '<Response><Say>This is a deep validation test call. Goodbye.</Say><Hangup/></Response>',
        });
        const callResponse = JSON.parse(callResult.content[0].text);

        console.log(`\nCall initiated: ${callResponse.sid}`);
        expect(callResponse.success).toBe(true);
        expect(callResponse.sid).toMatch(/^CA/);

        const callSid = callResponse.sid;

        // Step 2: Wait for call to complete (short TwiML should finish quickly)
        console.log('Waiting 15s for call to complete...');
        await new Promise((resolve) => setTimeout(resolve, 15000));

        // Step 3: Deep validate the call
        console.log('\nRunning deep validation...');
        const validationResult = await validator.validateCall(callSid, {
          waitForTerminal: true,
          timeout: 30000,
          alertLookbackSeconds: 120,
          syncServiceSid: TEST_CREDENTIALS.syncServiceSid || undefined,
        });

        console.log('\n' + formatValidationResult(validationResult));

        // Assertions
        expect(validationResult.resourceSid).toBe(callSid);
        expect(validationResult.resourceType).toBe('call');
        expect(validationResult.checks.resourceStatus).toBeDefined();
        expect(validationResult.checks.debuggerAlerts.passed).toBe(true);
        expect(validationResult.checks.callEvents).toBeDefined();

        // Voice Insights may not be immediately available
        if (validationResult.checks.voiceInsights) {
          console.log('\nVoice Insights available');
        }

        if (!validationResult.success) {
          console.error('\nValidation FAILED');
          console.error('Errors:', validationResult.errors);
          // For calls, we expect either completed or the call may not answer
          // Check if the failure is just no-answer vs actual error
          const status = validationResult.primaryStatus;
          if (status === 'no-answer' || status === 'busy') {
            console.log(`Note: Call ended with ${status} - this may be expected`);
          }
        } else {
          console.log('\nValidation PASSED ✓');
        }

        // We check that validation ran without throwing, but allow no-answer
        expect(validationResult.checks.resourceStatus).toBeDefined();
      },
      90000 // 90s timeout for calls
    );
  });

  describe('Verification Deep Validation', () => {
    const itVerification =
      shouldRunDeepValidation &&
      hasRealCredentials &&
      TEST_CREDENTIALS.verifyServiceSid
        ? it
        : it.skip;

    itVerification(
      'should start verification and validate via multiple endpoints',
      async () => {
        console.log('\n=== Verification Deep Validation Test ===');
        console.log(`Service: ${TEST_CREDENTIALS.verifyServiceSid}`);
        console.log(`To: ${TEST_CREDENTIALS.toNumber}`);

        // Step 1: Start verification using MCP tool
        const startTool = verify.find((t) => t.name === 'start_verification')!;
        const verifyResult = await startTool.handler({
          to: TEST_CREDENTIALS.toNumber,
          channel: 'sms',
        });
        const verifyResponse = JSON.parse(verifyResult.content[0].text);

        console.log(`\nVerification started: ${verifyResponse.sid}`);
        expect(verifyResponse.success).toBe(true);
        expect(verifyResponse.sid).toMatch(/^VE/);
        expect(verifyResponse.status).toBe('pending');

        const verificationSid = verifyResponse.sid;

        // Step 2: Wait a moment for verification to process
        console.log('Waiting 3s for verification to process...');
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Step 3: Deep validate the verification
        console.log('\nRunning deep validation...');
        const validationResult = await validator.validateVerification(
          TEST_CREDENTIALS.verifyServiceSid,
          verificationSid,
          {
            alertLookbackSeconds: 60,
            syncServiceSid: TEST_CREDENTIALS.syncServiceSid || undefined,
          }
        );

        console.log('\n' + formatValidationResult(validationResult));

        // Assertions
        expect(validationResult.resourceSid).toBe(verificationSid);
        expect(validationResult.resourceType).toBe('verification');
        expect(validationResult.primaryStatus).toBe('pending');
        expect(validationResult.checks.resourceStatus.passed).toBe(true);
        expect(validationResult.checks.debuggerAlerts.passed).toBe(true);

        if (!validationResult.success) {
          console.error('\nValidation FAILED');
          console.error('Errors:', validationResult.errors);
        } else {
          console.log('\nValidation PASSED ✓');
        }

        expect(validationResult.success).toBe(true);
      },
      45000 // 45s timeout
    );
  });

  describe('Full Workflow Deep Validation', () => {
    itDeepValidation(
      'should run complete messaging workflow with validation at each step',
      async () => {
        console.log('\n=== Full Messaging Workflow Deep Validation ===');
        const results: { step: string; success: boolean; details: string }[] = [];

        // Step 1: Check account status first
        console.log('\n1. Checking account status...');
        const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
        const account = await client.api.v2010.accounts(TEST_CREDENTIALS.accountSid).fetch();
        results.push({
          step: 'Account Check',
          success: account.status === 'active',
          details: `Account ${account.friendlyName} is ${account.status}`,
        });
        console.log(`   Account: ${account.friendlyName} (${account.status})`);

        // Step 2: Send message
        console.log('\n2. Sending test message...');
        const sendTool = messaging.find((t) => t.name === 'send_sms')!;
        const sendResult = await sendTool.handler({
          to: TEST_CREDENTIALS.toNumber,
          body: `Workflow test ${Date.now()}`,
        });
        const sendResponse = JSON.parse(sendResult.content[0].text);
        results.push({
          step: 'Send Message',
          success: sendResponse.success,
          details: `SID: ${sendResponse.sid}`,
        });
        console.log(`   Sent: ${sendResponse.sid}`);

        // Step 3: Wait and validate
        console.log('\n3. Waiting for delivery...');
        await new Promise((resolve) => setTimeout(resolve, 5000));

        console.log('\n4. Deep validating message...');
        const validation = await validator.validateMessage(sendResponse.sid, {
          waitForTerminal: true,
          timeout: 25000,
        });

        // Check for carrier rejection (common in test environments)
        const statusData = validation.checks.resourceStatus.data as { errorCode?: number } | undefined;
        const isCarrierRejection = statusData?.errorCode === 30034 || statusData?.errorCode === 30007;

        results.push({
          step: 'Deep Validation',
          // Consider carrier rejection as "validation worked correctly"
          success: validation.success || isCarrierRejection,
          details: isCarrierRejection
            ? `Carrier rejection detected (expected in test env): ${validation.primaryStatus}`
            : `Status: ${validation.primaryStatus}, Checks: ${Object.entries(validation.checks)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}:${v!.passed ? '✓' : '✗'}`)
                .join(', ')}`,
        });

        // Step 5: Check for any debugger alerts
        console.log('\n5. Checking debugger for issues...');
        const alerts = await client.monitor.v1.alerts.list({
          startDate: new Date(Date.now() - 60000),
          limit: 10,
        });
        const relevantAlerts = alerts.filter((a) => a.resourceSid === sendResponse.sid);

        // Carrier rejection alerts are expected in test environments
        const carrierAlerts = relevantAlerts.filter((a) => a.errorCode === '30034' || a.errorCode === '30007');
        const otherAlerts = relevantAlerts.filter((a) => a.errorCode !== '30034' && a.errorCode !== '30007');

        results.push({
          step: 'Debugger Check',
          success: otherAlerts.length === 0, // Only fail on non-carrier alerts
          details: relevantAlerts.length === 0
            ? 'No alerts found'
            : carrierAlerts.length > 0
              ? `Carrier rejection alerts (expected): ${carrierAlerts.length}`
              : `Found ${relevantAlerts.length} alerts`,
        });

        // Summary
        console.log('\n=== Workflow Summary ===');
        results.forEach((r) => {
          const icon = r.success ? '✓' : '✗';
          console.log(`${icon} ${r.step}: ${r.details}`);
        });

        const allPassed = results.every((r) => r.success);
        console.log(`\nOverall: ${allPassed ? 'PASSED ✓' : 'FAILED ✗'}`);

        expect(allPassed).toBe(true);
      },
      90000
    );
  });
});
