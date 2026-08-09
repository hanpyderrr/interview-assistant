import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const consolePath = path.join(repoRoot, 'src', 'interview-console', 'InterviewConsole.tsx');
const loadHistory = () => import(pathToFileURL(path.join(repoRoot, 'src', 'interview-console', 'answerHistory.ts')).href);

test('keeps independently selectable answer history for rapid consecutive questions', async () => {
  const source = await readFile(consolePath, 'utf8');

  assert.match(source, /answerHistory/);
  assert.match(source, /onSelectAnswer/);
  assert.match(source, /streamId/);
  assert.match(source, /history(?:Items)?\.map/);
  assert.match(source, /answerQueueRef/);
  assert.match(source, /pumpAnswerQueue/);
  assert.match(source, /cancelChatStream/);
});

test('updates only the matching question when two answers arrive one second apart', async () => {
  const { answerHistoryReducer, createAnswerHistoryState } = await loadHistory();
  let state = createAnswerHistoryState(10);
  state = answerHistoryReducer(state, { type: 'enqueue', id: 1, question: 'Question one' });
  state = answerHistoryReducer(state, { type: 'start', id: 1 });
  state = answerHistoryReducer(state, { type: 'token', id: 1, token: 'Answer one' });
  state = answerHistoryReducer(state, { type: 'enqueue', id: 2, question: 'Question two' });
  state = answerHistoryReducer(state, { type: 'start', id: 2 });
  state = answerHistoryReducer(state, { type: 'token', id: 2, token: 'Answer two' });
  state = answerHistoryReducer(state, { type: 'done', id: 2, finalText: 'Answer two complete' });

  assert.deepEqual(state.items.map((item) => [item.id, item.question, item.answer]), [
    [1, 'Question one', 'Answer one'],
    [2, 'Question two', 'Answer two complete'],
  ]);
});

test('selecting an older answer does not change the newer answer record', async () => {
  const { answerHistoryReducer, createAnswerHistoryState } = await loadHistory();
  let state = createAnswerHistoryState(10);
  state = answerHistoryReducer(state, { type: 'enqueue', id: 1, question: 'Question one' });
  state = answerHistoryReducer(state, { type: 'done', id: 1, finalText: 'Answer one' });
  state = answerHistoryReducer(state, { type: 'enqueue', id: 2, question: 'Question two' });
  state = answerHistoryReducer(state, { type: 'done', id: 2, finalText: 'Answer two' });
  state = answerHistoryReducer(state, { type: 'select', id: 1 });

  assert.equal(state.selectedId, 1);
  assert.equal(state.items.find((item) => item.id === 1)?.answer, 'Answer one');
  assert.equal(state.items.find((item) => item.id === 2)?.answer, 'Answer two');
});

test('background enqueues can preserve the currently selected answer', async () => {
  const { answerHistoryReducer, createAnswerHistoryState } = await loadHistory();
  let state = createAnswerHistoryState(10);
  state = answerHistoryReducer(state, { type: 'enqueue', id: 1, question: 'Question one' });
  state = answerHistoryReducer(state, { type: 'enqueue', id: 2, question: 'Question two', select: false });

  assert.equal(state.selectedId, 1);
  assert.deepEqual(state.items.map((item) => item.id), [1, 2]);
});

test('background enqueues fall back to a visible answer when the selected item is trimmed', async () => {
  const { answerHistoryReducer, createAnswerHistoryState } = await loadHistory();
  let state = createAnswerHistoryState(2);
  state = answerHistoryReducer(state, { type: 'enqueue', id: 1, question: 'Question one' });
  state = answerHistoryReducer(state, { type: 'enqueue', id: 2, question: 'Question two', select: false });
  state = answerHistoryReducer(state, { type: 'enqueue', id: 3, question: 'Question three', select: false });

  assert.deepEqual(state.items.map((item) => item.id), [2, 3]);
  assert.equal(state.selectedId, 3);
});

test('answer history is bounded to the configured maximum', async () => {
  const { answerHistoryReducer, createAnswerHistoryState } = await loadHistory();
  let state = createAnswerHistoryState(2);
  for (let id = 1; id <= 3; id += 1) {
    state = answerHistoryReducer(state, { type: 'enqueue', id, question: `Question ${id}` });
  }
  assert.deepEqual(state.items.map((item) => item.id), [2, 3]);
  assert.equal(state.selectedId, 3);
});

test('provider errors keep the answer panel useful with a local fallback from retrieved hits', async () => {
  const { answerHistoryReducer, createAnswerHistoryState } = await loadHistory();
  let state = createAnswerHistoryState(10);
  state = answerHistoryReducer(state, { type: 'enqueue', id: 1, question: 'SPI 接收为什么拆成独立进程？' });
  state = answerHistoryReducer(state, {
    type: 'hits',
    id: 1,
    hits: [{
      id: 'resume.004',
      title: '多进程与共享内存通信',
      excerpt: '将SPI接收、数据处理、Qt显示和5G通信拆分为独立进程，使用共享内存和POSIX信号量交换大块数据，减少进程间数据拷贝。',
      score: 5.25,
      source: 'resume_fact',
    }],
  });
  state = answerHistoryReducer(state, { type: 'error', id: 1, error: '503 Service temporarily unavailable' });

  const item = state.items[0];
  assert.equal(item.status, 'error');
  assert.equal(item.error, '503 Service temporarily unavailable');
  assert.match(item.answer, /模型服务暂时不可用/);
  assert.match(item.answer, /多进程与共享内存通信/);
  assert.match(item.answer, /共享内存和POSIX信号量/);
  assert.doesNotMatch(item.answer, /正在生成回答/);
});

test('provider timeout placeholder answers are replaced by local fallback drafts', async () => {
  const { answerHistoryReducer, createAnswerHistoryState } = await loadHistory();
  let state = createAnswerHistoryState(10);
  state = answerHistoryReducer(state, { type: 'enqueue', id: 1, question: '智能家居能耗监测平台的实时数据链路怎么设计？' });
  state = answerHistoryReducer(state, {
    type: 'hits',
    id: 1,
    hits: [{
      id: 'resume.002',
      title: '能耗监测平台总体架构',
      excerpt: '能耗监测平台基于 Linux 嵌入式网关，包含传感器采集、规则引擎、可视化看板和远程告警推送。',
      score: 4.5,
      source: 'resume_fact',
    }],
  });
  state = answerHistoryReducer(state, {
    type: 'done',
    id: 1,
    finalText: "The model did not produce an answer in time, so I won't guess from your profile.",
  });

  const item = state.items[0];
  assert.equal(item.status, 'error');
  assert.match(item.error || '', /模型超时/);
  assert.match(item.answer, /本地兜底口述稿/);
  assert.match(item.answer, /能耗监测平台总体架构/);
  assert.doesNotMatch(item.answer, /The model did not produce/);
});

test('provider timeout done event does not replace a useful streamed answer', async () => {
  const { answerHistoryReducer, createAnswerHistoryState } = await loadHistory();
  let state = createAnswerHistoryState(10);
  state = answerHistoryReducer(state, { type: 'enqueue', id: 1, question: 'How did you design the SPI data pipeline?' });
  state = answerHistoryReducer(state, { type: 'start', id: 1 });
  state = answerHistoryReducer(state, {
    type: 'token',
    id: 1,
    token: 'I split capture, processing, UI, and uplink into separate processes with shared memory to reduce copies.',
  });
  state = answerHistoryReducer(state, {
    type: 'done',
    id: 1,
    finalText: "The model did not produce an answer in time, so I won't guess from your profile.",
  });

  const item = state.items[0];
  assert.equal(item.status, 'answered');
  assert.equal(item.error, undefined);
  assert.match(item.answer, /shared memory to reduce copies/);
  assert.doesNotMatch(item.answer, /The model did not produce/);
});

test('generic timeout no-answer text is treated as a provider placeholder', async () => {
  const { answerHistoryReducer, createAnswerHistoryState } = await loadHistory();
  let state = createAnswerHistoryState(10);
  state = answerHistoryReducer(state, { type: 'enqueue', id: 1, question: 'What is your Linux tailoring approach?' });
  state = answerHistoryReducer(state, {
    type: 'done',
    id: 1,
    finalText: 'Request timed out before a useful answer was generated.',
  });

  const item = state.items[0];
  assert.equal(item.status, 'error');
  assert.match(item.error || '', /Request timed out/);
  assert.doesNotMatch(item.answer, /^Request timed out before a useful answer was generated\.$/);
});
