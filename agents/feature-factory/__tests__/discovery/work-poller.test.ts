// ABOUTME: Tests for work poller that listens to validation events.
// ABOUTME: Verifies event handling, queue management, and statistics.

import { EventEmitter } from 'events';
import {
  WorkPoller,
  createWorkPoller,
  type ValidationFailureEvent,
  type ValidationEventEmitter,
} from '../../src/discovery/work-poller';
import { type Diagnosis } from '../../src/discovery/work-discovery';

describe('WorkPoller', () => {
  const createMockDiagnosis = (): Diagnosis => ({
    patternId: 'PAT-test-001',
    summary: 'Test failure',
    rootCause: {
      category: 'code',
      description: 'Test error',
      confidence: 0.8,
    },
    evidence: [{ source: 'test', data: {}, relevance: 'primary' }],
    suggestedFixes: [
      { description: 'Fix the code', actionType: 'code', confidence: 0.8, automated: true },
    ],
    isKnownPattern: false,
    previousOccurrences: 0,
    validationResult: {
      success: false,
      resourceSid: 'SM123',
      resourceType: 'message',
      primaryStatus: 'failed',
      checks: {},
      errors: ['Test error'],
      warnings: [],
      duration: 100,
    },
    timestamp: new Date(),
  });

  const createMockValidationEvent = (diagnosis?: Diagnosis): ValidationFailureEvent => ({
    type: 'message',
    result: {
      success: false,
      resourceSid: 'SM123',
      errors: ['Test error'],
    },
    diagnosis,
    timestamp: new Date(),
  });

  describe('constructor', () => {
    it('creates poller with default config', () => {
      const poller = createWorkPoller();
      expect(poller).toBeInstanceOf(WorkPoller);
      expect(poller.getQueue()).toHaveLength(0);
    });

    it('creates poller with custom config', () => {
      const poller = createWorkPoller({
        enabled: true,
        pollInterval: 30000,
        maxQueueSize: 50,
        autoHandleLowTier: true,
        minPriority: 'high',
      });
      expect(poller).toBeInstanceOf(WorkPoller);
    });
  });

  describe('registerValidator', () => {
    it('registers a validator and listens for events', () => {
      const poller = createWorkPoller();
      const mockValidator = new EventEmitter() as ValidationEventEmitter;

      poller.registerValidator(mockValidator);

      // Emit event
      const event = createMockValidationEvent(createMockDiagnosis());
      mockValidator.emit('validation-failure', event);

      // Should have queued work
      expect(poller.getQueue()).toHaveLength(1);
    });
  });

  describe('unregisterValidator', () => {
    it('stops listening for events from unregistered validator', () => {
      const poller = createWorkPoller();
      const mockValidator = new EventEmitter() as ValidationEventEmitter;

      poller.registerValidator(mockValidator);
      poller.unregisterValidator(mockValidator);

      // Emit event (should be ignored)
      const event = createMockValidationEvent(createMockDiagnosis());
      mockValidator.emit('validation-failure', event);

      // Queue should still be empty
      expect(poller.getQueue()).toHaveLength(0);
    });
  });

  describe('work-discovered event', () => {
    it('emits work-discovered when validation failure is processed', (done) => {
      const poller = createWorkPoller();
      const mockValidator = new EventEmitter() as ValidationEventEmitter;

      poller.registerValidator(mockValidator);
      poller.on('work-discovered', (work) => {
        expect(work.summary).toBe('Test failure');
        expect(work.source).toBe('validation-failure');
        done();
      });

      const event = createMockValidationEvent(createMockDiagnosis());
      mockValidator.emit('validation-failure', event);
    });
  });

  describe('getNextWork', () => {
    it('returns undefined when queue is empty', () => {
      const poller = createWorkPoller();
      expect(poller.getNextWork()).toBeUndefined();
    });

    it('returns highest priority work first', () => {
      const poller = createWorkPoller();
      const mockValidator = new EventEmitter() as ValidationEventEmitter;
      poller.registerValidator(mockValidator);

      // Add low priority work
      const lowDiagnosis = createMockDiagnosis();
      lowDiagnosis.rootCause.category = 'unknown';
      lowDiagnosis.rootCause.confidence = 0.3;
      mockValidator.emit('validation-failure', createMockValidationEvent(lowDiagnosis));

      // Add high priority work
      const highDiagnosis = createMockDiagnosis();
      highDiagnosis.rootCause.category = 'code';
      highDiagnosis.rootCause.confidence = 0.9;
      highDiagnosis.patternId = 'PAT-high';
      mockValidator.emit('validation-failure', createMockValidationEvent(highDiagnosis));

      const next = poller.getNextWork();
      expect(next?.priority).toBe('high');
    });
  });

  describe('startWork / completeWork', () => {
    it('tracks work status through lifecycle', () => {
      const poller = createWorkPoller();
      const mockValidator = new EventEmitter() as ValidationEventEmitter;
      poller.registerValidator(mockValidator);

      const event = createMockValidationEvent(createMockDiagnosis());
      mockValidator.emit('validation-failure', event);

      const work = poller.getNextWork()!;
      expect(work.status).toBe('pending');

      poller.startWork(work);
      expect(work.status).toBe('in-progress');
      expect(work.startedAt).toBeInstanceOf(Date);

      poller.completeWork(work, 'Fixed the bug');
      expect(work.status).toBe('completed');
      expect(work.completedAt).toBeInstanceOf(Date);
      expect(work.resolution).toBe('Fixed the bug');

      // Should be removed from queue
      expect(poller.getQueue()).toHaveLength(0);
    });
  });

  describe('escalateWork', () => {
    it('marks work as escalated', () => {
      const poller = createWorkPoller();
      const mockValidator = new EventEmitter() as ValidationEventEmitter;
      poller.registerValidator(mockValidator);

      const event = createMockValidationEvent(createMockDiagnosis());
      mockValidator.emit('validation-failure', event);

      const work = poller.getNextWork()!;
      poller.escalateWork(work, 'Needs human review');

      expect(work.status).toBe('escalated');
      expect(work.resolution).toBe('Escalated: Needs human review');
    });

    it('emits work-escalated event', (done) => {
      const poller = createWorkPoller();
      const mockValidator = new EventEmitter() as ValidationEventEmitter;
      poller.registerValidator(mockValidator);

      poller.on('work-escalated', (work) => {
        expect(work.status).toBe('escalated');
        done();
      });

      const event = createMockValidationEvent(createMockDiagnosis());
      mockValidator.emit('validation-failure', event);

      const work = poller.getNextWork()!;
      poller.escalateWork(work, 'Needs human review');
    });
  });

  describe('getStats', () => {
    it('returns queue statistics', () => {
      const poller = createWorkPoller();
      const mockValidator = new EventEmitter() as ValidationEventEmitter;
      poller.registerValidator(mockValidator);

      // Add a few work items
      for (let i = 0; i < 3; i++) {
        const diagnosis = createMockDiagnosis();
        diagnosis.patternId = `PAT-${i}`;
        mockValidator.emit('validation-failure', createMockValidationEvent(diagnosis));
      }

      const stats = poller.getStats();
      expect(stats.queueSize).toBe(3);
      expect(stats.pendingCount).toBe(3);
      expect(stats.inProgressCount).toBe(0);
      expect(stats.byPriority.high).toBe(3);
      expect(stats.byTier[2]).toBe(3);
    });
  });

  describe('autoHandleLowTier', () => {
    it('auto-starts tier 1-2 work when enabled', (done) => {
      const poller = createWorkPoller({ autoHandleLowTier: true });
      const mockValidator = new EventEmitter() as ValidationEventEmitter;
      poller.registerValidator(mockValidator);

      poller.on('work-started', (work) => {
        expect(work.status).toBe('in-progress');
        expect(work.tier).toBeLessThanOrEqual(2);
        done();
      });

      const diagnosis = createMockDiagnosis();
      diagnosis.rootCause.category = 'code';
      diagnosis.suggestedFixes = [
        { description: 'Fix', actionType: 'code', confidence: 0.9, automated: true },
      ];
      mockValidator.emit('validation-failure', createMockValidationEvent(diagnosis));
    });
  });

  describe('minPriority filter', () => {
    it('filters out work below minimum priority', () => {
      const poller = createWorkPoller({ minPriority: 'high' });
      const mockValidator = new EventEmitter() as ValidationEventEmitter;
      poller.registerValidator(mockValidator);

      // Add low priority work (should be filtered)
      const lowDiagnosis = createMockDiagnosis();
      lowDiagnosis.rootCause.category = 'unknown';
      lowDiagnosis.rootCause.confidence = 0.3;
      mockValidator.emit('validation-failure', createMockValidationEvent(lowDiagnosis));

      expect(poller.getQueue()).toHaveLength(0);
    });

    it('allows work at or above minimum priority', () => {
      const poller = createWorkPoller({ minPriority: 'high' });
      const mockValidator = new EventEmitter() as ValidationEventEmitter;
      poller.registerValidator(mockValidator);

      // Add high priority work (should pass filter)
      const highDiagnosis = createMockDiagnosis();
      highDiagnosis.rootCause.category = 'code';
      mockValidator.emit('validation-failure', createMockValidationEvent(highDiagnosis));

      expect(poller.getQueue()).toHaveLength(1);
    });
  });

  describe('start / stop polling', () => {
    it('starts and stops the polling loop', () => {
      const poller = createWorkPoller({ pollInterval: 100 });

      poller.start();
      // Polling is running - just verify no errors

      poller.stop();
      // Should stop cleanly
    });
  });

  describe('getPendingByTier', () => {
    it('filters pending work by tier', () => {
      const poller = createWorkPoller();
      const mockValidator = new EventEmitter() as ValidationEventEmitter;
      poller.registerValidator(mockValidator);

      // Add tier 2 work
      const diagnosis = createMockDiagnosis();
      mockValidator.emit('validation-failure', createMockValidationEvent(diagnosis));

      expect(poller.getPendingByTier(2)).toHaveLength(1);
      expect(poller.getPendingByTier(1)).toHaveLength(0);
      expect(poller.getPendingByTier(3)).toHaveLength(0);
    });
  });
});
