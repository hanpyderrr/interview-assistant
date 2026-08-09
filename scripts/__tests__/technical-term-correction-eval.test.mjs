import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { evaluateTechnicalTermFixtures } from '../evaluate-technical-term-corrections.mjs';
import { loadKnowledgeBase } from '../interview-retriever.mjs';

test('captures the five-row pre-correction SPI baseline deterministically', async () => {
  const fixtures = JSON.parse(await fs.readFile('scripts/__tests__/fixtures/spi-correction-fixtures.json', 'utf8'));
  const entries = await loadKnowledgeBase('knowledge_source/embedded_kb.jsonl');
  const result = evaluateTechnicalTermFixtures(fixtures, entries);

  assert.equal(result.fixtureCount, 5);
  assert.equal(result.summary.positiveCorrectedCount, 0);
  assert.equal(result.summary.remainingPositiveAliasCount, 4);
  assert.equal(result.summary.negativeAliasesPreserved, 1);
  assert.equal(result.summary.top1MatchesFixtureBaseline, 5);
  assert.deepEqual(result, evaluateTechnicalTermFixtures(fixtures, entries));
});
