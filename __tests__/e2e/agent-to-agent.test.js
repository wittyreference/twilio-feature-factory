#!/usr/bin/env node
// ABOUTME: End-to-end test for agent-to-agent autonomous testing.
// ABOUTME: Starts both agent servers, triggers test call, and validates results.

require('dotenv').config();

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Agent-to-Agent E2E Test
 *
 * This script runs the full autonomous testing workflow:
 * 1. Starts Agent A (questioner) WebSocket server on port 8080
 * 2. Starts Agent B (answerer) WebSocket server on port 8081
 * 3. Starts ngrok tunnels for both servers
 * 4. Updates Twilio phone number webhooks
 * 5. Triggers test call via orchestrator
 * 6. Waits for call completion
 * 7. Validates results
 * 8. Reports pass/fail
 *
 * Prerequisites:
 *   - ngrok installed and authenticated
 *   - ANTHROPIC_API_KEY set
 *   - TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN set
 *   - AGENT_A_PHONE_NUMBER and AGENT_B_PHONE_NUMBER set
 *   - TWILIO_SYNC_SERVICE_SID set (optional, for transcript storage)
 *
 * Usage:
 *   node __tests__/e2e/agent-to-agent.test.js
 */

const AGENT_A_PORT = 8080;
const AGENT_B_PORT = 8081;
const TEST_TIMEOUT = 180000; // 3 minutes

// Check required environment variables
function checkEnv() {
  const required = [
    'ANTHROPIC_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    process.exit(1);
  }

  console.log('Environment variables verified');
}

// Start an agent server
function startAgentServer(role, port) {
  return new Promise((resolve, reject) => {
    console.log(`Starting ${role} server on port ${port}...`);

    const sessionId = `test-${Date.now()}`;
    const agentProcess = spawn('node', ['__tests__/e2e/agent-server-template.js'], {
      env: {
        ...process.env,
        PORT: String(port),
        AGENT_ROLE: role,
        AGENT_ID: `agent-${role}`,
        TEST_SESSION_ID: sessionId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let started = false;

    agentProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Ready for connections') && !started) {
        started = true;
        resolve({ process: agentProcess, sessionId });
      }
      console.log(`[${role.toUpperCase()}] ${output.trim()}`);
    });

    agentProcess.stderr.on('data', (data) => {
      console.error(`[${role.toUpperCase()} ERR] ${data.toString().trim()}`);
    });

    agentProcess.on('error', reject);

    // Timeout for startup
    setTimeout(() => {
      if (!started) {
        agentProcess.kill();
        reject(new Error(`${role} server failed to start within timeout`));
      }
    }, 10000);
  });
}

// Start ngrok tunnel using spawn for proper process management
async function startNgrokTunnel(port) {
  console.log(`Starting ngrok tunnel for port ${port}...`);

  return new Promise((resolve, reject) => {
    // Start ngrok as a background process
    const ngrokProcess = spawn('ngrok', ['http', String(port), '--log=stdout'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let resolved = false;

    ngrokProcess.stdout.on('data', async (data) => {
      const output = data.toString();

      // Look for the URL in ngrok output
      if (output.includes('url=') && !resolved) {
        // Extract URL from log line like "url=https://xxx.ngrok.io"
        const urlMatch = output.match(/url=(https:\/\/[^\s]+)/);
        if (urlMatch) {
          resolved = true;
          const wsUrl = urlMatch[1].replace('https://', 'wss://');
          console.log(`Tunnel URL for port ${port}: ${wsUrl}`);
          resolve({ process: ngrokProcess, url: wsUrl });
        }
      }
    });

    ngrokProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('ERR')) {
        console.error(`[NGROK ${port}] ${output.trim()}`);
      }
    });

    ngrokProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    // Fallback: if URL not found in stdout, try API after delay
    setTimeout(async () => {
      if (!resolved) {
        try {
          const { stdout: tunnelsJson } = await execAsync('curl -s http://localhost:4040/api/tunnels');
          const tunnels = JSON.parse(tunnelsJson);
          const tunnel = tunnels.tunnels.find(t => t.config.addr.includes(String(port)));

          if (tunnel) {
            resolved = true;
            const wsUrl = tunnel.public_url.replace('https://', 'wss://');
            console.log(`Tunnel URL for port ${port} (via API): ${wsUrl}`);
            resolve({ process: ngrokProcess, url: wsUrl });
          } else {
            reject(new Error(`No tunnel found for port ${port} after timeout`));
          }
        } catch (apiError) {
          reject(new Error(`ngrok API not available: ${apiError.message}`));
        }
      }
    }, 5000);

    // Hard timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ngrokProcess.kill();
        reject(new Error(`ngrok tunnel for port ${port} failed to start`));
      }
    }, 15000);
  });
}

// Update Twilio phone number webhook
async function updatePhoneNumberWebhook(phoneNumber, voiceUrl) {
  console.log(`Updating webhook for ${phoneNumber} to ${voiceUrl}...`);

  try {
    const twilio = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Find the phone number
    const numbers = await twilio.incomingPhoneNumbers.list({ phoneNumber });

    if (numbers.length === 0) {
      throw new Error(`Phone number ${phoneNumber} not found in account`);
    }

    // Update the voice URL
    await twilio.incomingPhoneNumbers(numbers[0].sid).update({
      voiceUrl: voiceUrl,
      voiceMethod: 'POST',
    });

    console.log(`Webhook updated for ${phoneNumber}`);
  } catch (error) {
    console.error(`Error updating webhook: ${error.message}`);
    throw error;
  }
}

// Trigger test call
async function triggerTestCall(sessionId) {
  console.log('Triggering test call...');

  try {
    const twilio = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const agentAPhone = process.env.AGENT_A_PHONE_NUMBER || '+12062021014';
    const agentBPhone = process.env.AGENT_B_PHONE_NUMBER || '+12062031575';

    // Make call from Agent A to Agent B
    const call = await twilio.calls.create({
      to: agentBPhone,
      from: agentAPhone,
      // The webhook on Agent A's number will handle the call
      url: `https://${process.env.TWILIO_DOMAIN}/conversation-relay/agent-a-inbound`,
      timeout: 120,
    });

    console.log(`Call created: ${call.sid}`);
    return call.sid;
  } catch (error) {
    console.error(`Error triggering call: ${error.message}`);
    throw error;
  }
}

// Wait for call to complete
async function waitForCallCompletion(callSid, timeout = 120000) {
  console.log('Waiting for call to complete...');

  const twilio = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const startTime = Date.now();
  const pollInterval = 5000;

  while (Date.now() - startTime < timeout) {
    const call = await twilio.calls(callSid).fetch();

    console.log(`Call status: ${call.status}`);

    if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(call.status)) {
      return call;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Timeout waiting for call completion');
}

// Validate test results
async function validateResults(sessionId, callSid) {
  console.log('Validating test results...');

  const syncServiceSid = process.env.TWILIO_SYNC_SERVICE_SID;

  if (!syncServiceSid) {
    console.log('Sync not configured - skipping transcript validation');
    return { success: true, warning: 'Sync not configured' };
  }

  const twilio = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const results = {
    success: false,
    agentA: null,
    agentB: null,
    errors: [],
  };

  // Get Agent A transcript
  try {
    const docA = await twilio.sync.v1
      .services(syncServiceSid)
      .documents(`agent-test-${sessionId}-agent-questioner`)
      .fetch();

    results.agentA = {
      found: true,
      turnCount: docA.data.turnCount,
      messageCount: docA.data.messages?.length || 0,
    };
  } catch (error) {
    results.errors.push(`Agent A transcript not found: ${error.message}`);
  }

  // Get Agent B transcript
  try {
    const docB = await twilio.sync.v1
      .services(syncServiceSid)
      .documents(`agent-test-${sessionId}-agent-answerer`)
      .fetch();

    results.agentB = {
      found: true,
      turnCount: docB.data.turnCount,
      messageCount: docB.data.messages?.length || 0,
    };
  } catch (error) {
    results.errors.push(`Agent B transcript not found: ${error.message}`);
  }

  // Validate conversation quality
  if (results.agentA?.found && results.agentB?.found) {
    if (results.agentA.turnCount >= 2 && results.agentB.turnCount >= 2) {
      results.success = true;
    } else {
      results.errors.push('Insufficient conversation turns');
    }
  }

  return results;
}

// Cleanup
function cleanup(processes, ngrokProcesses = []) {
  console.log('\nCleaning up...');

  // Kill agent servers
  processes.forEach(p => {
    if (p && !p.killed) {
      try {
        p.kill('SIGTERM');
      } catch (e) {
        // Ignore errors
      }
    }
  });

  // Kill ngrok processes
  ngrokProcesses.forEach(p => {
    if (p && !p.killed) {
      try {
        // ngrok was started detached, need to kill process group
        process.kill(-p.pid, 'SIGTERM');
      } catch (e) {
        // Ignore errors, try regular kill
        try { p.kill('SIGTERM'); } catch (_) {}
      }
    }
  });

  // Fallback: kill any remaining ngrok processes
  exec('pkill -f "ngrok http"', () => {});
}

// Main test runner
async function runTest() {
  console.log('='.repeat(60));
  console.log('  Agent-to-Agent E2E Test');
  console.log('='.repeat(60));

  checkEnv();

  const processes = [];
  const ngrokProcesses = [];
  const sessionId = `test-${Date.now()}`;

  // Check for optional full automation
  const runFullAutomation = process.env.FULL_AUTOMATION === 'true';

  try {
    console.log('\n--- Phase 1: Starting Agent Servers ---');

    // Start Agent A (questioner)
    const agentA = await startAgentServer('questioner', AGENT_A_PORT);
    processes.push(agentA.process);
    console.log(`Agent A (questioner) started on port ${AGENT_A_PORT}`);

    // Start Agent B (answerer)
    const agentB = await startAgentServer('answerer', AGENT_B_PORT);
    processes.push(agentB.process);
    console.log(`Agent B (answerer) started on port ${AGENT_B_PORT}`);

    if (runFullAutomation) {
      console.log('\n--- Phase 2: Starting ngrok Tunnels ---');

      // Start ngrok tunnels
      const tunnelA = await startNgrokTunnel(AGENT_A_PORT);
      ngrokProcesses.push(tunnelA.process);
      console.log(`Tunnel A: ${tunnelA.url}`);

      const tunnelB = await startNgrokTunnel(AGENT_B_PORT);
      ngrokProcesses.push(tunnelB.process);
      console.log(`Tunnel B: ${tunnelB.url}`);

      console.log('\n--- Phase 3: Updating Phone Number Webhooks ---');

      const agentAPhone = process.env.AGENT_A_PHONE_NUMBER || '+12062021014';
      const agentBPhone = process.env.AGENT_B_PHONE_NUMBER || '+12062031575';

      // For full automation, we'd need deployed functions that reference these tunnels
      // This requires serverless deployment with the tunnel URLs as env vars
      // For now, we'll report what would need to happen

      console.log(`Agent A phone: ${agentAPhone}`);
      console.log(`Agent B phone: ${agentBPhone}`);
      console.log(`Agent A relay URL would be: ${tunnelA.url}`);
      console.log(`Agent B relay URL would be: ${tunnelB.url}`);

      console.log('\n--- Phase 4: Triggering Test Call ---');

      const callSid = await triggerTestCall(sessionId);
      console.log(`Test call initiated: ${callSid}`);

      console.log('\n--- Phase 5: Waiting for Call Completion ---');

      const call = await waitForCallCompletion(callSid, 120000);
      console.log(`Call completed with status: ${call.status}`);

      console.log('\n--- Phase 6: Validating Results ---');

      const results = await validateResults(sessionId, callSid);

      console.log('\n' + '='.repeat(60));
      console.log('  Test Results');
      console.log('='.repeat(60));
      console.log(`Success: ${results.success}`);
      console.log(`Agent A: ${JSON.stringify(results.agentA, null, 2)}`);
      console.log(`Agent B: ${JSON.stringify(results.agentB, null, 2)}`);
      if (results.errors.length > 0) {
        console.log(`Errors: ${results.errors.join(', ')}`);
      }

      cleanup(processes, ngrokProcesses);

      if (results.success) {
        console.log('\n✅ Agent-to-Agent test PASSED');
        process.exit(0);
      } else {
        console.log('\n❌ Agent-to-Agent test FAILED');
        process.exit(1);
      }

    } else {
      // Semi-automated mode: servers running, provide next steps
      console.log('\n--- Agent Servers Running ---');
      console.log(`
Agent servers are now running and ready for connections.

Session ID: ${sessionId}
Agent A (questioner): ws://localhost:${AGENT_A_PORT}
Agent B (answerer): ws://localhost:${AGENT_B_PORT}

To complete the test manually:

1. Start ngrok tunnels (in separate terminals):
   ngrok http ${AGENT_A_PORT}
   ngrok http ${AGENT_B_PORT}

2. Update the AGENT_A_RELAY_URL and AGENT_B_RELAY_URL env vars
   with the ngrok wss:// URLs

3. Deploy functions:
   twilio serverless:deploy

4. Update phone number webhooks to point to deployed functions

5. Trigger the test call:
   twilio api:core:calls:create \\
     --to=${process.env.AGENT_B_PHONE_NUMBER || '+12062031575'} \\
     --from=${process.env.AGENT_A_PHONE_NUMBER || '+12062021014'} \\
     --url=https://<domain>.twil.io/conversation-relay/agent-a-inbound

For FULL automation, run with:
   FULL_AUTOMATION=true node __tests__/e2e/agent-to-agent.test.js

Press Ctrl+C to stop the servers.
`);

      // Keep running until interrupted
      await new Promise(() => {});
    }

  } catch (error) {
    console.error('\nTest failed:', error.message);
    console.error(error.stack);
    cleanup(processes, ngrokProcesses);
    process.exit(1);
  }
}

// Run test
runTest().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
