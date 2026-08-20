import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFinalTurn,
  buildRecentInterviewContext,
  shouldTriggerInterviewAnswer,
} from '../interviewContext.ts';

test('only final interviewer or user segments enter the turn list', () => {
  const partial = appendFinalTurn([], {
    speaker: 'user',
    text: 'partial answer',
    final: false,
  });
  assert.deepEqual(partial, []);

  const turns = appendFinalTurn(partial, {
    speaker: 'interviewer',
    text: '  Tell me about your project.  ',
    final: true,
  });
  assert.deepEqual(turns, [{ speaker: 'interviewer', text: 'Tell me about your project.', final: true }]);
});

test('duplicate or overlapping final segments do not grow the context', () => {
  const first = appendFinalTurn([], { speaker: 'user', text: 'I built the API', final: true });
  const duplicate = appendFinalTurn(first, { speaker: 'user', text: 'I built the API', final: true });
  const overlap = appendFinalTurn(duplicate, { speaker: 'user', text: 'I built the API with caching', final: true });

  assert.equal(overlap.length, 1);
  assert.equal(overlap[0].text, 'I built the API with caching');
});

test('a longer final for the same audio segment replaces the shorter final', () => {
  const short = appendFinalTurn([], {
    speaker: 'interviewer',
    text: 'Tell me about',
    final: true,
    segmentId: 4,
    audioStartMs: 1200,
    audioEndMs: 2600,
  });
  const complete = appendFinalTurn(short, {
    speaker: 'interviewer',
    text: 'Tell me about your most recent project',
    final: true,
    segmentId: 4,
    audioStartMs: 1200,
    audioEndMs: 2600,
  });

  assert.equal(complete.length, 1);
  assert.equal(complete[0].text, 'Tell me about your most recent project');
  assert.equal(complete[0].segmentId, 4);
});

test('a delayed final from an earlier segment is ignored after a newer segment', () => {
  const first = appendFinalTurn([], {
    speaker: 'interviewer',
    text: 'Question one',
    final: true,
    segmentId: 5,
    audioStartMs: 2600,
    audioEndMs: 3900,
  });
  const second = appendFinalTurn(first, {
    speaker: 'interviewer',
    text: 'Question two',
    final: true,
    segmentId: 6,
    audioStartMs: 3900,
    audioEndMs: 5200,
  });
  const delayed = appendFinalTurn(second, {
    speaker: 'interviewer',
    text: 'Question one with a late tail',
    final: true,
    segmentId: 5,
    audioStartMs: 2600,
    audioEndMs: 3900,
  });

  assert.equal(delayed, second);
  assert.deepEqual(delayed.map((turn) => turn.text), ['Question one', 'Question two']);
});

test('audio end metadata alone rejects a late tail when a provider omits segment ids', () => {
  const current = appendFinalTurn([], {
    speaker: 'interviewer',
    text: 'Current question',
    final: true,
    audioStartMs: 5200,
    audioEndMs: 6800,
  });
  const delayed = appendFinalTurn(current, {
    speaker: 'interviewer',
    text: 'Previous question tail',
    final: true,
    audioStartMs: 3000,
    audioEndMs: 5100,
  });

  assert.equal(delayed, current);
});

test('same-speaker text overlap across another speaker does not erase a new turn', () => {
  const question = appendFinalTurn([], {
    speaker: 'interviewer',
    text: 'Tell me about the project',
    final: true,
    segmentId: 7,
  });
  const answer = appendFinalTurn(question, {
    speaker: 'user',
    text: 'I owned the API',
    final: true,
    segmentId: 1,
  });
  const repeated = appendFinalTurn(answer, {
    speaker: 'interviewer',
    text: 'Tell me about the project architecture',
    final: true,
    segmentId: 8,
  });

  assert.equal(repeated.length, 3);
  assert.deepEqual(repeated.map((turn) => turn.text), [
    'Tell me about the project',
    'I owned the API',
    'Tell me about the project architecture',
  ]);
});

test('invalid, empty, and cross-speaker segments remain isolated', () => {
  const invalid = appendFinalTurn([], { speaker: 'assistant', text: 'ignore me', final: true });
  const empty = appendFinalTurn(invalid, { speaker: 'user', text: '   ', final: true });
  const interviewer = appendFinalTurn(empty, { speaker: 'interviewer', text: 'same words', final: true });
  const candidate = appendFinalTurn(interviewer, { speaker: 'user', text: 'same words', final: true });

  assert.equal(candidate.length, 2);
  assert.deepEqual(candidate.map((turn) => turn.speaker), ['interviewer', 'user']);
});

test('context is newest-first selected but rendered in chronological order and bounded', () => {
  const turns = [
    { speaker: 'interviewer', text: 'Question one', final: true },
    { speaker: 'user', text: 'Answer one', final: true },
    { speaker: 'interviewer', text: 'Question two', final: true },
    { speaker: 'user', text: 'Answer two', final: true },
  ];

  const context = buildRecentInterviewContext(turns, { maxTurns: 3, maxChars: 60 });
  assert.ok(context.length <= 60);
  assert.match(context, /面试官|Interviewer/);
  assert.match(context, /我的回答|Candidate/);
  assert.ok(context.indexOf('Question two') < context.indexOf('Answer two'));
});

test('candidate speech can be excluded without consuming the interviewer turn budget', () => {
  const turns = [
    { speaker: 'interviewer', text: 'Question one', final: true },
    { speaker: 'user', text: 'Answer one', final: true },
    { speaker: 'interviewer', text: 'Question two', final: true },
    { speaker: 'user', text: 'Answer two', final: true },
  ];

  const context = buildRecentInterviewContext(turns, {
    maxTurns: 2,
    includeCandidateSpeech: false,
  });

  assert.equal(context, 'Interviewer: Question one\nInterviewer: Question two');
});

test('only interviewer final segments trigger a new answer', () => {
  assert.equal(shouldTriggerInterviewAnswer('interviewer', true), true);
  assert.equal(shouldTriggerInterviewAnswer('interviewer', false), false);
  assert.equal(shouldTriggerInterviewAnswer('user', true), false);
  assert.equal(shouldTriggerInterviewAnswer('unknown', true), false);
});

test('non-finite caller limits cannot disable the hard context bounds', () => {
  const turns = Array.from({ length: 30 }, (_, index) => ({
    speaker: index % 2 === 0 ? 'interviewer' : 'user',
    text: `turn ${index} ${'x'.repeat(500)}`,
    final: true,
  }));

  const context = buildRecentInterviewContext(turns, { maxTurns: Infinity, maxChars: Infinity });
  assert.ok(context.length <= 8000);
  assert.ok(context.split('\n').length <= 20);
});
