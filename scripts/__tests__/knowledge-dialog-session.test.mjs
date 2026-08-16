import test from 'node:test';
import assert from 'node:assert/strict';
import { runKnowledgeDialog } from '../knowledge-dialog/session-runner.mjs';

test('runs one primary question plus at most two ordered follow-ups', async () => {
  let evaluations = 0;
  const result = await runKnowledgeDialog({
    sessionId: 'session-fixed',
    seedQuestions: ['主问题'],
    answerQuestion: async (question) => ({ answer: `回答:${question}`, evidenceIds: ['fact.x'], matches: [] }),
    evaluateAnswer: async ({ questionId, followupDepth }) => {
      evaluations += 1;
      return {
        questionId,
        score: 70,
        needFollowup: true,
        followupQuestion: `追问${followupDepth + 1}`,
      };
    },
    maxFollowupsPerQuestion: 2,
  });

  assert.equal(evaluations, 3);
  assert.equal(result.rounds.length, 3);
  assert.deepEqual(result.rounds.map((round) => round.round), [1, 2, 3]);
  assert.ok(result.rounds.every((round) => round.sessionId === 'session-fixed'));
  assert.equal(new Set(result.rounds.map((round) => round.questionId)).size, 3);
  assert.deepEqual(result.rounds.map((round) => round.followupDepth), [0, 1, 2]);
});

test('continues to the next seed after evaluator timeout and ignores its late result', async () => {
  let resolveLate;
  const lateEvaluation = new Promise((resolve) => { resolveLate = resolve; });
  const resultPromise = runKnowledgeDialog({
    sessionId: 'session-timeout',
    seedQuestions: ['slow', 'fast'],
    answerQuestion: async (question) => ({ answer: question, evidenceIds: [], matches: [] }),
    evaluateAnswer: ({ questionId }) => questionId.includes('-q1')
      ? lateEvaluation
      : Promise.resolve({ questionId, score: 80, needFollowup: false }),
    timeoutMs: 10,
  });

  const result = await resultPromise;
  resolveLate({ questionId: 'session-timeout-q1', score: 100, needFollowup: false });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.rounds.length, 2);
  assert.equal(result.rounds[0].evaluation, undefined);
  assert.equal(result.rounds[1].evaluation.score, 80);
  assert.equal(result.events.filter((event) => event.type === 'error').length, 1);
  assert.equal(result.events.some((event) => event.score === 100), false);
});

test('rejects empty seeds and explicit bounds outside the contract', async () => {
  const base = { sessionId: 's', answerQuestion: async () => ({}), evaluateAnswer: async () => ({}) };
  await assert.rejects(() => runKnowledgeDialog({ ...base, seedQuestions: [] }), /seedQuestions/);
  await assert.rejects(() => runKnowledgeDialog({ ...base, seedQuestions: ['q'], maxQuestions: 0 }), /maxQuestions/);
  await assert.rejects(() => runKnowledgeDialog({ ...base, seedQuestions: ['q'], maxFollowupsPerQuestion: 3 }), /maxFollowupsPerQuestion/);
});

test('discards an evaluation whose question id does not match the current round', async () => {
  const result = await runKnowledgeDialog({
    sessionId: 'session-stale',
    seedQuestions: ['question'],
    answerQuestion: async () => ({ answer: 'answer', evidenceIds: [], matches: [] }),
    evaluateAnswer: async () => ({ questionId: 'old-question', score: 90, needFollowup: false }),
  });
  assert.equal(result.rounds[0].evaluation, undefined);
  assert.match(result.events.find((event) => event.type === 'error').message, /stale/);
});

test('does not let injected results override event identity or leak credential fields', async () => {
  const result = await runKnowledgeDialog({
    sessionId: 'session-safe',
    seedQuestions: ['question'],
    answerQuestion: async () => ({ answer: 'answer', evidenceIds: [], matches: [], type: 'evil', apiKey: 'fixture-secret' }),
    evaluateAnswer: async ({ questionId }) => ({ questionId, score: 90, needFollowup: false, type: 'evil', authorization: 'fixture-secret' }),
  });
  assert.equal(result.events[1].type, 'answer');
  assert.equal(result.events[2].type, 'evaluation');
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false);
  assert.equal('apiKey' in result.rounds[0].answer, false);
  assert.equal('authorization' in result.rounds[0].evaluation, false);
});
