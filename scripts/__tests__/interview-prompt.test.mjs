import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewPrompt } from '../build-interview-prompt.mjs';

test('builds a spoken-answer prompt with factual boundaries', () => {
  const prompt = buildInterviewPrompt({
    question: '为什么使用多进程？',
    context: '来源等级=resume_fact；使用共享内存和 POSIX 信号量。',
  });

  assert.match(prompt.system, /不得猜测|需本人补充/);
  assert.match(prompt.user, /口述版回答/);
  assert.match(prompt.user, /为什么使用多进程/);
  assert.match(prompt.user, /共享内存/);
});

test('rejects an empty interview question', () => {
  assert.throws(
    () => buildInterviewPrompt({ question: '  ', context: '资料' }),
    /question/i,
  );
});

test('includes bounded candidate context without changing the current question', () => {
  const prompt = buildInterviewPrompt({
    question: '如何处理线上问题？',
    context: '来源等级=resume_fact；负责日志和指标建设。',
    conversationContext: 'Interviewer: 如何处理线上问题？\nCandidate: 我会先看错误率和调用链。',
  });

  assert.match(prompt.user, /面试官问题：\n如何处理线上问题/);
  assert.match(prompt.user, /候选人此前的实际回答|我的回答/);
  assert.match(prompt.user, /我会先看错误率和调用链/);
  assert.match(prompt.user, /承接|实际经历/);
});
