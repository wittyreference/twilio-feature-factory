// ABOUTME: Configuration for the API drift detection pipeline.
// ABOUTME: Defines tracked Twilio API domains, exclusions, and repo coordinates.

/**
 * Twilio OpenAPI spec repo coordinates on GitHub.
 */
export const OAI_REPO = {
  owner: 'twilio',
  repo: 'twilio-oai',
  specDir: 'spec/json',
};

/**
 * npm packages to monitor for version changes.
 */
export const NPM_PACKAGES = {
  sdk: 'twilio',
  cli: 'twilio-cli',
};

/**
 * The SDK version range pinned in the MCP server's package.json.
 * Used to flag when a new major version is released.
 */
export const SDK_PINNED_RANGE = '^5.0.0';

/**
 * Tracked OAI spec domains. Each corresponds to a JSON spec file
 * at spec/json/<domain>.json in the twilio-oai repo.
 *
 * These cover all 26 MCP tool modules in our server.
 */
export const TRACKED_DOMAINS = [
  'twilio_api_v2010',         // Core: calls, messages, numbers, conferences, recordings
  'twilio_messaging_v1',      // Messaging Services, sender pools, A2P
  'twilio_content_v1',        // Content Templates
  'twilio_content_v2',        // Content Templates v2 (if available)
  'twilio_verify_v2',         // Phone verification, OTP
  'twilio_lookups_v2',        // Phone number intelligence
  'twilio_trusthub_v1',       // Business identity, compliance profiles
  'twilio_sync_v1',           // Real-time state sync (documents, lists, maps)
  'twilio_taskrouter_v1',     // Skills-based task routing
  'twilio_studio_v2',         // Visual flow builder
  'twilio_proxy_v1',          // Number masking sessions
  'twilio_intelligence_v2',   // Voice Intelligence, transcripts
  'twilio_video_v1',          // Video rooms, participants, compositions
  'twilio_serverless_v1',     // Functions, assets, environments
  'twilio_notify_v1',         // Push notifications
  'twilio_trunking_v1',       // Elastic SIP Trunking
  'twilio_voice_v1',          // Voice config: BYOC, dialing permissions, connection policies
  'twilio_accounts_v1',       // Account management, usage, balance
  'twilio_pricing_v2',        // Voice, messaging, number pricing
  'twilio_numbers_v2',        // Regulatory bundles, hosted numbers
  'twilio_monitor_v1',        // Debugger alerts, events
];

/**
 * Excluded API domains — EOL, deprecated, or preview.
 * Matches the exclusion list in API_REFERENCE.md.
 */
export const EXCLUDED_DOMAINS = [
  'twilio_assistants',
  'twilio_autopilot',
  'twilio_chat',
  'twilio_conversations',
  'twilio_flex',
  'twilio_frontline',
  'twilio_fax',
  'twilio_ip_messaging',
  'twilio_microvisor',
  'twilio_preview',
  'twilio_supersim',
  'twilio_wireless',
  'twilio_marketplace',
];

/**
 * Path to the MCP tool source files, relative to the project root.
 */
export const MCP_TOOLS_DIR = 'agents/mcp-servers/twilio/src/tools';

/**
 * Path to the MCP server package.json, for reading the pinned SDK version.
 */
export const MCP_PACKAGE_JSON = 'agents/mcp-servers/twilio/package.json';
