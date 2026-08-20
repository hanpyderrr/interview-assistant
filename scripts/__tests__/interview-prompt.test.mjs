import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewPrompt } from '../build-interview-prompt.mjs';

test('builds a spoken-answer prompt with factual boundaries', () => {
  const prompt = buildInterviewPrompt({
    question: '为什么使用多进程？',
    context: '来源等级=resume_fact；使用共享内存和 POSIX 信号量。',
  });

  assert.match(prompt.system, /不得猜测|需本人补充/);
  assert.match(prompt.system, /【需本人补充】[\s\S]{0,40}(?:只能|仅可)[\s\S]{0,30}不能虚构的内容/);
  assert.match(prompt.system, /口述版回答[\s\S]{0,30}(?:和|、)[\s\S]{0,30}结合我的项目[\s\S]{0,40}(?:不得|不能)[\s\S]{0,20}(?:出现|使用)[\s\S]{0,20}(?:该占位符|【需本人补充】)/);
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

test('system prompt protects concise budgets, complete technical answers, and claim correctness', () => {
  const { system } = buildInterviewPrompt({ question: '请介绍这个项目。', context: '资料' });

  assert.match(system, /简单[\s\S]{0,40}1[～至到-]2\s*句[\s\S]{0,40}15[～至到-]35\s*词/);
  assert.match(system, /普通[\s\S]{0,40}2[～至到-]3\s*句[\s\S]{0,40}25[～至到-]55\s*词/);
  assert.match(system, /行为[\s\S]{0,40}60[～至到-]110\s*词/);
  for (const task of ['代码', '调试', '算法', '系统设计']) {
    assert.match(system, new RegExp(`${task}[\\s\\S]{0,100}(?:保持完整|完整回答|不受上述)`));
  }
  assert.match(system, /明确[\s\S]{0,30}(?:详细|完整)[\s\S]{0,80}(?:保持完整|完整回答|不受上述)/);
  assert.match(system, /保留[\s\S]{0,20}证据强度/);
  assert.match(system, /建议[\s\S]{0,40}应该[\s\S]{0,40}可以包含[\s\S]{0,80}(?:不得|不能)[\s\S]{0,30}项目[\s\S]{0,20}(?:已实现|事实)/);
  assert.match(system, /明确[\s\S]{0,20}不确定[\s\S]{0,30}保持[\s\S]{0,10}不确定/);
  assert.match(system, /推导[\s\S]{0,20}数值[\s\S]{0,30}输出前[\s\S]{0,30}复核[\s\S]{0,20}(?:单位[\s\S]{0,10}(?:计算|算术)|(?:计算|算术)[\s\S]{0,10}单位)/);
});

test('keeps four non-repeating sections and limits the project section to one relevant fact', () => {
  const { user } = buildInterviewPrompt({ question: '为什么使用多进程？', context: '资料' });
  const sections = ['【口述版回答】', '【结合我的项目】', '【可能追问】', '【不能虚构的内容】'];

  for (const section of sections) {
    assert.equal(user.split(section).length - 1, 1, `${section} should appear exactly once`);
  }
  assert.match(user, /各分区[\s\S]{0,20}(?:不要|不得)重复/);
  assert.match(user, /项目区[\s\S]{0,30}(?:只|仅)[\s\S]{0,10}(?:一个|1\s*个)[\s\S]{0,20}最相关事实/);
});
