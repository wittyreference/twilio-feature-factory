// ABOUTME: Unit tests for Twilio Video tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { videoTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.authToken.length > 0 &&
  TEST_CREDENTIALS.fromNumber.startsWith('+');

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

describe('videoTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = videoTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 10 tools', () => {
      expect(tools).toHaveLength(10);
    });

    it('should have create_video_room tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_video_room');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('video room');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_video_rooms tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_video_rooms');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('video rooms');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_room_participants tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_room_participants');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('participant');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('create_video_room schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_video_room');
        schema = tool!.inputSchema;
      });

      it('should accept empty params (uniqueName is optional)', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('should accept uniqueName', () => {
        const result = schema.safeParse({ uniqueName: 'test-room' });
        expect(result.success).toBe(true);
      });

      it('should have default type of group', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe('group');
        }
      });

      it('should validate type enum', () => {
        const valid = schema.safeParse({ uniqueName: 'test', type: 'group' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ uniqueName: 'test', type: 'invalid' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('list_video_rooms schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_video_rooms');
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
        const valid = schema.safeParse({ status: 'completed' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ status: 'invalid' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('list_room_participants schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_room_participants');
        schema = tool!.inputSchema;
      });

      it('should require roomSid', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should validate roomSid starts with RM', () => {
        const valid = schema.safeParse({ roomSid: 'RM12345678901234567890123456789012' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ roomSid: 'XX12345678901234567890123456789012' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_video_rooms should return rooms',
      async () => {
        const tool = tools.find(t => t.name === 'list_video_rooms')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.rooms)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_room should return room details when rooms exist',
      async () => {
        const listTool = tools.find(t => t.name === 'list_video_rooms')!;
        const getTool = tools.find(t => t.name === 'get_room')!;

        const listResult = await listTool.handler({ limit: 1 });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const roomSid = listResponse.rooms[0].sid;

          const getResult = await getTool.handler({ roomSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(roomSid);
          expect(getResponse.uniqueName).toBeDefined();
          expect(getResponse.status).toBeDefined();
        }
      },
      20000
    );

    itWithCredentials(
      'list_room_participants should return participants for a room',
      async () => {
        const listRoomsTool = tools.find(t => t.name === 'list_video_rooms')!;
        const listParticipantsTool = tools.find(t => t.name === 'list_room_participants')!;

        const roomsResult = await listRoomsTool.handler({ limit: 1 });
        const roomsResponse = JSON.parse(roomsResult.content[0].text);

        if (roomsResponse.count > 0) {
          const roomSid = roomsResponse.rooms[0].sid;

          const participantsResult = await listParticipantsTool.handler({ roomSid, limit: 10 });
          const participantsResponse = JSON.parse(participantsResult.content[0].text);

          expect(participantsResponse.success).toBe(true);
          expect(participantsResponse.count).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(participantsResponse.participants)).toBe(true);
        }
      },
      20000
    );
  });
});
