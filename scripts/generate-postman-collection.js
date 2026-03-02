#!/usr/bin/env node
// ABOUTME: Generates the Newman/Postman E2E test collection from a compact specification.
// ABOUTME: Run with: node scripts/generate-postman-collection.js > postman/collection.json

const BASE = '{{BASE_URL}}';

// ── Helpers ──────────────────────────────────────────────────────────────

function post(name, path, body, tests) {
  return {
    name,
    request: {
      method: 'POST',
      header: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }],
      body: {
        mode: 'urlencoded',
        urlencoded: Object.entries(body).map(([key, value]) => ({ key, value: String(value) })),
      },
      url: { raw: `${BASE}/${path}`, host: [BASE], path: path.split('/') },
    },
    event: [{ listen: 'test', script: { exec: tests, type: 'text/javascript' } }],
  };
}

function get(name, path, tests) {
  return {
    name,
    request: {
      method: 'GET',
      header: [],
      url: { raw: `${BASE}/${path}`, host: [BASE], path: path.split('/') },
    },
    event: [{ listen: 'test', script: { exec: tests, type: 'text/javascript' } }],
  };
}

function folder(name, items) {
  return { name, item: items };
}

// Test assertion helpers (lines for the exec array)
const status200 = "pm.test('Status code is 200', () => pm.response.to.have.status(200));";
const isTwiml = [
  "pm.test('Response is TwiML', () => {",
  "  const t = pm.response.text();",
  "  pm.expect(t).to.include('<?xml');",
  "  pm.expect(t).to.include('<Response>');",
  "});",
];
const isJson = [
  "pm.test('Response is JSON', () => {",
  "  pm.response.to.have.header('Content-Type', /json/);",
  "  JSON.parse(pm.response.text());",
  "});",
];

function includes(label, ...strings) {
  const checks = strings.map((s) => `  pm.expect(t).to.include('${s}');`).join('\n');
  return [`pm.test('${label}', () => {`, '  const t = pm.response.text();', checks, '});'];
}

function jsonHas(label, ...fields) {
  const checks = fields.map((f) => `  pm.expect(j).to.have.property('${f}');`).join('\n');
  return [`pm.test('${label}', () => {`, '  const j = pm.response.json();', checks, '});'];
}

function jsonFieldEquals(label, field, value) {
  return [
    `pm.test('${label}', () => {`,
    '  const j = pm.response.json();',
    `  pm.expect(j.${field}).to.eql(${JSON.stringify(value)});`,
    '});',
  ];
}

function jsonSuccess(val) {
  return jsonFieldEquals(val ? 'Response indicates success' : 'Response indicates failure', 'success', val);
}

// Common bodies
const callBody = { CallSid: 'CA' + 'a'.repeat(32), From: '+15551234567', To: '{{TWILIO_PHONE_NUMBER}}' };
const msgBody = { MessageSid: 'SM' + 'b'.repeat(32), From: '+15551234567', To: '{{TWILIO_PHONE_NUMBER}}' };

// ── Folder 1: Voice - Inbound & Gather ──────────────────────────────────

const voiceBasic = folder('Voice - Inbound & Gather', [
  post('Incoming Call - Happy Path', 'voice/incoming-call', { ...callBody, CallStatus: 'ringing' }, [
    status200,
    ...isTwiml,
    ...includes('Contains Say with voice attribute', '<Say', 'voice=', 'Polly.Amy'),
    ...includes('Contains Gather with DTMF and speech', '<Gather', 'input="dtmf speech"', 'action="/voice/gather-input"'),
    ...includes('Contains no-input fallback', 'We did not receive any input'),
  ]),
  get('Incoming Call - GET Health Check', 'voice/incoming-call', [
    status200,
    ...isTwiml,
  ]),
  post('Gather Input - DTMF Digit', 'voice/gather-input', { ...callBody, Digits: '5' }, [
    status200,
    ...isTwiml,
    ...includes('Echoes digit pressed', 'You pressed 5'),
    ...includes('Contains Hangup', '<Hangup'),
  ]),
  post('Gather Input - Speech Result', 'voice/gather-input', { ...callBody, SpeechResult: 'I need help with billing' }, [
    status200,
    ...isTwiml,
    ...includes('Echoes speech result', 'You said', 'I need help with billing'),
    ...includes('Contains Hangup', '<Hangup'),
  ]),
  post('Gather Input - No Input', 'voice/gather-input', callBody, [
    status200,
    ...isTwiml,
    ...includes('Shows no-input message', 'No input was detected'),
    ...includes('Contains Hangup', '<Hangup'),
  ]),
]);

// ── Folder 2: Voice - IVR Flow ──────────────────────────────────────────

const voiceIvr = folder('Voice - IVR Flow', [
  post('IVR Welcome', 'voice/ivr-welcome', callBody, [
    status200,
    ...isTwiml,
    ...includes('Contains background recording', '<Start', '<Recording'),
    ...includes('Contains dental clinic greeting', 'Valley Dental'),
    ...includes('Contains Gather with IVR action', '<Gather', 'action="/voice/ivr-menu"'),
    ...includes('Contains menu options', 'appointments', 'billing', 'hours'),
  ]),
  post('IVR Menu - Appointments (DTMF 1)', 'voice/ivr-menu', { ...callBody, Digits: '1' }, [
    status200,
    ...isTwiml,
    ...includes('Routes to appointments', 'appointments department', 'Doctor Smith'),
  ]),
  post('IVR Menu - Billing (DTMF 2)', 'voice/ivr-menu', { ...callBody, Digits: '2' }, [
    status200,
    ...isTwiml,
    ...includes('Routes to billing', 'billing department', 'Delta Dental'),
  ]),
  post('IVR Menu - Hours (DTMF 3)', 'voice/ivr-menu', { ...callBody, Digits: '3' }, [
    status200,
    ...isTwiml,
    ...includes('Shows office hours', 'Monday through Friday', '123 Main Street'),
  ]),
  post('IVR Menu - Operator (DTMF 0)', 'voice/ivr-menu', { ...callBody, Digits: '0' }, [
    status200,
    ...isTwiml,
    ...includes('Transfers to operator', 'connect you to an operator'),
  ]),
  post('IVR Menu - Speech "book appointment"', 'voice/ivr-menu', { ...callBody, SpeechResult: 'I want to book an appointment' }, [
    status200,
    ...isTwiml,
    ...includes('Speech routes to appointments', 'appointments department'),
  ]),
  post('IVR Menu - Unknown (DTMF 9)', 'voice/ivr-menu', { ...callBody, Digits: '9' }, [
    status200,
    ...isTwiml,
    ...includes('Shows unrecognized message', 'did not understand'),
    ...includes('Redirects to welcome', '<Redirect>/voice/ivr-welcome</Redirect>'),
  ]),
]);

// ── Folder 3: Voice - Notification Flow ─────────────────────────────────

const voiceNotification = folder('Voice - Notification Flow', [
  post('Notification Outbound', 'voice/notification-outbound', callBody, [
    status200,
    ...isTwiml,
    ...includes('Contains background recording', '<Start', '<Recording'),
    ...includes('Contains appointment details', 'Valley Health Clinic', 'appointment scheduled'),
    ...includes('Contains confirmation gather', '<Gather', 'action="/voice/notification-confirm"'),
    ...includes('Contains instructions', 'press 1 or say yes', 'press 2 or say no'),
  ]),
  post('Notification Confirm - Confirmed (DTMF 1)', 'voice/notification-confirm', { ...callBody, Digits: '1' }, [
    status200,
    ...isTwiml,
    ...includes('Confirms appointment', 'confirmed', '2:30 PM'),
    ...includes('Contains Hangup', '<Hangup'),
  ]),
  post('Notification Confirm - Reschedule (DTMF 2)', 'voice/notification-confirm', { ...callBody, Digits: '2' }, [
    status200,
    ...isTwiml,
    ...includes('Offers reschedule', 'reschedule'),
    ...includes('Contains Hangup', '<Hangup'),
  ]),
  post('Notification Confirm - Speech "yes"', 'voice/notification-confirm', { ...callBody, SpeechResult: 'yes I confirm' }, [
    status200,
    ...isTwiml,
    ...includes('Speech confirms appointment', 'confirmed'),
  ]),
  post('Notification Confirm - Unknown (DTMF 7)', 'voice/notification-confirm', { ...callBody, Digits: '7' }, [
    status200,
    ...isTwiml,
    ...includes('Shows unrecognized response', 'unable to understand'),
    ...includes('Contains Hangup', '<Hangup'),
  ]),
]);

// ── Folder 4: Voice - Outbound Contact Center TwiML ─────────────────────

const voiceOutbound = folder('Voice - Outbound Contact Center TwiML', [
  post('Customer Leg with ConferenceName', 'voice/outbound-customer-leg?ConferenceName=test-conf-123', callBody, [
    status200,
    ...isTwiml,
    ...includes('Contains Conference verb', '<Conference', 'test-conf-123'),
  ]),
  post('Agent Leg with ConferenceName', 'voice/outbound-agent-leg?ConferenceName=test-conf-123', callBody, [
    status200,
    ...isTwiml,
    ...includes('Contains whisper and Conference', '<Say', '<Conference', 'test-conf-123'),
  ]),
]);

// ── Folder 5: Voice - Sales Dialer TwiML ────────────────────────────────

const voiceSales = folder('Voice - Sales Dialer TwiML', [
  post('Prospect Leg', 'voice/sales-dialer-prospect?ConferenceName=sales-test-456', callBody, [
    status200,
    ...isTwiml,
    ...includes('Contains Conference', '<Conference', 'sales-test-456'),
  ]),
  post('Agent Leg', 'voice/sales-dialer-agent?ConferenceName=sales-test-456', callBody, [
    status200,
    ...isTwiml,
    ...includes('Contains whisper and Conference', '<Say', '<Conference', 'sales-test-456'),
  ]),
]);

// ── Folder 6: Voice - Call Tracking ─────────────────────────────────────

const voiceTracking = folder('Voice - Call Tracking', [
  post('Inbound with Campaign', 'voice/call-tracking-inbound', callBody, [
    status200,
    ...isTwiml,
    ...includes('Contains tracking elements', '<Start', '<Recording'),
  ]),
]);

// ── Folder 7: Voice - SDK ───────────────────────────────────────────────

const voiceSdk = folder('Voice - SDK', [
  post('SDK Handler - PSTN Number', 'voice/sdk-handler', { To: '+15559876543' }, [
    status200,
    ...isTwiml,
    ...includes('Dials PSTN number', '<Dial', '<Number', '+15559876543'),
  ]),
  post('SDK Handler - Client', 'voice/sdk-handler', { To: 'client:alice' }, [
    status200,
    ...isTwiml,
    ...includes('Dials client', '<Dial', '<Client', 'alice'),
  ]),
  post('SDK Handler - No Destination', 'voice/sdk-handler', {}, [
    status200,
    ...isTwiml,
    ...includes('Shows error message', 'No destination'),
  ]),
  post('SDK Handler - Invalid Format', 'voice/sdk-handler', { To: 'invalid-format' }, [
    status200,
    ...isTwiml,
    ...includes('Shows invalid format message', 'Invalid destination'),
  ]),
]);

// ── Folder 8: Voice - ConversationRelay TwiML ───────────────────────────

const voiceRelay = folder('Voice - ConversationRelay TwiML', [
  post('Relay Handler', 'conversation-relay/relay-handler', callBody, [
    status200,
    ...isTwiml,
    "pm.test('Contains Connect>ConversationRelay or not-configured', () => {",
    '  const t = pm.response.text();',
    "  const hasRelay = t.includes('<ConversationRelay');",
    "  const notConfigured = t.includes('not configured') || t.includes('<Hangup');",
    '  pm.expect(hasRelay || notConfigured).to.be.true;',
    '});',
  ]),
  post('AI Assistant Inbound', 'conversation-relay/ai-assistant-inbound', callBody, [
    status200,
    ...isTwiml,
    "pm.test('Returns ConversationRelay or not-configured message', () => {",
    '  const t = pm.response.text();',
    "  const hasRelay = t.includes('<ConversationRelay');",
    "  const notConfigured = t.includes('not configured') || t.includes('unavailable');",
    '  pm.expect(hasRelay || notConfigured).to.be.true;',
    '});',
  ]),
]);

// ── Folder 9: Messaging ─────────────────────────────────────────────────

const messaging = folder('Messaging', [
  post('Incoming SMS - Happy Path', 'messaging/incoming-sms', { ...msgBody, Body: 'Hello from E2E test' }, [
    status200,
    ...isTwiml,
    ...includes('Contains Message element', '<Message'),
    ...includes('Echoes incoming message', 'Hello from E2E test'),
  ]),
  post('Incoming SMS - Empty Body', 'messaging/incoming-sms', msgBody, [
    status200,
    ...isTwiml,
    ...includes('Still returns Message', '<Message'),
  ]),
  get('Incoming SMS - GET Health Check', 'messaging/incoming-sms', [
    status200,
  ]),
]);

// ── Folder 10: TaskRouter ───────────────────────────────────────────────

const taskrouter = folder('TaskRouter', [
  post('Contact Center Welcome', 'taskrouter/contact-center-welcome', callBody, [
    status200,
    ...isTwiml,
    ...includes('Contains Enqueue', '<Enqueue'),
    ...includes('Contains Task element', '<Task'),
  ]),
  post('Assignment Callback - Call Type', 'taskrouter/assignment', {
    TaskSid: 'WT' + 'e'.repeat(32),
    TaskAttributes: '{"type":"call","callSid":"CA' + 'a'.repeat(32) + '"}',
    WorkerAttributes: '{"contact_uri":"+15551234567"}',
    WorkerName: 'TestAgent',
    ReservationSid: 'WR' + 'f'.repeat(32),
  }, [
    status200,
    "pm.test('Returns conference instruction', () => {",
    '  const j = pm.response.json();',
    "  pm.expect(j.instruction).to.eql('conference');",
    "  pm.expect(j).to.have.property('from');",
    "  pm.expect(j).to.have.property('to');",
    '});',
  ]),
  post('Assignment Callback - Non-Call Type', 'taskrouter/assignment', {
    TaskSid: 'WT' + 'e'.repeat(32),
    TaskAttributes: '{"type":"email"}',
    WorkerAttributes: '{}',
    WorkerName: 'TestAgent',
    ReservationSid: 'WR' + 'f'.repeat(32),
  }, [
    status200,
    "pm.test('Returns accept instruction', () => {",
    '  const j = pm.response.json();',
    "  pm.expect(j.instruction).to.eql('accept');",
    '});',
  ]),
]);

// ── Folder 11: Callbacks ────────────────────────────────────────────────

const fakeSids = {
  call: 'CA' + 'a'.repeat(32),
  msg: 'SM' + 'b'.repeat(32),
  task: 'WT' + 'e'.repeat(32),
  reservation: 'WR' + 'f'.repeat(32),
  worker: 'WK' + '0'.repeat(32),
  verify: 'VE' + 'd'.repeat(32),
  account: 'AC' + '1'.repeat(32),
};

const callbacks = folder('Callbacks', [
  post('Call Status - Completed', 'callbacks/call-status', {
    CallSid: fakeSids.call, CallStatus: 'completed', To: '+15551234567', From: '+15559876543',
    Direction: 'inbound', CallDuration: '120',
  }, [status200, ...jsonSuccess(true)]),

  post('Call Status - Failed', 'callbacks/call-status', {
    CallSid: fakeSids.call, CallStatus: 'failed', ErrorCode: '31205', ErrorMessage: 'HTTP connection failure',
    To: '+15551234567', From: '+15559876543',
  }, [status200, ...jsonSuccess(true)]),

  post('Call Status - Missing CallSid', 'callbacks/call-status', { CallStatus: 'completed' }, [
    status200,
    ...jsonSuccess(false),
  ]),

  post('Message Status - Delivered', 'callbacks/message-status', {
    MessageSid: fakeSids.msg, MessageStatus: 'delivered', To: '+15551234567', From: '+15559876543',
  }, [status200, ...jsonSuccess(true)]),

  post('Message Status - Failed', 'callbacks/message-status', {
    MessageSid: fakeSids.msg, MessageStatus: 'failed', ErrorCode: '30003', ErrorMessage: 'Unreachable',
  }, [status200, ...jsonSuccess(true)]),

  post('Message Status - Missing MessageSid', 'callbacks/message-status', { MessageStatus: 'sent' }, [
    status200,
    ...jsonSuccess(false),
  ]),

  post('Task Status - task.created', 'callbacks/task-status', {
    EventType: 'task.created', TaskSid: fakeSids.task, TaskAttributes: '{"type":"call"}',
    WorkspaceSid: 'WS' + '0'.repeat(32),
  }, [status200, ...jsonSuccess(true)]),

  post('Task Status - reservation.accepted', 'callbacks/task-status', {
    EventType: 'reservation.accepted', TaskSid: fakeSids.task, ReservationSid: fakeSids.reservation,
    WorkerSid: fakeSids.worker, WorkerName: 'TestWorker',
  }, [status200, ...jsonSuccess(true)]),

  post('Verification Status - Approved', 'callbacks/verification-status', {
    VerificationSid: fakeSids.verify, Status: 'approved', To: '+15551234567', Channel: 'sms',
  }, [status200, ...jsonSuccess(true)]),

  post('Fallback - Voice Call', 'callbacks/fallback', {
    CallSid: fakeSids.call, ErrorCode: '11200', ErrorUrl: 'https://example.com/broken',
    ErrorMessage: 'HTTP retrieval failure', From: '+15551234567', To: '+15559876543', Direction: 'inbound',
  }, [
    status200,
    ...includes('Returns safe TwiML', '<Say', 'technical difficulties', '<Hangup'),
  ]),

  post('Fallback - Message', 'callbacks/fallback', {
    MessageSid: fakeSids.msg, ErrorCode: '11200', ErrorUrl: 'https://example.com/broken',
    ErrorMessage: 'HTTP retrieval failure',
  }, [
    status200,
    "pm.test('Returns fallback JSON', () => {",
    '  const j = pm.response.json();',
    "  pm.expect(j.fallback).to.eql(true);",
    "  pm.expect(j.resourceType).to.eql('message');",
    '});',
  ]),
]);

// ── Folder 12: Conversation Relay - Callbacks ───────────────────────────

const relayCallbacks = folder('Conversation Relay - Callbacks', [
  post('Transcript Complete - Non-matching Event', 'conversation-relay/transcript-complete', {
    transcript_sid: 'GT1234567890abcdef', event_type: 'voice_intelligence_transcript_processing',
    account_sid: fakeSids.account,
  }, [
    status200,
  ]),
]);

// ── Folder 13: Error Cases - API Functions ──────────────────────────────

const errorCases = folder('Error Cases - API Functions', [
  post('Send SMS - Missing Params', 'messaging/send-sms', {}, [
    "pm.test('Returns error for missing params', () => {",
    '  const j = pm.response.json();',
    "  pm.expect(j.success).to.eql(false);",
    '});',
  ]),
  post('Start Verification - Missing To', 'verify/start-verification', {}, [
    "pm.test('Returns error for missing to', () => {",
    '  const j = pm.response.json();',
    "  pm.expect(j.success).to.eql(false);",
    '});',
  ]),
  post('Check Verification - Missing Params', 'verify/check-verification', {}, [
    "pm.test('Returns error for missing params', () => {",
    '  const j = pm.response.json();',
    "  pm.expect(j.success).to.eql(false);",
    '});',
  ]),
]);

// ── Folder 14: Health Checks ────────────────────────────────────────────

const publicEndpoints = [
  'voice/incoming-call', 'voice/ivr-welcome', 'voice/outbound-customer-leg',
  'voice/outbound-agent-leg', 'voice/sales-dialer-prospect', 'voice/sales-dialer-agent',
  'voice/call-tracking-inbound', 'voice/notification-outbound', 'voice/pizza-agent-connect',
  'voice/stream-connect', 'voice/sdk-handler',
  'messaging/incoming-sms',
  'taskrouter/contact-center-welcome',
  'conversation-relay/ai-assistant-inbound', 'conversation-relay/relay-handler',
  'conversation-relay/transcript-complete',
];

const healthChecks = folder('Health Checks', publicEndpoints.map((path) =>
  get(`GET ${path}`, path, [
    `pm.test('${path} is accessible', () => pm.response.to.have.status(200));`,
  ])
));

// ── Build Collection ────────────────────────────────────────────────────

const collection = {
  info: {
    name: 'Twilio Feature Factory E2E Tests',
    description: 'Comprehensive E2E tests for all serverless function endpoints. Run against localhost:3000 (twilio-run) or deployed serverless.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    voiceBasic,
    voiceIvr,
    voiceNotification,
    voiceOutbound,
    voiceSales,
    voiceTracking,
    voiceSdk,
    voiceRelay,
    messaging,
    taskrouter,
    callbacks,
    relayCallbacks,
    errorCases,
    healthChecks,
  ],
  event: [
    {
      listen: 'test',
      script: {
        exec: ["pm.test('Response time under 5s', () => pm.expect(pm.response.responseTime).to.be.below(5000));"],
        type: 'text/javascript',
      },
    },
  ],
  variable: [
    { key: 'BASE_URL', value: 'http://localhost:3000' },
  ],
};

// Count requests
let count = 0;
function countRequests(items) {
  for (const item of items) {
    if (item.request) count++;
    if (item.item) countRequests(item.item);
  }
}
countRequests(collection.item);

process.stdout.write(JSON.stringify(collection, null, 2) + '\n');
process.stderr.write(`Generated ${count} requests in ${collection.item.length} folders\n`);
