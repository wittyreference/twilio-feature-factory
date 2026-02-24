// ABOUTME: Twilio Payments API tools for PCI-compliant payment capture on active calls.
// ABOUTME: Provides create_payment, update_payment, and get_payment tools.

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

const PCI_WARNING = 'WARNING: Using payments requires PCI Mode to be enabled on your account. PCI Mode is IRREVERSIBLE and account-wide. Always use a subaccount for payments testing.';

/**
 * Returns all Payments-related tools configured with the given Twilio context.
 */
export function paymentsTools(context: TwilioContext) {
  const { client } = context;

  const createPayment = createTool(
    'create_payment',
    `Initiate PCI-compliant payment capture on an active call. ${PCI_WARNING}`,
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      idempotencyKey: z.string().describe('Idempotency key for the payment request (required by API)'),
      statusCallback: z.string().url().describe('URL to receive payment status callbacks'),
      paymentConnector: z.string().describe('Payment connector name (e.g. "Default")'),
      tokenType: z.enum(['one-time', 'reusable']).default('one-time').describe('Token type for the payment'),
      chargeAmount: z.string().optional().describe('Amount to charge (e.g. "9.99")'),
      currency: z.string().default('usd').optional().describe('Currency code (default: usd)'),
      description: z.string().optional().describe('Payment description'),
      input: z.enum(['dtmf']).optional().describe('How card info is collected'),
      paymentMethod: z.enum(['credit-card', 'ach-debit']).default('credit-card').optional().describe('Payment method type'),
      validCardTypes: z.array(z.string()).optional().describe('Allowed card types (e.g. ["visa", "mastercard"])'),
    }),
    async ({ callSid, idempotencyKey, statusCallback, paymentConnector, tokenType, chargeAmount, currency, description, input, paymentMethod, validCardTypes }) => {
      const params: Record<string, unknown> = {
        idempotencyKey,
        statusCallback,
        paymentConnector,
        tokenType,
      };
      if (chargeAmount !== undefined) params.chargeAmount = chargeAmount;
      if (currency !== undefined) params.currency = currency;
      if (description !== undefined) params.description = description;
      if (input !== undefined) params.input = input;
      if (paymentMethod !== undefined) params.paymentMethod = paymentMethod;
      if (validCardTypes !== undefined) params.validCardTypes = validCardTypes.join(' ');

      const payment = await client.calls(callSid).payments.create(params as any);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: payment.sid,
            callSid: payment.callSid,
            accountSid: payment.accountSid,
            dateCreated: payment.dateCreated,
            dateUpdated: payment.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updatePayment = createTool(
    'update_payment',
    `Update, complete, or cancel an in-progress payment on an active call. ${PCI_WARNING}`,
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      paymentSid: z.string().startsWith('PK').describe('Payment SID (starts with PK)'),
      idempotencyKey: z.string().describe('Idempotency key for the update request'),
      capture: z.enum([
        'payment-card-number',
        'security-code',
        'expiration-date',
        'postal-code',
        'bank-routing-number',
        'bank-account-number',
      ]).optional().describe('Payment field to capture next'),
      status: z.enum(['complete', 'cancel']).optional().describe('Set to complete or cancel the payment'),
    }),
    async ({ callSid, paymentSid, idempotencyKey, capture, status }) => {
      const params: Record<string, unknown> = {
        idempotencyKey,
      };
      if (capture !== undefined) params.capture = capture;
      if (status !== undefined) params.status = status;

      const payment = await client.calls(callSid).payments(paymentSid).update(params as any);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: payment.sid,
            callSid: payment.callSid,
            accountSid: payment.accountSid,
            dateCreated: payment.dateCreated,
            dateUpdated: payment.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const getPayment = createTool(
    'get_payment',
    `Get the status of a payment on a call. ${PCI_WARNING}`,
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      paymentSid: z.string().startsWith('PK').describe('Payment SID (starts with PK)'),
    }),
    async ({ callSid, paymentSid }) => {
      // SDK doesn't expose fetch() on payments — use REST API directly
      const resp = await client.request({
        method: 'get',
        uri: `https://api.twilio.com/2010-04-01/Accounts/${client.accountSid}/Calls/${callSid}/Payments/${paymentSid}.json`,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            ...resp.body,
          }, null, 2),
        }],
      };
    }
  );

  return [createPayment, updatePayment, getPayment];
}
