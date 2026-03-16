// ABOUTME: Environment validation tool for agent self-verification of operating context.
// ABOUTME: Checks Twilio credentials, account identity, configured services, and warns on mismatches.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';

function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>
) {
  return { name, description, inputSchema: schema, handler };
}

/**
 * Returns environment validation tools configured with the given Twilio context.
 */
export function environmentTools(context: TwilioContext) {
  const { client } = context;

  const validateEnvironment = createTool(
    'validate_environment',
    'Validate the MCP server operating environment. Fetches account identity from Twilio API, checks configured service SIDs, and reports credential method. Use before operations to confirm you are targeting the correct account.',
    z.object({
      expectedAccountSid: z.string().startsWith('AC').optional().describe('Expected Account SID to verify against (warns on mismatch)'),
      expectedAccountName: z.string().optional().describe('Expected account friendly name substring to verify against (case-insensitive, warns on mismatch)'),
      checkServices: z.boolean().optional().default(true).describe('Verify configured service SIDs are reachable'),
    }),
    async ({ expectedAccountSid, expectedAccountName, checkServices }) => {
      const checks: Record<string, { passed: boolean; message: string }> = {};
      const warnings: string[] = [];

      // --- 1. Account identity ---
      // Try account.fetch() first (requires main auth token), fall back to a
      // lightweight API call (incoming phone numbers) for API key auth.
      let accountFriendlyName = '';
      let accountSid = client.accountSid;
      let accountStatus = '';
      let accountType = '';
      try {
        const account = await client.api.v2010.accounts(client.accountSid).fetch();
        accountSid = account.sid;
        accountFriendlyName = account.friendlyName;
        accountStatus = account.status;
        accountType = account.type;

        checks['accountReachable'] = { passed: true, message: `Account ${accountSid} (${accountFriendlyName})` };

        if (accountStatus !== 'active') {
          checks['accountActive'] = { passed: false, message: `Account status is '${accountStatus}', expected 'active'` };
        } else {
          checks['accountActive'] = { passed: true, message: 'Account is active' };
        }
      } catch {
        // account.fetch() fails with API key auth (401) — fall back to a
        // lightweight connectivity check that works with any credential type.
        try {
          await client.incomingPhoneNumbers.list({ limit: 1 });
          checks['accountReachable'] = { passed: true, message: `Account ${accountSid} (account details unavailable with API key auth)` };
          accountFriendlyName = '(unavailable — API key auth)';
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          checks['accountReachable'] = { passed: false, message: `Cannot reach Twilio API: ${msg}` };
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                checks,
                errors: ['Failed to reach Twilio API. Credentials may be invalid or expired.'],
              }, null, 2),
            }],
            isError: true,
          };
        }
      }

      // --- 2. Expected account verification ---
      if (expectedAccountSid && expectedAccountSid !== accountSid) {
        checks['expectedAccountSid'] = {
          passed: false,
          message: `MISMATCH: Operating on ${accountSid} but expected ${expectedAccountSid}`,
        };
        warnings.push(`Account SID mismatch — expected ${expectedAccountSid}, got ${accountSid}`);
      } else if (expectedAccountSid) {
        checks['expectedAccountSid'] = { passed: true, message: 'Account SID matches expected' };
      }

      if (expectedAccountName) {
        const nameMatch = accountFriendlyName.toLowerCase().includes(expectedAccountName.toLowerCase());
        if (!nameMatch) {
          checks['expectedAccountName'] = {
            passed: false,
            message: `MISMATCH: Account name '${accountFriendlyName}' does not contain '${expectedAccountName}'`,
          };
          warnings.push(`Account name mismatch — '${accountFriendlyName}' does not contain '${expectedAccountName}'`);
        } else {
          checks['expectedAccountName'] = { passed: true, message: `Account name '${accountFriendlyName}' matches` };
        }
      }

      // --- 3. Credential method ---
      const authMethod = process.env.TWILIO_API_KEY ? 'API Key (SK...)' : 'Auth Token';
      checks['authMethod'] = { passed: true, message: `Using ${authMethod}` };

      // --- 4. Configured phone number ---
      const fromNumber = context.defaultFromNumber;
      if (fromNumber) {
        checks['defaultFromNumber'] = { passed: true, message: `Default from: ${fromNumber}` };
      } else {
        checks['defaultFromNumber'] = { passed: false, message: 'No TWILIO_PHONE_NUMBER configured' };
        warnings.push('No default from number configured');
      }

      // --- 5. Regional configuration ---
      const region = process.env.TWILIO_REGION;
      const edge = process.env.TWILIO_EDGE;
      if (region) {
        checks['region'] = { passed: true, message: `Region: ${region}` };
      }
      if (edge) {
        checks['edge'] = { passed: true, message: `Edge: ${edge}` };
      }

      // --- 6. Service SID reachability ---
      if (checkServices) {
        // Verify Service
        const verifySid = context.verifyServiceSid;
        if (verifySid) {
          try {
            const service = await client.verify.v2.services(verifySid).fetch();
            checks['verifyService'] = { passed: true, message: `Verify: ${service.friendlyName} (${verifySid})` };
          } catch {
            checks['verifyService'] = { passed: false, message: `Verify SID ${verifySid} not reachable` };
            warnings.push(`Verify service ${verifySid} is configured but not reachable`);
          }
        } else {
          checks['verifyService'] = { passed: true, message: 'Not configured (optional)' };
        }

        // Sync Service
        const syncSid = context.syncServiceSid;
        if (syncSid) {
          try {
            const service = await client.sync.v1.services(syncSid).fetch();
            checks['syncService'] = { passed: true, message: `Sync: ${service.friendlyName} (${syncSid})` };
          } catch {
            checks['syncService'] = { passed: false, message: `Sync SID ${syncSid} not reachable` };
            warnings.push(`Sync service ${syncSid} is configured but not reachable`);
          }
        } else {
          checks['syncService'] = { passed: true, message: 'Not configured (optional)' };
        }

        // TaskRouter Workspace
        const trSid = context.taskrouterWorkspaceSid;
        if (trSid) {
          try {
            const workspace = await client.taskrouter.v1.workspaces(trSid).fetch();
            checks['taskrouterWorkspace'] = { passed: true, message: `TaskRouter: ${workspace.friendlyName} (${trSid})` };
          } catch {
            checks['taskrouterWorkspace'] = { passed: false, message: `TaskRouter SID ${trSid} not reachable` };
            warnings.push(`TaskRouter workspace ${trSid} is configured but not reachable`);
          }
        } else {
          checks['taskrouterWorkspace'] = { passed: true, message: 'Not configured (optional)' };
        }
      }

      // --- 7. Subaccount detection ---
      if (accountType === 'Full' && accountSid !== (process.env.TWILIO_ACCOUNT_SID || '')) {
        warnings.push('Authenticated account SID differs from TWILIO_ACCOUNT_SID env var — possible subaccount mismatch');
      }

      // --- Build result ---
      const allPassed = Object.values(checks).every(c => c.passed);
      const hasWarnings = warnings.length > 0;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: allPassed && !hasWarnings,
            account: {
              sid: accountSid,
              friendlyName: accountFriendlyName,
              status: accountStatus,
              type: accountType,
            },
            authMethod,
            defaultFromNumber: fromNumber || null,
            region: region || null,
            edge: edge || null,
            checks,
            ...(warnings.length > 0 ? { warnings } : {}),
          }, null, 2),
        }],
      };
    }
  );

  return [validateEnvironment];
}
