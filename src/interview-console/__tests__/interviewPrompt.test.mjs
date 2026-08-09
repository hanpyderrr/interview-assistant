import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewConsolePrompt } from '../interviewPrompt.ts';

test('includes the candidate answer context with an explicit label', () => {
  const prompt = buildInterviewConsolePrompt(
    '你如何定位线上问题？',
    '来源等级=resume_fact；我负责过日志和指标建设。',
    'Interviewer: 你如何定位线上问题？\nCandidate: 我会先看错误率和调用链。',
  );

  assert.match(prompt, /面试官问题：你如何定位线上问题/);
  assert.match(prompt, /我的回答|候选人此前的实际回答/);
  assert.match(prompt, /我会先看错误率和调用链/);
  assert.match(prompt, /承接|实际经历/);
});

test('empty or invalid candidate context falls back to the current prompt shape', () => {
  const prompt = buildInterviewConsolePrompt('为什么使用多进程？', '资料', '   ');

  assert.match(prompt, /面试官问题：为什么使用多进程/);
  assert.match(prompt, /个人资料与题库：\n资料/);
  assert.doesNotMatch(prompt, /我的回答|候选人此前的实际回答/);
});
