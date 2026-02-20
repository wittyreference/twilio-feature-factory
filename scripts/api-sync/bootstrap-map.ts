// ABOUTME: Generates an initial tool-endpoint-map.json by matching SDK call paths to OAI endpoints.
// ABOUTME: Produces a draft mapping with confidence scores for human review.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolInventoryEntry, OaiSnapshot, OaiEndpoint, ToolEndpointMap } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = resolve(__dirname, 'inventory.json');
const SYNC_STATE_PATH = resolve(__dirname, 'sync-state.json');

/**
 * Maps tool file names to the OAI domain(s) they correspond to.
 * This constrains matching so that tools from verify.ts only match verify endpoints, etc.
 */
const FILE_TO_DOMAINS: Record<string, string[]> = {
  'accounts.ts': ['twilio_accounts_v1', 'twilio_api_v2010'],
  'addresses.ts': ['twilio_api_v2010'],
  'content.ts': ['twilio_content_v1', 'twilio_content_v2'],
  'debugger.ts': ['twilio_monitor_v1', 'twilio_api_v2010'],
  'iam.ts': ['twilio_api_v2010', 'twilio_accounts_v1'],
  'intelligence.ts': ['twilio_intelligence_v2'],
  'lookups.ts': ['twilio_lookups_v2'],
  'media.ts': ['twilio_video_v1'],
  'messaging-services.ts': ['twilio_messaging_v1'],
  'messaging.ts': ['twilio_api_v2010'],
  'notify.ts': ['twilio_notify_v1'],
  'phone-numbers.ts': ['twilio_api_v2010'],
  'pricing.ts': ['twilio_pricing_v2'],
  'proxy.ts': ['twilio_proxy_v1'],
  'regulatory.ts': ['twilio_numbers_v2'],
  'serverless.ts': ['twilio_serverless_v1'],
  'sip.ts': ['twilio_api_v2010'],
  'studio.ts': ['twilio_studio_v2'],
  'sync.ts': ['twilio_sync_v1'],
  'taskrouter.ts': ['twilio_taskrouter_v1'],
  'trunking.ts': ['twilio_trunking_v1'],
  'trusthub.ts': ['twilio_trusthub_v1'],
  'verify.ts': ['twilio_verify_v2'],
  'video.ts': ['twilio_video_v1'],
  'voice-config.ts': ['twilio_voice_v1'],
  'voice.ts': ['twilio_api_v2010', 'twilio_intelligence_v2'],
};

/**
 * Maps common nouns in tool names to OAI path resource segments.
 * Tool name "start_verification" → noun "verification" → path segment "Verifications".
 */
const NOUN_TO_PATH_SEGMENT: Record<string, string> = {
  'verification': 'Verifications',
  'document': 'Documents',
  'flow': 'Flows',
  'execution': 'Executions',
  'task': 'Tasks',
  'worker': 'Workers',
  'workflow': 'Workflows',
  'workspace': 'Workspaces',
  'session': 'Sessions',
  'participant': 'Participants',
  'interaction': 'Interactions',
  'service': 'Services',
  'room': 'Rooms',
  'recording': 'Recordings',
  'composition': 'Compositions',
  'hook': 'CompositionHooks',
  'track': 'Tracks',
  'stream': 'Streams',
  'conference': 'Conferences',
  'call': 'Calls',
  'message': 'Messages',
  'sms': 'Messages',
  'mms': 'Messages',
  'number': 'PhoneNumbers',
  'phone_number': 'PhoneNumbers',
  'address': 'Addresses',
  'account': 'Accounts',
  'subaccount': 'Accounts',
  'key': 'Keys',
  'signing_key': 'SigningKeys',
  'api_key': 'Keys',
  'variable': 'Variables',
  'build': 'Builds',
  'environment': 'Environments',
  'function': 'Functions',
  'asset': 'Assets',
  'log': 'Logs',
  'binding': 'Bindings',
  'notification': 'Notifications',
  'alpha_sender': 'AlphaSenders',
  'short_code': 'ShortCodes',
  'trunk': 'Trunks',
  'origination_url': 'OriginationUrls',
  'credential_list': 'CredentialLists',
  'ip_access_control_list': 'IpAccessControlLists',
  'bundle': 'RegulatoryCompliance/Bundles',
  'end_user': 'EndUsers',
  'supporting_document': 'SupportingDocuments',
  'regulation': 'Regulations',
  'customer_profile': 'CustomerProfiles',
  'trust_product': 'TrustProducts',
  'entity_assignment': 'EntityAssignments',
  'content_template': 'Content',
  'template': 'Content',
  'transcript': 'Transcripts',
  'sentence': 'Sentences',
  'operator_result': 'OperatorResults',
  'dialing_permission': 'DialingPermissions/Countries',
  'byoc_trunk': 'ByocTrunks',
  'connection_policy': 'ConnectionPolicies',
  'target': 'Targets',
  'trigger': 'Triggers',
  'balance': 'Balance',
  'usage_record': 'Usage/Records',
  'intelligence_service': 'Services',
  'messaging_service': 'Services',
  'proxy_service': 'Services',
  'notify_service': 'Services',
  'pricing_country': 'Countries',
};

/**
 * Map HTTP method hints from SDK call patterns.
 */
function sdkMethodToHttp(sdkCall: string): string {
  if (sdkCall.includes('.create')) return 'post';
  if (sdkCall.includes('.list') || sdkCall.includes('.each') || sdkCall.includes('.page')) return 'get';
  if (sdkCall.includes('.fetch')) return 'get';
  if (sdkCall.includes('.update')) return 'post';  // Twilio uses POST for updates
  if (sdkCall.includes('.remove') || sdkCall.includes('.delete')) return 'delete';
  return 'get';
}

/**
 * Extract the resource name from an SDK call path.
 * e.g., "client.messages.create" → "messages"
 * e.g., "client.conferences.participants.list" → "participants"
 * e.g., "client.api.v2010.accounts.list" → "accounts"
 */
function extractSdkResource(sdkCall: string): string {
  // Remove "client." prefix
  let path = sdkCall.replace(/^client\./, '');

  // Remove api.v2010 prefix
  path = path.replace(/^api\.v2010\./, '');

  // Split by dots and get the last resource name (before the method)
  const parts = path.split('.');
  // The last part is usually the method (create, list, fetch, etc.)
  const methods = ['create', 'list', 'fetch', 'update', 'remove', 'delete', 'each', 'page'];

  // Walk backwards to find the last non-method segment
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!methods.includes(parts[i])) {
      return parts[i];
    }
  }
  return parts[0];
}

/**
 * Extract the primary noun from a tool name.
 * e.g., "start_verification" → "verification"
 * e.g., "list_conference_participants" → "participant"
 * e.g., "create_document" → "document"
 */
function extractToolNoun(toolName: string): string {
  // Remove action prefix
  const actions = ['get', 'list', 'create', 'update', 'delete', 'start', 'check',
    'send', 'make', 'add', 'remove', 'associate', 'trigger', 'search', 'configure',
    'analyze', 'lookup'];
  const parts = toolName.split('_');

  // Remove leading action word
  let noun = parts.filter(p => !actions.includes(p)).join('_');
  if (!noun) noun = parts.slice(1).join('_');

  // Singularize (rough)
  noun = noun.replace(/s$/, '').replace(/ies$/, 'y');

  return noun;
}

/**
 * Infer HTTP method from tool name prefix.
 */
function toolNameToHttp(toolName: string): string {
  if (toolName.startsWith('create_') || toolName.startsWith('add_') ||
      toolName.startsWith('send_') || toolName.startsWith('make_') ||
      toolName.startsWith('start_') || toolName.startsWith('trigger_') ||
      toolName.startsWith('associate_')) return 'post';
  if (toolName.startsWith('delete_') || toolName.startsWith('remove_')) return 'delete';
  if (toolName.startsWith('update_') || toolName.startsWith('configure_')) return 'post';
  return 'get';
}

/**
 * Score how well a tool matches an OAI endpoint.
 * Uses multiple signals: domain constraining, tool name nouns, SDK calls, parameter overlap.
 */
function scoreMatch(
  tool: ToolInventoryEntry,
  endpoint: OaiEndpoint,
  sdkCall: string,
): number {
  let score = 0;

  // Domain constraining: tool file must match endpoint domain
  const allowedDomains = FILE_TO_DOMAINS[tool.file] || [];
  if (allowedDomains.length > 0 && !allowedDomains.includes(endpoint.domain)) {
    return 0;  // Hard reject if domain doesn't match
  }

  // HTTP method match (from SDK call or tool name)
  const httpMethod = sdkMethodToHttp(sdkCall);
  const nameMethod = toolNameToHttp(tool.name);
  if (endpoint.method === httpMethod || endpoint.method === nameMethod) {
    score += 25;
  }

  // Tool name noun matching: strongest signal for domain APIs
  const toolNoun = extractToolNoun(tool.name);
  const nounPathSegment = NOUN_TO_PATH_SEGMENT[toolNoun];
  if (nounPathSegment) {
    if (endpoint.path.includes(nounPathSegment)) {
      score += 50;  // Strong match
    }
  }

  // SDK resource name in path (case-insensitive) — good for v2010 APIs
  const sdkResource = extractSdkResource(sdkCall);
  const pathLower = endpoint.path.toLowerCase();
  if (pathLower.includes(sdkResource.toLowerCase()) && sdkResource.length > 3) {
    score += 30;
  }

  // For instance endpoints (fetch/update/delete), prefer paths with {Sid} suffix
  if (/\b(fetch|update|remove|delete|get|configure)\b/.test(tool.name.split('_')[0]) ||
      ['fetch', 'update', 'remove', 'delete'].some(m => sdkCall.includes(`.${m}`))) {
    if (endpoint.path.match(/\{[^}]+\}\.json$/) || endpoint.path.match(/\{[^}]+\}$/)) {
      score += 10;
    }
  }

  // For list/create endpoints, prefer paths WITHOUT a trailing {Sid}
  if (/\b(list|create|add|send|make|start|trigger|search)\b/.test(tool.name.split('_')[0]) ||
      ['list', 'create'].some(m => sdkCall.includes(`.${m}`))) {
    if (!endpoint.path.match(/\{(?!AccountSid|ServiceSid|WorkspaceSid)[^}]+\}\.json$/)) {
      score += 10;
    }
  }

  // Parameter overlap bonus
  const epParams = new Set([
    ...endpoint.parameters.map(p => p.name.toLowerCase()),
    ...endpoint.requestBody.map(p => p.name.toLowerCase()),
  ]);
  const toolParams = new Set(tool.params.map(p => p.toLowerCase()));
  let overlap = 0;
  for (const p of toolParams) {
    if (['limit', 'page', 'pagesize', 'pagetoken'].includes(p)) continue;
    if (epParams.has(p)) overlap++;
  }
  score += overlap * 5;

  // OperationId matching: if operationId contains the tool name parts
  const opIdLower = endpoint.operationId.toLowerCase();
  const toolParts = tool.name.split('_');
  const actionMatch = toolParts[0] && opIdLower.startsWith(toolParts[0]);
  if (actionMatch) score += 5;

  return score;
}

/**
 * Find the best matching OAI endpoint(s) for a tool.
 */
function findBestMatches(
  tool: ToolInventoryEntry,
  endpoints: Record<string, OaiEndpoint>,
): Array<{ key: string; score: number; sdkPath: string }> {
  const matches: Array<{ key: string; score: number; sdkPath: string }> = [];

  for (const sdkCall of tool.sdkCalls) {
    const scored: Array<{ key: string; score: number }> = [];

    for (const [key, endpoint] of Object.entries(endpoints)) {
      const score = scoreMatch(tool, endpoint, sdkCall);
      if (score >= 40) {  // Minimum threshold
        scored.push({ key, score });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Take the best match for this SDK call
    if (scored.length > 0) {
      matches.push({
        key: scored[0].key,
        score: scored[0].score,
        sdkPath: sdkCall,
      });
    }
  }

  return matches;
}

/**
 * Main bootstrap function.
 */
function runBootstrap(): void {
  // Load inventory
  if (!existsSync(INVENTORY_PATH)) {
    console.error('No inventory.json found. Run extract-inventory.ts first.');
    process.exit(1);
  }
  const inventory: ToolInventoryEntry[] = JSON.parse(readFileSync(INVENTORY_PATH, 'utf-8'));

  // Load latest snapshot
  const syncState = JSON.parse(readFileSync(SYNC_STATE_PATH, 'utf-8'));
  const snapshotPath = resolve(__dirname, 'snapshots', `${syncState.oai.version}.json`);
  if (!existsSync(snapshotPath)) {
    console.error(`No snapshot found for version ${syncState.oai.version}. Run snapshot.ts first.`);
    process.exit(1);
  }
  const snapshot: OaiSnapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'));

  console.log(`Bootstrapping tool-endpoint map...`);
  console.log(`  Tools: ${inventory.length}`);
  console.log(`  OAI endpoints: ${snapshot.endpointCount}`);

  const mapping: ToolEndpointMap = {};
  let mapped = 0;
  let unmapped = 0;
  const lowConfidence: Array<{ tool: string; score: number }> = [];

  for (const tool of inventory) {
    const matches = findBestMatches(tool, snapshot.endpoints);

    if (matches.length > 0) {
      // Deduplicate endpoint keys
      const uniqueEndpoints = [...new Set(matches.map(m => m.key))];
      const bestScore = Math.max(...matches.map(m => m.score));

      mapping[tool.name] = {
        endpoints: uniqueEndpoints,
        sdkPath: matches[0].sdkPath,
      };
      mapped++;

      if (bestScore < 60) {
        lowConfidence.push({ tool: tool.name, score: bestScore });
      }
    } else {
      // No match found — create an empty entry for manual mapping
      mapping[tool.name] = {
        endpoints: [],
        sdkPath: tool.sdkCalls[0] || '',
      };
      unmapped++;
    }
  }

  console.log(`\nResults:`);
  console.log(`  Mapped: ${mapped} tools (${Math.round(mapped / inventory.length * 100)}%)`);
  console.log(`  Unmapped: ${unmapped} tools`);
  console.log(`  Low confidence (score < 60): ${lowConfidence.length}`);

  if (lowConfidence.length > 0) {
    console.log(`\nLow confidence matches (review these):`);
    for (const lc of lowConfidence.slice(0, 20)) {
      console.log(`  - ${lc.tool} (score: ${lc.score})`);
    }
  }

  if (unmapped > 0) {
    console.log(`\nUnmapped tools (need manual mapping):`);
    for (const tool of inventory) {
      if (mapping[tool.name]?.endpoints.length === 0) {
        console.log(`  - ${tool.name} (sdk: ${tool.sdkCalls.join(', ')})`);
      }
    }
  }

  // Write draft map
  const draftPath = resolve(__dirname, 'tool-endpoint-map.json');
  writeFileSync(draftPath, JSON.stringify(mapping, null, 2));
  console.log(`\nDraft map saved: ${draftPath}`);
  console.log('Review and finalize this file — especially low-confidence and unmapped entries.');
}

// Export for testing
export { scoreMatch, extractSdkResource, sdkMethodToHttp, findBestMatches };

// Run if executed directly
const isMain = process.argv[1]?.endsWith('bootstrap-map.ts') ||
  process.argv[1]?.includes('bootstrap-map');
if (isMain) {
  runBootstrap();
}
