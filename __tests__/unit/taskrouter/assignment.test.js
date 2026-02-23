// ABOUTME: Unit tests for the TaskRouter assignment callback handler.
// ABOUTME: Tests dequeue instruction for call tasks and accept for others.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/taskrouter/assignment.protected');

describe('assignment handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_PHONE_NUMBER: '+15559876543',
    };
    callback = jest.fn();
  });

  describe('call tasks', () => {
    it('should return dequeue instruction for call type tasks', async () => {
      const event = global.createTestEvent({
        TaskSid: 'WT1234567890abcdef',
        WorkerName: 'Agent B',
        TaskAttributes: JSON.stringify({
          type: 'call',
          language: 'english',
          callSid: 'CA1234567890abcdef',
          from: '+15551234567',
        }),
      });

      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.instruction).toBe('dequeue');
    });

    it('should include from number in dequeue instruction', async () => {
      const event = global.createTestEvent({
        TaskSid: 'WT1234567890abcdef',
        WorkerName: 'Agent B',
        TaskAttributes: JSON.stringify({ type: 'call', callSid: 'CA123' }),
      });

      await handler(context, event, callback);

      const response = callback.mock.calls[0][1];
      expect(response.from).toBe('+15559876543');
    });
  });

  describe('non-call tasks', () => {
    it('should return accept instruction for non-call tasks', async () => {
      const event = global.createTestEvent({
        TaskSid: 'WT1234567890abcdef',
        WorkerName: 'Agent B',
        TaskAttributes: JSON.stringify({ type: 'email', subject: 'Help needed' }),
      });

      await handler(context, event, callback);

      const response = callback.mock.calls[0][1];
      expect(response.instruction).toBe('accept');
    });
  });

  describe('edge cases', () => {
    it('should handle missing TaskAttributes gracefully', async () => {
      const event = global.createTestEvent({
        TaskSid: 'WT1234567890abcdef',
        WorkerName: 'Agent B',
      });

      await handler(context, event, callback);

      const response = callback.mock.calls[0][1];
      expect(response.instruction).toBe('accept');
    });

    it('should handle empty TaskAttributes', async () => {
      const event = global.createTestEvent({
        TaskSid: 'WT1234567890abcdef',
        WorkerName: 'Agent B',
        TaskAttributes: '{}',
      });

      await handler(context, event, callback);

      const response = callback.mock.calls[0][1];
      expect(response.instruction).toBe('accept');
    });
  });
});
