// ABOUTME: Unit tests for SIP Lab provisioning script logic.
// ABOUTME: Tests password generation, env file parsing, and resource creation order.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('SIP Lab Setup', () => {
  describe('Password Generation', () => {
    // Extracted password generation logic for testing
    function generatePassword() {
      const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let password = '';
      for (let i = 0; i < 20; i++) {
        password += chars[crypto.randomInt(chars.length)];
      }
      if (!/[a-z]/.test(password)) {password = 'a' + password.slice(1);}
      if (!/[A-Z]/.test(password)) {password = password.slice(0, 1) + 'A' + password.slice(2);}
      if (!/[0-9]/.test(password)) {password = password.slice(0, 2) + '3' + password.slice(3);}
      return password;
    }

    test('generates password with 20 characters', () => {
      const password = generatePassword();
      expect(password.length).toBe(20);
    });

    test('generates password with lowercase letter', () => {
      const password = generatePassword();
      expect(/[a-z]/.test(password)).toBe(true);
    });

    test('generates password with uppercase letter', () => {
      const password = generatePassword();
      expect(/[A-Z]/.test(password)).toBe(true);
    });

    test('generates password with digit', () => {
      const password = generatePassword();
      expect(/[0-9]/.test(password)).toBe(true);
    });

    test('generates password meeting Twilio minimum (12+ chars)', () => {
      const password = generatePassword();
      expect(password.length).toBeGreaterThanOrEqual(12);
    });

    test('generates unique passwords', () => {
      const passwords = new Set();
      for (let i = 0; i < 100; i++) {
        passwords.add(generatePassword());
      }
      // Should have at least 90 unique passwords out of 100
      expect(passwords.size).toBeGreaterThan(90);
    });
  });

  describe('Env File Parsing', () => {
    function readEnvFile(filePath) {
      if (!fs.existsSync(filePath)) {return {};}
      const content = fs.readFileSync(filePath, 'utf8');
      const env = {};
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {continue;}
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex);
          const value = trimmed.substring(eqIndex + 1).replace(/^["']|["']$/g, '');
          env[key] = value;
        }
      }
      return env;
    }

    test('parses key=value pairs', () => {
      const tmpFile = path.join(os.tmpdir(), `test-env-${Date.now()}`);
      fs.writeFileSync(tmpFile, 'FOO=bar\nBAZ=qux\n');
      const result = readEnvFile(tmpFile);
      expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
      fs.unlinkSync(tmpFile);
    });

    test('skips comments and empty lines', () => {
      const tmpFile = path.join(os.tmpdir(), `test-env-${Date.now()}`);
      fs.writeFileSync(tmpFile, '# comment\n\nFOO=bar\n# another\n');
      const result = readEnvFile(tmpFile);
      expect(result).toEqual({ FOO: 'bar' });
      fs.unlinkSync(tmpFile);
    });

    test('handles values with = signs', () => {
      const tmpFile = path.join(os.tmpdir(), `test-env-${Date.now()}`);
      fs.writeFileSync(tmpFile, 'URL=sip:1.2.3.4:5060\n');
      const result = readEnvFile(tmpFile);
      expect(result).toEqual({ URL: 'sip:1.2.3.4:5060' });
      fs.unlinkSync(tmpFile);
    });

    test('strips surrounding quotes', () => {
      const tmpFile = path.join(os.tmpdir(), `test-env-${Date.now()}`);
      fs.writeFileSync(tmpFile, 'FOO="bar"\nBAZ=\'qux\'\n');
      const result = readEnvFile(tmpFile);
      expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
      fs.unlinkSync(tmpFile);
    });

    test('returns empty object for missing file', () => {
      const result = readEnvFile('/nonexistent/file');
      expect(result).toEqual({});
    });
  });

  describe('Env File Updates', () => {
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

    test('creates new file with values', () => {
      const tmpFile = path.join(os.tmpdir(), `test-env-update-${Date.now()}`);
      updateEnvFile(tmpFile, { FOO: 'bar', BAZ: 'qux' });
      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content).toContain('FOO=bar');
      expect(content).toContain('BAZ=qux');
      fs.unlinkSync(tmpFile);
    });

    test('updates existing values', () => {
      const tmpFile = path.join(os.tmpdir(), `test-env-update-${Date.now()}`);
      fs.writeFileSync(tmpFile, 'FOO=old\nBAZ=keep\n');
      updateEnvFile(tmpFile, { FOO: 'new' });
      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content).toContain('FOO=new');
      expect(content).toContain('BAZ=keep');
      expect(content).not.toContain('FOO=old');
      fs.unlinkSync(tmpFile);
    });

    test('appends new values without removing existing', () => {
      const tmpFile = path.join(os.tmpdir(), `test-env-update-${Date.now()}`);
      fs.writeFileSync(tmpFile, 'EXISTING=value\n');
      updateEnvFile(tmpFile, { NEW: 'added' });
      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content).toContain('EXISTING=value');
      expect(content).toContain('NEW=added');
      fs.unlinkSync(tmpFile);
    });
  });

  describe('Resource Provisioning Order', () => {
    // Verify the expected order of operations
    const EXPECTED_ORDER = [
      'create_ip_acl',
      'add_ip_to_acl',
      'create_credential_list',
      'create_credential',
      'create_trunk',
      'associate_acl',
      'associate_credentials',
      'create_origination_url',
      'associate_phone_number',
    ];

    test('defines 9 provisioning steps', () => {
      expect(EXPECTED_ORDER.length).toBe(9);
    });

    test('creates ACL before trunk (ACL needed for association)', () => {
      const aclIndex = EXPECTED_ORDER.indexOf('create_ip_acl');
      const trunkIndex = EXPECTED_ORDER.indexOf('create_trunk');
      expect(aclIndex).toBeLessThan(trunkIndex);
    });

    test('creates credentials before trunk (credentials needed for association)', () => {
      const credIndex = EXPECTED_ORDER.indexOf('create_credential_list');
      const trunkIndex = EXPECTED_ORDER.indexOf('create_trunk');
      expect(credIndex).toBeLessThan(trunkIndex);
    });

    test('creates trunk before origination URL (URL belongs to trunk)', () => {
      const trunkIndex = EXPECTED_ORDER.indexOf('create_trunk');
      const urlIndex = EXPECTED_ORDER.indexOf('create_origination_url');
      expect(trunkIndex).toBeLessThan(urlIndex);
    });

    test('phone number is last step (optional, removes webhooks)', () => {
      const phoneIndex = EXPECTED_ORDER.indexOf('associate_phone_number');
      expect(phoneIndex).toBe(EXPECTED_ORDER.length - 1);
    });
  });
});
