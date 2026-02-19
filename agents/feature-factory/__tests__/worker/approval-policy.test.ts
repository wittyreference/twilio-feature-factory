// ABOUTME: Unit tests for approval policy module.
// ABOUTME: Tests tier-based routing, override precedence, and budget enforcement.

import { describe, it, expect } from '@jest/globals';
import {
  evaluateApproval,
  createDefaultPolicy,
  type ApprovalPolicy,
  type ApprovalDecision,
} from '../../src/worker/approval-policy.js';
import type { DiscoveredWork, AutomationTier } from '../../src/discovery/work-discovery.js';

function createWork(overrides: Partial<DiscoveredWork> = {}): DiscoveredWork {
  return {
    id: `work-${Date.now()}`,
    discoveredAt: new Date(),
    source: 'validation-failure',
    priority: 'medium',
    tier: 2 as AutomationTier,
    suggestedWorkflow: 'bug-fix',
    summary: 'Test work item',
    description: 'A test work item',
    status: 'pending',
    ...overrides,
  };
}

describe('ApprovalPolicy', () => {
  describe('createDefaultPolicy', () => {
    it('should create a policy with expected defaults', () => {
      const policy = createDefaultPolicy();

      expect(policy.maxAutoExecuteBudgetUsd).toBe(10);
      expect(policy.tierDefaults).toBeDefined();
      expect(policy.tierDefaults[1]).toBe('auto-execute');
      expect(policy.tierDefaults[2]).toBe('auto-execute');
      expect(policy.tierDefaults[3]).toBe('confirm');
      expect(policy.tierDefaults[4]).toBe('escalate');
    });
  });

  describe('evaluateApproval — tier defaults', () => {
    const policy = createDefaultPolicy();

    it('should auto-execute tier 1 work', () => {
      const work = createWork({ tier: 1 as AutomationTier });
      const result = evaluateApproval(work, policy);

      expect(result.decision).toBe('auto-execute');
      expect(result.tier).toBe(1);
    });

    it('should auto-execute tier 2 work', () => {
      const work = createWork({ tier: 2 as AutomationTier });
      const result = evaluateApproval(work, policy);

      expect(result.decision).toBe('auto-execute');
      expect(result.tier).toBe(2);
    });

    it('should require confirmation for tier 3 work', () => {
      const work = createWork({ tier: 3 as AutomationTier });
      const result = evaluateApproval(work, policy);

      expect(result.decision).toBe('confirm');
      expect(result.tier).toBe(3);
    });

    it('should escalate tier 4 work', () => {
      const work = createWork({ tier: 4 as AutomationTier });
      const result = evaluateApproval(work, policy);

      expect(result.decision).toBe('escalate');
      expect(result.tier).toBe(4);
    });

    it('should include reason in result', () => {
      const work = createWork({ tier: 1 as AutomationTier });
      const result = evaluateApproval(work, policy);

      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe('string');
    });

    it('should include source in result', () => {
      const work = createWork({ source: 'debugger-alert' });
      const result = evaluateApproval(work, policy);

      expect(result.source).toBe('debugger-alert');
    });
  });

  describe('evaluateApproval — source overrides', () => {
    it('should apply source override over tier default', () => {
      const policy: ApprovalPolicy = {
        ...createDefaultPolicy(),
        sourceOverrides: {
          'user-request': 'auto-execute',
        },
      };

      // Tier 4 would normally escalate, but user-request override takes precedence
      const work = createWork({
        tier: 4 as AutomationTier,
        source: 'user-request',
      });
      const result = evaluateApproval(work, policy);

      expect(result.decision).toBe('auto-execute');
      expect(result.reason).toContain('source override');
    });

    it('should not apply source override for different sources', () => {
      const policy: ApprovalPolicy = {
        ...createDefaultPolicy(),
        sourceOverrides: {
          'user-request': 'auto-execute',
        },
      };

      const work = createWork({
        tier: 4 as AutomationTier,
        source: 'validation-failure',
      });
      const result = evaluateApproval(work, policy);

      expect(result.decision).toBe('escalate');
    });
  });

  describe('evaluateApproval — priority overrides', () => {
    it('should apply priority override over tier default', () => {
      const policy: ApprovalPolicy = {
        ...createDefaultPolicy(),
        priorityOverrides: {
          critical: 'confirm',
        },
      };

      // Tier 1 would normally auto-execute, but critical override requires confirm
      const work = createWork({
        tier: 1 as AutomationTier,
        priority: 'critical',
      });
      const result = evaluateApproval(work, policy);

      expect(result.decision).toBe('confirm');
      expect(result.reason).toContain('priority override');
    });
  });

  describe('evaluateApproval — override precedence', () => {
    it('source overrides take precedence over priority overrides', () => {
      const policy: ApprovalPolicy = {
        ...createDefaultPolicy(),
        sourceOverrides: {
          'user-request': 'auto-execute',
        },
        priorityOverrides: {
          critical: 'escalate',
        },
      };

      const work = createWork({
        tier: 3 as AutomationTier,
        priority: 'critical',
        source: 'user-request',
      });
      const result = evaluateApproval(work, policy);

      // Source override wins: auto-execute
      expect(result.decision).toBe('auto-execute');
    });

    it('priority overrides take precedence over tier defaults', () => {
      const policy: ApprovalPolicy = {
        ...createDefaultPolicy(),
        priorityOverrides: {
          low: 'escalate',
        },
      };

      const work = createWork({
        tier: 1 as AutomationTier,
        priority: 'low',
      });
      const result = evaluateApproval(work, policy);

      // Priority override wins over tier default
      expect(result.decision).toBe('escalate');
    });
  });

  describe('evaluateApproval — budget enforcement', () => {
    it('should escalate auto-execute items when estimated cost exceeds budget', () => {
      const policy: ApprovalPolicy = {
        ...createDefaultPolicy(),
        maxAutoExecuteBudgetUsd: 5,
      };

      const work = createWork({
        tier: 1 as AutomationTier,
      });
      const result = evaluateApproval(work, policy, { estimatedCostUsd: 10 });

      expect(result.decision).toBe('confirm');
      expect(result.reason).toContain('budget');
    });

    it('should allow auto-execute when under budget', () => {
      const policy: ApprovalPolicy = {
        ...createDefaultPolicy(),
        maxAutoExecuteBudgetUsd: 10,
      };

      const work = createWork({ tier: 1 as AutomationTier });
      const result = evaluateApproval(work, policy, { estimatedCostUsd: 5 });

      expect(result.decision).toBe('auto-execute');
    });

    it('should not affect confirm or escalate decisions', () => {
      const policy: ApprovalPolicy = {
        ...createDefaultPolicy(),
        maxAutoExecuteBudgetUsd: 1,
      };

      const work = createWork({ tier: 3 as AutomationTier });
      const result = evaluateApproval(work, policy, { estimatedCostUsd: 100 });

      // Already confirm, budget doesn't change it
      expect(result.decision).toBe('confirm');
    });
  });

  describe('evaluateApproval — manual-review workflow', () => {
    it('should always escalate manual-review workflows regardless of tier', () => {
      const policy = createDefaultPolicy();
      const work = createWork({
        tier: 1 as AutomationTier,
        suggestedWorkflow: 'manual-review',
      });
      const result = evaluateApproval(work, policy);

      expect(result.decision).toBe('escalate');
      expect(result.reason).toContain('manual-review');
    });
  });
});
