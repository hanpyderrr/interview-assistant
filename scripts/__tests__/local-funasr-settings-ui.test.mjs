import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/components/SettingsOverlay.tsx', import.meta.url), 'utf8');

test('settings lists local FunASR as a selectable on-device provider', () => {
  assert.match(source, /id: 'local-funasr'/);
  assert.match(source, /label: 'Local FunASR Nano'/);
  assert.match(source, /runs on this PC/i);
});

test('local FunASR card renders health state and a start or test action', () => {
  assert.match(source, /sttProvider === 'local-funasr'/);
  assert.match(source, /localFunAsrHealth/);
  assert.match(source, /handleTestLocalFunAsrConnection/);
  assert.match(source, /testLocalFunAsrConnection/);
  assert.match(source, /Test \/ Start Local Service/);
  assert.match(source, /if \(!result\?\.success\)/);
  assert.match(source, /await handleTestLocalFunAsrConnection\(\)/);
  assert.match(source, /sttProvider !== 'local-funasr'/);
  assert.match(source, /Number\.isFinite\(localFunAsrHealth\.cuda_memory_current_mib\)/);
});
