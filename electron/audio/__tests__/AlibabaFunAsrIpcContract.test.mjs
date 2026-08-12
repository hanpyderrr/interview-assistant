import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('main registers secure Fun-ASR key/config handlers and resolves stored key only there', () => {
  const source = read('electron/ipcHandlers.ts');
  assert.match(source, /safeHandle\('set-alibaba-fun-asr-api-key'/);
  assert.match(source, /safeHandle\('get-alibaba-fun-asr-config'/);
  assert.match(source, /safeHandle\('set-alibaba-fun-asr-config'/);
  assert.match(source, /provider === 'alibaba-fun-asr'/);
  assert.match(source, /getAlibabaFunAsrApiKey\(\)/);
  assert.match(source, /testAlibabaFunAsrConnection/);
  assert.match(source, /hasAlibabaFunAsrKey:/);
  assert.match(source, /sttKeyPersistenceWarning\(apiKey, persisted\)/);
  assert.match(source, /No stored Alibaba Fun-ASR API key/);
  assert.match(source, /Could not save Alibaba Fun-ASR API key/);
});

test('preload and renderer types expose public config but no raw Fun-ASR credential', () => {
  const preload = read('electron/preload.ts');
  const types = read('src/types/electron.d.ts');
  for (const source of [preload, types]) {
    assert.match(source, /setAlibabaFunAsrApiKey/);
    assert.match(source, /getAlibabaFunAsrConfig/);
    assert.match(source, /setAlibabaFunAsrConfig/);
    assert.match(source, /'alibaba-fun-asr'/);
    assert.doesNotMatch(source, /sttAlibabaKey/);
  }
  assert.match(types, /hasAlibabaFunAsrKey\??: boolean/);
  assert.doesNotMatch(types, /alibabaFunAsrApiKey/);
});

test('connection helper never recognizes the renderer stored-key sentinel', () => {
  const helper = read('electron/audio/alibabaFunAsrConnectionTest.ts');
  assert.doesNotMatch(helper, /__USE_STORED__/);
  assert.doesNotMatch(helper, /resolveSttTestKey/);
});
