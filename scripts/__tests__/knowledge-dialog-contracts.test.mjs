import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROTOCOL_VERSION,
  MESSAGE_TYPES,
  ISSUE_TYPES,
  SUGGESTION_ACTIONS,
  MAX_FOLLOWUP_DEPTH,
  parseDialogMessage,
} from '../knowledge-dialog/contracts.mjs';

// The personal knowledge base (knowledge_source/interview_kb.jsonl) is
// user-local and out of scope: every assertion here uses the fictional
// fixtures under validation/knowledge-dialog/fixtures/ or inline messages.

const FIXTURE_CASES = new URL('../../validation/knowledge-dialog/fixtures/dialog-cases.jsonl', import.meta.url);
const PLAN_CATEGORIES = [
  'direct-hit',
  'no-hit',
  'missed-expected-id',
  'conflicting-facts',
  'generic-answer',
  'unsupported-metric',
  'missing-responsibility',
  'paraphrased-question',
  'follow-up-context',
  'multiple-candidates',
];

const baseQuestion = {
  protocolVersion: 1,
  sessionId: 'fixture-session',
  type: 'question',
  round: 1,
  questionId: 'q-1',
  question: '请说明SPI异常恢复设计。',
};

test('exposes the shared protocol constants', () => {
  assert.equal(PROTOCOL_VERSION, 1);
  assert.ok(MESSAGE_TYPES.includes('question'));
  assert.ok(MESSAGE_TYPES.includes('evaluation'));
  assert.ok(ISSUE_TYPES.includes('retrieval-miss'));
  assert.ok(ISSUE_TYPES.includes('unsupported-claim'));
  assert.ok(ISSUE_TYPES.includes('overlong-answer'));
  assert.ok(ISSUE_TYPES.includes('arithmetic-error'));
  assert.ok(ISSUE_TYPES.includes('evidence-boundary'));
  assert.ok(SUGGESTION_ACTIONS.includes('expand-prepared-answer'));
  assert.equal(MAX_FOLLOWUP_DEPTH, 2);
});

test('accepts a version-one question', () => {
  const message = parseDialogMessage(baseQuestion);
  assert.equal(message.questionId, 'q-1');
  assert.equal(message.question, '请说明SPI异常恢复设计。');
  assert.equal(message.sessionId, 'fixture-session');
  assert.ok(Object.isFrozen(message));
});

test('accepts an answer with empty evidence ids', () => {
  const message = parseDialogMessage({
    protocolVersion: 1,
    sessionId: 'fixture-session',
    type: 'answer',
    round: 1,
    questionId: 'q-1',
    answer: '这是通用原理，没有个人项目证据。',
    evidenceIds: [],
  });
  assert.deepEqual(message.evidenceIds, []);
});

test('accepts a valid evaluation and preserves optional fields', () => {
  const message = parseDialogMessage({
    protocolVersion: 1,
    sessionId: 'fixture-session',
    type: 'evaluation',
    round: 1,
    questionId: 'q-1',
    score: 72,
    supported: true,
    missingPoints: ['重试次数'],
    contradictions: [],
    needFollowup: true,
    followupQuestion: '如何避免重复处理？',
  });
  assert.equal(message.score, 72);
  assert.deepEqual(message.missingPoints, ['重试次数']);
  assert.equal(message.needFollowup, true);
});

test('accepts a followup at the two-round cap', () => {
  const message = parseDialogMessage({
    protocolVersion: 1,
    sessionId: 'fixture-session',
    type: 'followup',
    round: 2,
    questionId: 'q-1',
    question: '追问：重试时如何防止重复处理？',
    followupDepth: 2,
  });
  assert.equal(message.followupDepth, 2);
});

test('rejects invalid evaluation scores', () => {
  assert.throws(() => parseDialogMessage({
    protocolVersion: 1,
    sessionId: 'fixture-session',
    type: 'evaluation',
    round: 1,
    questionId: 'q-1',
    score: 101,
    needFollowup: false,
  }), /score/);
});

test('rejects a negative evaluation score', () => {
  assert.throws(() => parseDialogMessage({
    protocolVersion: 1,
    sessionId: 'fixture-session',
    type: 'evaluation',
    round: 1,
    questionId: 'q-1',
    score: -1,
    needFollowup: false,
  }), /score/);
});

test('rejects a missing sessionId', () => {
  assert.throws(() => parseDialogMessage({
    protocolVersion: 1,
    type: 'question',
    round: 1,
    questionId: 'q-1',
    question: '请说明SPI异常恢复设计。',
  }), /sessionId/);
});

test('rejects a missing protocolVersion', () => {
  assert.throws(() => parseDialogMessage({
    sessionId: 'fixture-session',
    type: 'question',
    round: 1,
    questionId: 'q-1',
    question: '请说明SPI异常恢复设计。',
  }), /protocolVersion/);
});

test('rejects an unknown message type', () => {
  assert.throws(() => parseDialogMessage({
    protocolVersion: 1,
    sessionId: 'fixture-session',
    type: 'nonsense',
  }), /type/);
});

test('rejects followup depth beyond the two-round cap', () => {
  assert.throws(() => parseDialogMessage({
    protocolVersion: 1,
    sessionId: 'fixture-session',
    type: 'followup',
    round: 3,
    questionId: 'q-1',
    question: '第三轮追问。',
    followupDepth: 3,
  }), /followupDepth/);
});

test('rejects messages that are not plain objects', () => {
  assert.throws(() => parseDialogMessage(null), /object/);
  assert.throws(() => parseDialogMessage('question'), /object/);
});

test('rejects credential-like keys at the top level', () => {
  assert.throws(() => parseDialogMessage({
    ...baseQuestion,
    OPENAI_API_KEY: 'sk-fixture-not-real',
  }), /API_KEY/);
});

test('rejects credential-like keys nested inside a message', () => {
  assert.throws(() => parseDialogMessage({
    ...baseQuestion,
    meta: { PASSWORD: 'hunter2' },
  }), /PASSWORD/);
});

test('rejects credential-like keys at arbitrary nesting depth', () => {
  let nested = { TOKEN: 'fixture-only' };
  for (let index = 0; index < 10; index += 1) nested = { child: nested };
  assert.throws(() => parseDialogMessage({ ...baseQuestion, meta: nested }), /TOKEN/);
});

test('rejects camelCase and HTTP credential field names', () => {
  assert.throws(() => parseDialogMessage({ ...baseQuestion, meta: { apiKey: 'fixture' } }), /apiKey/);
  assert.throws(() => parseDialogMessage({ ...baseQuestion, meta: { authorization: 'fixture' } }), /authorization/);
});

test('fixture file contains at least ten fictional cases covering the plan categories', async () => {
  const text = await readFile(FIXTURE_CASES, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  assert.ok(lines.length >= 10, `expected at least 10 fixture lines, got ${lines.length}`);
  const cases = lines.map((line, index) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`fixture line ${index + 1} is not valid JSON: ${error.message}`);
    }
    return parsed;
  });
  assert.ok(cases.every((entry) => typeof entry.caseId === 'string' && entry.caseId));
  assert.ok(cases.every((entry) => typeof entry.category === 'string' && entry.category));
  assert.ok(cases.every((entry) => typeof entry.question === 'string' && entry.question));
  const categories = new Set(cases.map((entry) => entry.category));
  for (const required of PLAN_CATEGORIES) {
    assert.ok(categories.has(required), `missing fixture category: ${required}`);
  }
  for (const entry of cases) {
    assert.ok(Array.isArray(entry.kb), `${entry.caseId} must declare a kb array`);
    for (const kbEntry of entry.kb) {
      assert.ok(kbEntry.id && kbEntry.title && kbEntry.content, `${entry.caseId} kb entry needs id/title/content`);
      assert.ok(Array.isArray(kbEntry.keywords), `${entry.caseId} kb entry needs keywords array`);
    }
    assert.ok(Array.isArray(entry.expectedEvidenceIds), `${entry.caseId} needs expectedEvidenceIds array`);
  }
});
