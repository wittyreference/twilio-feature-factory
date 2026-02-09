// ABOUTME: Twilio Numbers v2 tools for regulatory bundles.
// ABOUTME: Provides comprehensive bundle, document, and regulation management with submission workflow.

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
 * Returns all Regulatory-related tools configured with the given Twilio context.
 */
export function regulatoryTools(context: TwilioContext) {
  const { client } = context;

  const listRegulatoryBundles = createTool(
    'list_regulatory_bundles',
    'List regulatory compliance bundles for number ownership.',
    z.object({
      status: z.enum(['draft', 'pending-review', 'in-review', 'twilio-rejected', 'twilio-approved', 'provisionally-approved']).optional().describe('Filter by status'),
      friendlyName: z.string().optional().describe('Filter by friendly name'),
      regulationSid: z.string().optional().describe('Filter by regulation SID'),
      isoCountry: z.string().length(2).optional().describe('Filter by ISO country code'),
      numberType: z.enum(['local', 'mobile', 'national', 'toll-free']).optional().describe('Filter by number type'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum bundles to return'),
    }),
    async ({ status, friendlyName, regulationSid, isoCountry, numberType, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) {params.status = status;}
      if (friendlyName) {params.friendlyName = friendlyName;}
      if (regulationSid) {params.regulationSid = regulationSid;}
      if (isoCountry) {params.isoCountry = isoCountry;}
      if (numberType) {params.numberType = numberType;}

      const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list(params);

      const result = bundles.map(b => {
        const bundle = b as unknown as Record<string, unknown>;
        return {
          sid: b.sid,
          friendlyName: b.friendlyName,
          status: b.status,
          email: b.email,
          statusCallback: b.statusCallback,
          regulationSid: b.regulationSid,
          isoCountry: bundle.isoCountry,
          numberType: bundle.numberType,
          validUntil: b.validUntil,
          dateCreated: b.dateCreated,
          dateUpdated: b.dateUpdated,
        };
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            bundles: result,
          }, null, 2),
        }],
      };
    }
  );

  const getBundleStatus = createTool(
    'get_bundle_status',
    'Get detailed status of a regulatory bundle.',
    z.object({
      bundleSid: z.string().startsWith('BU').describe('Bundle SID (starts with BU)'),
    }),
    async ({ bundleSid }) => {
      const bundle = await client.numbers.v2.regulatoryCompliance
        .bundles(bundleSid)
        .fetch();

      const bundleData = bundle as unknown as Record<string, unknown>;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: bundle.sid,
            friendlyName: bundle.friendlyName,
            status: bundle.status,
            email: bundle.email,
            statusCallback: bundle.statusCallback,
            regulationSid: bundle.regulationSid,
            isoCountry: bundleData.isoCountry,
            numberType: bundleData.numberType,
            validUntil: bundle.validUntil,
            dateCreated: bundle.dateCreated,
            dateUpdated: bundle.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listSupportingDocuments = createTool(
    'list_regulatory_supporting_documents',
    'List supporting documents for regulatory compliance bundles.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum documents to return'),
    }),
    async ({ limit }) => {
      const documents = await client.numbers.v2.regulatoryCompliance
        .supportingDocuments.list({ limit });

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

  const listRegulations = createTool(
    'list_regulations',
    'List available regulations for different countries and number types.',
    z.object({
      isoCountry: z.string().length(2).optional().describe('Filter by ISO country code'),
      numberType: z.enum(['local', 'mobile', 'national', 'toll-free']).optional().describe('Filter by number type'),
      endUserType: z.enum(['individual', 'business']).optional().describe('Filter by end user type'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum regulations to return'),
    }),
    async ({ isoCountry, numberType, endUserType, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (isoCountry) {params.isoCountry = isoCountry;}
      if (numberType) {params.numberType = numberType;}
      if (endUserType) {params.endUserType = endUserType;}

      const regulations = await client.numbers.v2.regulatoryCompliance.regulations.list(params);

      const result = regulations.map(r => ({
        sid: r.sid,
        friendlyName: r.friendlyName,
        isoCountry: r.isoCountry,
        numberType: r.numberType,
        endUserType: r.endUserType,
        requirements: r.requirements,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            regulations: result,
          }, null, 2),
        }],
      };
    }
  );

  const createBundle = createTool(
    'create_regulatory_bundle',
    'Create a new regulatory compliance bundle.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the bundle'),
      email: z.string().email().describe('Contact email for the bundle'),
      regulationSid: z.string().optional().describe('Regulation SID to comply with'),
      isoCountry: z.string().length(2).describe('ISO country code for the bundle'),
      endUserType: z.enum(['individual', 'business']).describe('End user type'),
      numberType: z.enum(['local', 'mobile', 'national', 'toll-free']).describe('Number type'),
      statusCallback: z.string().url().optional().describe('Webhook URL for status updates'),
    }),
    async ({ friendlyName, email, regulationSid, isoCountry, endUserType, numberType, statusCallback }) => {
      const bundle = await client.numbers.v2.regulatoryCompliance.bundles.create({
        friendlyName,
        email,
        isoCountry,
        endUserType,
        numberType,
        ...(regulationSid && { regulationSid }),
        ...(statusCallback && { statusCallback }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: bundle.sid,
            friendlyName: bundle.friendlyName,
            status: bundle.status,
            email: bundle.email,
            regulationSid: bundle.regulationSid,
            dateCreated: bundle.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateBundle = createTool(
    'update_regulatory_bundle',
    'Update a regulatory bundle.',
    z.object({
      bundleSid: z.string().startsWith('BU').describe('Bundle SID (starts with BU)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      email: z.string().email().optional().describe('New contact email'),
      statusCallback: z.string().url().optional().describe('New status callback URL'),
      status: z.enum(['draft', 'pending-review']).optional().describe('Update status (set to pending-review to submit)'),
    }),
    async ({ bundleSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {params[key] = value;}
      });

      const bundle = await client.numbers.v2.regulatoryCompliance
        .bundles(bundleSid)
        .update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: bundle.sid,
            friendlyName: bundle.friendlyName,
            status: bundle.status,
            email: bundle.email,
            dateUpdated: bundle.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteBundle = createTool(
    'delete_regulatory_bundle',
    'Delete a regulatory bundle (only draft status).',
    z.object({
      bundleSid: z.string().startsWith('BU').describe('Bundle SID (starts with BU)'),
    }),
    async ({ bundleSid }) => {
      await client.numbers.v2.regulatoryCompliance.bundles(bundleSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            bundleSid,
          }, null, 2),
        }],
      };
    }
  );

  const listBundleItemAssignments = createTool(
    'list_bundle_item_assignments',
    'List item assignments for a regulatory bundle.',
    z.object({
      bundleSid: z.string().startsWith('BU').describe('Bundle SID (starts with BU)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum assignments to return'),
    }),
    async ({ bundleSid, limit }) => {
      const assignments = await client.numbers.v2.regulatoryCompliance
        .bundles(bundleSid)
        .itemAssignments.list({ limit });

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
            bundleSid,
            count: result.length,
            itemAssignments: result,
          }, null, 2),
        }],
      };
    }
  );

  const createBundleItemAssignment = createTool(
    'create_bundle_item_assignment',
    'Assign an item (end user, document) to a regulatory bundle.',
    z.object({
      bundleSid: z.string().startsWith('BU').describe('Bundle SID (starts with BU)'),
      objectSid: z.string().describe('Item SID to assign (end user or supporting document)'),
    }),
    async ({ bundleSid, objectSid }) => {
      const assignment = await client.numbers.v2.regulatoryCompliance
        .bundles(bundleSid)
        .itemAssignments.create({ objectSid });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: assignment.sid,
            bundleSid: assignment.bundleSid,
            objectSid: assignment.objectSid,
            dateCreated: assignment.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteBundleItemAssignment = createTool(
    'delete_bundle_item_assignment',
    'Remove an item assignment from a regulatory bundle.',
    z.object({
      bundleSid: z.string().startsWith('BU').describe('Bundle SID (starts with BU)'),
      assignmentSid: z.string().startsWith('BV').describe('Assignment SID (starts with BV)'),
    }),
    async ({ bundleSid, assignmentSid }) => {
      await client.numbers.v2.regulatoryCompliance
        .bundles(bundleSid)
        .itemAssignments(assignmentSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            removed: true,
            bundleSid,
            assignmentSid,
          }, null, 2),
        }],
      };
    }
  );

  const getSupportingDocument = createTool(
    'get_supporting_document',
    'Get details of a specific supporting document.',
    z.object({
      documentSid: z.string().startsWith('RD').describe('Supporting Document SID (starts with RD)'),
    }),
    async ({ documentSid }) => {
      const document = await client.numbers.v2.regulatoryCompliance
        .supportingDocuments(documentSid)
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: document.sid,
            friendlyName: document.friendlyName,
            mimeType: document.mimeType,
            status: document.status,
            type: document.type,
            attributes: document.attributes,
            dateCreated: document.dateCreated,
            dateUpdated: document.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createSupportingDocument = createTool(
    'create_supporting_document',
    'Create a supporting document for regulatory compliance.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the document'),
      type: z.string().describe('Document type'),
      attributes: z.record(z.unknown()).optional().describe('Document attributes'),
    }),
    async ({ friendlyName, type, attributes }) => {
      const document = await client.numbers.v2.regulatoryCompliance
        .supportingDocuments.create({
          friendlyName,
          type,
          ...(attributes && { attributes }),
        });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: document.sid,
            friendlyName: document.friendlyName,
            type: document.type,
            status: document.status,
            attributes: document.attributes,
            dateCreated: document.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateSupportingDocument = createTool(
    'update_supporting_document',
    'Update a supporting document.',
    z.object({
      documentSid: z.string().startsWith('RD').describe('Supporting Document SID (starts with RD)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      attributes: z.record(z.unknown()).optional().describe('Updated attributes'),
    }),
    async ({ documentSid, friendlyName, attributes }) => {
      const params: Record<string, unknown> = {};
      if (friendlyName) {params.friendlyName = friendlyName;}
      if (attributes) {params.attributes = attributes;}

      const document = await client.numbers.v2.regulatoryCompliance
        .supportingDocuments(documentSid)
        .update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: document.sid,
            friendlyName: document.friendlyName,
            status: document.status,
            attributes: document.attributes,
            dateUpdated: document.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteSupportingDocument = createTool(
    'delete_supporting_document',
    'Delete a supporting document.',
    z.object({
      documentSid: z.string().startsWith('RD').describe('Supporting Document SID (starts with RD)'),
    }),
    async ({ documentSid }) => {
      await client.numbers.v2.regulatoryCompliance
        .supportingDocuments(documentSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            documentSid,
          }, null, 2),
        }],
      };
    }
  );

  const listEndUsers = createTool(
    'list_regulatory_end_users',
    'List end users for regulatory compliance.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum end users to return'),
    }),
    async ({ limit }) => {
      const endUsers = await client.numbers.v2.regulatoryCompliance
        .endUsers.list({ limit });

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
    'create_regulatory_end_user',
    'Create an end user for regulatory compliance.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the end user'),
      type: z.enum(['individual', 'business']).describe('End user type'),
      attributes: z.record(z.unknown()).optional().describe('End user attributes'),
    }),
    async ({ friendlyName, type, attributes }) => {
      const endUser = await client.numbers.v2.regulatoryCompliance
        .endUsers.create({
          friendlyName,
          type,
          ...(attributes && { attributes }),
        });

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

  return [
    listRegulatoryBundles,
    getBundleStatus,
    createBundle,
    updateBundle,
    deleteBundle,
    listBundleItemAssignments,
    createBundleItemAssignment,
    deleteBundleItemAssignment,
    listSupportingDocuments,
    getSupportingDocument,
    createSupportingDocument,
    updateSupportingDocument,
    deleteSupportingDocument,
    listEndUsers,
    createEndUser,
    listRegulations,
  ];
}
