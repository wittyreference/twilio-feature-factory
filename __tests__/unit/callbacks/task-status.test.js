// ABOUTME: Unit tests for task-status callback handler.
// ABOUTME: Tests TaskRouter event logging to Sync and error handling.

const path = require('path');
const Twilio = require('twilio');

Twilio.Response = class MockResponse {
  constructor() { this.statusCode = 200; this.body = ''; this.headers = {}; }
  setStatusCode(code) { this.statusCode = code; }
  setBody(body) { this.body = body; }
  appendHeader(key, value) { this.headers[key] = value; }
};

global.Twilio = Twilio;

const SYNC_LOGGER_PATH = path.resolve(
  __dirname,
  '../../../functions/callbacks/helpers/sync-logger.private'
);

describe('task-status callback', () => {
  let handler;
  let mockLogToSync;
  let callback;

  beforeEach(() => {
    jest.resetModules();
    mockLogToSync = jest.fn().mockResolvedValue({});

    global.Runtime = {
      getFunctions: () => ({
        'callbacks/helpers/sync-logger': { path: SYNC_LOGGER_PATH },
      }),
    };

    jest.doMock(SYNC_LOGGER_PATH, () => ({
      logToSync: mockLogToSync,
    }));

    handler = require('../../../functions/callbacks/task-status.protected').handler;
    callback = jest.fn();
  });

  afterEach(() => {
    delete global.Runtime;
  });

  it('should log task event to Sync and return success', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      EventType: 'task.completed',
      TaskSid: 'WT1234567890abcdef1234567890abcdef',
      TaskAssignmentStatus: 'completed',
      WorkspaceSid: 'WS123',
      WorkflowSid: 'WW123',
      AccountSid: 'AC123',
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.eventType).toBe('task.completed');
  });

  it('should use TaskSid as primary resource SID', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      EventType: 'task.created',
      TaskSid: 'WT123',
      ReservationSid: 'WR456',
      WorkerSid: 'WK789',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'task',
      'WT123',
      expect.objectContaining({ eventType: 'task.created' })
    );
  });

  it('should fall back to ReservationSid when no TaskSid', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      EventType: 'reservation.accepted',
      ReservationSid: 'WR456',
      WorkerSid: 'WK789',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'reservation',
      'WR456',
      expect.objectContaining({ eventType: 'reservation.accepted' })
    );
  });

  it('should fall back to WorkerSid when no TaskSid or ReservationSid', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      EventType: 'worker.activity.update',
      WorkerSid: 'WK789',
      WorkerName: 'Alice',
      WorkerActivityName: 'Available',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'worker',
      'WK789',
      expect.objectContaining({
        eventType: 'worker.activity.update',
        workerName: 'Alice',
      })
    );
  });

  it('should return error if no resource SID found', async () => {
    const context = {};
    const event = { EventType: 'task.created' };

    await handler(context, event, callback);

    const [, result] = callback.mock.calls[0];
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing resource SID');
    expect(mockLogToSync).not.toHaveBeenCalled();
  });

  it('should parse TaskAttributes JSON', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      EventType: 'task.created',
      TaskSid: 'WT123',
      TaskAttributes: '{"type":"support","priority":5}',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'task',
      'WT123',
      expect.objectContaining({
        taskAttributes: { type: 'support', priority: 5 },
      })
    );
  });

  it('should handle invalid TaskAttributes JSON gracefully', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      EventType: 'task.created',
      TaskSid: 'WT123',
      TaskAttributes: 'not-json',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'task',
      'WT123',
      expect.objectContaining({
        taskAttributes: 'not-json',
      })
    );
  });

  it('should handle logToSync errors gracefully', async () => {
    mockLogToSync.mockRejectedValue(new Error('Sync error'));
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      EventType: 'task.created',
      TaskSid: 'WT123',
    };

    await handler(context, event, callback);

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.eventType).toBe('task.created');
  });
});
