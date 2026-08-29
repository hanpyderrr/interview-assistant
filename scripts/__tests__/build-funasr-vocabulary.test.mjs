import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVocabularyEntries, extractHistoricalTranscriptText } from '../build-funasr-vocabulary.mjs';

test('keeps only curated terms present in source material and applies priority weights', () => {
  const entries = buildVocabularyEntries({
    sourceText: '项目使用 SPI、CPOL、Agent Loop、PlanKiller 和 TofFrame。',
    historicalText: '识别曾把 CPOL 写错，PlanKiller 也容易错。',
    projectTerms: ['PlanKiller', 'TofFrame'],
    curatedTerms: ['SPI', 'CPOL', 'Agent Loop', '普通词'],
  });
  assert.deepEqual(entries, [
    { text: 'PlanKiller', lang: 'en', weight: 4 },
    { text: 'TofFrame', lang: 'en', weight: 4 },
    { text: 'CPOL', lang: 'en', weight: 4 },
    { text: 'Agent Loop', lang: 'en', weight: 3 },
    { text: 'SPI', lang: 'en', weight: 3 },
  ]);
});

test('deduplicates case-insensitively and rejects unsupported entries', () => {
  const entries = buildVocabularyEntries({
    sourceText: 'RAG rag 超长词',
    historicalText: '',
    projectTerms: [],
    curatedTerms: ['RAG', 'rag', '', 'x'.repeat(65)],
  });
  assert.deepEqual(entries, [{ text: 'RAG', lang: 'en', weight: 3 }]);
});

test('historical weighting reads transcripts but never generated answers', () => {
  const text = extractHistoricalTranscriptText(JSON.stringify({ rows: [{
    transcribedText: '这里说了 CPOL',
    answer: '回答里提到 HNSW，但它不是历史识别目标',
  }] }));
  assert.match(text, /CPOL/);
  assert.doesNotMatch(text, /HNSW/);
});
