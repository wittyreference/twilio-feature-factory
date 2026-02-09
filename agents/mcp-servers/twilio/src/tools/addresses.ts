// ABOUTME: Twilio Address tools for regulatory compliance.
// ABOUTME: Provides address CRUD for phone number requirements.

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
 * Returns all Address-related tools configured with the given Twilio context.
 */
export function addressesTools(context: TwilioContext) {
  const { client } = context;

  const listAddresses = createTool(
    'list_addresses',
    'List addresses in the account.',
    z.object({
      customerName: z.string().optional().describe('Filter by customer name'),
      friendlyName: z.string().optional().describe('Filter by friendly name'),
      isoCountry: z.string().length(2).optional().describe('Filter by country code'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum addresses to return'),
    }),
    async ({ customerName, friendlyName, isoCountry, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (customerName) {params.customerName = customerName;}
      if (friendlyName) {params.friendlyName = friendlyName;}
      if (isoCountry) {params.isoCountry = isoCountry;}

      const addresses = await client.addresses.list(params);

      const result = addresses.map(a => ({
        sid: a.sid,
        friendlyName: a.friendlyName,
        customerName: a.customerName,
        street: a.street,
        city: a.city,
        region: a.region,
        postalCode: a.postalCode,
        isoCountry: a.isoCountry,
        validated: a.validated,
        verified: a.verified,
        emergencyEnabled: a.emergencyEnabled,
        dateCreated: a.dateCreated,
        dateUpdated: a.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            addresses: result,
          }, null, 2),
        }],
      };
    }
  );

  const getAddress = createTool(
    'get_address',
    'Get details of a specific address.',
    z.object({
      addressSid: z.string().startsWith('AD').describe('Address SID (starts with AD)'),
    }),
    async ({ addressSid }) => {
      const address = await client.addresses(addressSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: address.sid,
            friendlyName: address.friendlyName,
            customerName: address.customerName,
            street: address.street,
            city: address.city,
            region: address.region,
            postalCode: address.postalCode,
            isoCountry: address.isoCountry,
            validated: address.validated,
            verified: address.verified,
            emergencyEnabled: address.emergencyEnabled,
            dateCreated: address.dateCreated,
            dateUpdated: address.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createAddress = createTool(
    'create_address',
    'Create a new address for regulatory compliance.',
    z.object({
      customerName: z.string().describe('Customer name for the address'),
      street: z.string().describe('Street address'),
      city: z.string().describe('City'),
      region: z.string().describe('State/Province/Region'),
      postalCode: z.string().describe('Postal/ZIP code'),
      isoCountry: z.string().length(2).describe('ISO 3166-1 alpha-2 country code'),
      friendlyName: z.string().optional().describe('Friendly name for the address'),
      emergencyEnabled: z.boolean().default(false).describe('Enable for emergency calling (E911)'),
      autoCorrectAddress: z.boolean().default(true).describe('Auto-correct address formatting'),
    }),
    async ({ customerName, street, city, region, postalCode, isoCountry, friendlyName, emergencyEnabled, autoCorrectAddress }) => {
      const address = await client.addresses.create({
        customerName,
        street,
        city,
        region,
        postalCode,
        isoCountry: isoCountry.toUpperCase(),
        emergencyEnabled,
        autoCorrectAddress,
        ...(friendlyName && { friendlyName }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: address.sid,
            friendlyName: address.friendlyName,
            customerName: address.customerName,
            street: address.street,
            city: address.city,
            region: address.region,
            postalCode: address.postalCode,
            isoCountry: address.isoCountry,
            validated: address.validated,
            verified: address.verified,
            emergencyEnabled: address.emergencyEnabled,
            dateCreated: address.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateAddress = createTool(
    'update_address',
    'Update an existing address.',
    z.object({
      addressSid: z.string().startsWith('AD').describe('Address SID (starts with AD)'),
      customerName: z.string().optional().describe('New customer name'),
      street: z.string().optional().describe('New street address'),
      city: z.string().optional().describe('New city'),
      region: z.string().optional().describe('New state/province'),
      postalCode: z.string().optional().describe('New postal code'),
      friendlyName: z.string().optional().describe('New friendly name'),
      emergencyEnabled: z.boolean().optional().describe('Enable/disable emergency calling'),
      autoCorrectAddress: z.boolean().optional().describe('Auto-correct address formatting'),
    }),
    async ({ addressSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {params[key] = value;}
      });

      const address = await client.addresses(addressSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: address.sid,
            friendlyName: address.friendlyName,
            customerName: address.customerName,
            street: address.street,
            city: address.city,
            region: address.region,
            postalCode: address.postalCode,
            validated: address.validated,
            verified: address.verified,
            emergencyEnabled: address.emergencyEnabled,
            dateUpdated: address.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteAddress = createTool(
    'delete_address',
    'Delete an address.',
    z.object({
      addressSid: z.string().startsWith('AD').describe('Address SID (starts with AD)'),
    }),
    async ({ addressSid }) => {
      await client.addresses(addressSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            addressSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Dependent Phone Numbers ============

  const listDependentPhoneNumbers = createTool(
    'list_address_phone_numbers',
    'List phone numbers that depend on an address.',
    z.object({
      addressSid: z.string().startsWith('AD').describe('Address SID (starts with AD)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum numbers to return'),
    }),
    async ({ addressSid, limit }) => {
      const numbers = await client.addresses(addressSid).dependentPhoneNumbers.list({ limit });

      const result = numbers.map(n => ({
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        capabilities: n.capabilities,
        addressRequirements: n.addressRequirements,
        emergencyStatus: n.emergencyStatus,
        emergencyAddressSid: n.emergencyAddressSid,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            addressSid,
            count: result.length,
            phoneNumbers: result,
          }, null, 2),
        }],
      };
    }
  );

  return [
    listAddresses,
    getAddress,
    createAddress,
    updateAddress,
    deleteAddress,
    listDependentPhoneNumbers,
  ];
}
