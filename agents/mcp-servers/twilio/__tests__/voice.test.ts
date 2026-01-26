// ABOUTME: Unit tests for Twilio voice tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

/**
 * VOICE INSIGHTS & CONFERENCE INSIGHTS TIMING BEHAVIOR
 *
 * Voice Insights and Conference Insights summaries are NOT available immediately
 * after a call or conference ends. The data follows this availability timeline:
 *
 * - Partial data: Available within ~2 minutes after end (no SLA guarantee)
 * - Final data: Locked and immutable 30 minutes after end
 *
 * Check the `processingState` field in responses:
 * - 'partial': Data may still change, not all metrics populated
 * - 'complete': Final data, will not change
 *
 * This timing applies to:
 * - get_call_summary (Voice Insights)
 * - get_conference_summary (Conference Insights)
 * - list_conference_participant_summaries (Conference Insights)
 * - get_conference_participant_summary (Conference Insights)
 */

import { voiceTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

// Real Twilio credentials from environment - NO magic test numbers.
const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  toNumber: process.env.TEST_PHONE_NUMBER || '',
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.authToken.length > 0 &&
  TEST_CREDENTIALS.fromNumber.startsWith('+') &&
  TEST_CREDENTIALS.toNumber.startsWith('+');

function createTestContext(): TwilioContext {
  const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
  return {
    client,
    defaultFromNumber: TEST_CREDENTIALS.fromNumber,
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('voiceTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = voiceTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 24 tools', () => {
      expect(tools).toHaveLength(24);
    });

    // Core call tools
    it('should have get_call_logs tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_call_logs');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('call logs');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have make_call tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'make_call');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('outbound call');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_recording tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_recording');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('recording');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    // Call control tools
    it('should have get_call tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_call');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('information about a specific call');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have update_call tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'update_call');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Modify');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_call_recordings tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_call_recordings');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('recordings for a specific call');
      expect(typeof tool?.handler).toBe('function');
    });

    // Conference tools
    it('should have list_conferences tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_conferences');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('List conferences');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_conference tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_conference');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('information about a specific conference');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have update_conference tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'update_conference');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Update a conference');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_conference_participants tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_conference_participants');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('participants in a conference');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_conference_participant tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_conference_participant');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('specific participant');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have update_conference_participant tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'update_conference_participant');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('mute');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have add_participant_to_conference tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'add_participant_to_conference');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Add a new participant');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_conference_recordings tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_conference_recordings');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('recordings for a specific conference');
      expect(typeof tool?.handler).toBe('function');
    });

    // Voice Insights tools
    it('should have get_call_summary tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_call_summary');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Voice Insights');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_call_events tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_call_events');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Voice Insights events');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_call_metrics tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_call_metrics');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Voice Insights metrics');
      expect(typeof tool?.handler).toBe('function');
    });

    // Conference Insights tools (with timing documentation)
    it('should have get_conference_summary tool with timing note in description', () => {
      const tool = tools.find(t => t.name === 'get_conference_summary');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Conference Insights');
      expect(tool?.description).toContain('not immediately available');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_conference_participant_summaries tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_conference_participant_summaries');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Conference Insights');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_conference_participant_summary tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_conference_participant_summary');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Conference Insights');
      expect(typeof tool?.handler).toBe('function');
    });

    // Media Streams tools
    // NOTE: These tools manage UNIDIRECTIONAL streams (API equivalent of <Start><Stream>).
    // For BIDIRECTIONAL streams (AI agents), use TwiML with <Connect><Stream>.
    it('should have start_call_stream tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'start_call_stream');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('unidirectional media stream');
      expect(tool?.description).toContain('<Start><Stream>');
      expect(tool?.description).toContain('<Connect><Stream>');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have stop_call_stream tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'stop_call_stream');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Stop a media stream');
      expect(typeof tool?.handler).toBe('function');
    });

    // Transcription tools
    it('should have list_recording_transcriptions tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_recording_transcriptions');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('transcriptions');
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_transcription tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_transcription');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('transcription details');
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('get_call_logs schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_call_logs');
        schema = tool!.inputSchema;
      });

      it('should have sensible defaults', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate status enum', () => {
        const validStatus = schema.safeParse({ status: 'completed' });
        expect(validStatus.success).toBe(true);

        const invalidStatus = schema.safeParse({ status: 'invalid-status' });
        expect(invalidStatus.success).toBe(false);
      });

      it('should validate phone number format for to/from', () => {
        const validTo = schema.safeParse({ to: '+15551234567' });
        expect(validTo.success).toBe(true);

        const invalidTo = schema.safeParse({ to: '5551234567' });
        expect(invalidTo.success).toBe(false);
      });

      it('should reject limit outside range', () => {
        expect(schema.safeParse({ limit: 0 }).success).toBe(false);
        expect(schema.safeParse({ limit: 101 }).success).toBe(false);
        expect(schema.safeParse({ limit: 50 }).success).toBe(true);
      });
    });

    describe('make_call schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'make_call');
        schema = tool!.inputSchema;
      });

      it('should require to phone number', () => {
        const withTo = schema.safeParse({
          to: '+15551234567',
          url: 'https://example.com/twiml',
        });
        expect(withTo.success).toBe(true);

        const withoutTo = schema.safeParse({
          url: 'https://example.com/twiml',
        });
        expect(withoutTo.success).toBe(false);
      });

      it('should require either url or twiml', () => {
        const withUrl = schema.safeParse({
          to: '+15551234567',
          url: 'https://example.com/twiml',
        });
        expect(withUrl.success).toBe(true);

        const withTwiml = schema.safeParse({
          to: '+15551234567',
          twiml: '<Response><Say>Hello</Say></Response>',
        });
        expect(withTwiml.success).toBe(true);

        const withNeither = schema.safeParse({
          to: '+15551234567',
        });
        expect(withNeither.success).toBe(false);
      });

      it('should validate url format', () => {
        const validUrl = schema.safeParse({
          to: '+15551234567',
          url: 'https://example.com/twiml',
        });
        expect(validUrl.success).toBe(true);

        const invalidUrl = schema.safeParse({
          to: '+15551234567',
          url: 'not-a-url',
        });
        expect(invalidUrl.success).toBe(false);
      });
    });

    describe('get_recording schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_recording');
        schema = tool!.inputSchema;
      });

      it('should require recording SID starting with RE', () => {
        const validSid = schema.safeParse({
          recordingSid: 'RExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          recordingSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });

    describe('get_call schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_call');
        schema = tool!.inputSchema;
      });

      it('should require call SID starting with CA', () => {
        const validSid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          callSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });

    describe('update_call schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'update_call');
        schema = tool!.inputSchema;
      });

      it('should require callSid', () => {
        const valid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          status: 'completed',
        });
        expect(valid.success).toBe(true);

        const missing = schema.safeParse({
          status: 'completed',
        });
        expect(missing.success).toBe(false);
      });

      it('should require at least one update field', () => {
        const valid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          twiml: '<Response><Say>Hello</Say></Response>',
        });
        expect(valid.success).toBe(true);

        const noUpdate = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(noUpdate.success).toBe(false);
      });

      it('should validate status enum', () => {
        const validStatus = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          status: 'completed',
        });
        expect(validStatus.success).toBe(true);

        const invalidStatus = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          status: 'invalid',
        });
        expect(invalidStatus.success).toBe(false);
      });
    });

    describe('list_conferences schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_conferences');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate status enum', () => {
        const validStatus = schema.safeParse({ status: 'in-progress' });
        expect(validStatus.success).toBe(true);

        const invalidStatus = schema.safeParse({ status: 'invalid' });
        expect(invalidStatus.success).toBe(false);
      });
    });

    describe('get_conference schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_conference');
        schema = tool!.inputSchema;
      });

      it('should require conference SID starting with CF', () => {
        const valid = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          conferenceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalid.success).toBe(false);
      });
    });

    describe('update_conference_participant schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'update_conference_participant');
        schema = tool!.inputSchema;
      });

      it('should require both conferenceSid and callSid', () => {
        const valid = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          muted: true,
        });
        expect(valid.success).toBe(true);

        const missingCallSid = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          muted: true,
        });
        expect(missingCallSid.success).toBe(false);
      });

      it('should accept boolean muted and hold', () => {
        const valid = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          muted: true,
          hold: false,
        });
        expect(valid.success).toBe(true);
      });
    });

    describe('add_participant_to_conference schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'add_participant_to_conference');
        schema = tool!.inputSchema;
      });

      it('should require conferenceSid and to', () => {
        const valid = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          to: '+15551234567',
        });
        expect(valid.success).toBe(true);

        const missingTo = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingTo.success).toBe(false);
      });

      it('should validate phone number format', () => {
        const invalid = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          to: '5551234567',
        });
        expect(invalid.success).toBe(false);
      });

      it('should have sensible defaults', () => {
        const result = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          to: '+15551234567',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.earlyMedia).toBe(true);
          expect(result.data.muted).toBe(false);
          expect(result.data.hold).toBe(false);
          expect(result.data.startConferenceOnEnter).toBe(true);
          expect(result.data.endConferenceOnExit).toBe(false);
        }
      });
    });

    // Voice Insights schema tests
    // Note: Insights data not immediately available after call end.
    // Partial data ~2 min, final data locked 30 min after end.
    describe('get_call_summary schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_call_summary');
        schema = tool!.inputSchema;
      });

      it('should require call SID starting with CA', () => {
        const valid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          callSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalid.success).toBe(false);
      });

      it('should accept optional processingState for timing control', () => {
        const partial = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          processingState: 'partial',
        });
        expect(partial.success).toBe(true);

        const complete = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          processingState: 'complete',
        });
        expect(complete.success).toBe(true);

        const invalid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          processingState: 'invalid',
        });
        expect(invalid.success).toBe(false);
      });
    });

    describe('list_call_events schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_call_events');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
        }
      });

      it('should validate edge enum', () => {
        const valid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          edge: 'carrier_edge',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          edge: 'invalid_edge',
        });
        expect(invalid.success).toBe(false);
      });
    });

    describe('get_transcription schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_transcription');
        schema = tool!.inputSchema;
      });

      it('should require transcription SID starting with TR', () => {
        const valid = schema.safeParse({
          transcriptionSid: 'TRxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          transcriptionSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalid.success).toBe(false);
      });
    });

    // Conference Insights schema tests
    // Note: These tools document timing behavior in their descriptions
    describe('get_conference_summary schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_conference_summary');
        schema = tool!.inputSchema;
      });

      it('should require conference SID starting with CF', () => {
        const valid = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          conferenceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalid.success).toBe(false);
      });
    });

    describe('list_conference_participant_summaries schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_conference_participant_summaries');
        schema = tool!.inputSchema;
      });

      it('should require conference SID and have default limit', () => {
        const result = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
        }
      });
    });

    describe('get_conference_participant_summary schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_conference_participant_summary');
        schema = tool!.inputSchema;
      });

      it('should require both conference SID and participant SID', () => {
        const valid = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          participantSid: 'CPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const missingParticipant = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingParticipant.success).toBe(false);
      });

      it('should require participant SID starting with CP', () => {
        const invalid = schema.safeParse({
          conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          participantSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalid.success).toBe(false);
      });
    });

    // Media Streams schema tests
    describe('start_call_stream schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'start_call_stream');
        schema = tool!.inputSchema;
      });

      it('should require call SID and WebSocket URL', () => {
        const valid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          url: 'wss://example.com/stream',
        });
        expect(valid.success).toBe(true);

        const missingUrl = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingUrl.success).toBe(false);
      });

      it('should require call SID starting with CA', () => {
        const invalid = schema.safeParse({
          callSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          url: 'wss://example.com/stream',
        });
        expect(invalid.success).toBe(false);
      });

      it('should validate track enum', () => {
        const inbound = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          url: 'wss://example.com/stream',
          track: 'inbound_track',
        });
        expect(inbound.success).toBe(true);

        const both = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          url: 'wss://example.com/stream',
          track: 'both_tracks',
        });
        expect(both.success).toBe(true);

        const invalid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          url: 'wss://example.com/stream',
          track: 'invalid_track',
        });
        expect(invalid.success).toBe(false);
      });

      it('should accept optional parameters array', () => {
        const withParams = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          url: 'wss://example.com/stream',
          parameters: [
            { name: 'key1', value: 'value1' },
            { name: 'key2', value: 'value2' },
          ],
        });
        expect(withParams.success).toBe(true);
      });

      it('should limit parameters to 10', () => {
        const tooManyParams = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          url: 'wss://example.com/stream',
          parameters: Array(11).fill({ name: 'key', value: 'value' }),
        });
        expect(tooManyParams.success).toBe(false);
      });
    });

    describe('stop_call_stream schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'stop_call_stream');
        schema = tool!.inputSchema;
      });

      it('should require both call SID and stream SID', () => {
        const valid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          streamSid: 'MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const missingStream = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingStream.success).toBe(false);
      });

      it('should require stream SID starting with MZ', () => {
        const invalid = schema.safeParse({
          callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          streamSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials('get_call_logs should return call array', async () => {
      const tool = tools.find(t => t.name === 'get_call_logs')!;
      const result = await tool.handler({ limit: 5 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.calls)).toBe(true);
    });

    itWithCredentials(
      'get_call should return call details when call exists',
      async () => {
        // First get a call from logs
        const logsTool = tools.find(t => t.name === 'get_call_logs')!;
        const logsResult = await logsTool.handler({ limit: 1 });
        const logsResponse = JSON.parse(logsResult.content[0].text);

        if (logsResponse.count > 0) {
          const callSid = logsResponse.calls[0].sid;

          const getTool = tools.find(t => t.name === 'get_call')!;
          const getResult = await getTool.handler({ callSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(callSid);
          expect(getResponse.to).toBeDefined();
          expect(getResponse.from).toBeDefined();
          expect(getResponse.status).toBeDefined();
        }
      },
      15000
    );

    itWithCredentials(
      'list_conferences should return conference array',
      async () => {
        const tool = tools.find(t => t.name === 'list_conferences')!;
        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(Array.isArray(response.conferences)).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
      },
      15000
    );

    itWithCredentials(
      'get_conference should return conference details when conference exists',
      async () => {
        const listTool = tools.find(t => t.name === 'list_conferences')!;
        const listResult = await listTool.handler({ limit: 1 });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const conferenceSid = listResponse.conferences[0].sid;

          const getTool = tools.find(t => t.name === 'get_conference')!;
          const getResult = await getTool.handler({ conferenceSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(conferenceSid);
          expect(getResponse.friendlyName).toBeDefined();
          expect(getResponse.status).toBeDefined();
        }
      },
      15000
    );

    itWithCredentials(
      'list_conference_participants should return participants array',
      async () => {
        const listTool = tools.find(t => t.name === 'list_conferences')!;
        const listResult = await listTool.handler({ limit: 1, status: 'in-progress' });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const conferenceSid = listResponse.conferences[0].sid;

          const participantsTool = tools.find(t => t.name === 'list_conference_participants')!;
          const participantsResult = await participantsTool.handler({ conferenceSid, limit: 10 });
          const participantsResponse = JSON.parse(participantsResult.content[0].text);

          expect(participantsResponse.success).toBe(true);
          expect(Array.isArray(participantsResponse.participants)).toBe(true);
        }
      },
      15000
    );

    itWithCredentials(
      'list_call_recordings should return recordings for a call',
      async () => {
        // Get a recent call
        const logsTool = tools.find(t => t.name === 'get_call_logs')!;
        const logsResult = await logsTool.handler({ limit: 5, status: 'completed' });
        const logsResponse = JSON.parse(logsResult.content[0].text);

        if (logsResponse.count > 0) {
          const callSid = logsResponse.calls[0].sid;

          const recordingsTool = tools.find(t => t.name === 'list_call_recordings')!;
          const recordingsResult = await recordingsTool.handler({ callSid, limit: 5 });
          const recordingsResponse = JSON.parse(recordingsResult.content[0].text);

          expect(recordingsResponse.success).toBe(true);
          expect(Array.isArray(recordingsResponse.recordings)).toBe(true);
        }
      },
      15000
    );

    itWithCredentials(
      'get_call_summary should return Voice Insights data',
      async () => {
        // Get a completed call for Voice Insights
        const logsTool = tools.find(t => t.name === 'get_call_logs')!;
        const logsResult = await logsTool.handler({ limit: 5, status: 'completed' });
        const logsResponse = JSON.parse(logsResult.content[0].text);

        if (logsResponse.count > 0) {
          const callSid = logsResponse.calls[0].sid;

          const summaryTool = tools.find(t => t.name === 'get_call_summary')!;
          try {
            const summaryResult = await summaryTool.handler({ callSid });
            const summaryResponse = JSON.parse(summaryResult.content[0].text);

            expect(summaryResponse.success).toBe(true);
            expect(summaryResponse.callSid).toBe(callSid);
          } catch (error) {
            // Voice Insights may not be available for all calls
            const err = error as { code: number };
            expect([20404, 20003]).toContain(err.code);
          }
        }
      },
      15000
    );

    itWithCredentials(
      'list_call_events should return events for a call',
      async () => {
        const logsTool = tools.find(t => t.name === 'get_call_logs')!;
        const logsResult = await logsTool.handler({ limit: 5, status: 'completed' });
        const logsResponse = JSON.parse(logsResult.content[0].text);

        if (logsResponse.count > 0) {
          const callSid = logsResponse.calls[0].sid;

          const eventsTool = tools.find(t => t.name === 'list_call_events')!;
          try {
            const eventsResult = await eventsTool.handler({ callSid, limit: 10 });
            const eventsResponse = JSON.parse(eventsResult.content[0].text);

            expect(eventsResponse.success).toBe(true);
            expect(Array.isArray(eventsResponse.events)).toBe(true);
          } catch (error) {
            // Voice Insights may not be available for all calls
            const err = error as { code: number };
            expect([20404, 20003]).toContain(err.code);
          }
        }
      },
      15000
    );
  });
});
