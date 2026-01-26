// ABOUTME: Unit tests for the QA agent configuration.
// ABOUTME: Validates QA agent schema, system prompt, and output expectations.

import { describe, it, expect } from '@jest/globals';
import { qaAgent } from '../src/agents/qa.js';
import { getAgentConfig } from '../src/agents/index.js';

describe('QA Agent Configuration', () => {
  describe('Basic Properties', () => {
    it('should have correct name', () => {
      expect(qaAgent.name).toBe('qa');
    });

    it('should have meaningful description', () => {
      expect(qaAgent.description).toBeTruthy();
      expect(qaAgent.description.length).toBeGreaterThan(20);
      expect(qaAgent.description.toLowerCase()).toContain('quality');
    });

    it('should be registered in agent index', () => {
      const config = getAgentConfig('qa');
      expect(config).toBeDefined();
      expect(config.name).toBe('qa');
    });
  });

  describe('Tools Configuration', () => {
    it('should include file reading tools', () => {
      expect(qaAgent.tools).toContain('Read');
      expect(qaAgent.tools).toContain('Glob');
      expect(qaAgent.tools).toContain('Grep');
    });

    it('should include bash for running tests', () => {
      expect(qaAgent.tools).toContain('Bash');
    });

    it('should not include write/edit tools (QA reads only)', () => {
      expect(qaAgent.tools).not.toContain('Write');
      expect(qaAgent.tools).not.toContain('Edit');
    });
  });

  describe('Max Turns', () => {
    it('should have reasonable maxTurns limit', () => {
      expect(qaAgent.maxTurns).toBeGreaterThan(10);
      expect(qaAgent.maxTurns).toBeLessThanOrEqual(100);
    });
  });

  describe('System Prompt', () => {
    const prompt = qaAgent.systemPrompt;

    it('should have substantial system prompt', () => {
      expect(prompt.length).toBeGreaterThan(500);
    });

    it('should mention test execution', () => {
      expect(prompt.toLowerCase()).toContain('test');
      expect(prompt).toContain('npm test');
    });

    it('should mention coverage analysis', () => {
      expect(prompt.toLowerCase()).toContain('coverage');
    });

    it('should mention TwiML validation', () => {
      expect(prompt.toLowerCase()).toContain('twiml');
    });

    it('should mention security scanning', () => {
      expect(prompt.toLowerCase()).toContain('security');
    });

    it('should define verdict criteria', () => {
      expect(prompt).toContain('PASSED');
      expect(prompt).toContain('NEEDS_ATTENTION');
      expect(prompt).toContain('FAILED');
    });

    it('should define coverage threshold', () => {
      expect(prompt).toContain('80%');
    });

    it('should describe credential exposure patterns', () => {
      expect(prompt).toContain('AC[a-f0-9]{32}');
      expect(prompt).toContain('SK[a-f0-9]{32}');
    });

    it('should describe TwiML patterns to flag', () => {
      expect(prompt).toContain('<Gather>');
      expect(prompt).toContain('<Redirect>');
      expect(prompt).toContain('timeout');
    });
  });

  describe('Input Schema', () => {
    const input = qaAgent.inputSchema;

    it('should define testScope input', () => {
      expect(input.testScope).toBeDefined();
      expect(input.testScope).toContain('unit');
      expect(input.testScope).toContain('integration');
      expect(input.testScope).toContain('e2e');
    });

    it('should define analysisMode input', () => {
      expect(input.analysisMode).toBeDefined();
      expect(input.analysisMode).toContain('full');
      expect(input.analysisMode).toContain('coverage-only');
      expect(input.analysisMode).toContain('security-only');
    });

    it('should accept files from dev phase', () => {
      expect(input.filesCreated).toBeDefined();
      expect(input.filesModified).toBeDefined();
    });
  });

  describe('Output Schema', () => {
    const output = qaAgent.outputSchema;

    it('should define test result fields', () => {
      expect(output.testsRun).toBeDefined();
      expect(output.testsPassed).toBeDefined();
      expect(output.testsFailed).toBeDefined();
      expect(output.testOutput).toBeDefined();
    });

    it('should define coverage fields', () => {
      expect(output.coveragePercent).toBeDefined();
      expect(output.coverageGaps).toBeDefined();
      expect(output.coverageMeetsThreshold).toBeDefined();
    });

    it('should define security fields', () => {
      expect(output.securityIssues).toBeDefined();
    });

    it('should define TwiML fields', () => {
      expect(output.twimlIssues).toBeDefined();
    });

    it('should define deep validation fields', () => {
      expect(output.deepValidationResults).toBeDefined();
    });

    it('should define verdict and summary', () => {
      expect(output.verdict).toBeDefined();
      expect(output.summary).toBeDefined();
      expect(output.recommendations).toBeDefined();
    });
  });
});

describe('QA Agent Role Separation', () => {
  it('should be distinct from review agent', async () => {
    const { reviewAgent } = await import('../src/agents/review.js');

    // QA and Review have different names
    expect(qaAgent.name).not.toBe(reviewAgent.name);

    // QA has Bash for running tests, Review does not
    expect(qaAgent.tools).toContain('Bash');
    expect(reviewAgent.tools).not.toContain('Bash');

    // Both have Read/Glob/Grep for analysis
    expect(qaAgent.tools).toContain('Read');
    expect(reviewAgent.tools).toContain('Read');
  });

  it('QA focuses on execution, Review focuses on judgment', () => {
    const qaPrompt = qaAgent.systemPrompt.toLowerCase();

    // QA executes tests and produces data
    expect(qaPrompt).toContain('run');
    expect(qaPrompt).toContain('coverage');
    expect(qaPrompt).toContain('npm test');

    // QA outputs structured metrics
    expect(qaAgent.outputSchema.testsRun).toBeDefined();
    expect(qaAgent.outputSchema.coveragePercent).toBeDefined();
  });
});
