// ABOUTME: Twilio Verify tools for phone verification and 2FA.
// ABOUTME: Provides start_verification, check_verification, and get_verification_status tools.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';

function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
) {
  return { name, description, inputSchema: schema, handler };
}

/**
 * Returns all Verify-related tools configured with the given Twilio context.
 */
export function verifyTools(context: TwilioContext) {
  const { client, verifyServiceSid } = context;

  const startVerification = createTool(
    'start_verification',
    'Start a verification by sending an OTP via SMS, call, or email.',
    z.object({
      to: z.string().describe('Phone number (E.164) or email address'),
      channel: z.enum(['sms', 'call', 'email']).default('sms').describe('Delivery channel'),
      serviceSid: z.string().startsWith('VA').optional().describe('Verify Service SID (uses default if not provided)'),
    }),
    async ({ to, channel, serviceSid }) => {
      const sid = serviceSid || verifyServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Verify Service SID configured' }, null, 2),
          }],
        };
      }

      const verification = await client.verify.v2
        .services(sid)
        .verifications.create({ to, channel });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: verification.sid,
            to: verification.to,
            channel: verification.channel,
            status: verification.status,
            valid: verification.valid,
            dateCreated: verification.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const checkVerification = createTool(
    'check_verification',
    'Verify a code provided by the user.',
    z.object({
      to: z.string().describe('Phone number (E.164) or email that received the code'),
      code: z.string().length(6).describe('6-digit verification code'),
      serviceSid: z.string().startsWith('VA').optional().describe('Verify Service SID (uses default if not provided)'),
    }),
    async ({ to, code, serviceSid }) => {
      const sid = serviceSid || verifyServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Verify Service SID configured' }, null, 2),
          }],
        };
      }

      const verificationCheck = await client.verify.v2
        .services(sid)
        .verificationChecks.create({ to, code });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: verificationCheck.sid,
            to: verificationCheck.to,
            channel: verificationCheck.channel,
            status: verificationCheck.status,
            valid: verificationCheck.valid,
            dateCreated: verificationCheck.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const getVerificationStatus = createTool(
    'get_verification_status',
    'Check the status of a pending verification.',
    z.object({
      verificationSid: z.string().startsWith('VE').describe('Verification SID (starts with VE)'),
      serviceSid: z.string().startsWith('VA').optional().describe('Verify Service SID (uses default if not provided)'),
    }),
    async ({ verificationSid, serviceSid }) => {
      const sid = serviceSid || verifyServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Verify Service SID configured' }, null, 2),
          }],
        };
      }

      const verification = await client.verify.v2
        .services(sid)
        .verifications(verificationSid)
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: verification.sid,
            to: verification.to,
            channel: verification.channel,
            status: verification.status,
            valid: verification.valid,
            dateCreated: verification.dateCreated,
            dateUpdated: verification.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  return [startVerification, checkVerification, getVerificationStatus];
}
