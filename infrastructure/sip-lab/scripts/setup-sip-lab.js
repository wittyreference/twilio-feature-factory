#!/usr/bin/env node
// ABOUTME: Provisions Twilio SIP resources for the SIP Lab (trunk, ACL, credentials, origination URL).
// ABOUTME: Stores all SIDs in .env.sip-lab for use by Docker containers and test scripts.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = (msg, color = 'reset') => console.log(`${colors[color]}${msg}${colors.reset}`);
const ok = (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`);
const warn = (msg) => console.log(`${colors.yellow}!${colors.reset} ${msg}`);
const err = (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`);
const step = (phase, msg) => console.log(`${colors.cyan}[${phase}]${colors.reset} ${msg}`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

const SIP_LAB_DIR = path.resolve(__dirname, '..');
const PROJECT_DIR = path.resolve(SIP_LAB_DIR, '../..');
const ENV_FILE = path.join(SIP_LAB_DIR, '.env.sip-lab');

// ── Helpers ───────────────────────────────────────────────────────────────

function generatePassword() {
  // Twilio requires: 12+ chars, mixed case, at least one digit
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 20; i++) {
    password += chars[crypto.randomInt(chars.length)];
  }
  // Ensure requirements are met
  if (!/[a-z]/.test(password)) password = 'a' + password.slice(1);
  if (!/[A-Z]/.test(password)) password = password.slice(0, 1) + 'A' + password.slice(2);
  if (!/[0-9]/.test(password)) password = password.slice(0, 2) + '3' + password.slice(3);
  return password;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex);
      const value = trimmed.substring(eqIndex + 1).replace(/^["']|["']$/g, '');
      env[key] = value;
    }
  }
  return env;
}

function updateEnvFile(filePath, updates) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(filePath, content.trimEnd() + '\n');
}

// ── Main Setup ────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log('  SIP Lab — Twilio Resource Provisioning');
  console.log('══════════════════════════════════════════════════════════');
  console.log('');

  // Load credentials
  const projectEnv = readEnvFile(path.join(PROJECT_DIR, '.env'));
  const sipLabEnv = readEnvFile(ENV_FILE);

  const accountSid = projectEnv.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
  const authToken = projectEnv.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    err('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env');
    process.exit(1);
  }

  log(`  Account: ${accountSid}`, 'cyan');

  // Get droplet IP
  let pbxIp = sipLabEnv.SIP_LAB_DROPLET_IP || sipLabEnv.EXTERNAL_IP || '';
  if (!pbxIp) {
    pbxIp = await question('  PBX public IP (droplet IP): ');
  }
  if (!pbxIp) {
    err('PBX IP is required. Run droplet-setup.sh first.');
    process.exit(1);
  }
  log(`  PBX IP:  ${pbxIp}`, 'cyan');
  console.log('');

  const client = require('twilio')(accountSid, authToken);
  const updates = {};
  const username = `siplab-${crypto.randomBytes(4).toString('hex')}`;
  const password = generatePassword();

  try {
    // Step 1: Create IP ACL
    step('1/9', 'Creating IP Access Control List...');
    const acl = await client.sip.ipAccessControlLists.create({
      friendlyName: 'sip-lab-acl',
    });
    updates.SIP_LAB_IP_ACL_SID = acl.sid;
    ok(`IP ACL: ${acl.sid}`);

    // Step 2: Add PBX IP to ACL
    step('2/9', `Adding PBX IP ${pbxIp} to ACL...`);
    const ipEntry = await client.sip.ipAccessControlLists(acl.sid)
      .ipAddresses.create({
        friendlyName: 'sip-lab-pbx',
        ipAddress: pbxIp,
      });
    updates.SIP_LAB_IP_ADDRESS_SID = ipEntry.sid;
    ok(`IP entry: ${ipEntry.sid}`);

    // Step 3: Create Credential List
    step('3/9', 'Creating Credential List...');
    const credList = await client.sip.credentialLists.create({
      friendlyName: 'sip-lab-credentials',
    });
    updates.SIP_LAB_CREDENTIAL_LIST_SID = credList.sid;
    ok(`Credential List: ${credList.sid}`);

    // Step 4: Create Credential
    step('4/9', `Creating credential (user: ${username})...`);
    const cred = await client.sip.credentialLists(credList.sid)
      .credentials.create({
        username: username,
        password: password,
      });
    updates.SIP_LAB_CREDENTIAL_SID = cred.sid;
    updates.SIP_CREDENTIAL_USERNAME = username;
    updates.SIP_CREDENTIAL_PASSWORD = password;
    ok(`Credential: ${cred.sid}`);

    // Step 5: Create SIP Trunk
    const trunkName = `sip-lab-${crypto.randomBytes(3).toString('hex')}`;
    step('5/9', `Creating SIP Trunk (${trunkName})...`);
    const trunk = await client.trunking.v1.trunks.create({
      friendlyName: 'sip-lab-trunk',
      domainName: `${trunkName}.pstn.twilio.com`,
    });
    updates.SIP_LAB_TRUNK_SID = trunk.sid;
    updates.SIP_LAB_TRUNK_DOMAIN = trunk.domainName;
    updates.TWILIO_TRUNK_DOMAIN = trunk.domainName;
    ok(`Trunk: ${trunk.sid} (${trunk.domainName})`);

    // Step 6: Associate IP ACL with Trunk
    step('6/9', 'Associating IP ACL with trunk...');
    await client.trunking.v1.trunks(trunk.sid)
      .ipAccessControlLists.create({
        ipAccessControlListSid: acl.sid,
      });
    ok('IP ACL associated');

    // Step 7: Associate Credential List with Trunk
    step('7/9', 'Associating Credential List with trunk...');
    await client.trunking.v1.trunks(trunk.sid)
      .credentialsLists.create({
        credentialListSid: credList.sid,
      });
    ok('Credential List associated');

    // Step 8: Create Origination URL
    step('8/9', `Creating Origination URL (sip:${pbxIp}:5060)...`);
    const origUrl = await client.trunking.v1.trunks(trunk.sid)
      .originationUrls.create({
        friendlyName: 'sip-lab-pbx',
        sipUrl: `sip:${pbxIp}:5060`,
        priority: 10,
        weight: 10,
        enabled: true,
      });
    updates.SIP_LAB_ORIGINATION_URL_SID = origUrl.sid;
    ok(`Origination URL: ${origUrl.sid}`);

    // Step 9: Optionally associate phone number
    step('9/9', 'Phone number association...');
    const phoneNumber = projectEnv.TWILIO_PHONE_NUMBER || '';
    if (phoneNumber) {
      warn(`Your main number is ${phoneNumber}`);
      warn('Associating it with the trunk will REMOVE its current voice webhook.');
      const answer = await question('  Associate this number with the SIP trunk? [y/N] ');
      if (answer.toLowerCase().startsWith('y')) {
        // Find phone number SID
        const numbers = await client.incomingPhoneNumbers.list({
          phoneNumber: phoneNumber,
          limit: 1,
        });
        if (numbers.length > 0) {
          await client.trunking.v1.trunks(trunk.sid)
            .phoneNumbers.create({
              phoneNumberSid: numbers[0].sid,
            });
          updates.SIP_LAB_PHONE_NUMBER_SID = numbers[0].sid;
          ok(`Phone number ${phoneNumber} associated with trunk`);
        } else {
          warn('Phone number not found on this account');
        }
      } else {
        log('  Skipped. You can associate a number later via MCP tools.');
      }
    } else {
      log('  No TWILIO_PHONE_NUMBER in .env — skipping.');
      log('  Associate a number later via MCP: associate_phone_number_to_trunk');
    }

    // Save state
    console.log('');
    step('Save', 'Writing SIDs to .env.sip-lab...');
    updateEnvFile(ENV_FILE, updates);
    ok(`State saved to ${ENV_FILE}`);

    // Summary
    console.log('');
    console.log('══════════════════════════════════════════════════════════');
    console.log('  SIP Lab — Provisioning Complete');
    console.log('══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Trunk:         ${updates.SIP_LAB_TRUNK_SID}`);
    console.log(`  Domain:        ${updates.TWILIO_TRUNK_DOMAIN}`);
    console.log(`  IP ACL:        ${updates.SIP_LAB_IP_ACL_SID}`);
    console.log(`  Credential:    ${updates.SIP_CREDENTIAL_USERNAME}`);
    console.log(`  Origination:   sip:${pbxIp}:5060`);
    console.log('');
    console.log('  Next steps:');
    console.log('    1. Update droplet .env.sip-lab with trunk domain + credentials:');
    console.log(`       SIP_LAB_SSH_CMD from .env.sip-lab, then edit ~/sip-lab/.env.sip-lab`);
    console.log('    2. Restart Asterisk: docker compose restart asterisk');
    console.log('    3. Test termination: ./scripts/test-termination.sh');
    console.log('');

  } catch (error) {
    err(`Provisioning failed: ${error.message}`);
    if (error.code) err(`  Twilio error code: ${error.code}`);
    console.log('');
    warn('Partial resources may have been created. Run teardown to clean up:');
    console.log('  node infrastructure/sip-lab/scripts/teardown-sip-lab.js');
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
