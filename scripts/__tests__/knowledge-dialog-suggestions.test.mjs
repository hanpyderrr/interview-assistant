import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseAnswer } from '../knowledge-dialog/answer-diagnostics.mjs';
import { createSuggestions, CONTENT_CHANGING_ACTIONS } from '../knowledge-dialog/suggestion-engine.mjs';
import { classifyAnswerLengthBudget, countSpokenUnits } from '../knowledge-dialog/answer-quality-rules.mjs';

// Fictional entries only — never read knowledge_source/*.jsonl. These entries
// follow the retriever schema (id/title/content/keywords/fact_status) so the
// diagnostics stay compatible with scripts/interview-retriever.mjs output.
const entries = [
  {
    id: 'fact.mem',
    title: '内存优化',
    content: '在智芯网关项目中把日志缓冲区改为环形队列，减少动态分配，稳定运行内存占用降低。',
    keywords: ['内存', '优化', '环形队列'],
    fact_status: 'resume_fact',
  },
  {
    id: 'fact.spi.recovery',
    title: 'SPI 异常恢复',
    content: 'SPI 异常恢复包括重发与状态机复位，重试次数按项目配置记录。',
    keywords: ['SPI', '恢复', '重试'],
    fact_status: 'prepared_answer',
  },
  {
    id: 'fact.team.2023',
    title: '2023 年团队规模',
    content: '2023 年智芯网关项目团队共 5 人。',
    keywords: ['团队', '人数'],
    fact_status: 'resume_fact',
  },
  {
    id: 'fact.team.2024',
    title: '2024 年团队规模',
    content: '2024 年智芯网关项目团队共 8 人。',
    keywords: ['团队', '人数'],
    fact_status: 'resume_fact',
  },
];

// ---------------------------------------------------------------------------
// answer-diagnostics: deterministic answer grounding
// ---------------------------------------------------------------------------

test('flags an unrecorded numeric claim as unsupported-claim', () => {
  const issues = diagnoseAnswer({
    question: '您做的内存优化带来了什么收益？',
    answer: '改成环形队列后内存占用降低，性能提升了40%。',
    entries,
    evidenceIds: ['fact.mem'],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'unsupported-claim');
  assert.equal(issues[0].severity, 'high');
  assert.deepEqual(issues[0].evidenceIds, ['fact.mem']);
  assert.equal(issues[0].question, '您做的内存优化带来了什么收益？');
  assert.ok(issues[0].explanation.includes('40%'));
  assert.ok(issues[0].suggestedAction.length > 0);
  assert.ok(issues[0].id);
});

test('accepts a numeric claim grounded in the cited entry', () => {
  const issues = diagnoseAnswer({
    question: '2023 年团队多少人？',
    answer: '2023 年团队共 5 人。',
    entries,
    evidenceIds: ['fact.team.2023'],
  });
  assert.deepEqual(issues, []);
});

test('flags an answer without project evidence as generic-answer', () => {
  const issues = diagnoseAnswer({
    question: '请介绍您的嵌入式软件调试方法。',
    answer: '调试时先复现现象，再通过断点和日志定位问题，修改后做回归测试。',
    entries,
    evidenceIds: [],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'generic-answer');
  assert.equal(issues[0].severity, 'medium');
  assert.deepEqual(issues[0].evidenceIds, []);
});

test('does not flag an answer that cites evidence as generic', () => {
  const issues = diagnoseAnswer({
    question: '请介绍您的嵌入式软件调试方法。',
    answer: '日志缓冲区改为环形队列后，动态分配减少，内存占用降低。',
    entries,
    evidenceIds: ['fact.mem'],
  });
  assert.deepEqual(issues, []);
});

test('flags a generic answer even when an evidence id is attached but unused', () => {
  const issues = diagnoseAnswer({
    question: '请介绍您的内存优化项目。',
    answer: '优化通常要先分析瓶颈，再逐步修改并回归测试。',
    entries,
    evidenceIds: ['fact.mem'],
  });
  assert.equal(issues[0].type, 'generic-answer');
});

test('flags a missing requested responsibility detail', () => {
  const issues = diagnoseAnswer({
    question: 'SPI 通信异常时您负责哪些恢复措施？',
    answer: '我会复位状态机，并重新初始化 SPI 外设。',
    entries,
    evidenceIds: ['fact.spi.recovery'],
    expectedDetailTerms: ['重试次数', '重发'],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'missing-detail');
  assert.equal(issues[0].severity, 'medium');
  assert.ok(issues[0].explanation.includes('重试次数'));
});

test('flags a responsibility question answered without any responsibility language', () => {
  const issues = diagnoseAnswer({
    question: '请说明您负责哪些模块。',
    answer: '固件采用分层架构，模块间通过消息队列解耦。',
    entries,
    evidenceIds: ['fact.mem'],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'missing-detail');
});

test('conservatively flags the 【需本人补充】 placeholder as a knowledge gap', () => {
  const issues = diagnoseAnswer({
    question: '请介绍您的区块链项目经验。',
    answer: '区块链项目我没有实际经验，资料中也没有记录。【需本人补充】',
    entries,
    evidenceIds: [],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'knowledge-gap');
  assert.equal(issues[0].severity, 'high');
  assert.ok(issues[0].explanation.includes('需本人补充'));
});

test('allows the placeholder only inside the cannot-fiction section', () => {
  const issues = diagnoseAnswer({
    question: '请介绍内存优化。',
    answer: '【口述版回答】\n我把日志缓冲区改成环形队列。\n【结合我的项目】\n环形队列减少动态分配。\n【可能追问】\n如何回归？\n【不能虚构的内容】\n具体量化收益【需本人补充】',
    entries,
    evidenceIds: ['fact.mem'],
  });
  assert.ok(!issues.some((item) => item.type === 'knowledge-gap'));
});

test('still flags the placeholder in spoken, project, or unsectioned text', () => {
  for (const answer of [
    '【口述版回答】\n具体收益【需本人补充】\n【不能虚构的内容】\n无',
    '【结合我的项目】\n团队规模【需本人补充】\n【不能虚构的内容】\n无',
    '具体收益【需本人补充】',
  ]) {
    const issues = diagnoseAnswer({ question: '请介绍项目。', answer, entries, evidenceIds: [] });
    assert.equal(issues[0]?.type, 'knowledge-gap');
    assert.equal(issues[0]?.severity, 'high');
  }
});

test('checks only the spoken section and flags a normal answer over 55 units', () => {
  const longSpoken = '我负责日志模块并通过环形队列减少动态分配同时补充监控告警回归测试故障复盘接口校验性能分析内存检查线程同步异常恢复版本发布风险控制持续验证';
  const issues = diagnoseAnswer({
    question: '请介绍你的工作方法。',
    answer: `【口述版回答】\n${longSpoken}\n【结合我的项目】\n${'项目资料'.repeat(80)}\n【可能追问】\n无\n【不能虚构的内容】\n无`,
    entries,
    evidenceIds: ['fact.mem'],
  });
  const overlong = issues.find((item) => item.type === 'overlong-answer');
  assert.equal(overlong?.severity, 'medium');
  assert.match(overlong?.explanation ?? '', />\s*55|超过\s*55/);
});

test('does not count other recognized sections when the spoken section is absent', () => {
  const longText = '项'.repeat(120);
  const sectioned = diagnoseAnswer({
    question: '请介绍工作方法。',
    answer: `【结合我的项目】\n${longText}\n【可能追问】\n如何验证？`,
    entries: [],
    evidenceIds: [],
  });
  assert.ok(!sectioned.some((item) => item.type === 'overlong-answer'));

  const legacy = diagnoseAnswer({ question: '请介绍工作方法。', answer: longText, entries: [], evidenceIds: [] });
  assert.ok(legacy.some((item) => item.type === 'overlong-answer'));
});

test('classifies concise budgets before applying only their upper gates', () => {
  assert.deepEqual(classifyAnswerLengthBudget('什么是 POSIX？'), { kind: 'simple', min: 15, max: 35, enforce: true });
  assert.deepEqual(classifyAnswerLengthBudget('请介绍你的工作方法。'), { kind: 'normal', min: 25, max: 55, enforce: true });
  assert.deepEqual(classifyAnswerLengthBudget('讲一个你解决团队冲突的经历。'), { kind: 'behavioral', min: 60, max: 110, enforce: true });
  for (const question of ['请做系统设计。', '请详细展开。', '请分步骤回答。', '请写代码解决。', '如何调试崩溃？', '分析这个数据结构与算法。']) {
    assert.equal(classifyAnswerLengthBudget(question).enforce, false, question);
  }

  const answerWithUnits = (units) => `【口述版回答】\n${'答'.repeat(units)}\n【结合我的项目】\n${'项目'.repeat(100)}`;
  for (const [question, accepted, rejected] of [
    ['什么是接口？', 35, 36],
    ['请介绍工作方法。', 55, 56],
    ['讲一个你解决团队冲突的经历。', 110, 111],
  ]) {
    assert.equal(countSpokenUnits('答'.repeat(accepted)), accepted);
    assert.ok(!diagnoseAnswer({ question, answer: answerWithUnits(accepted), entries: [], evidenceIds: [] }).some((item) => item.type === 'overlong-answer'));
    assert.ok(diagnoseAnswer({ question, answer: answerWithUnits(rejected), entries: [], evidenceIds: [] }).some((item) => item.type === 'overlong-answer'));
  }
});

test('does not apply the normal spoken limit to system design or detailed requests', () => {
  const longAnswer = `【口述版回答】\n${'系统设计需要说明约束容量边界故障恢复监控降级'.repeat(8)}\n【结合我的项目】\n环形队列减少动态分配。`;
  for (const question of ['请做一个系统设计。', '请详细展开你的方案。', '请分步骤说明恢复流程。']) {
    const issues = diagnoseAnswer({ question, answer: longAnswer, entries, evidenceIds: ['fact.mem'] });
    assert.ok(!issues.some((item) => item.type === 'overlong-answer'), question);
  }
});

test('detects MHz to bytes-per-second arithmetic errors above five percent', () => {
  const arithmeticEntries = [{
    id: 'fact.clock', title: '采样时钟', content: '接口时钟为 1.125MHz。', keywords: ['接口', '时钟'], fact_status: 'resume_fact',
  }];
  const wrong = diagnoseAnswer({
    question: '如何计算接口吞吐？',
    answer: '1.125MHz 按每字节 8 位换算，得到 112.5kB/s。',
    entries: arithmeticEntries,
    evidenceIds: ['fact.clock'],
  });
  assert.equal(wrong.find((item) => item.type === 'arithmetic-error')?.severity, 'high');

  const correct = diagnoseAnswer({
    question: '如何计算接口吞吐？',
    answer: '1.125MHz 按每字节 8 位换算，得到 140.625kB/s。',
    entries: arithmeticEntries,
    evidenceIds: ['fact.clock'],
  });
  assert.ok(!correct.some((item) => item.type === 'arithmetic-error'));
  assert.ok(!correct.some((item) => item.type === 'unsupported-claim' && item.explanation.includes('140.625')));
});

test('validates bytes times fps arithmetic without duplicating unsupported claims', () => {
  const frameEntries = [{
    id: 'fact.frame', title: '帧大小', content: '每帧 2070 bytes，帧率 30fps。', keywords: ['帧大小', '帧率'], fact_status: 'resume_fact',
  }];
  const issues = diagnoseAnswer({
    question: '带宽是多少？',
    answer: '2070 bytes × 30fps，约为 62.1kB/s。',
    entries: frameEntries,
    evidenceIds: ['fact.frame'],
  });
  assert.ok(!issues.some((item) => item.type === 'arithmetic-error'));
  assert.ok(!issues.some((item) => item.type === 'unsupported-claim' && item.explanation.includes('62.1')));
});

test('handles arithmetic units and the five-percent boundary conservatively', () => {
  const clock = [{ id: 'clock', title: 'bit rate', content: '原始比特率 0.8MHz。', keywords: ['比特率'], fact_status: 'resume_fact' }];
  const diagnose = (answer) => diagnoseAnswer({ question: '换算速率。', answer, entries: clock, evidenceIds: ['clock'] });
  assert.ok(!diagnose('原始比特率 0.8MHz 换算为 105kB/s。').some((item) => item.type === 'arithmetic-error'));
  assert.ok(diagnose('原始比特率 0.8MHz 换算为 105.1kB/s。').some((item) => item.type === 'arithmetic-error'));
  assert.ok(!diagnose('原始比特率 0.8MHz 换算为 800kb/s。').some((item) => item.type === 'arithmetic-error'));

  const onePointOneTwoFive = [{ id: 'clock2', title: 'bit rate', content: '原始比特率 1.125MHz。', keywords: ['比特率'], fact_status: 'resume_fact' }];
  const kib = diagnoseAnswer({ question: '换算速率。', answer: '原始比特率 1.125MHz 换算约为 137.329KiB/s。', entries: onePointOneTwoFive, evidenceIds: ['clock2'] });
  assert.ok(!kib.some((item) => item.type === 'arithmetic-error'));
});

test('distinguishes bare bytes and bits per second in arithmetic checks', () => {
  const clock = [{ id: 'clock-bare', title: 'bit rate', content: '原始比特率 1.125MHz。', keywords: ['比特率'], fact_status: 'resume_fact' }];
  const diagnoseClock = (answer) => diagnoseAnswer({ question: '换算速率。', answer, entries: clock, evidenceIds: ['clock-bare'] });
  assert.ok(!diagnoseClock('原始比特率 1.125MHz 换算为 140625B/s。').some((item) => item.type === 'arithmetic-error'));
  assert.ok(diagnoseClock('原始比特率 1.125MHz 换算为 112500B/s。').some((item) => item.type === 'arithmetic-error'));
  assert.ok(!diagnoseClock('原始比特率 1.125MHz 换算为 1125000b/s。').some((item) => item.type === 'arithmetic-error'));
  assert.ok(diagnoseClock('原始比特率 1.125MHz 换算为 140625b/s。').some((item) => item.type === 'arithmetic-error'));

  const frames = [{ id: 'frame-bare', title: 'frame rate', content: '每帧 2070 bytes，帧率 30fps。', keywords: ['帧率'], fact_status: 'resume_fact' }];
  const frameIssues = diagnoseAnswer({ question: '换算带宽。', answer: '2070 bytes × 30fps，对应 62100B/s。', entries: frames, evidenceIds: ['frame-bare'] });
  assert.ok(!frameIssues.some((item) => item.type === 'arithmetic-error'));
  assert.ok(!frameIssues.some((item) => item.type === 'unsupported-claim' && item.explanation.includes('62100')));
});

test('pairs an explicit SPI raw-bandwidth calculation when the sentence has multiple outputs', () => {
  const spiEvidence = [{
    id: 'spi-bandwidth',
    title: 'SPI 参数',
    content: '当前 SPI 是 MODE0、8bit、1.125MHz，另一项估算为 2KB×30=60KB/s。',
    keywords: ['SPI', '带宽'],
    fact_status: 'resume_fact',
  }];
  const diagnose = (answer) => diagnoseAnswer({ question: 'SPI 带宽是多少？', answer, entries: spiEvidence, evidenceIds: ['spi-bandwidth'] });
  const wrong = diagnose('当前 SPI 是 MODE0、8bit、1.125MHz，裸带宽约 112.5KB/s，2KB×30=60KB/s 加上协议开销。');
  assert.equal(wrong.find((item) => item.type === 'arithmetic-error')?.severity, 'high');

  const correct = diagnose('当前 SPI 是 MODE0、8bit、1.125MHz，裸带宽约 140.625KB/s，2KB×30=60KB/s 加上协议开销。');
  assert.ok(!correct.some((item) => item.type === 'arithmetic-error'));
  assert.ok(!correct.some((item) => item.type === 'unsupported-claim' && item.explanation.includes('140.625')));
});

test('emits exactly one arithmetic error when local SPI and general rules both match', () => {
  const clock = [{ id: 'spi-one', title: 'SPI rate', content: 'SPI 原始比特率 1MHz。', keywords: ['SPI'], fact_status: 'resume_fact' }];
  const issues = diagnoseAnswer({
    question: 'SPI 带宽是多少？',
    answer: 'SPI 原始比特率 1MHz 换算为100kB/s。',
    entries: clock,
    evidenceIds: ['spi-one'],
  });
  assert.equal(issues.filter((item) => item.type === 'arithmetic-error').length, 1);
});

test('grounds only the numeric occurrence that is the verified derived result', () => {
  const clock = [{
    id: 'tiny-clock', title: '原始比特率', content: '原始比特率 0.0008MHz。', keywords: ['比特率'], fact_status: 'resume_fact',
  }];
  const combined = diagnoseAnswer({
    question: '请说明换算和团队情况。',
    answer: '原始比特率0.0008MHz换算为100B/s；项目团队有100人。',
    entries: clock,
    evidenceIds: ['tiny-clock'],
  });
  const unsupported = combined.filter((item) => item.type === 'unsupported-claim');
  assert.equal(unsupported.length, 1);
  assert.match(unsupported[0].explanation, /100/);

  const standalone = diagnoseAnswer({
    question: '团队多少人？', answer: '项目团队有100人。', entries: clock, evidenceIds: ['tiny-clock'],
  });
  assert.ok(standalone.some((item) => item.type === 'unsupported-claim'));

  const sameClause = diagnoseAnswer({
    question: '请说明换算和团队情况。',
    answer: '原始比特率0.0008MHz换算为100B/s，同时项目团队有100人。',
    entries: clock,
    evidenceIds: ['tiny-clock'],
  });
  assert.ok(sameClause.some((item) => item.type === 'unsupported-claim'));
});

test('does not infer arithmetic from ambiguous clocks, multiple groups, or cross-sentence numbers', () => {
  for (const answer of [
    'CPU 主频是 1.125MHz，结果是 112.5kB/s。',
    'DDR 双通道时钟 1.125MHz 换算为 112.5kB/s。',
    '原始比特率是 1.125MHz。下一步得到 112.5kB/s。',
    '原始比特率有 1.125MHz 和 2MHz，换算为 112.5kB/s。',
    '只有原始比特率 1.125MHz，尚无换算结果。',
  ]) {
    const issues = diagnoseAnswer({ question: '说明参数。', answer, entries: [], evidenceIds: [] });
    assert.ok(!issues.some((item) => item.type === 'arithmetic-error'), answer);
  }
});

test('flags strong implementation claims that cross a protected evidence boundary', () => {
  const protectedEntries = [{
    id: 'fact.proposal',
    title: '并发建议',
    content: '建议采用共享内存和信号量完成进程间同步，具体实现仍需确认。',
    keywords: ['共享内存', '信号量', '同步'],
    fact_status: 'prepared_answer',
  }];
  const issues = diagnoseAnswer({
    question: '项目如何做进程同步？',
    answer: '项目里有共享内存和信号量，我已经实现了进程同步。',
    entries: protectedEntries,
    evidenceIds: ['fact.proposal'],
  });
  assert.equal(issues.find((item) => item.type === 'evidence-boundary')?.severity, 'high');

  const conservative = diagnoseAnswer({
    question: '可以如何做进程同步？',
    answer: '可以采用共享内存和信号量完成进程同步，但仍需确认。',
    entries: protectedEntries,
    evidenceIds: ['fact.proposal'],
  });
  assert.ok(!conservative.some((item) => item.type === 'evidence-boundary'));
});

test('limits evidence boundaries to guarded clauses and non-modal strong claims', () => {
  const mixed = [{
    id: 'mixed', title: '并发设计',
    content: '项目已确认使用共享内存，建议采用信号量。',
    keywords: ['共享内存', '信号量'], fact_status: 'prepared_answer',
  }];
  const check = (answer) => diagnoseAnswer({ question: '项目怎么同步？', answer, entries: mixed, evidenceIds: ['mixed'] });
  assert.ok(!check('项目里有共享内存。').some((item) => item.type === 'evidence-boundary'));
  assert.ok(check('我实现了信号量。').some((item) => item.type === 'evidence-boundary'));
  for (const safe of [
    '项目可以采用信号量。',
    '如果需要，我会采用信号量。',
    '项目尚未确认是否实现信号量。',
    '项目没有实现信号量。',
    '不能说项目已经实现信号量。',
    '这不代表项目已经实现信号量。',
    '这并非项目已经实现信号量。',
    '这不是已实现信号量。',
  ]) {
    assert.ok(!check(safe).some((item) => item.type === 'evidence-boundary'), safe);
  }

  const technical = [{ id: 'tech', title: '参数建议', content: '建议配置 DMA_RING_SIZE。', keywords: ['DMA_RING_SIZE'], fact_status: 'prepared_answer' }];
  const issue = diagnoseAnswer({ question: '参数是什么？', answer: '项目里有 DMA_RING_SIZE。', entries: technical, evidenceIds: ['tech'] });
  assert.ok(issue.some((item) => item.type === 'evidence-boundary'));

  const englishComma = [{ id: 'mixed-en', title: '并发设计', content: '项目已确认使用共享内存, 建议采用信号量。', keywords: ['共享内存', '信号量'], fact_status: 'prepared_answer' }];
  const safe = diagnoseAnswer({ question: '项目怎么同步？', answer: '项目里有共享内存。', entries: englishComma, evidenceIds: ['mixed-en'] });
  assert.ok(!safe.some((item) => item.type === 'evidence-boundary'));

  const asymmetric = [{ id: 'guarded-pair', title: '并发建议', content: '建议采用共享内存；信号量仍需确认。', keywords: ['共享内存', '信号量'], fact_status: 'prepared_answer' }];
  const asymmetricIssues = diagnoseAnswer({
    question: '项目怎么同步？',
    answer: '项目里有共享内存，信号量仍需确认。',
    entries: asymmetric,
    evidenceIds: ['guarded-pair'],
  });
  assert.ok(asymmetricIssues.some((item) => item.type === 'evidence-boundary'));

  const proposedMemory = [{ id: 'memory-proposal', title: '内存建议', content: '建议采用共享内存。', keywords: ['共享内存'], fact_status: 'prepared_answer' }];
  for (const answer of ['项目采用共享内存。', '项目使用共享内存。', '我负责实现共享内存。']) {
    const issues = diagnoseAnswer({ question: '项目怎么通信？', answer, entries: proposedMemory, evidenceIds: ['memory-proposal'] });
    assert.ok(issues.some((item) => item.type === 'evidence-boundary'), answer);
  }
  const modalMemory = diagnoseAnswer({ question: '可以怎么通信？', answer: '项目可以采用共享内存。', entries: proposedMemory, evidenceIds: ['memory-proposal'] });
  assert.ok(!modalMemory.some((item) => item.type === 'evidence-boundary'));

  for (const [index, content] of ['应该采用共享内存。', '可以包含共享内存。', '如果需要可使用共享内存。'].entries()) {
    const guarded = [{ id: `guarded-modal-${index}`, title: '通信方案', content, keywords: ['共享内存'], fact_status: 'prepared_answer' }];
    const issues = diagnoseAnswer({ question: '项目怎么通信？', answer: '项目采用共享内存。', entries: guarded, evidenceIds: [`guarded-modal-${index}`] });
    assert.ok(issues.some((item) => item.type === 'evidence-boundary'), content);
  }
  const confirmedMemory = [{ id: 'confirmed-memory', title: '通信事实', content: '已确认项目采用共享内存。', keywords: ['共享内存'], fact_status: 'resume_fact' }];
  const confirmedIssues = diagnoseAnswer({ question: '项目怎么通信？', answer: '项目采用共享内存。', entries: confirmedMemory, evidenceIds: ['confirmed-memory'] });
  assert.ok(!confirmedIssues.some((item) => item.type === 'evidence-boundary'));

  const adviceThenFact = [{
    id: 'advice-then-fact', title: '混合证据', content: '建议优化日志，项目采用共享内存。',
    keywords: ['优化日志', '共享内存'], fact_status: 'prepared_answer',
  }];
  const confirmedTail = diagnoseAnswer({ question: '项目怎么做？', answer: '项目采用共享内存。', entries: adviceThenFact, evidenceIds: ['advice-then-fact'] });
  assert.ok(!confirmedTail.some((item) => item.type === 'evidence-boundary'));
  const protectedHead = diagnoseAnswer({ question: '项目怎么做？', answer: '项目采用优化日志。', entries: adviceThenFact, evidenceIds: ['advice-then-fact'] });
  assert.ok(protectedHead.some((item) => item.type === 'evidence-boundary'));

  const strongFactContinuations = [
    { content: '建议优化日志，项目里有共享内存。', advice: '优化日志', fact: '共享内存', answer: '项目里有共享内存。' },
    { content: '建议增加重试，我实现了 DMA。', advice: '增加重试', fact: 'DMA', answer: '我实现了 DMA。' },
    { content: '建议调整布局，项目已经完成异常恢复。', advice: '调整布局', fact: '异常恢复', answer: '项目已经完成异常恢复。' },
  ];
  for (const [index, item] of strongFactContinuations.entries()) {
    const evidence = [{
      id: `strong-tail-${index}`, title: '混合证据', content: item.content,
      keywords: [item.advice, item.fact], fact_status: 'prepared_answer',
    }];
    const factIssues = diagnoseAnswer({ question: '项目怎么做？', answer: item.answer, entries: evidence, evidenceIds: [`strong-tail-${index}`] });
    assert.ok(!factIssues.some((issue) => issue.type === 'evidence-boundary'), item.content);
    const adviceIssues = diagnoseAnswer({ question: '项目怎么做？', answer: `项目采用${item.advice}。`, entries: evidence, evidenceIds: [`strong-tail-${index}`] });
    assert.ok(adviceIssues.some((issue) => issue.type === 'evidence-boundary'), `advice: ${item.content}`);
  }

  const enumeratedGuard = [{
    id: 'guarded-fields',
    title: '共享内存答题',
    content: '共享内存答题应包含创建、定容、映射和销毁流程，以及魔数、版本、长度、序号、状态和异常恢复。真实容量仍需确认。',
    keywords: ['共享内存', '创建', '映射', '销毁', '异常恢复'],
    fact_status: 'prepared_answer',
  }];
  const enumeratedIssues = diagnoseAnswer({
    question: '共享内存里有哪些字段？',
    answer: '回答要点：项目里有魔数、版本、长度、序号、状态字段。',
    entries: enumeratedGuard,
    evidenceIds: ['guarded-fields'],
  });
  assert.equal(enumeratedIssues.find((item) => item.type === 'evidence-boundary')?.severity, 'high');
});

test('grounds only standalone canonical numeric claims', () => {
  const identifiers = diagnoseAnswer({
    question: '使用哪些接口和校验？',
    answer: '项目使用 SPI1、CRC32、STM32 和 I2C。',
    entries: [],
    evidenceIds: [],
  });
  assert.ok(!identifiers.some((item) => item.type === 'unsupported-claim'));

  const dottedVersions = diagnoseAnswer({
    question: '使用哪些版本？', answer: '应用版本是 v2.0，内核使用 FreeRTOS10.4.3。', entries: [], evidenceIds: [],
  });
  assert.ok(!dottedVersions.some((item) => item.type === 'unsupported-claim'));

  const compactUnits = diagnoseAnswer({
    question: '性能指标是多少？',
    answer: '延迟5ms，吞吐100MB/s，帧率30fps。',
    entries: [],
    evidenceIds: [],
  });
  const compactUnsupported = compactUnits.find((item) => item.type === 'unsupported-claim');
  assert.match(compactUnsupported?.explanation ?? '', /5.*100.*30/);

  const groupedUnsupported = diagnoseAnswer({ question: '数量是多少？', answer: '数量是 1,000。', entries: [], evidenceIds: [] });
  const groupedExplanation = groupedUnsupported.find((item) => item.type === 'unsupported-claim')?.explanation ?? '';
  assert.match(groupedExplanation, /1,000/);
  assert.doesNotMatch(groupedExplanation, /1、000/);

  const numericEvidence = [{
    id: 'canonical-numbers', title: '指标', content: '收益 5%，重试 5 次。', keywords: ['收益', '重试'], fact_status: 'resume_fact',
  }];
  const equivalent = diagnoseAnswer({
    question: '指标是多少？', answer: '收益 5.0%，重试 05 次。', entries: numericEvidence, evidenceIds: ['canonical-numbers'],
  });
  assert.ok(!equivalent.some((item) => item.type === 'unsupported-claim'));

  const groupedEquivalent = diagnoseAnswer({
    question: '数量是多少？', answer: '数量是 1,000。',
    entries: [{ id: 'plain-thousand', title: '数量', content: '数量是 1000。', keywords: ['数量'], fact_status: 'resume_fact' }],
    evidenceIds: ['plain-thousand'],
  });
  assert.ok(!groupedEquivalent.some((item) => item.type === 'unsupported-claim'));

  const percentSemantics = diagnoseAnswer({
    question: '成功率是多少？', answer: '成功率是 5%。',
    entries: [{ id: 'plain-five', title: '次数', content: '重试 5 次。', keywords: ['重试'], fact_status: 'resume_fact' }],
    evidenceIds: ['plain-five'],
  });
  assert.ok(percentSemantics.some((item) => item.type === 'unsupported-claim'));
});

test('flags an answer that cites a missing evidence id as a knowledge gap', () => {
  const issues = diagnoseAnswer({
    question: '请介绍您的蓝牙项目。',
    answer: '蓝牙项目负责连接管理。',
    entries,
    evidenceIds: ['fact.ble.ghost'],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'knowledge-gap');
  assert.deepEqual(issues[0].evidenceIds, ['fact.ble.ghost']);
});

test('marks a claim grounded only in a non-cited entry as needs-model-review', () => {
  const issues = diagnoseAnswer({
    question: '2024 年团队多少人？',
    answer: '2024 年团队共 8 人。',
    entries,
    evidenceIds: ['fact.team.2023'],
  });
  assert.ok(issues.length >= 1);
  assert.equal(issues[0].type, 'needs-model-review');
  assert.equal(issues[0].needsModelReview, true);
  assert.equal(issues[0].severity, 'low');
  assert.ok(!issues.some((issue) => issue.type === 'unsupported-claim'));
});

test('does not perform unreliable semantic contradiction detection', () => {
  // Two conflicting-but-grounded entries: the answer picks one number. The
  // deterministic module must NOT invent a fact-conflict issue — that is the
  // injected evaluator's job (plan Task 3 Step 2).
  const issues = diagnoseAnswer({
    question: '项目团队多少人？',
    answer: '2023 年团队共 5 人。',
    entries,
    evidenceIds: ['fact.team.2023', 'fact.team.2024'],
  });
  assert.ok(!issues.some((issue) => issue.type === 'fact-conflict'));
});

// ---------------------------------------------------------------------------
// suggestion-engine: reviewable suggestions that never touch the knowledge base
// ---------------------------------------------------------------------------

test('maps generic-answer to a confirmed content-changing suggestion', () => {
  const suggestion = createSuggestions([
    {
      id: 'issue-1',
      type: 'generic-answer',
      severity: 'medium',
      evidenceIds: ['fact.mem'],
      explanation: '回答只有通用原理，缺少项目证据。',
      suggestedAction: 'expand-prepared-answer',
    },
  ])[0];
  assert.deepEqual(
    {
      action: suggestion.action,
      status: suggestion.status,
      requiresUserConfirmation: suggestion.requiresUserConfirmation,
      sourceIssueIds: suggestion.sourceIssueIds,
    },
    {
      action: 'expand-prepared-answer',
      status: 'proposed',
      requiresUserConfirmation: true,
      sourceIssueIds: ['issue-1'],
    },
  );
});

test('maps every issue type to a valid action with the right confirmation flag', () => {
  const cases = [
    { type: 'knowledge-gap', action: 'add-confirmed-fact', confirmation: true },
    { type: 'retrieval-miss', action: 'add-keywords', confirmation: true },
    { type: 'weak-retrieval', action: 'adjust-retrieval', confirmation: false },
    { type: 'fact-conflict', action: 'resolve-conflict', confirmation: true },
    { type: 'unsupported-claim', action: 'add-confirmed-fact', confirmation: true },
    { type: 'generic-answer', action: 'expand-prepared-answer', confirmation: true },
    { type: 'missing-detail', action: 'expand-prepared-answer', confirmation: true },
    { type: 'needs-model-review', action: 'adjust-prompt', confirmation: false },
    { type: 'overlong-answer', action: 'adjust-prompt', confirmation: false },
    { type: 'arithmetic-error', action: 'adjust-prompt', confirmation: false },
    { type: 'evidence-boundary', action: 'adjust-prompt', confirmation: false },
  ];
  const issues = cases.map((entry, index) => ({
    id: `issue-${index + 1}`,
    type: entry.type,
    severity: 'medium',
    evidenceIds: [],
    explanation: `${entry.type} 的确定性解释。`,
    suggestedAction: entry.action,
  }));
  const suggestions = createSuggestions(issues);
  cases.forEach((entry, index) => {
    const suggestion = suggestions[index];
    assert.equal(suggestion.action, entry.action, `${entry.type} action`);
    assert.equal(suggestion.requiresUserConfirmation, entry.confirmation, `${entry.type} confirmation`);
    assert.equal(suggestion.status, 'proposed');
    assert.deepEqual(suggestion.sourceIssueIds, [`issue-${index + 1}`]);
  });
});

test('every content-changing suggestion is proposed, confirmed, and sourced', () => {
  const issues = [
    { id: 'issue-1', type: 'generic-answer', severity: 'medium', evidenceIds: [], explanation: 'e', suggestedAction: 'expand-prepared-answer' },
    { id: 'issue-2', type: 'fact-conflict', severity: 'high', evidenceIds: [], explanation: 'e', suggestedAction: 'resolve-conflict' },
    { id: 'issue-3', type: 'knowledge-gap', severity: 'high', evidenceIds: [], explanation: 'e', suggestedAction: 'add-confirmed-fact' },
    { id: 'issue-4', type: 'weak-retrieval', severity: 'medium', evidenceIds: [], explanation: 'e', suggestedAction: 'adjust-retrieval' },
    { id: 'issue-5', type: 'retrieval-miss', severity: 'high', evidenceIds: [], explanation: 'e', suggestedAction: 'add-keywords' },
  ];
  const suggestions = createSuggestions(issues);
  for (const suggestion of suggestions) {
    assert.equal(suggestion.status, 'proposed');
    assert.ok(Array.isArray(suggestion.sourceIssueIds) && suggestion.sourceIssueIds.length > 0);
    assert.equal(suggestion.requiresUserConfirmation, CONTENT_CHANGING_ACTIONS.has(suggestion.action));
  }
});

test('assigns deterministic suggestion ids in output order', () => {
  const issues = [
    { id: 'issue-1', type: 'generic-answer', severity: 'medium', evidenceIds: [], explanation: 'e', suggestedAction: 'expand-prepared-answer' },
    { id: 'issue-2', type: 'weak-retrieval', severity: 'medium', evidenceIds: [], explanation: 'e', suggestedAction: 'adjust-retrieval' },
    { id: 'issue-3', type: 'needs-model-review', severity: 'low', evidenceIds: [], explanation: 'e', suggestedAction: 'adjust-prompt', needsModelReview: true },
  ];
  const suggestions = createSuggestions(issues);
  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.id),
    ['suggestion-1', 'suggestion-2', 'suggestion-3'],
  );
});

test('rejects an unknown action instead of silently inventing one', () => {
  assert.throws(
    () => createSuggestions([{ id: 'issue-x', type: 'bogus-type', severity: 'medium', evidenceIds: [], explanation: 'e', suggestedAction: 'bogus-action' }]),
    /bogus-action/,
  );
});

test('diagnoseAnswer + createSuggestions pipeline stays inside the contract', () => {
  const issues = diagnoseAnswer({
    question: '请介绍您的嵌入式软件调试方法。',
    answer: '调试时先复现现象，再通过断点和日志定位问题。',
    entries,
    evidenceIds: [],
  });
  const suggestions = createSuggestions(issues);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].action, 'expand-prepared-answer');
  assert.equal(suggestions[0].requiresUserConfirmation, true);
  assert.deepEqual(suggestions[0].sourceIssueIds, [issues[0].id]);
});
