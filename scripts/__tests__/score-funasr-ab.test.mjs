import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReferenceDocument, compareConditions } from '../score-funasr-ab.mjs';

test('builds an honest model-normalized reference with target terms only', () => {
  const reference = buildReferenceDocument({
    rows: [{ file: '004.wav', group: 'split', asrStatus: 'ok', transcribedText: 'SPI 的 CPOL 是什么？' }],
  }, [{ text: 'SPI' }, { text: 'CPOL' }, { text: 'RAG' }]);
  assert.equal(reference.items[0].referenceType, 'model_normalized_reference');
  assert.deepEqual(reference.items[0].targetTerms, ['SPI', 'CPOL']);
});

test('reports paired similarity, target recall and latency without calling it CER', () => {
  const reference = { items: [{ file: '004.wav', group: 'split', referenceText: 'SPI 的 CPOL 是什么', targetTerms: ['SPI', 'CPOL'] }] };
  const a = { metadata: { configFingerprint: 'a' }, rows: [{ file: '004.wav', group: 'split', asrStatus: 'ok', transcribedText: 'S P I 的口令是什么', firstResultMs: 400, postAudioFinalizeMs: 220 }] };
  const b = { metadata: { configFingerprint: 'b' }, rows: [{ file: '004.wav', group: 'split', asrStatus: 'ok', transcribedText: 'SPI 的 CPOL 是什么', firstResultMs: 410, postAudioFinalizeMs: 230 }] };
  const result = compareConditions(reference, a, b);
  assert.equal(result.summary.pairedCount, 1);
  assert.equal(result.summary.aTargetRecall, 0);
  assert.equal(result.summary.bTargetRecall, 1);
  assert.equal(result.summary.improved, 1);
  assert.equal(JSON.stringify(result).includes('CER'), false);
});

test('rejects an A/B comparison that accidentally reuses one fingerprint', () => {
  const reference = { items: [] };
  const doc = { metadata: { configFingerprint: 'same' }, rows: [] };
  assert.throws(() => compareConditions(reference, doc, doc), /fingerprint/i);
});
