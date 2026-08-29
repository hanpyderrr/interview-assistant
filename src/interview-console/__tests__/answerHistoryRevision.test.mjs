// Phase 18 Step 3 RED contract for the future answer-history `revise` action.
//
// This suite runs against the real reducer. It is expected to FAIL now because
// `{ type: 'revise' }` is not implemented; the reducer's `default` branch
// returns the state unchanged, so the question/status assertions below fail.
// Do not implement the action here (Step 4 owns that).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerHistoryReducer,
  createAnswerHistoryState,
} from '../answerHistory.ts';
import { stripCorrectionSection } from '../questionCorrectionExtractor.ts';

const ANSWER_ID = 4201;
const FIRST_QUESTION = '你怎么设计 SPI 帧头？';
const COMBINED_QUESTION = '你怎么设计 SPI 帧头？还有 CRC32 校验和半包怎么处理？';

const HITS = [
  { id: 'kb-1', title: 'SPI 帧协议', excerpt: '帧头 + 长度 + CRC32', score: 0.91 },
];

/** A round mid-generation: enqueued, started, streamed a visible draft, hits attached. */
function stateWithVisibleDraft() {
  let state = createAnswerHistoryState(10);
  state = answerHistoryReducer(state, { type: 'enqueue', id: ANSWER_ID, question: FIRST_QUESTION });
  state = answerHistoryReducer(state, { type: 'start', id: ANSWER_ID });
  state = answerHistoryReducer(state, { type: 'hits', id: ANSWER_ID, hits: HITS });
  state = answerHistoryReducer(state, { type: 'token', id: ANSWER_ID, token: '我会先约定字节序，' });
  state = answerHistoryReducer(state, { type: 'token', id: ANSWER_ID, token: '再定义帧头。' });
  return state;
}

const VISIBLE_DRAFT = '我会先约定字节序，再定义帧头。';

test('revise keeps exactly one item and reuses the same answer id', () => {
  const before = stateWithVisibleDraft();
  assert.equal(before.items.length, 1);

  const after = answerHistoryReducer(before, {
    type: 'revise',
    id: ANSWER_ID,
    question: COMBINED_QUESTION,
  });

  assert.equal(after.items.length, 1, 'revise must not append a second history item');
  assert.equal(after.items[0].id, ANSWER_ID, 'revise must reuse the existing answer id');
  assert.equal(after.selectedId, ANSWER_ID);
});

test('revise updates the combined question text', () => {
  const after = answerHistoryReducer(stateWithVisibleDraft(), {
    type: 'revise',
    id: ANSWER_ID,
    question: COMBINED_QUESTION,
  });

  assert.equal(after.items[0].question, COMBINED_QUESTION);
});

test('revise retains the visible draft answer and the existing hits', () => {
  const after = answerHistoryReducer(stateWithVisibleDraft(), {
    type: 'revise',
    id: ANSWER_ID,
    question: COMBINED_QUESTION,
  });

  assert.equal(
    after.items[0].answer,
    VISIBLE_DRAFT,
    'the old visible draft must stay on screen until fresh output arrives',
  );
  assert.deepEqual(after.items[0].hits, HITS, 'revise must retain previously attached hits');
  assert.equal(after.items[0].replacePending, true);
});

test('the first visible token atomically replaces the retained draft and later tokens append', () => {
  let state = answerHistoryReducer(stateWithVisibleDraft(), { type: 'revise', id: ANSWER_ID, question: COMBINED_QUESTION });
  state = answerHistoryReducer(state, { type: 'token', id: ANSWER_ID, token: '' });
  assert.equal(state.items[0].answer, VISIBLE_DRAFT);
  state = answerHistoryReducer(state, { type: 'token', id: ANSWER_ID, token: '新答案第一句。' });
  assert.equal(state.items[0].answer, '新答案第一句。');
  assert.equal(state.items[0].replacePending, false);
  state = answerHistoryReducer(state, { type: 'token', id: ANSWER_ID, token: '第二句。' });
  assert.equal(state.items[0].answer, '新答案第一句。第二句。');
});

test('empty done and terminal failures keep the visible draft while clearing replacePending', () => {
  for (const action of [
    { type: 'done', id: ANSWER_ID, finalText: '' },
    { type: 'error', id: ANSWER_ID, error: '失败' },
    { type: 'interrupted', id: ANSWER_ID },
  ]) {
    const revised = answerHistoryReducer(stateWithVisibleDraft(), { type: 'revise', id: ANSWER_ID, question: COMBINED_QUESTION });
    const after = answerHistoryReducer(revised, action);
    assert.equal(after.items[0].answer, VISIBLE_DRAFT, action.type);
    assert.equal(after.items[0].replacePending, false, action.type);
  }
});

test('revise moves the item back to generating and clears any prior error', () => {
  let state = stateWithVisibleDraft();
  state = answerHistoryReducer(state, { type: 'error', id: ANSWER_ID, error: '模型超时' });
  assert.equal(state.items[0].status, 'error');

  const after = answerHistoryReducer(state, {
    type: 'revise',
    id: ANSWER_ID,
    question: COMBINED_QUESTION,
  });

  assert.equal(after.items[0].status, 'generating');
  assert.equal(after.items[0].error, undefined);
});

test('a later done(finalText) replaces the retained draft on the revised item', () => {
  const revised = answerHistoryReducer(stateWithVisibleDraft(), {
    type: 'revise',
    id: ANSWER_ID,
    question: COMBINED_QUESTION,
  });
  assert.equal(revised.items[0].answer, VISIBLE_DRAFT);

  const finalText = '字节序用小端，帧头 0xA55A，长度 2 字节，尾部 CRC32；半包按长度字段在环形缓冲里等齐再解。';
  const done = answerHistoryReducer(revised, { type: 'done', id: ANSWER_ID, finalText });

  assert.equal(done.items.length, 1);
  assert.equal(done.items[0].id, ANSWER_ID);
  assert.equal(done.items[0].answer, finalText, 'the fresh final answer must replace the retained draft');
  assert.equal(done.items[0].status, 'answered');
  assert.equal(done.items[0].question, COMBINED_QUESTION);
  assert.deepEqual(done.items[0].hits, HITS);
});

test('a no-token done strips its correction block and atomically replaces the retained draft', () => {
  const revised = answerHistoryReducer(stateWithVisibleDraft(), {
    type: 'revise',
    id: ANSWER_ID,
    question: COMBINED_QUESTION,
  });
  const providerFinal = `【问题修正】${COMBINED_QUESTION}【/问题修正】新答案正文。`;
  const stripped = stripCorrectionSection(providerFinal, COMBINED_QUESTION);
  const done = answerHistoryReducer(revised, { type: 'done', id: ANSWER_ID, finalText: stripped.text });
  assert.equal(done.items[0].answer, '新答案正文。');
  assert.doesNotMatch(done.items[0].answer, /问题修正/);
  assert.equal(done.items[0].replacePending, false);
});

test('revise for an unknown answer id does not create an item', () => {
  const before = stateWithVisibleDraft();
  const after = answerHistoryReducer(before, {
    type: 'revise',
    id: 999999,
    question: COMBINED_QUESTION,
  });

  assert.equal(after.items.length, 1);
  assert.equal(after.items[0].id, ANSWER_ID);
  assert.equal(after.items[0].question, FIRST_QUESTION);
});

test('enqueue defaults to student and revise preserves the answer-level snapshot', () => {
  let state = createAnswerHistoryState(10);
  state = answerHistoryReducer(state, {
    type: 'enqueue', id: 1, question: '怎么设计 RAG？', answerLevel: 'mid',
  });
  state = answerHistoryReducer(state, {
    type: 'revise', id: 1, question: '怎么设计 RAG？如何处理故障？',
  });
  assert.equal(state.items[0].answerLevel, 'mid');

  let defaultState = createAnswerHistoryState(10);
  defaultState = answerHistoryReducer(defaultState, { type: 'enqueue', id: 2, question: '什么是 RAG？' });
  assert.equal(defaultState.items[0].answerLevel, 'student');
});

test('local fallback wording follows the answer-level snapshot', () => {
  const answers = {};
  for (const answerLevel of ['student', 'mid', 'senior']) {
    let state = createAnswerHistoryState(10);
    state = answerHistoryReducer(state, {
      type: 'enqueue', id: 1, question: '怎么设计 RAG？', answerLevel,
    });
    state = answerHistoryReducer(state, { type: 'error', id: 1, error: 'offline' });
    answers[answerLevel] = state.items[0].answer;
  }

  assert.match(answers.student, /我的理解|学习|个人项目/);
  assert.match(answers.mid, /实现|排查|取舍/);
  assert.match(answers.senior, /架构|可靠性|容量|约束/);
  assert.equal(new Set(Object.values(answers)).size, 3);
});
