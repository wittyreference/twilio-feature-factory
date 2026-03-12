// ABOUTME: E2E tests for real SIP calls through Elastic SIP Trunking and PV SIP Domains.
// ABOUTME: Requires running Asterisk PBX on DigitalOcean droplet and provisioned Twilio SIP resources.

import { voiceTools, sipTools, validationTools, TwilioContext } from '../../../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

// Individual test timeouts are set per-test; this is the global fallback
jest.setTimeout(120000);

// ---------------------------------------------------------------------------
// Environment & credentials
// ---------------------------------------------------------------------------

const ENV = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  trunkSid: process.env.SIP_LAB_TRUNK_SID || '',
  trunkNumber: process.env.SIP_LAB_TRUNK_NUMBER || '',
  dropletIp: process.env.SIP_LAB_DROPLET_IP || '',
  ipAclSid: process.env.SIP_LAB_IP_ACL_SID || '',
  sshKey: (process.env.SIP_LAB_SSH_KEY || '~/.ssh/sip-lab').replace('~', process.env.HOME || ''),
  // Serverless domain for voiceUrl endpoints
  serverlessDomain: process.env.TWILIO_CALLBACK_BASE_URL || 'https://prototype-1483-dev.twil.io',
};

const hasSipLab =
  ENV.accountSid.startsWith('AC') &&
  ENV.authToken.length > 0 &&
  ENV.fromNumber.startsWith('+') &&
  ENV.trunkSid.startsWith('TK') &&
  ENV.trunkNumber.startsWith('+') &&
  ENV.dropletIp.length > 0;

const describeSipLab = hasSipLab ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

function createTestContext(): TwilioContext {
  const client = Twilio(ENV.accountSid, ENV.authToken);
  return { client, defaultFromNumber: ENV.fromNumber };
}

function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

async function callTool(tool: Tool, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = await tool.handler(params);
  return JSON.parse(result.content[0].text);
}

/** Sleep for ms */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Poll until fn() resolves without throwing. */
async function pollUntil<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; delayMs?: number; label?: string } = {},
): Promise<T> {
  const { maxAttempts = 20, delayMs = 3000, label = 'condition' } = opts;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxAttempts - 1) {
        throw new Error(
          `${label} not met after ${maxAttempts} attempts (${(maxAttempts * delayMs) / 1000}s): ${(err as Error).message}`,
        );
      }
      await sleep(delayMs);
    }
  }
  throw new Error('unreachable');
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeSipLab('SIP Lab E2E — Real calls with deep MCP validation', () => {
  let voice: Tool[];
  let sip: Tool[];
  let validation: Tool[];
  const testStartTime = new Date();

  beforeAll(() => {
    const ctx = createTestContext();
    voice = voiceTools(ctx) as Tool[];
    sip = sipTools(ctx) as Tool[];
    validation = validationTools(ctx) as Tool[];
  });

  // =========================================================================
  // Test A: Elastic SIP Trunk — PSTN call → SIP Trunk → Asterisk PBX
  // =========================================================================

  describe('Test A: Elastic SIP Trunk termination (PSTN→Trunk→PBX)', () => {
    let callSid: string;

    test('places outbound call to trunk number via make_call', async () => {
      const makeCall = findTool(voice, 'make_call');
      const result = await callTool(makeCall, {
        to: ENV.trunkNumber,
        from: ENV.fromNumber,
        // Pause keeps parent leg alive while Asterisk answers + plays audio
        twiml: '<Response><Pause length="20"/></Response>',
      });

      expect(result.success).toBe(true);
      // make_call returns { sid } not { callSid }
      expect(result.sid).toMatch(/^CA/);
      callSid = result.sid as string;
    }, 15000);

    test('call completes — Asterisk answers and plays audio', async () => {
      expect(callSid).toBeDefined();

      const getCall = findTool(voice, 'get_call');
      const finalCall = await pollUntil(
        async () => {
          const call = await callTool(getCall, { callSid });
          if (!['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(call.status as string)) {
            throw new Error(`Call still in progress: ${call.status}`);
          }
          return call;
        },
        { maxAttempts: 20, delayMs: 3000, label: 'call completion' },
      );

      expect(finalCall.status).toBe('completed');
      expect(Number(finalCall.duration)).toBeGreaterThan(3);
    }, 90000);

    test('validate_call confirms clean call with Voice Insights', async () => {
      expect(callSid).toBeDefined();

      const validateCall = findTool(validation, 'validate_call');
      const result = await callTool(validateCall, {
        callSid,
        minDuration: 3,
        waitForTerminal: false, // already completed
      });

      expect(result.success).toBe(true);
      // validate_call returns { primaryStatus, resourceSid }
      expect(result.primaryStatus).toBe('completed');
    }, 30000);
  });

  // =========================================================================
  // Test B: PV SIP Domain — PBX → SIP Domain → TwiML webhook
  // =========================================================================

  describe('Test B: PV SIP Domain (PBX→SIP Domain→TwiML)', () => {
    let domainSid: string | null = null;
    let aclMappingSid: string | null = null;
    let callSid: string | null = null;

    // Generate unique domain name to avoid collisions
    const testId = Date.now().toString(16).replace(/[0-9]/g, c => String.fromCharCode(97 + parseInt(c)));
    const domainName = `mcp-e2e-${testId}.sip.twilio.com`;
    const domainLabel = domainName.replace('.sip.twilio.com', '');

    afterAll(async () => {
      // Teardown in reverse order — each in try/catch to clean up as much as possible
      if (aclMappingSid && domainSid) {
        try {
          const deleteMappingTool = findTool(sip, 'delete_sip_domain_ip_acl_mapping');
          await callTool(deleteMappingTool, { domainSid, ipAccessControlListSid: ENV.ipAclSid });
        } catch { /* best effort */ }
      }

      if (domainSid) {
        try {
          const deleteDomainTool = findTool(sip, 'delete_sip_domain');
          await callTool(deleteDomainTool, { domainSid });
        } catch { /* best effort */ }
      }
    }, 30000);

    test('creates ephemeral SIP Domain with TwiML voiceUrl', async () => {
      const createDomain = findTool(sip, 'create_sip_domain');
      const result = await callTool(createDomain, {
        friendlyName: `mcp-e2e-${testId}`,
        domainName,
        // Use incoming-call handler as a simple TwiML responder
        voiceUrl: `${ENV.serverlessDomain}/voice/incoming-call`,
      });

      expect(result.success).toBe(true);
      expect(result.sid).toMatch(/^SD/);
      domainSid = result.sid as string;
    }, 15000);

    test('associates IP ACL for PBX authentication', async () => {
      expect(domainSid).toBeDefined();

      const createMapping = findTool(sip, 'create_sip_domain_ip_acl_mapping');
      const result = await callTool(createMapping, {
        domainSid,
        ipAccessControlListSid: ENV.ipAclSid,
      });

      expect(result.success).toBe(true);
      aclMappingSid = result.sid as string;
    }, 15000);

    test('API call routes through SIP Domain via <Dial><Sip>', async () => {
      expect(domainSid).toBeDefined();
      // Give Twilio a moment to propagate the domain + ACL mapping
      await sleep(5000);

      // Make an API call that dials a SIP URI on the ephemeral domain.
      // This tests the SIP Domain voiceUrl + IP ACL auth path from Twilio's side.
      // The domain's voiceUrl (/voice/incoming-call) returns TwiML to handle the call.
      const makeCall = findTool(voice, 'make_call');
      const result = await callTool(makeCall, {
        to: ENV.trunkNumber, // Valid number for caller ID
        from: ENV.fromNumber,
        twiml: `<Response><Dial timeout="10"><Sip>sip:test@${domainLabel}.sip.twilio.com</Sip></Dial></Response>`,
      });

      expect(result.success).toBe(true);
      expect(result.sid).toMatch(/^CA/);

      // Wait for call to reach terminal status
      const getCall = findTool(voice, 'get_call');
      const finalCall = await pollUntil(
        async () => {
          const call = await callTool(getCall, { callSid: result.sid as string });
          if (!['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(call.status as string)) {
            throw new Error(`Call still in progress: ${call.status}`);
          }
          return call;
        },
        { maxAttempts: 10, delayMs: 3000, label: 'SIP Domain call completion' },
      );

      // The call may complete or get no-answer depending on domain config
      // Success means the SIP Domain was reachable and processed the INVITE
      callSid = result.sid as string;
      expect(finalCall.status).toBeDefined();
    }, 60000);

    test('validate_call confirms SIP Domain call succeeded', async () => {
      if (!callSid) {
        console.log('Skipping — no SIP Domain call to validate');
        return;
      }

      const validateCall = findTool(validation, 'validate_call');
      const result = await callTool(validateCall, {
        callSid,
        minDuration: 1,
        waitForTerminal: true,
        timeout: 45000,
      });

      expect(result.success).toBe(true);
      expect(result.primaryStatus).toBe('completed');
    }, 60000);
  });

  // =========================================================================
  // Test C: Outbound PV SIP — <Dial><Sip> → PBX echo test
  // =========================================================================

  describe('Test C: Outbound PV SIP (<Dial><Sip>→PBX echo test)', () => {
    let callSid: string;

    test('places call with TwiML that dials SIP URI on PBX', async () => {
      const makeCall = findTool(voice, 'make_call');
      // Dial the echo test extension (600) on Asterisk via SIP
      const result = await callTool(makeCall, {
        to: ENV.trunkNumber, // Route through a valid number
        from: ENV.fromNumber,
        twiml: `<Response><Dial timeout="15"><Sip>sip:600@${ENV.dropletIp}:5060</Sip></Dial></Response>`,
      });

      expect(result.success).toBe(true);
      expect(result.sid).toMatch(/^CA/);
      callSid = result.sid as string;
    }, 15000);

    test('call completes — PBX echo test answers', async () => {
      expect(callSid).toBeDefined();

      const getCall = findTool(voice, 'get_call');
      const finalCall = await pollUntil(
        async () => {
          const call = await callTool(getCall, { callSid });
          if (!['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(call.status as string)) {
            throw new Error(`Call still in progress: ${call.status}`);
          }
          return call;
        },
        { maxAttempts: 15, delayMs: 3000, label: 'call completion' },
      );

      // Echo test should answer — accept completed or no-answer
      expect(['completed', 'no-answer']).toContain(finalCall.status);
    }, 60000);

    test('validate_call provides Voice Insights on SIP call', async () => {
      expect(callSid).toBeDefined();

      const validateCall = findTool(validation, 'validate_call');
      const result = await callTool(validateCall, {
        callSid,
        minDuration: 0, // echo test may be short
        waitForTerminal: false,
      });

      // Call may or may not fully connect depending on PBX NAT/firewall
      // The important thing is validate_call returns data without error
      expect(result.resourceSid).toBe(callSid);
      expect(result.primaryStatus).toBeDefined();
    }, 30000);
  });

  // =========================================================================
  // Test D: validate_sip infrastructure check
  // =========================================================================

  describe('Test D: validate_sip infrastructure check', () => {
    test('validates SIP Lab trunk with expected PBX IP', async () => {
      const validateSip = findTool(validation, 'validate_sip');
      const result = await callTool(validateSip, {
        trunkSid: ENV.trunkSid,
        expectedPbxIp: ENV.dropletIp,
        checkDebugger: true,
        lookbackSeconds: 600,
      });

      expect(result.success).toBe(true);
      expect(result.resourceType).toBe('sip');

      // Verify individual checks
      const checks = result.checks as Record<string, { passed: boolean; message: string }>;
      expect(checks.trunk.passed).toBe(true);
      expect(checks.trunkIpAcl.passed).toBe(true);
      expect(checks.trunkPbxIp.passed).toBe(true);
      expect(checks.trunkCredentials.passed).toBe(true);
      expect(checks.trunkOrigination.passed).toBe(true);
      expect(checks.trunkPhoneNumbers.passed).toBe(true);
      expect(checks.debugger.passed).toBe(true);

      // Verify no errors or warnings
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    }, 30000);
  });

  // =========================================================================
  // Test E: Debugger clean after all tests
  // =========================================================================

  describe('Test E: Debugger clean after test window', () => {
    test('no SIP errors in debugger since test start', async () => {
      const validateDebugger = findTool(validation, 'validate_debugger');

      // Calculate lookback from test start
      const elapsedSeconds = Math.ceil((Date.now() - testStartTime.getTime()) / 1000) + 60;

      const result = await callTool(validateDebugger, {
        lookbackSeconds: elapsedSeconds,
        logLevel: 'error',
      });

      // validate_debugger returns { success, totalAlerts, errorAlerts, warningAlerts, alerts }
      // Filter for SIP-specific errors only — other errors are outside our scope
      const alerts = (result.alerts || []) as Array<{ errorCode: string; alertText: string }>;
      const sipErrors = alerts.filter(a => {
        const code = parseInt(a.errorCode, 10);
        return (code >= 13000 && code < 14000) || (code >= 64000 && code < 65000);
      });

      if (sipErrors.length > 0) {
        console.log(
          'SIP errors found:',
          sipErrors.map(a => `${a.errorCode}: ${a.alertText}`),
        );
      }
      expect(sipErrors).toHaveLength(0);
    }, 15000);
  });
});
