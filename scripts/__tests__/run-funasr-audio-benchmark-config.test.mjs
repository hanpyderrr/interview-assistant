import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRunConfiguration, assertCompatibleExisting } from '../run-funasr-audio-benchmark.mjs';

test('builds a non-secret fingerprint that separates A and B conditions', () => {
  const base = {
    DASHSCOPE_API_KEY: 'secret-key', BENCH_WS_ID: 'ws-1', BENCH_REGION: 'cn-beijing',
    BENCH_MODEL: 'fun-asr-realtime', BENCH_ASR_ONLY: '1',
  };
  const a = buildRunConfiguration({ ...base, BENCH_CONDITION: 'A-no-vocabulary' });
  const b = buildRunConfiguration({ ...base, BENCH_CONDITION: 'B-vocabulary', BENCH_VOCABULARY_ID: 'vocab-1' });
  assert.notEqual(a.fingerprint, b.fingerprint);
  assert.equal(a.asrOnly, true);
  assert.equal(a.publicMetadata.vocabularyConfigured, false);
  assert.equal(b.publicMetadata.vocabularyConfigured, true);
  assert.equal(JSON.stringify(a).includes('secret-key'), true);
  assert.equal(JSON.stringify(a.publicMetadata).includes('secret-key'), false);
  assert.equal(JSON.stringify(b.publicMetadata).includes('vocab-1'), false);
});

test('refuses to resume results from another condition or configuration', () => {
  const run = buildRunConfiguration({
    DASHSCOPE_API_KEY: 'k', BENCH_WS_ID: 'ws', BENCH_REGION: 'cn-beijing', BENCH_MODEL: 'fun-asr-realtime',
    BENCH_ASR_ONLY: '1', BENCH_CONDITION: 'A-no-vocabulary',
  });
  assert.doesNotThrow(() => assertCompatibleExisting({ metadata: { configFingerprint: run.fingerprint } }, run));
  assert.throws(() => assertCompatibleExisting({ metadata: { configFingerprint: 'other' } }, run), /fingerprint/i);
});
