#!/usr/bin/env node
// ABOUTME: Auto-setup script for provisioning Twilio resources and deploying callback infrastructure.
// ABOUTME: Prompts for credentials, provisions selected resources, deploys Functions, and updates .env.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`${colors.cyan}[${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}!${colors.reset} ${message}`);
}

// Interactive readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function questionHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '\u0003') {
        // Ctrl+C
        process.exit();
      } else if (char === '\u007F' || char === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += char;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

async function confirmChoice(prompt, defaultYes = true) {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await question(`${prompt} ${suffix} `);
  if (answer === '') return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

// Resource provisioning options
const RESOURCES = {
  phoneNumber: {
    name: 'Phone Number',
    description: 'Purchase a local phone number for SMS/Voice',
    envVar: 'TWILIO_PHONE_NUMBER',
  },
  verifyService: {
    name: 'Verify Service',
    description: 'OTP verification via SMS/Call/Email',
    envVar: 'TWILIO_VERIFY_SERVICE_SID',
  },
  syncService: {
    name: 'Sync Service',
    description: 'Real-time state synchronization',
    envVar: 'TWILIO_SYNC_SERVICE_SID',
  },
  messagingService: {
    name: 'Messaging Service',
    description: 'Sender pools and compliance features',
    envVar: 'TWILIO_MESSAGING_SERVICE_SID',
  },
  taskrouterWorkspace: {
    name: 'TaskRouter Workspace',
    description: 'Skills-based routing for contact centers',
    envVar: 'TWILIO_TASKROUTER_WORKSPACE_SID',
    children: ['taskrouterWorkflow'],
  },
  taskrouterWorkflow: {
    name: 'TaskRouter Workflow',
    description: 'Default routing workflow',
    envVar: 'TWILIO_TASKROUTER_WORKFLOW_SID',
    parent: 'taskrouterWorkspace',
  },
  callbackFunctions: {
    name: 'Callback Functions',
    description: 'Auto-deploy status callback handlers to Sync',
    envVar: 'TWILIO_CALLBACK_BASE_URL',
  },
};

class TwilioSetup {
  constructor(accountSid, authToken) {
    this.client = require('twilio')(accountSid, authToken);
    this.accountSid = accountSid;
    this.envUpdates = {};
    this.callbackBaseUrl = null;
  }

  async searchAndPurchasePhoneNumber() {
    logStep('Phone', 'Searching for available local numbers...');

    try {
      // Search for US local numbers
      const available = await this.client
        .availablePhoneNumbers('US')
        .local.list({ limit: 5, smsEnabled: true, voiceEnabled: true });

      if (available.length === 0) {
        throw new Error('No available phone numbers found');
      }

      log('\nAvailable numbers:', 'cyan');
      available.forEach((num, i) => {
        console.log(`  ${i + 1}. ${num.friendlyName} (${num.locality || 'Unknown'})`);
      });

      const choice = await question('\nSelect a number (1-5) or press Enter for first: ');
      const trimmedChoice = choice.trim();

      // Default to first option if empty, whitespace, or non-numeric
      let index = 0;
      if (trimmedChoice !== '') {
        const parsed = parseInt(trimmedChoice, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= available.length) {
          index = parsed - 1;
        } else {
          logWarning(`Invalid selection "${trimmedChoice}", using first option`);
        }
      }

      const selectedNumber = available[index];
      logStep('Phone', `Purchasing ${selectedNumber.friendlyName}...`);

      const purchased = await this.client.incomingPhoneNumbers.create({
        phoneNumber: selectedNumber.phoneNumber,
        friendlyName: 'twilio-agent-factory',
      });

      logSuccess(`Purchased: ${purchased.phoneNumber}`);
      this.envUpdates.TWILIO_PHONE_NUMBER = purchased.phoneNumber;
      return purchased;
    } catch (error) {
      logError(`Failed to purchase phone number: ${error.message}`);
      throw error;
    }
  }

  async createVerifyService() {
    logStep('Verify', 'Creating Verify service...');

    try {
      const service = await this.client.verify.v2.services.create({
        friendlyName: 'twilio-agent-factory-verify',
        codeLength: 6,
      });

      logSuccess(`Created Verify service: ${service.sid}`);
      this.envUpdates.TWILIO_VERIFY_SERVICE_SID = service.sid;
      return service;
    } catch (error) {
      logError(`Failed to create Verify service: ${error.message}`);
      throw error;
    }
  }

  async createSyncService() {
    logStep('Sync', 'Creating Sync service...');

    try {
      const service = await this.client.sync.v1.services.create({
        friendlyName: 'twilio-agent-factory-sync',
      });

      logSuccess(`Created Sync service: ${service.sid}`);
      this.envUpdates.TWILIO_SYNC_SERVICE_SID = service.sid;
      return service;
    } catch (error) {
      logError(`Failed to create Sync service: ${error.message}`);
      throw error;
    }
  }

  async createMessagingService(phoneNumberSid = null) {
    logStep('Messaging', 'Creating Messaging service...');

    try {
      const service = await this.client.messaging.v1.services.create({
        friendlyName: 'twilio-agent-factory-messaging',
        inboundRequestUrl: this.callbackBaseUrl
          ? `${this.callbackBaseUrl}/callbacks/message-status`
          : undefined,
        statusCallback: this.callbackBaseUrl
          ? `${this.callbackBaseUrl}/callbacks/message-status`
          : undefined,
        fallbackUrl: this.callbackBaseUrl ? `${this.callbackBaseUrl}/callbacks/fallback` : undefined,
      });

      logSuccess(`Created Messaging service: ${service.sid}`);
      this.envUpdates.TWILIO_MESSAGING_SERVICE_SID = service.sid;

      // Add phone number to messaging service if provided
      if (phoneNumberSid) {
        logStep('Messaging', 'Adding phone number to Messaging service...');
        await this.client.messaging.v1.services(service.sid).phoneNumbers.create({
          phoneNumberSid: phoneNumberSid,
        });
        logSuccess('Phone number added to Messaging service');
      }

      return service;
    } catch (error) {
      logError(`Failed to create Messaging service: ${error.message}`);
      throw error;
    }
  }

  async createTaskRouterWorkspace() {
    logStep('TaskRouter', 'Creating TaskRouter workspace...');

    try {
      const workspace = await this.client.taskrouter.v1.workspaces.create({
        friendlyName: 'twilio-agent-factory-workspace',
        eventCallbackUrl: this.callbackBaseUrl
          ? `${this.callbackBaseUrl}/callbacks/task-status`
          : undefined,
      });

      logSuccess(`Created TaskRouter workspace: ${workspace.sid}`);
      this.envUpdates.TWILIO_TASKROUTER_WORKSPACE_SID = workspace.sid;
      return workspace;
    } catch (error) {
      logError(`Failed to create TaskRouter workspace: ${error.message}`);
      throw error;
    }
  }

  async createTaskRouterWorkflow(workspaceSid) {
    logStep('TaskRouter', 'Creating default workflow...');

    try {
      // First, get the default task queue
      const queues = await this.client.taskrouter.v1.workspaces(workspaceSid).taskQueues.list({ limit: 1 });

      let queueSid;
      if (queues.length === 0) {
        // Create a default queue
        const queue = await this.client.taskrouter.v1.workspaces(workspaceSid).taskQueues.create({
          friendlyName: 'Default Queue',
          targetWorkers: '1==1', // Match all workers
        });
        queueSid = queue.sid;
        logSuccess(`Created default task queue: ${queueSid}`);
      } else {
        queueSid = queues[0].sid;
      }

      // Create workflow with default routing
      const workflow = await this.client.taskrouter.v1.workspaces(workspaceSid).workflows.create({
        friendlyName: 'Default Workflow',
        configuration: JSON.stringify({
          task_routing: {
            filters: [],
            default_filter: {
              queue: queueSid,
            },
          },
        }),
      });

      logSuccess(`Created TaskRouter workflow: ${workflow.sid}`);
      this.envUpdates.TWILIO_TASKROUTER_WORKFLOW_SID = workflow.sid;
      return workflow;
    } catch (error) {
      logError(`Failed to create TaskRouter workflow: ${error.message}`);
      throw error;
    }
  }

  async deployCallbackFunctions() {
    logStep('Deploy', 'Deploying callback Functions...');

    try {
      // Check if twilio CLI is installed
      try {
        execSync('twilio --version', { stdio: 'pipe' });
      } catch {
        throw new Error(
          'Twilio CLI is not installed. Please install it first: npm install -g twilio-cli'
        );
      }

      // Check if serverless plugin is installed
      try {
        execSync('twilio plugins', { stdio: 'pipe' });
      } catch {
        logWarning('Installing serverless plugin...');
        execSync('twilio plugins:install @twilio-labs/plugin-serverless', { stdio: 'inherit' });
      }

      // Deploy the serverless project
      const projectRoot = path.resolve(__dirname, '..');
      log('Deploying serverless project...', 'cyan');

      const result = execSync('twilio serverless:deploy --environment callbacks', {
        cwd: projectRoot,
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      // Parse the deployment URL from output
      const urlMatch = result.match(/https:\/\/[\w-]+\.twil\.io/);
      if (urlMatch) {
        this.callbackBaseUrl = urlMatch[0];
        this.envUpdates.TWILIO_CALLBACK_BASE_URL = this.callbackBaseUrl;
        logSuccess(`Deployed to: ${this.callbackBaseUrl}`);
      } else {
        // Try to extract from domain pattern
        const domainMatch = result.match(/Domain[:\s]+(https:\/\/[^\s]+)/);
        if (domainMatch) {
          this.callbackBaseUrl = domainMatch[1];
          this.envUpdates.TWILIO_CALLBACK_BASE_URL = this.callbackBaseUrl;
          logSuccess(`Deployed to: ${this.callbackBaseUrl}`);
        } else {
          logWarning('Could not parse deployment URL from output. Check twilio serverless:list');
          console.log(result);
        }
      }

      return this.callbackBaseUrl;
    } catch (error) {
      logError(`Failed to deploy callback Functions: ${error.message}`);
      throw error;
    }
  }

  async configurePhoneNumberWebhooks(phoneNumberSid) {
    if (!this.callbackBaseUrl) {
      logWarning('No callback URL available, skipping webhook configuration');
      return;
    }

    logStep('Configure', 'Configuring phone number webhooks...');

    try {
      await this.client.incomingPhoneNumbers(phoneNumberSid).update({
        smsStatusCallback: `${this.callbackBaseUrl}/callbacks/message-status`,
        smsFallbackUrl: `${this.callbackBaseUrl}/callbacks/fallback`,
        voiceStatusCallback: `${this.callbackBaseUrl}/callbacks/call-status`,
        voiceFallbackUrl: `${this.callbackBaseUrl}/callbacks/fallback`,
      });

      this.envUpdates.TWILIO_STATUS_CALLBACK_URL = `${this.callbackBaseUrl}/callbacks/message-status`;
      this.envUpdates.TWILIO_FALLBACK_URL = `${this.callbackBaseUrl}/callbacks/fallback`;

      logSuccess('Phone number webhooks configured');
    } catch (error) {
      logError(`Failed to configure webhooks: ${error.message}`);
      throw error;
    }
  }

  async configureVerifyServiceCallback(serviceSid) {
    if (!this.callbackBaseUrl) {
      logWarning('No callback URL available, skipping Verify callback configuration');
      return;
    }

    logStep('Configure', 'Configuring Verify service callback...');

    try {
      // Note: Verify service webhooks are configured differently
      // The statusCallback is set per-verification, not on the service
      // But we can configure the service's default webhook URL
      await this.client.verify.v2.services(serviceSid).update({
        // Verify v2 doesn't have a direct statusCallback on service
        // Callbacks are per-verification start request
      });

      logWarning(
        'Verify callbacks must be set per-verification. Use statusCallback param in start_verification.'
      );
    } catch (error) {
      logWarning(`Verify callback configuration skipped: ${error.message}`);
    }
  }

  updateEnvFile() {
    logStep('Env', 'Updating .env file...');

    const envPath = path.resolve(__dirname, '..', '.env');
    const envExamplePath = path.resolve(__dirname, '..', '.env.example');

    let envContent = '';

    // Read existing .env or use .env.example as template
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    } else if (fs.existsSync(envExamplePath)) {
      envContent = fs.readFileSync(envExamplePath, 'utf-8');
    }

    // Update each env variable
    for (const [key, value] of Object.entries(this.envUpdates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (envContent.match(regex)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    fs.writeFileSync(envPath, envContent);
    logSuccess(`.env file updated with ${Object.keys(this.envUpdates).length} variables`);

    // Show summary
    log('\nNew environment variables:', 'cyan');
    for (const [key, value] of Object.entries(this.envUpdates)) {
      console.log(`  ${key}=${value}`);
    }
  }
}

async function selectResources() {
  log('\nWhich resources would you like to provision?\n', 'bright');

  const selected = {};

  for (const [key, resource] of Object.entries(RESOURCES)) {
    if (resource.parent) continue; // Skip children, they're handled with parents

    const answer = await confirmChoice(`  ${resource.name}: ${resource.description}`, true);
    selected[key] = answer;

    // Auto-select children if parent is selected
    if (answer && resource.children) {
      for (const childKey of resource.children) {
        selected[childKey] = true;
      }
    }
  }

  return selected;
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║         Twilio Agent Factory - Auto Setup                  ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

  log('This script will help you provision Twilio resources and configure');
  log('your development environment for the Twilio Agent Factory.\n');

  // Check for existing .env
  const envPath = path.resolve(__dirname, '..', '.env');
  let accountSid = process.env.TWILIO_ACCOUNT_SID;
  let authToken = process.env.TWILIO_AUTH_TOKEN;

  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    accountSid = process.env.TWILIO_ACCOUNT_SID;
    authToken = process.env.TWILIO_AUTH_TOKEN;
  }

  // Prompt for credentials if not set
  if (!accountSid || accountSid.startsWith('ACxxxx')) {
    log('Enter your Twilio credentials (found at https://console.twilio.com/):\n', 'yellow');
    accountSid = await question('Account SID: ');
  } else {
    log(`Using existing Account SID: ${accountSid.substring(0, 10)}...`, 'green');
    const useExisting = await confirmChoice('Use this Account SID?', true);
    if (!useExisting) {
      accountSid = await question('Account SID: ');
    }
  }

  if (!authToken || authToken === 'your_auth_token_here') {
    authToken = await questionHidden('Auth Token: ');
  } else {
    log('Using existing Auth Token from .env', 'green');
    const useExisting = await confirmChoice('Use this Auth Token?', true);
    if (!useExisting) {
      authToken = await questionHidden('Auth Token: ');
    }
  }

  // Validate credentials
  log('\nValidating credentials...', 'cyan');
  let setup;
  try {
    setup = new TwilioSetup(accountSid, authToken);
    const account = await setup.client.api.accounts(accountSid).fetch();
    logSuccess(`Connected to: ${account.friendlyName}`);
  } catch (error) {
    logError(`Invalid credentials: ${error.message}`);
    rl.close();
    process.exit(1);
  }

  // Save credentials to env
  setup.envUpdates.TWILIO_ACCOUNT_SID = accountSid;
  setup.envUpdates.TWILIO_AUTH_TOKEN = authToken;

  // Select resources to provision
  const selectedResources = await selectResources();

  // Confirm selections
  log('\nResources to provision:', 'bright');
  let hasSelections = false;
  for (const [key, selected] of Object.entries(selectedResources)) {
    if (selected) {
      console.log(`  ✓ ${RESOURCES[key].name}`);
      hasSelections = true;
    }
  }

  if (!hasSelections) {
    log('\nNo resources selected. Exiting.', 'yellow');
    rl.close();
    process.exit(0);
  }

  const proceed = await confirmChoice('\nProceed with provisioning?', true);
  if (!proceed) {
    log('Setup cancelled.', 'yellow');
    rl.close();
    process.exit(0);
  }

  log('\n' + '═'.repeat(60) + '\n', 'cyan');

  // Deploy callback functions first if selected (needed for webhook URLs)
  if (selectedResources.callbackFunctions) {
    try {
      await setup.deployCallbackFunctions();
    } catch (error) {
      logWarning('Continuing without callback deployment...');
    }
  }

  // Provision Sync service (needed for callbacks)
  if (selectedResources.syncService) {
    try {
      await setup.createSyncService();
    } catch (error) {
      logWarning('Continuing without Sync service...');
    }
  }

  // Provision phone number
  let phoneNumber = null;
  if (selectedResources.phoneNumber) {
    try {
      phoneNumber = await setup.searchAndPurchasePhoneNumber();
      if (setup.callbackBaseUrl) {
        await setup.configurePhoneNumberWebhooks(phoneNumber.sid);
      }
    } catch (error) {
      logWarning('Continuing without phone number...');
    }
  }

  // Provision Verify service
  if (selectedResources.verifyService) {
    try {
      const verify = await setup.createVerifyService();
      await setup.configureVerifyServiceCallback(verify.sid);
    } catch (error) {
      logWarning('Continuing without Verify service...');
    }
  }

  // Provision Messaging service
  if (selectedResources.messagingService) {
    try {
      await setup.createMessagingService(phoneNumber?.sid);
    } catch (error) {
      logWarning('Continuing without Messaging service...');
    }
  }

  // Provision TaskRouter
  if (selectedResources.taskrouterWorkspace) {
    try {
      const workspace = await setup.createTaskRouterWorkspace();

      if (selectedResources.taskrouterWorkflow) {
        await setup.createTaskRouterWorkflow(workspace.sid);
      }
    } catch (error) {
      logWarning('Continuing without TaskRouter...');
    }
  }

  // Update .env file
  log('\n' + '═'.repeat(60) + '\n', 'cyan');
  setup.updateEnvFile();

  // Final summary
  log('\n╔════════════════════════════════════════════════════════════╗', 'green');
  log('║                    Setup Complete!                         ║', 'green');
  log('╚════════════════════════════════════════════════════════════╝\n', 'green');

  log('Next steps:', 'bright');
  console.log('  1. Review your .env file');
  console.log('  2. Run tests: npm test');
  console.log('  3. Start local server: npm run start:ngrok');
  console.log('  4. Deploy to production: npm run deploy:prod\n');

  if (setup.callbackBaseUrl) {
    log('Callback URLs configured:', 'cyan');
    console.log(`  Status: ${setup.callbackBaseUrl}/callbacks/message-status`);
    console.log(`  Fallback: ${setup.callbackBaseUrl}/callbacks/fallback\n`);
  }

  rl.close();
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    logError(`Setup failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { TwilioSetup };
