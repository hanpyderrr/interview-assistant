import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ipcSource = readFileSync(new URL('../../ipcHandlers.ts', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../../preload.ts', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../../../src/types/electron.d.ts', import.meta.url), 'utf8');

test('set-stt-provider accepts local-funasr across IPC boundaries', () => {
  assert.match(ipcSource, /allowedSttProviders[\s\S]*'local-funasr'/);
  assert.match(ipcSource, /typeof requestedProvider !== 'string'/);
  assert.match(ipcSource, /setSttProvider\(previousProvider\)/);
  assert.match(preloadSource, /\| 'local-funasr'/);
  assert.match(typesSource, /setSttProvider:[^\n]+local-funasr/);
});

test('renderer can test and start the fixed local service without secrets', () => {
  assert.match(ipcSource, /safeHandle\('test-local-funasr-connection'/);
  assert.match(ipcSource, /localFunAsrServiceManager\.ensureReady\(\)/);
  assert.match(preloadSource, /testLocalFunAsrConnection: \(\) => ipcRenderer\.invoke\('test-local-funasr-connection'\)/);
  assert.match(preloadSource, /testLocalFunAsrConnection: \(\) => Promise/);
  assert.match(typesSource, /testLocalFunAsrConnection: \(\) => Promise/);
});

test('local health response exposes only operational metadata', () => {
  assert.match(typesSource, /state: 'loading' \| 'ready' \| 'failed'/);
  assert.doesNotMatch(typesSource, /testLocalFunAsrConnection:[^\n]*(apiKey|token|secret)/i);
});
