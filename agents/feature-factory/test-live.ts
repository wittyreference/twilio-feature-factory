#!/usr/bin/env npx tsx
// ABOUTME: Standalone live API test - run with: npx tsx test-live.ts
// ABOUTME: Tests Feature Factory orchestrator with actual Claude API calls.

import { FeatureFactoryOrchestrator } from './src/orchestrator.js';
import type { WorkflowEvent } from './src/types.js';

async function main() {
  console.log('🧪 Feature Factory Live API Test\n');
  console.log('=' .repeat(50));

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set');
    console.log('\nSet it with: export ANTHROPIC_API_KEY=your-key');
    process.exit(1);
  }

  console.log('✓ ANTHROPIC_API_KEY found');
  console.log('');

  // Create orchestrator
  const orchestrator = new FeatureFactoryOrchestrator({
    maxBudgetUsd: 2.0,
    maxTurnsPerAgent: 8,
    defaultModel: 'haiku', // Cheapest model for testing
    approvalMode: 'none',
    verbose: true,
    twilioMcpEnabled: false,
    workingDirectory: process.cwd(),
  });

  console.log('✓ Orchestrator created');
  console.log(`  Budget: $${orchestrator.getConfig().maxBudgetUsd}`);
  console.log(`  Model: ${orchestrator.getConfig().defaultModel}`);
  console.log(`  Max turns: ${orchestrator.getConfig().maxTurnsPerAgent}`);
  console.log('');

  // Simple test task
  const task = 'Analyze the structure of the package.json file and describe what this project does based on its dependencies.';

  console.log('📋 Task:', task);
  console.log('');
  console.log('=' .repeat(50));
  console.log('Starting workflow...\n');

  const events: WorkflowEvent[] = [];
  let completedPhases = 0;
  let totalCost = 0;

  try {
    const generator = orchestrator.runWorkflow('new-feature', task);

    for await (const event of generator) {
      events.push(event);

      switch (event.type) {
        case 'workflow-started':
          console.log(`🚀 Workflow started: ${event.workflow}`);
          console.log(`   Phases: ${event.totalPhases}`);
          break;

        case 'phase-started':
          console.log(`\n▶️  Phase ${event.phaseIndex + 1}/${event.totalPhases}: ${event.phase}`);
          console.log(`   Agent: ${event.agent}`);
          break;

        case 'phase-completed':
          completedPhases++;
          totalCost += event.result.costUsd;
          console.log(`\n✅ Phase completed: ${event.phase}`);
          console.log(`   Success: ${event.result.success}`);
          console.log(`   Turns: ${event.result.turnsUsed}`);
          console.log(`   Cost: $${event.result.costUsd.toFixed(4)}`);

          if (event.result.filesCreated.length > 0) {
            console.log(`   Files created: ${event.result.filesCreated.join(', ')}`);
          }
          if (event.result.filesModified.length > 0) {
            console.log(`   Files modified: ${event.result.filesModified.join(', ')}`);
          }

          // Show output summary
          const output = event.result.output;
          if (output && typeof output === 'object') {
            console.log('\n   📄 Output:');
            const outputStr = JSON.stringify(output, null, 2);
            // Truncate long output
            if (outputStr.length > 500) {
              console.log('   ' + outputStr.substring(0, 500) + '...');
            } else {
              console.log('   ' + outputStr.split('\n').join('\n   '));
            }
          }

          // Stop after 2 phases to control cost
          if (completedPhases >= 2) {
            console.log('\n⏹️  Stopping after 2 phases (cost control)');
            break;
          }
          break;

        case 'cost-update':
          console.log(`   💰 Running cost: $${event.currentCostUsd.toFixed(4)} (remaining: $${event.budgetRemainingUsd.toFixed(2)})`);
          break;

        case 'workflow-error':
          console.log(`\n❌ Error: ${event.error}`);
          console.log(`   Phase: ${event.phase || 'unknown'}`);
          console.log(`   Recoverable: ${event.recoverable}`);
          break;

        case 'workflow-completed':
          console.log('\n🎉 Workflow completed successfully!');
          console.log(`   Total cost: $${event.totalCostUsd.toFixed(4)}`);
          console.log(`   Total turns: ${event.totalTurns}`);
          break;
      }

      // Safety break for cost
      if (totalCost > 1.0) {
        console.log('\n⚠️  Cost limit reached, stopping');
        break;
      }
    }
  } catch (error) {
    console.error('\n💥 Error:', error);
    process.exit(1);
  }

  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 Test Summary');
  console.log('=' .repeat(50));
  console.log(`   Events received: ${events.length}`);
  console.log(`   Phases completed: ${completedPhases}`);
  console.log(`   Total cost: $${totalCost.toFixed(4)}`);
  console.log('');

  if (completedPhases > 0) {
    console.log('✅ Live API test PASSED');
  } else {
    console.log('❌ Live API test FAILED - no phases completed');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
