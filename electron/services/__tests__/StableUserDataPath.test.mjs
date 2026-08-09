import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('stable Electron userData identity', () => {
  test('main process pins raw Electron development userData before app initialization', () => {
    const source = read('electron/main.ts');
    const setupAt = source.indexOf('configureStableUserDataPath();');
    const initializeAt = source.indexOf('async function initializeApp()');
    const lockAt = source.indexOf('app.requestSingleInstanceLock()');

    assert.ok(setupAt >= 0, 'main.ts must call configureStableUserDataPath() at module startup');
    assert.ok(initializeAt > setupAt, 'stable userData setup must run before initializeApp()');
    assert.ok(lockAt > setupAt, 'stable userData setup must run before the single-instance lock');
    assert.match(source, /process\.env\.NATIVELY_TEST_USERDATA/, 'test userData override must remain first-class');
    assert.match(source, /const\s+testUserDataPath\s*=\s*path\.resolve\(process\.env\.NATIVELY_TEST_USERDATA\)/, 'test override should be resolved before app.setPath');
    assert.match(source, /fs\.mkdirSync\(testUserDataPath,\s*\{\s*recursive:\s*true\s*\}\)/, 'test override directory should exist before app.setPath');
    assert.match(source, /app\.setPath\(\s*['"]userData['"]\s*,\s*testUserDataPath\s*\)/, 'test override should be passed directly to app.setPath');
    assert.match(source, /if\s*\(!app\.isPackaged\)\s*\{[\s\S]*?path\.join\(app\.getPath\(['"]appData['"]\),\s*['"]natively['"]\)[\s\S]*?app\.setPath\(\s*['"]userData['"]/, 'raw Electron development should use appData/natively instead of appData/Electron');
  });

  test('CredentialsManager resolves credential files lazily from the current userData path', () => {
    const source = read('electron/services/CredentialsManager.ts');

    assert.doesNotMatch(
      source,
      /const\s+(CREDENTIALS_PATH|FALLBACK_PATH|SALT_PATH)\s*=\s*path\.join\(app\.getPath\(['"]userData['"]\)/,
      'credential paths must not be frozen while the module is imported',
    );
    assert.match(source, /function\s+getCredentialPaths\(\)/, 'CredentialsManager should expose one lazy path resolver');
    assert.match(source, /const\s+userDataPath\s*=\s*app\.getPath\(['"]userData['"]\)/, 'lazy resolver should read the current Electron userData path');
  });
});
