import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalFallbackAnswer, answerHistoryReducer, createAnswerHistoryState } from '../answerHistory.ts';

const hit = { id: 'test.1', title: 'Redis缓存优化', excerpt: '我负责缓存优化，降低数据库负载。', source: 'prepared_answer', score: 999 };
const failure = (question, hits = [], englishMode = false) => {
  let s = createAnswerHistoryState();
  for (const a of [
    { type: 'enqueue', id: 1, question, englishMode },
    { type: 'hits', id: 1, hits },
    { type: 'error', id: 1, error: 'HTTP 503 test failure' },
  ]) s = answerHistoryReducer(s, a);
  return s.items[0];
};

test('HR fallback rejects technical hits regardless of their score or source', () => {
  for (const source of ['resume_fact', 'prepared_answer']) {
    const item = failure('你上学累不累？', [{ ...hit, source }]);
    assert.doesNotMatch(item.answer, /Redis|数据库|缓存|项目|架构|性能|工程师|HTTP|503/);
    assert.match(item.answer, /真实|感受/);
    assert.equal(item.answerSource, 'guidance');
    assert.equal(item.error, 'HTTP 503 test failure');
  }
});

test('irrelevant or unverified KB matches do not manufacture a technical answer', () => {
  const item = failure('ADC采样精度受哪些因素影响？', [hit]);
  assert.equal(item.answerSource, 'unavailable');
  assert.doesNotMatch(item.answer, /Redis|缓存|稳定性|解耦|性能收益/);
  assert.match(item.answer, /可靠|参考/);
});

test('an exact question title offers a labeled reference with draft provenance', () => {
  const item = failure('ADC采样精度受哪些因素影响？', [{ ...hit, title: 'ADC采样精度受哪些因素影响', excerpt: 'ADC的参考电压和噪声影响转换精度。' }]);
  assert.equal(item.answerSource, 'reference');
  assert.match(item.answer, /题库参考/);
  assert.match(item.answer, /未经.*确认/);
  assert.match(item.answer, /参考电压/);
  assert.doesNotMatch(item.answer, /可以这样答|稳定性|解耦|503/);
});

test('matching titles cannot make a visibly unrelated excerpt into a reference', () => {
  const item = failure('ADC采样精度受哪些因素影响？', [{ ...hit, title: 'ADC采样精度受哪些因素影响？' }]);
  assert.equal(item.answerSource, 'unavailable');
  assert.doesNotMatch(item.answer, /缓存|数据库/);
});

test('mixed and unknown questions fail honestly instead of quoting unverified matches', () => {
  for (const q of ['学 ADC 压力大吗？另外采样精度受哪些因素影响？', 'zorbax呢']) {
    assert.equal(failure(q, [{ ...hit, title: q }]).answerSource, 'unavailable');
  }
});

test('English fallback follows the saved answer language', () => {
  const item = failure('你上学累不累？', [hit], true);
  assert.match(item.answer, /feel|experience/i);
  assert.doesNotMatch(item.answer, /[\u4e00-\u9fff]|Redis|cache|503/);
});

test('partial provider output stays incomplete and preserves text without appending fallback', () => {
  for (const final of [{ type: 'error', id: 1, error: 'HTTP 503' }, { type: 'done', id: 1, finalText: 'Request timed out before a useful answer was generated.' }]) {
    let s = createAnswerHistoryState();
    s = answerHistoryReducer(s, { type: 'enqueue', id: 1, question: 'ADC是什么？' });
    s = answerHistoryReducer(s, { type: 'token', id: 1, token: 'ADC把模拟信号转换为' });
    s = answerHistoryReducer(s, final);
    assert.equal(s.items[0].answer, 'ADC把模拟信号转换为');
    assert.equal(s.items[0].status, 'error');
    assert.equal(s.items[0].answerSource, 'model');
  }
});

test('an empty done event is not a successful answer', () => {
  let s = createAnswerHistoryState();
  s = answerHistoryReducer(s, { type: 'enqueue', id: 1, question: 'ADC是什么？' });
  s = answerHistoryReducer(s, { type: 'done', id: 1 });
  assert.equal(s.items[0].status, 'error');
  assert.equal(s.items[0].answerSource, 'unavailable');
});

test('fallback does not expose raw backend errors in spoken content', () => {
  assert.doesNotMatch(buildLocalFallbackAnswer('ADC是什么？', [], 'internal-test-error-123'), /internal-test-error-123/);
});


test('a Chinese-only TOF excerpt still shares the subject of an exact TOF title', () => {
  const item = failure('请用 1 分钟介绍单光子 TOF 项目', [{
    id: 'tof.cn',
    title: '请用 1 分钟介绍单光子 TOF 项目',
    excerpt: '单光子探测终端通过时间数字转换完成飞行时间测量，硬件触发同步采集。',
    source: 'prepared_answer',
    score: 5,
  }]);
  assert.equal(item.answerSource, 'reference');
  assert.match(item.answer, /题库参考/);
  assert.match(item.answer, /单光子探测终端/);
  assert.match(item.answer, /准备稿/);
});

test('a same-title but unrelated excerpt stays unavailable without English overlap', () => {
  const item = failure('请用 1 分钟介绍单光子 TOF 项目', [{
    id: 'unrelated',
    title: '请用 1 分钟介绍单光子 TOF 项目',
    excerpt: '负责族谱数字化，整理校对家族关系并进行证据分层。',
    source: 'resume_fact',
    score: 5,
  }]);
  assert.equal(item.answerSource, 'unavailable');
  assert.doesNotMatch(item.answer, /族谱|单光子/);
});

test('technical discussion of timeout is useful content, including before a stream failure', () => {
  for (const final of [{ type: 'done', id: 1 }, { type: 'error', id: 1, error: 'Connection closed' }]) {
    let s = createAnswerHistoryState();
    s = answerHistoryReducer(s, { type: 'enqueue', id: 1, question: 'How would you handle TCP failures?' });
    const answer = 'I would set a timeout and retry with backoff when a request timed out.';
    s = answerHistoryReducer(s, { type: 'token', id: 1, token: answer });
    s = answerHistoryReducer(s, final);
    assert.equal(s.items[0].answer, answer);
    assert.equal(s.items[0].answerSource, 'model');
    assert.equal(s.items[0].status, final.type === 'done' ? 'answered' : 'error');
  }
});

test('an exact TOF title accepts distinctive hardware anchors without repeating the title', () => {
  const title = '请用 1 分钟介绍单光子 TOF 项目';
  const reference = failure(title, [{ id:'tof.hardware', title,
    excerpt:'PF32 数据由 N97 采集处理，深度帧发送到 RK3568 显示。', source:'prepared_answer' }]);
  assert.equal(reference.answerSource, 'reference');
  const unrelated = failure(title, [{ id:'board.generic', title,
    excerpt:'RK3568 开发板运行 Linux，用于测试一个网页。', source:'prepared_answer' }]);
  assert.equal(unrelated.answerSource, 'unavailable');
});
