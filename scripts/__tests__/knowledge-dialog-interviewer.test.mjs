import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterviewerAdapter } from '../knowledge-dialog/interviewer-adapter.mjs';

test('uses an injected model to evaluate and create a bounded follow-up', async () => {
  const calls = [];
  const evaluateAnswer = createInterviewerAdapter({
    generateEvaluation: async (request, provider) => {
      calls.push({ request, provider });
      return { answer: '```json\n{"score":68,"needFollowup":true,"followupQuestion":"请具体说明重试上限。"}\n```' };
    },
    provider: { model: 'fixture-interviewer', apiKey: 'fixture-secret' },
  });
  const signal = new AbortController().signal;
  const result = await evaluateAnswer({
    sessionId: 's', round: 1, questionId: 'q1', question: '如何恢复？',
    answer: '通过重试恢复。', evidenceIds: ['fact.retry'], followupDepth: 0,
  }, { signal });

  assert.deepEqual(result, {
    questionId: 'q1', score: 68, needFollowup: true, followupQuestion: '请具体说明重试上限。',
  });
  assert.equal(calls[0].provider.signal, signal);
  assert.match(calls[0].request.system, /JSON/);
  assert.equal(calls[0].request.user.includes('fixture-secret'), false);
});

test('rejects malformed or unbounded interviewer output', async () => {
  const invalidScore = createInterviewerAdapter({
    generateEvaluation: async () => ({ answer: '{"score":101,"needFollowup":false}' }),
    provider: {},
  });
  await assert.rejects(() => invalidScore({ questionId: 'q', question: 'q', answer: 'a', followupDepth: 0 }), /score/);

  const missingFollowup = createInterviewerAdapter({
    generateEvaluation: async () => ({ answer: '{"score":60,"needFollowup":true}' }),
    provider: {},
  });
  await assert.rejects(() => missingFollowup({ questionId: 'q', question: 'q', answer: 'a', followupDepth: 0 }), /followupQuestion/);
});
