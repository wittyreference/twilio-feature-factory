// ABOUTME: Twilio TrustHub tools for business identity and compliance.
// ABOUTME: Provides comprehensive profile, product, and policy management with submission workflow.

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
 * Returns all TrustHub-related tools configured with the given Twilio context.
 */
export function trusthubTools(context: TwilioContext) {
  const { client } = context;

  const createCustomerProfile = createTool(
    'create_customer_profile',
    'Create a customer profile for regulatory compliance.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the profile'),
      email: z.string().email().describe('Contact email for the business'),
      policySid: z.string().startsWith('RN').describe('Policy SID for compliance type (starts with RN)'),
      statusCallback: z.string().url().optional().describe('Webhook URL for status updates'),
    }),
    async ({ friendlyName, email, policySid, statusCallback }) => {
      const params: {
        friendlyName: string;
        email: string;
        policySid: string;
        statusCallback?: string;
      } = {
        friendlyName,
        email,
        policySid,
      };

      if (statusCallback) {params.statusCallback = statusCallback;}

      const profile = await client.trusthub.v1.customerProfiles.create(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: profile.sid,
            friendlyName: profile.friendlyName,
            email: profile.email,
            status: profile.status,
            policySid: profile.policySid,
            dateCreated: profile.dateCreated,
            dateUpdated: profile.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listCustomerProfiles = createTool(
    'list_customer_profiles',
    'List customer profiles in the account.',
    z.object({
      status: z.enum(['draft', 'pending-review', 'in-review', 'twilio-rejected', 'twilio-approved']).optional().describe('Filter by status'),
      friendlyName: z.string().optional().describe('Filter by friendly name'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum profiles to return'),
    }),
    async ({ status, friendlyName, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) {params.status = status;}
      if (friendlyName) {params.friendlyName = friendlyName;}

      const profiles = await client.trusthub.v1.customerProfiles.list(params);

      const result = profiles.map(p => ({
        sid: p.sid,
        friendlyName: p.friendlyName,
        email: p.email,
        status: p.status,
        policySid: p.policySid,
        dateCreated: p.dateCreated,
        dateUpdated: p.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            profiles: result,
          }, null, 2),
        }],
      };
    }
  );

  const listTrustProducts = createTool(
    'list_trust_products',
    'List trust products (A2P brands, SHAKEN/STIR registrations).',
    z.object({
      status: z.enum(['draft', 'pending-review', 'in-review', 'twilio-rejected', 'twilio-approved']).optional().describe('Filter by status'),
      friendlyName: z.string().optional().describe('Filter by friendly name'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum products to return'),
    }),
    async ({ status, friendlyName, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) {params.status = status;}
      if (friendlyName) {params.friendlyName = friendlyName;}

      const products = await client.trusthub.v1.trustProducts.list(params);

      const result = products.map(p => ({
        sid: p.sid,
        friendlyName: p.friendlyName,
        email: p.email,
        status: p.status,
        policySid: p.policySid,
        dateCreated: p.dateCreated,
        dateUpdated: p.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            products: result,
          }, null, 2),
        }],
      };
    }
  );

  const listPolicies = createTool(
    'list_policies',
    'List available compliance policies (A2P, SHAKEN/STIR, etc.).',
    z.object({
      limit: z.number().min(1).max(100).default(50).describe('Maximum policies to return'),
    }),
    async ({ limit }) => {
      const policies = await client.trusthub.v1.policies.list({ limit });

      const result = policies.map(p => ({
        sid: p.sid,
        friendlyName: p.friendlyName,
        requirements: p.requirements,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            policies: result,
          }, null, 2),
        }],
      };
    }
  );

  const getCustomerProfile = createTool(
    'get_customer_profile',
    'Get details of a specific customer profile.',
    z.object({
      customerProfileSid: z.string().startsWith('BU').describe('Customer Profile SID (starts with BU)'),
    }),
    async ({ customerProfileSid }) => {
      const profile = await client.trusthub.v1.customerProfiles(customerProfileSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: profile.sid,
            friendlyName: profile.friendlyName,
            email: profile.email,
            status: profile.status,
            policySid: profile.policySid,
            validUntil: profile.validUntil,
            statusCallback: profile.statusCallback,
            dateCreated: profile.dateCreated,
            dateUpdated: profile.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updateCustomerProfile = createTool(
    'update_customer_profile',
    'Update a customer profile.',
    z.object({
      customerProfileSid: z.string().startsWith('BU').describe('Customer Profile SID (starts with BU)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      email: z.string().email().optional().describe('New contact email'),
      statusCallback: z.string().url().optional().describe('New status callback URL'),
      status: z.enum(['draft', 'pending-review']).optional().describe('Update status (set to pending-review to submit)'),
    }),
    async ({ customerProfileSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {params[key] = value;}
      });

      const profile = await client.trusthub.v1.customerProfiles(customerProfileSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: profile.sid,
            friendlyName: profile.friendlyName,
            email: profile.email,
            status: profile.status,
            dateUpdated: profile.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteCustomerProfile = createTool(
    'delete_customer_profile',
    'Delete a customer profile (only draft status).',
    z.object({
      customerProfileSid: z.string().startsWith('BU').describe('Customer Profile SID (starts with BU)'),
    }),
    async ({ customerProfileSid }) => {
      await client.trusthub.v1.customerProfiles(customerProfileSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            customerProfileSid,
          }, null, 2),
        }],
      };
    }
  );

  const listCustomerProfileEntityAssignments = createTool(
    'list_customer_profile_entity_assignments',
    'List entity assignments for a customer profile.',
    z.object({
      customerProfileSid: z.string().startsWith('BU').describe('Customer Profile SID (starts with BU)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum assignments to return'),
    }),
    async ({ customerProfileSid, limit }) => {
      const assignments = await client.trusthub.v1
        .customerProfiles(customerProfileSid)
        .customerProfilesEntityAssignments.list({ limit });

      const result = assignments.map(a => ({
        sid: a.sid,
        objectSid: a.objectSid,
        dateCreated: a.dateCreated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            customerProfileSid,
            count: result.length,
            entityAssignments: result,
          }, null, 2),
        }],
      };
    }
  );

  const createCustomerProfileEntityAssignment = createTool(
    'create_customer_profile_entity_assignment',
    'Assign an entity (end user, supporting document) to a customer profile.',
    z.object({
      customerProfileSid: z.string().startsWith('BU').describe('Customer Profile SID (starts with BU)'),
      objectSid: z.string().describe('Entity SID to assign (end user, supporting document)'),
    }),
    async ({ customerProfileSid, objectSid }) => {
      const assignment = await client.trusthub.v1
        .customerProfiles(customerProfileSid)
        .customerProfilesEntityAssignments.create({ objectSid });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: assignment.sid,
            customerProfileSid: assignment.customerProfileSid,
            objectSid: assignment.objectSid,
            dateCreated: assignment.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteCustomerProfileEntityAssignment = createTool(
    'delete_customer_profile_entity_assignment',
    'Remove an entity assignment from a customer profile.',
    z.object({
      customerProfileSid: z.string().startsWith('BU').describe('Customer Profile SID (starts with BU)'),
      assignmentSid: z.string().startsWith('BV').describe('Entity Assignment SID (starts with BV)'),
    }),
    async ({ customerProfileSid, assignmentSid }) => {
      await client.trusthub.v1
        .customerProfiles(customerProfileSid)
        .customerProfilesEntityAssignments(assignmentSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            removed: true,
            customerProfileSid,
            assignmentSid,
          }, null, 2),
        }],
      };
    }
  );

  const getTrustProduct = createTool(
    'get_trust_product',
    'Get details of a specific trust product.',
    z.object({
      trustProductSid: z.string().startsWith('BU').describe('Trust Product SID (starts with BU)'),
    }),
    async ({ trustProductSid }) => {
      const product = await client.trusthub.v1.trustProducts(trustProductSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: product.sid,
            friendlyName: product.friendlyName,
            email: product.email,
            status: product.status,
            policySid: product.policySid,
            validUntil: product.validUntil,
            statusCallback: product.statusCallback,
            dateCreated: product.dateCreated,
            dateUpdated: product.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createTrustProduct = createTool(
    'create_trust_product',
    'Create a new trust product (A2P brand, SHAKEN/STIR registration).',
    z.object({
      friendlyName: z.string().describe('Friendly name for the trust product'),
      email: z.string().email().describe('Contact email'),
      policySid: z.string().startsWith('RN').describe('Policy SID (starts with RN)'),
      statusCallback: z.string().url().optional().describe('Webhook URL for status updates'),
    }),
    async ({ friendlyName, email, policySid, statusCallback }) => {
      const params: {
        friendlyName: string;
        email: string;
        policySid: string;
        statusCallback?: string;
      } = { friendlyName, email, policySid };

      if (statusCallback) {params.statusCallback = statusCallback;}

      const product = await client.trusthub.v1.trustProducts.create(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: product.sid,
            friendlyName: product.friendlyName,
            email: product.email,
            status: product.status,
            policySid: product.policySid,
            dateCreated: product.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateTrustProduct = createTool(
    'update_trust_product',
    'Update a trust product.',
    z.object({
      trustProductSid: z.string().startsWith('BU').describe('Trust Product SID (starts with BU)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      email: z.string().email().optional().describe('New contact email'),
      statusCallback: z.string().url().optional().describe('New status callback URL'),
      status: z.enum(['draft', 'pending-review']).optional().describe('Update status (set to pending-review to submit)'),
    }),
    async ({ trustProductSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {params[key] = value;}
      });

      const product = await client.trusthub.v1.trustProducts(trustProductSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: product.sid,
            friendlyName: product.friendlyName,
            email: product.email,
            status: product.status,
            dateUpdated: product.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteTrustProduct = createTool(
    'delete_trust_product',
    'Delete a trust product (only draft status).',
    z.object({
      trustProductSid: z.string().startsWith('BU').describe('Trust Product SID (starts with BU)'),
    }),
    async ({ trustProductSid }) => {
      await client.trusthub.v1.trustProducts(trustProductSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            trustProductSid,
          }, null, 2),
        }],
      };
    }
  );

  const listEndUsers = createTool(
    'list_end_users',
    'List end users (individuals/businesses associated with trust products).',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum end users to return'),
    }),
    async ({ limit }) => {
      const endUsers = await client.trusthub.v1.endUsers.list({ limit });

      const result = endUsers.map(eu => ({
        sid: eu.sid,
        friendlyName: eu.friendlyName,
        type: eu.type,
        attributes: eu.attributes,
        dateCreated: eu.dateCreated,
        dateUpdated: eu.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            endUsers: result,
          }, null, 2),
        }],
      };
    }
  );

  const createEndUser = createTool(
    'create_end_user',
    'Create an end user for trust products.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the end user'),
      type: z.string().describe('End user type (e.g., "customer")'),
      attributes: z.record(z.unknown()).optional().describe('Additional attributes'),
    }),
    async ({ friendlyName, type, attributes }) => {
      const params: {
        friendlyName: string;
        type: string;
        attributes?: Record<string, unknown>;
      } = { friendlyName, type };

      if (attributes) {params.attributes = attributes;}

      const endUser = await client.trusthub.v1.endUsers.create(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: endUser.sid,
            friendlyName: endUser.friendlyName,
            type: endUser.type,
            attributes: endUser.attributes,
            dateCreated: endUser.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const listSupportingDocuments = createTool(
    'list_trusthub_supporting_documents',
    'List supporting documents for TrustHub trust products.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum documents to return'),
    }),
    async ({ limit }) => {
      const documents = await client.trusthub.v1.supportingDocuments.list({ limit });

      const result = documents.map(d => ({
        sid: d.sid,
        friendlyName: d.friendlyName,
        mimeType: d.mimeType,
        status: d.status,
        type: d.type,
        attributes: d.attributes,
        dateCreated: d.dateCreated,
        dateUpdated: d.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            documents: result,
          }, null, 2),
        }],
      };
    }
  );

  return [
    createCustomerProfile,
    listCustomerProfiles,
    getCustomerProfile,
    updateCustomerProfile,
    deleteCustomerProfile,
    listCustomerProfileEntityAssignments,
    createCustomerProfileEntityAssignment,
    deleteCustomerProfileEntityAssignment,
    listTrustProducts,
    getTrustProduct,
    createTrustProduct,
    updateTrustProduct,
    deleteTrustProduct,
    listEndUsers,
    createEndUser,
    listSupportingDocuments,
    listPolicies,
  ];
}
