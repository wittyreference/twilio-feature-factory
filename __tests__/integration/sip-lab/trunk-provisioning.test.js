// ABOUTME: Integration tests for SIP Lab Twilio resource provisioning lifecycle.
// ABOUTME: Tests create, verify, and teardown of SIP trunk resources using real Twilio APIs.

const hasRealCredentials =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_ACCOUNT_SID.startsWith('AC');

const describeWithCreds = hasRealCredentials ? describe : describe.skip;

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
      friendlyName: 'sip-lab-test-acl',
    });
    expect(acl.sid).toMatch(/^AL/);
    createdResources.aclSid = acl.sid;
  });

  test('adds IP address to ACL', async () => {
    const ip = await client.sip.ipAccessControlLists(createdResources.aclSid)
      .ipAddresses.create({
        friendlyName: 'test-ip',
        ipAddress: '203.0.113.1', // TEST-NET-3 (RFC 5737) — safe for testing
      });
    expect(ip.sid).toMatch(/^IP/);
    createdResources.ipSid = ip.sid;
  });

  test('creates credential list', async () => {
    const credList = await client.sip.credentialLists.create({
      friendlyName: 'sip-lab-test-creds',
    });
    expect(credList.sid).toMatch(/^CL/);
    createdResources.credListSid = credList.sid;
  });

  test('creates credential with compliant password', async () => {
    const cred = await client.sip.credentialLists(createdResources.credListSid)
      .credentials.create({
        username: 'testuser',
        password: 'TestPassword123!', // Meets: 12+ chars, mixed case, digit
      });
    expect(cred.sid).toMatch(/^CR/);
    createdResources.credSid = cred.sid;
  });

  test('creates SIP trunk', async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const trunk = await client.trunking.v1.trunks.create({
      friendlyName: 'sip-lab-test-trunk',
      domainName: `sip-lab-test-${randomSuffix}.pstn.twilio.com`,
    });
    expect(trunk.sid).toMatch(/^TK/);
    expect(trunk.domainName).toContain('.pstn.twilio.com');
    createdResources.trunkSid = trunk.sid;
  });

  test('associates IP ACL with trunk', async () => {
    const association = await client.trunking.v1.trunks(createdResources.trunkSid)
      .ipAccessControlLists.create({
        ipAccessControlListSid: createdResources.aclSid,
      });
    expect(association.sid).toBe(createdResources.aclSid);
  });

  test('associates credential list with trunk', async () => {
    const association = await client.trunking.v1.trunks(createdResources.trunkSid)
      .credentialsLists.create({
        credentialListSid: createdResources.credListSid,
      });
    expect(association.sid).toBe(createdResources.credListSid);
  });

  test('creates origination URL on trunk', async () => {
    const origUrl = await client.trunking.v1.trunks(createdResources.trunkSid)
      .originationUrls.create({
        friendlyName: 'test-pbx',
        sipUrl: 'sip:203.0.113.1:5060',
        priority: 10,
        weight: 10,
        enabled: true,
      });
    expect(origUrl.sid).toMatch(/^OU/);
    createdResources.origUrlSid = origUrl.sid;
  });

  test('verifies trunk has ACL associated', async () => {
    const acls = await client.trunking.v1.trunks(createdResources.trunkSid)
      .ipAccessControlLists.list();
    expect(acls.length).toBe(1);
    expect(acls[0].sid).toBe(createdResources.aclSid);
  });

  test('verifies trunk has credential list associated', async () => {
    const credLists = await client.trunking.v1.trunks(createdResources.trunkSid)
      .credentialsLists.list();
    expect(credLists.length).toBe(1);
    expect(credLists[0].sid).toBe(createdResources.credListSid);
  });

  test('verifies trunk has origination URL', async () => {
    const urls = await client.trunking.v1.trunks(createdResources.trunkSid)
      .originationUrls.list();
    expect(urls.length).toBe(1);
    expect(urls[0].sipUrl).toBe('sip:203.0.113.1:5060');
  });
}, 60000);
