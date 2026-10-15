import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadLocalSigningConfig } = require('../local-mac-signing.cjs');

function fixture(t, value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-signing-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const configPath = path.join(dir, 'identity.json');
  if (value !== undefined) fs.writeFileSync(configPath, typeof value === 'string' ? value : JSON.stringify(value));
  return configPath;
}
const valid = { version: 1, certificateSha1: 'A'.repeat(40), keychain: '/Users/test/Library/Keychains/login.keychain-db' };

test('an unconfigured machine keeps the existing packaging path', t => {
  assert.equal(loadLocalSigningConfig({ configPath: fixture(t) }), null);
});
test('explicit local build fails if its identity config disappears', t => {
  assert.throws(() => loadLocalSigningConfig({ configPath: fixture(t), required: true }), /setup|配置/i);
});
test('invalid existing config cannot silently fall back to ad-hoc signing', t => {
  for (const value of ['{broken', {...valid, certificateSha1:'-'}, {...valid, keychain:'relative'}, {...valid, version:2}]) {
    assert.throws(() => loadLocalSigningConfig({ configPath:fixture(t,value) }));
  }
});
test('the exact certificate fingerprint is pinned, not a possibly ambiguous name', t => {
  const result=loadLocalSigningConfig({configPath:fixture(t,valid),required:true});
  assert.equal(result.certificateSha1,valid.certificateSha1);
  assert.equal(result.keychain,valid.keychain);
});
