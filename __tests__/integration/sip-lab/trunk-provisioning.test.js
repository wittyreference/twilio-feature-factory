// ABOUTME: Integration tests for SIP Lab Twilio resource provisioning lifecycle.
// ABOUTME: Tests create, verify, and teardown of SIP trunk resources using real Twilio APIs.

const hasRealCredentials =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_ACCOUNT_SID.startsWith('AC');

const describeWithCreds = hasRealCredentials ? describe : describe.skip;

// Unique suffix per test run to avoid cross-run collisions
const runId = Math.random().toString(36).substring(2, 8);

// Retry helper for eventually-consistent Trunking API reads
async function waitForCondition(fn, { retries = 5, delayMs = 1000 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (i === retries - 1) {throw err;}
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

describeWithCreds('SIP Lab Trunk Provisioning (live API)', () => {
  let client;
  const createdResources = {};

  beforeAll(() => {
    client = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  });

  afterAll(async () => {
    // Teardown in reverse order
    const { trunkSid, aclSid, credListSid, credSid, ipSid, origUrlSid } = createdResources;

    if (trunkSid && origUrlSid) {
      await client.trunking.v1.trunks(trunkSid).originationUrls(origUrlSid).remove().catch(() => {});
    }
    if (trunkSid && credListSid) {
      await client.trunking.v1.trunks(trunkSid).credentialsLists(credListSid).remove().catch(() => {});
    }
    if (trunkSid && aclSid) {
      await client.trunking.v1.trunks(trunkSid).ipAccessControlLists(aclSid).remove().catch(() => {});
    }
    if (trunkSid) {
      await client.trunking.v1.trunks(trunkSid).remove().catch(() => {});
    }
    if (credListSid && credSid) {
      await client.sip.credentialLists(credListSid).credentials(credSid).remove().catch(() => {});
    }
    if (credListSid) {
      await client.sip.credentialLists(credListSid).remove().catch(() => {});
    }
    if (aclSid && ipSid) {
      await client.sip.ipAccessControlLists(aclSid).ipAddresses(ipSid).remove().catch(() => {});
    }
    if (aclSid) {
      await client.sip.ipAccessControlLists(aclSid).remove().catch(() => {});
    }
  }, 30000);

  test('creates IP ACL', async () => {
    const acl = await client.sip.ipAccessControlLists.create({
      friendlyName: `sip-lab-test-acl-${runId}`,
    });
    expect(acl.sid).toMatch(/^AL/);
    createdResources.aclSid = acl.sid;
  });

  test('adds IP address to ACL', async () => {
    expect(createdResources.aclSid).toBeDefined();
    const ip = await client.sip.ipAccessControlLists(createdResources.aclSid)
      .ipAddresses.create({
        friendlyName: `test-ip-${runId}`,
        ipAddress: '203.0.113.1', // TEST-NET-3 (RFC 5737) — safe for testing
      });
    expect(ip.sid).toMatch(/^IP/);
    createdResources.ipSid = ip.sid;
  });

  test('creates credential list', async () => {
    const credList = await client.sip.credentialLists.create({
      friendlyName: `sip-lab-test-creds-${runId}`,
    });
    expect(credList.sid).toMatch(/^CL/);
    createdResources.credListSid = credList.sid;
  });

  test('creates credential with compliant password', async () => {
    expect(createdResources.credListSid).toBeDefined();
    const cred = await client.sip.credentialLists(createdResources.credListSid)
      .credentials.create({
        username: `testuser-${runId}`,
        password: 'TestPassword123!', // Meets: 12+ chars, mixed case, digit
      });
    expect(cred.sid).toMatch(/^CR/);
    createdResources.credSid = cred.sid;
  });

  test('creates SIP trunk', async () => {
    const trunk = await client.trunking.v1.trunks.create({
      friendlyName: `sip-lab-test-trunk-${runId}`,
      domainName: `sip-lab-test-${runId}.pstn.twilio.com`,
    });
    expect(trunk.sid).toMatch(/^TK/);
    expect(trunk.domainName).toContain('.pstn.twilio.com');
    createdResources.trunkSid = trunk.sid;
  });

  test('associates IP ACL with trunk', async () => {
    expect(createdResources.trunkSid).toBeDefined();
    expect(createdResources.aclSid).toBeDefined();
    const association = await client.trunking.v1.trunks(createdResources.trunkSid)
      .ipAccessControlLists.create({
        ipAccessControlListSid: createdResources.aclSid,
      });
    expect(association.sid).toBe(createdResources.aclSid);
  });

  test('associates credential list with trunk', async () => {
    expect(createdResources.trunkSid).toBeDefined();
    expect(createdResources.credListSid).toBeDefined();
    const association = await client.trunking.v1.trunks(createdResources.trunkSid)
      .credentialsLists.create({
        credentialListSid: createdResources.credListSid,
      });
    expect(association.sid).toBe(createdResources.credListSid);
  });

  test('creates origination URL on trunk', async () => {
    expect(createdResources.trunkSid).toBeDefined();
    const origUrl = await client.trunking.v1.trunks(createdResources.trunkSid)
      .originationUrls.create({
        friendlyName: `test-pbx-${runId}`,
        sipUrl: 'sip:203.0.113.1:5060',
        priority: 10,
        weight: 10,
        enabled: true,
      });
    expect(origUrl.sid).toMatch(/^OU/);
    createdResources.origUrlSid = origUrl.sid;
  });

  // Verification tests use retry polling for Trunking API eventual consistency
  test('verifies trunk has ACL associated', async () => {
    expect(createdResources.trunkSid).toBeDefined();
    await waitForCondition(async () => {
      const acls = await client.trunking.v1.trunks(createdResources.trunkSid)
        .ipAccessControlLists.list();
      expect(acls.length).toBe(1);
      expect(acls[0].sid).toBe(createdResources.aclSid);
    });
  }, 15000);

  test('verifies trunk has credential list associated', async () => {
    expect(createdResources.trunkSid).toBeDefined();
    expect(createdResources.credListSid).toBeDefined();
    await waitForCondition(async () => {
      const credLists = await client.trunking.v1.trunks(createdResources.trunkSid)
        .credentialsLists.list();
      expect(credLists.length).toBe(1);
      expect(credLists[0].sid).toBe(createdResources.credListSid);
    });
  }, 15000);

  test('verifies trunk has origination URL', async () => {
    expect(createdResources.trunkSid).toBeDefined();
    await waitForCondition(async () => {
      const urls = await client.trunking.v1.trunks(createdResources.trunkSid)
        .originationUrls.list();
      expect(urls.length).toBe(1);
      expect(urls[0].sipUrl).toBe('sip:203.0.113.1:5060');
    });
  }, 15000);
}, 60000);
