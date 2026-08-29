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

test('requires the question-correction section at the start of the answer', () => {
  const prompt = buildInterviewConsolePrompt('你如何定位线上问题？', '资料', undefined);

  assert.match(prompt, /【问题修正】<修正后的面试官问题>【\/问题修正】/);
  assert.match(prompt, /只修正问题里明显的语音转写错别字、同音字和断句错误/);
  assert.match(prompt, /保持原意、技术词、数字不变/);
  assert.match(prompt, /没有问题可修正时原样输出问题/);
});

test('owns the spoken length contract without a blanket 30-60 second rule', () => {
  const prompt = buildInterviewConsolePrompt('什么是 POSIX？', '资料');
  assert.match(prompt, /简单定义、是非题或单一事实题[^\n]*1[～-]2 句[^\n]*15[～-]35 字/);
  assert.match(prompt, /普通问题[^\n]*2[～-]3 句[^\n]*25[～-]55 字/);
  assert.match(prompt, /行为问题[^\n]*60[～-]110 字/);
  assert.match(prompt, /标点和空白不计/);
  assert.match(prompt, /代码[^\n]*调试[^\n]*(?:DSA|数据结构)[^\n]*系统设计[^\n]*保持完整/);
  assert.doesNotMatch(prompt, /30\s*[-～]\s*60\s*秒/);
});

test('defaults to the student answer level', () => {
  const prompt = buildInterviewConsolePrompt('什么是 RAG？', '资料');
  assert.match(prompt, /回答定位：学生\/应届/);
  assert.match(prompt, /如果落地我会/);
  assert.match(prompt, /不得虚构经历、职责或指标/);
});

test('adds distinct mid and senior depth without removing shared safety contracts', () => {
  const mid = buildInterviewConsolePrompt('什么是 RAG？', '资料', undefined, 'mid');
  const senior = buildInterviewConsolePrompt('什么是 RAG？', '资料', undefined, 'senior');

  assert.match(mid, /回答定位：中级工程师/);
  assert.match(mid, /实现步骤|常见故障|主要取舍/);
  assert.match(senior, /回答定位：高级工程师/);
  assert.match(senior, /SLO|容量|降级/);
  for (const prompt of [mid, senior]) {
    assert.match(prompt, /【问题修正】/);
    assert.match(prompt, /没有资料支持的指标写“需要本人补充”/);
    assert.match(prompt, /不得虚构经历、职责或指标/);
  }
});
