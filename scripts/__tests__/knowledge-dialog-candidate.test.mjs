import test from 'node:test';
import assert from 'node:assert/strict';
import { createCandidateAdapter } from '../knowledge-dialog/candidate-adapter.mjs';

test('adapts injected preparation and answer generation without exposing credentials', async () => {
  const calls = [];
  const answerQuestion = createCandidateAdapter({
    prepareRequest: async (question, options) => {
      calls.push(['prepare', question, options.kbPath]);
      return {
        system: 'grounded system',
        user: question,
        matches: [{ entry: { id: 'fact.fictional' }, score: 3.25 }],
      };
    },
    generateAnswer: async (request, provider) => {
      calls.push(['generate', request.user, provider.model]);
      assert.equal(provider.apiKey, 'fixture-secret');
      return { answer: '基于虚构条目的回答。', endpoint: 'https://provider.invalid' };
    },
    now: (() => {
      const values = [100, 112];
      return () => values.shift();
    })(),
  });

  const result = await answerQuestion('请介绍虚构项目。', {
    kbPath: 'fictional.jsonl',
    provider: { apiKey: 'fixture-secret', model: 'fixture-model' },
  });

  assert.deepEqual(calls, [
    ['prepare', '请介绍虚构项目。', 'fictional.jsonl'],
    ['generate', '请介绍虚构项目。', 'fixture-model'],
  ]);
  assert.deepEqual(result, {
    question: '请介绍虚构项目。',
    answer: '基于虚构条目的回答。',
    evidenceIds: ['fact.fictional'],
    matches: [{ id: 'fact.fictional', score: 3.25 }],
    elapsedMs: 12,
  });
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false);
  assert.equal(JSON.stringify(result).includes('Authorization'), false);
});

test('requires injected functions', () => {
  assert.throws(() => createCandidateAdapter({}), /prepareRequest/);
});
