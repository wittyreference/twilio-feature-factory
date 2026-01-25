// ABOUTME: Live API tests for Feature Factory - actually calls Claude API.
// ABOUTME: Run with: npm run test:live (requires ANTHROPIC_API_KEY)

import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { FeatureFactoryOrchestrator } from '../src/orchestrator.js';
import type { WorkflowEvent } from '../src/types.js';

// Skip if no API key
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

// Increase timeout for API calls
jest.setTimeout(120000);

describe('Live API Tests', () => {

  beforeAll(() => {
    if (!hasApiKey) {
      console.log('⚠️  ANTHROPIC_API_KEY not set - skipping live API tests');
    }
  });

  describe('Single Agent Execution', () => {
    it('should execute architect agent with real API call', async () => {
      if (!hasApiKey) {
        console.log('Skipping: No API key');
        return;
      }

      console.log('\n🚀 Starting live API test...\n');

      const orchestrator = new FeatureFactoryOrchestrator({
        maxBudgetUsd: 1.0, // $1 budget limit
        maxTurnsPerAgent: 5, // Limit turns
        defaultModel: 'haiku', // Use cheapest model for testing
        approvalMode: 'none', // No approval pauses
        verbose: true,
        twilioMcpEnabled: false, // Don't need MCP for this test
      });

      const events: WorkflowEvent[] = [];
      let phaseCompleted = false;

      // Run workflow - it will stop after first phase needs approval
      // But with approvalMode: 'none', it should continue
      const generator = orchestrator.runWorkflow(
        'new-feature',
        'Create a simple hello world function that returns "Hello, World!"'
      );

      try {
        for await (const event of generator) {
          events.push(event);
          console.log(`📍 Event: ${event.type}`);

          if (event.type === 'phase-completed') {
            console.log(`   Agent: ${event.agent}`);
            console.log(`   Success: ${event.result.success}`);
            console.log(`   Cost: $${event.result.costUsd.toFixed(4)}`);
            console.log(`   Turns: ${event.result.turnsUsed}`);
            phaseCompleted = true;

            // Stop after first phase for this test
            break;
          }

          if (event.type === 'workflow-error') {
            console.log(`   Error: ${event.error}`);
            break;
          }

          if (event.type === 'cost-update') {
            console.log(`   Budget remaining: $${event.budgetRemainingUsd.toFixed(2)}`);
          }
        }
      } catch (error) {
        console.error('Error during workflow:', error);
        throw error;
      }

      // Verify we got expected events
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('workflow-started');

      // Should have completed at least one phase or hit an error
      const hasPhaseComplete = events.some((e) => e.type === 'phase-completed');
      const hasError = events.some((e) => e.type === 'workflow-error');

      console.log('\n📊 Test Results:');
      console.log(`   Events received: ${events.length}`);
      console.log(`   Phase completed: ${hasPhaseComplete}`);
      console.log(`   Had error: ${hasError}`);

      if (phaseCompleted) {
        const phaseEvent = events.find(
          (e) => e.type === 'phase-completed'
        ) as Extract<WorkflowEvent, { type: 'phase-completed' }>;

        expect(phaseEvent.result.success).toBe(true);
        expect(phaseEvent.result.costUsd).toBeGreaterThan(0);
        expect(phaseEvent.result.turnsUsed).toBeGreaterThan(0);

        console.log('\n✅ Live API test passed!');
        console.log(`   Total cost: $${phaseEvent.result.costUsd.toFixed(4)}`);
      }
    });
  });

  describe('Tool Execution in Agent', () => {
    it('should execute agent that uses tools', async () => {
      if (!hasApiKey) {
        console.log('Skipping: No API key');
        return;
      }

      console.log('\n🔧 Testing agent with tool usage...\n');

      const orchestrator = new FeatureFactoryOrchestrator({
        maxBudgetUsd: 2.0,
        maxTurnsPerAgent: 10,
        defaultModel: 'haiku',
        approvalMode: 'none',
        verbose: true,
        twilioMcpEnabled: false,
        workingDirectory: process.cwd(),
      });

      const events: WorkflowEvent[] = [];

      // Use a task that requires reading files
      const generator = orchestrator.runWorkflow(
        'new-feature',
        'Read the package.json file and describe what dependencies are installed'
      );

      let architectResult: Extract<
        WorkflowEvent,
        { type: 'phase-completed' }
      > | null = null;

      try {
        for await (const event of generator) {
          events.push(event);

          if (event.type === 'phase-started') {
            console.log(`\n▶️  Starting phase: ${event.phase} (${event.agent})`);
          }

          if (event.type === 'phase-completed') {
            console.log(`\n✓ Completed: ${event.phase}`);
            console.log(`  Turns: ${event.result.turnsUsed}`);
            console.log(`  Cost: $${event.result.costUsd.toFixed(4)}`);

            if (event.agent === 'architect') {
              architectResult = event;
              break; // Stop after architect for this test
            }
          }

          if (event.type === 'workflow-error') {
            console.log(`\n❌ Error: ${event.error}`);
            break;
          }
        }
      } catch (error) {
        console.error('Error:', error);
        throw error;
      }

      if (architectResult) {
        console.log('\n📋 Architect Output:');
        console.log(JSON.stringify(architectResult.result.output, null, 2));

        expect(architectResult.result.success).toBe(true);
        expect(architectResult.result.turnsUsed).toBeGreaterThan(0);
      }
    });
  });

  describe('Multi-Phase Workflow', () => {
    it('should execute multiple phases in sequence', async () => {
      if (!hasApiKey) {
        console.log('Skipping: No API key');
        return;
      }

      console.log('\n🔄 Testing multi-phase workflow...\n');

      const orchestrator = new FeatureFactoryOrchestrator({
        maxBudgetUsd: 5.0,
        maxTurnsPerAgent: 10,
        defaultModel: 'haiku',
        approvalMode: 'none', // Run without pausing for approval
        verbose: true,
        twilioMcpEnabled: false,
        workingDirectory: process.cwd(),
      });

      const events: WorkflowEvent[] = [];
      const completedPhases: string[] = [];
      let totalCost = 0;

      const generator = orchestrator.runWorkflow(
        'new-feature',
        'Create a utility function that formats phone numbers to E.164 format'
      );

      try {
        for await (const event of generator) {
          events.push(event);

          if (event.type === 'phase-started') {
            console.log(`\n▶️  Phase: ${event.phase} (${event.phaseIndex + 1}/${event.totalPhases})`);
          }

          if (event.type === 'phase-completed') {
            completedPhases.push(event.agent);
            totalCost += event.result.costUsd;
            console.log(`✓ ${event.agent}: $${event.result.costUsd.toFixed(4)}`);

            // Stop after 3 phases to limit cost
            if (completedPhases.length >= 3) {
              console.log('\n⏹️  Stopping after 3 phases for cost control');
              break;
            }
          }

          if (event.type === 'workflow-error') {
            console.log(`\n❌ Error in ${event.phase || 'workflow'}: ${event.error}`);
            break;
          }

          if (event.type === 'workflow-completed') {
            console.log('\n🎉 Workflow completed!');
            console.log(`   Total cost: $${event.totalCostUsd.toFixed(4)}`);
          }
        }
      } catch (error) {
        console.error('Error:', error);
        throw error;
      }

      console.log('\n📊 Summary:');
      console.log(`   Phases completed: ${completedPhases.join(' → ')}`);
      console.log(`   Total cost: $${totalCost.toFixed(4)}`);

      expect(completedPhases.length).toBeGreaterThan(0);
      expect(totalCost).toBeGreaterThan(0);
    });
  });
});
