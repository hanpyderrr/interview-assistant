import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerPrewarmCache } from '../answerPrewarm.ts';
import { buildInterviewConsolePrompt } from '../interviewPrompt.ts';
import { validateInterviewAnswerTopic } from '../answerTopicValidation.ts';

test('prewarm and direct retrieval both skip technical KB for HR and unknown questions', async () => {
  let calls = 0;
  const cache = createAnswerPrewarmCache(async () => { calls++; return { success: true, context: 'Redis架构', matches: [] }; });
  for (const q of ['你上学累不累？', '请谈谈zorbax']) {
    const warm = await cache.prewarm(q);
    const direct = await cache.retrieve(q);
    assert.deepEqual(direct, warm.retrieval);
    assert.doesNotMatch(direct.context, /Redis/);
  }
  assert.equal(calls, 0);
});

test('unknown prompts do not label questions as HR or require draft prefixes', () => {
  const prompt = buildInterviewConsolePrompt('请谈谈zorbax', '', '上一题是Redis');
  assert.match(prompt, /当前题型：unknown/);
  assert.match(prompt, /不能.*个人|不.*默认.*个人/);
  assert.doesNotMatch(prompt, /上一题是Redis/);
});

test('bare follow-up without context asks to clarify rather than inventing a preceding topic', async () => {
  const cache = createAnswerPrewarmCache(async () => { throw Error('unrelated KB must not be queried'); });
  const result = await cache.prewarm('那为什么？');
  assert.match(result.prompt, /没有.*上文|缺少.*上文/);
});

test('a reflection may name its subject, but cannot detour into implementation details', () => {
  const question = '学习数据库有什么心得？';
  assert.equal(validateInterviewAnswerTopic({ question, answer: '参考表达：学习数据库需要耐心，我会先弄清概念再逐步练习。' }).ok, true);
  assert.equal(validateInterviewAnswerTopic({ question, answer: '参考表达：我会用索引和缓存优化数据库查询性能。' }).ok, false);
});

test('unknown topic is not sufficient reason to reject a technical explanation', () => {
  const result = validateInterviewAnswerTopic({ question: '请谈谈zorbax', answer: '若你指的是某个数据库工具，需要补充它的名称或用途。' });
  assert.equal(result.ok, true);
});
