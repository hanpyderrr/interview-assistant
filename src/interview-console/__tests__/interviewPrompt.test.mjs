import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewConsolePrompt } from '../interviewPrompt.ts';

test('includes the candidate answer context with an explicit label', () => {
  const prompt = buildInterviewConsolePrompt(
    '那你如何定位线上问题？',
    '来源等级=resume_fact；我负责过日志和指标建设。',
    'Interviewer: 你如何定位线上问题？\nCandidate: 我会先看错误率和调用链。',
  );

  assert.match(prompt, /面试官问题：那你如何定位线上问题/);
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
    assert.match(prompt, /没有资料支持的指标[^。]*我目前无法确认/);
    assert.doesNotMatch(prompt, /指标写“需要本人补充”/);
    assert.match(prompt, /不得虚构经历、职责或指标/);
  }
});

 test('student depth respects evidence and separates working code from explanation scope', () => {
 const student = buildInterviewConsolePrompt('设计跨地域容灾系统', '暂无个人经历');
 assert.match(student, /资料未提及不等于不会或没做过/);
 assert.match(student, /高难度首答 2～4 句/);
 assert.match(student, /代码必须完整可用/);
 assert.match(student, /不把免责声明套在每道题上/);
 assert.doesNotMatch(student, /系统设计或用户明确要求详细\/分步骤时保持完整/);
 const senior = buildInterviewConsolePrompt('设计跨地域容灾系统', '资料', undefined, 'senior');
 assert.doesNotMatch(senior, /高难度首答 2～4 句/);
 });
 test('student follow-up preserves explicitly stated limits', () => {
 const prompt = buildInterviewConsolePrompt('那阈值具体怎么设置？', 'RAG 项目', 'Candidate: 我只了解基本检索，没有做过阈值调参。');
 assert.match(prompt, /没有做过阈值调参/);
 assert.match(prompt, /遵守此前明确的能力边界/);
 });

test('English mode overrides Chinese speech instructions without changing evidence boundaries', () => {
  const prompt = buildInterviewConsolePrompt('What is an index?', '', undefined, 'student', true);
  assert.match(prompt, /OUTPUT LANGUAGE: English/);
  assert.match(prompt, /Keep the question-correction markers unchanged/);
  assert.match(prompt, /不得虚构经历/);
  assert.ok(prompt.lastIndexOf('OUTPUT LANGUAGE: English') > prompt.lastIndexOf('用中文'));
  assert.doesNotMatch(buildInterviewConsolePrompt('什么是索引？', ''), /OUTPUT LANGUAGE: English/);
});

test('tail states the current question type and reinforces a concise first answer', () => {
  const technical = buildInterviewConsolePrompt('ADC 采样精度受什么影响？', '资料');
  assert.match(technical, /本轮首答精简要求/);
  assert.match(technical, /当前题型为「technical」/);
  assert.match(technical, /优先 2～3 句、25～55 字/);
  assert.match(technical, /只挑最核心的 1～2 点/);
  assert.match(technical, /不把题库要点展开成长段教材或完整教程/);
  assert.match(technical, /简单定义\/是非题\/单一事实题沿用上面的 1～2 句、15～35 字/);

  const reflection = buildInterviewConsolePrompt('学习 Java 有什么心得？', '资料');
  assert.match(reflection, /当前题型为「personal」/);
  assert.ok(reflection.includes('学习心得/反思类 HR 题优先 2～3 句、25～55 字'));
});

test('tail keeps behavioral first answers complete instead of merely short', () => {
  const prompt = buildInterviewConsolePrompt('讲一次你和同事的分歧', '资料');
  assert.match(prompt, /当前题型为「behavioral」/);
  assert.match(prompt, /行为题保持 60～110 字/);
  assert.match(prompt, /保留必要的情境、处理与反思/);
  assert.match(prompt, /不为求短丢掉关键经过/);
});

test('tail forces mixed answers to cover both parts without dropping one', () => {
  const prompt = buildInterviewConsolePrompt('如何排查死锁？另外你和同事如何协作？', '资料');
  assert.match(prompt, /当前题型为「mixed」/);
  assert.ok(prompt.includes('mixed 必须分别覆盖技术与个人/协作两部分'));
  assert.match(prompt, /不得为了简短漏答其中任何一问/);
});

test('tail defers to complex, code and user-specified length expectations', () => {
  const complex = buildInterviewConsolePrompt('设计跨地域容灾系统', '资料');
  assert.match(complex, /复杂技术题（代码、调试、DSA、系统设计）和资料明确支持的个人项目仍按上面的较长标准展开/);
  assert.match(complex, /不强行压短/);

  const custom = '这篇回答请写到 300 字，并给出完整代码。';
  const detailed = buildInterviewConsolePrompt('实现一个 LRU 缓存', '资料', undefined, 'student', false, custom);
  assert.ok(detailed.includes(custom));
  assert.match(detailed, /用户补充的提示词指定了长度时，以用户要求为准/);
  assert.match(detailed, /保留完整代码和关键前提，不得截断/);
});

test('English mode tail uses English sentence and word guidance instead of the Chinese rule', () => {
  const prompt = buildInterviewConsolePrompt('How does Redis handle persistence?', '', undefined, 'student', true);
  assert.match(prompt, /Final first-answer brevity rule for the current "technical" question/);
  assert.match(prompt, /2–3 sentences \(about 35–75 words\)/);
  assert.doesNotMatch(prompt, /本轮首答精简要求/);
  assert.doesNotMatch(prompt, /当前题型为/);
  assert.match(prompt, /参考表达（请按真实情况调整）/);
  assert.ok(prompt.lastIndexOf('OUTPUT LANGUAGE: English') > prompt.lastIndexOf('用中文'));
  assert.doesNotMatch(buildInterviewConsolePrompt('什么是索引？', ''), /Final first-answer brevity rule/);
});

test('follow-up context does not certify a previous generated answer as evidence', () => {
  const prompt = buildInterviewConsolePrompt('那后来呢？', '记录只验证了双路输出。', 'Candidate: 已经验证了完整系统。');
  assert.match(prompt, /此前回答可能有误/);
  assert.match(prompt, /本轮资料中的明确事实优先于此前回答/);
  assert.match(prompt, /阶段性验证不得扩大为整机性能/);
  assert.match(prompt, /检索片段未提供不等于整个知识库没有记录/);
  assert.match(prompt, /方案、目的、参数配置不等于实施效果/);
  assert.match(prompt, /某一种机制不起作用，不等于整体必然失败/);
});
