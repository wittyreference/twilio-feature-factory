#!/usr/bin/env node
// ABOUTME: Tears down Twilio SIP resources created by setup-sip-lab.js.
// ABOUTME: Removes trunk, ACL, credentials, origination URL in reverse order.

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const ok = (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`);
const warn = (msg) => console.log(`${colors.yellow}!${colors.reset} ${msg}`);
const err = (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`);
const step = (phase, msg) => console.log(`${colors.cyan}[${phase}]${colors.reset} ${msg}`);

const SIP_LAB_DIR = path.resolve(__dirname, '..');
const PROJECT_DIR = path.resolve(SIP_LAB_DIR, '../..');
const ENV_FILE = path.join(SIP_LAB_DIR, '.env.sip-lab');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      env[trimmed.substring(0, eqIndex)] = trimmed.substring(eqIndex + 1).replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

function clearEnvVars(filePath, keys) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  for (const key of keys) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=`);
  }
  fs.writeFileSync(filePath, content);
}

async function safeDelete(label, deleteFn) {
  try {
    await deleteFn();
    ok(label);
  } catch (error) {
    if (error.status === 404) {
      warn(`${label} (already gone)`);
    } else {
      err(`${label}: ${error.message}`);
    }
  }
}

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log('  SIP Lab — Twilio Resource Teardown');
  console.log('══════════════════════════════════════════════════════════');
  console.log('');

  const projectEnv = readEnvFile(path.join(PROJECT_DIR, '.env'));
  const sipLabEnv = readEnvFile(ENV_FILE);

  const accountSid = projectEnv.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
  const authToken = projectEnv.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    err('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
    process.exit(1);
  }

  const client = require('twilio')(accountSid, authToken);

  const trunkSid = sipLabEnv.SIP_LAB_TRUNK_SID;
  const aclSid = sipLabEnv.SIP_LAB_IP_ACL_SID;
  const credListSid = sipLabEnv.SIP_LAB_CREDENTIAL_LIST_SID;
  const phoneNumberSid = sipLabEnv.SIP_LAB_PHONE_NUMBER_SID;

  if (!trunkSid && !aclSid && !credListSid) {
    warn('No SIP resources found in .env.sip-lab. Nothing to tear down.');
    process.exit(0);
  }

  // Reverse order: disassociate, then delete

  // 1. Remove phone number from trunk
  if (trunkSid && phoneNumberSid) {
    step('1', 'Removing phone number from trunk...');
    await safeDelete(`Phone number ${phoneNumberSid}`, () =>
      client.trunking.v1.trunks(trunkSid).phoneNumbers(phoneNumberSid).remove()
    );
  }

  // 2. Delete origination URL (auto-deleted with trunk, but explicit is safer)
  if (trunkSid && sipLabEnv.SIP_LAB_ORIGINATION_URL_SID) {
    step('2', 'Deleting origination URL...');
    await safeDelete('Origination URL', () =>
      client.trunking.v1.trunks(trunkSid)
        .originationUrls(sipLabEnv.SIP_LAB_ORIGINATION_URL_SID).remove()
    );
  }

  // 3. Disassociate credential list from trunk
  if (trunkSid && credListSid) {
    step('3', 'Disassociating credential list from trunk...');
    await safeDelete('Credential list disassociation', () =>
      client.trunking.v1.trunks(trunkSid).credentialsLists(credListSid).remove()
    );
  }

  // 4. Disassociate IP ACL from trunk
  if (trunkSid && aclSid) {
    step('4', 'Disassociating IP ACL from trunk...');
    await safeDelete('IP ACL disassociation', () =>
      client.trunking.v1.trunks(trunkSid).ipAccessControlLists(aclSid).remove()
    );
  }

  // 5. Delete trunk
  if (trunkSid) {
    step('5', 'Deleting SIP trunk...');
    await safeDelete(`Trunk ${trunkSid}`, () =>
      client.trunking.v1.trunks(trunkSid).remove()
    );
  }

  // 6. Delete credential (must delete before credential list)
  if (credListSid && sipLabEnv.SIP_LAB_CREDENTIAL_SID) {
    step('6', 'Deleting credential...');
    await safeDelete('Credential', () =>
      client.sip.credentialLists(credListSid)
        .credentials(sipLabEnv.SIP_LAB_CREDENTIAL_SID).remove()
    );
  }

  // 7. Delete credential list
  if (credListSid) {
    step('7', 'Deleting credential list...');
    await safeDelete(`Credential list ${credListSid}`, () =>
      client.sip.credentialLists(credListSid).remove()
    );
  }

  // 8. Delete IP address from ACL (must delete before ACL)
  if (aclSid && sipLabEnv.SIP_LAB_IP_ADDRESS_SID) {
    step('8', 'Deleting IP address from ACL...');
    await safeDelete('IP address', () =>
      client.sip.ipAccessControlLists(aclSid)
        .ipAddresses(sipLabEnv.SIP_LAB_IP_ADDRESS_SID).remove()
    );
  }

  // 9. Delete IP ACL
  if (aclSid) {
    step('9', 'Deleting IP ACL...');
    await safeDelete(`IP ACL ${aclSid}`, () =>
      client.sip.ipAccessControlLists(aclSid).remove()
    );
  }

  // Clear env file
  step('Clean', 'Clearing SIDs from .env.sip-lab...');
  clearEnvVars(ENV_FILE, [
    'SIP_LAB_TRUNK_SID', 'SIP_LAB_TRUNK_DOMAIN', 'TWILIO_TRUNK_DOMAIN',
    'SIP_LAB_IP_ACL_SID', 'SIP_LAB_IP_ADDRESS_SID',
    'SIP_LAB_CREDENTIAL_LIST_SID', 'SIP_LAB_CREDENTIAL_SID',
    'SIP_CREDENTIAL_USERNAME', 'SIP_CREDENTIAL_PASSWORD',
    'SIP_LAB_ORIGINATION_URL_SID', 'SIP_LAB_PHONE_NUMBER_SID',
  ]);
  ok('State cleared');

  console.log('');
  console.log('  All SIP Lab Twilio resources have been torn down.');
  console.log('');
}

main().catch((error) => {
  err(`Teardown failed: ${error.message}`);
  process.exit(1);
});
