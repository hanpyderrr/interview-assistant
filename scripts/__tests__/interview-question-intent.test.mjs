import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyInterviewQuestion,
  isSelfIntroductionQuestion,
} from '../../src/interview-console/questionIntent.ts';

// Default evidence/carry flags implied by each intent. A case may override any
// flag when negation or context changes the route (see CASES below).
const FLAGS = {
  technical: { carryPreviousTopic: false, allowTechnicalEvidence: true, allowPersonalEvidence: false },
  project: { carryPreviousTopic: false, allowTechnicalEvidence: true, allowPersonalEvidence: true },
  behavioral: { carryPreviousTopic: false, allowTechnicalEvidence: false, allowPersonalEvidence: true },
  personal: { carryPreviousTopic: false, allowTechnicalEvidence: false, allowPersonalEvidence: true },
  mixed: { carryPreviousTopic: false, allowTechnicalEvidence: true, allowPersonalEvidence: true },
  follow_up: { carryPreviousTopic: true, allowTechnicalEvidence: true, allowPersonalEvidence: true },
  unknown: { carryPreviousTopic: false, allowTechnicalEvidence: false, allowPersonalEvidence: false },
};

test('a self introduction focused on project experience still uses personal evidence', () => {
  for (const question of [
    '你好，请用一分钟做个自我介绍，重点说一下与你应聘嵌入式软件工程师相关的项目经历。',
    '请做一下自我介绍。',
    '请介绍一下自己，重点讲讲 TOF 和冰体温度采集项目经历。',
  ]) {
    assert.equal(isSelfIntroductionQuestion(question), true, question);
    assert.deepEqual(classifyInterviewQuestion(question), { intent: 'personal', ...FLAGS.personal }, question);
  }
});

test('a project mentioned in an earlier introduction is a project question', () => {
  for (const question of [
    '再回到你自我介绍里提到的冰体温度采集项目：STM32F767、PT1000和MAX31865之间怎么连接？总共设计多少个测点，目前实际跑通了多少路，用的是RTOS任务还是裸机循环？',
    '你自我介绍中提到的 TOF 项目，SPI 链路怎么连接？',
    '你自我介绍提到的项目使用了什么协议？',
  ]) {
    assert.equal(isSelfIntroductionQuestion(question), false, question);
    assert.deepEqual(classifyInterviewQuestion(question), { intent: 'project', ...FLAGS.project }, question);
  }
});

const CASES = [
  // --- Negative technical: HR / life / motivation must never default to technical.
  ['你上学累不累？', 'personal'],
  ['这学期上学有什么心得？', 'personal'],
  ['你有什么兴趣爱好？', 'personal'],
  ['平时喜欢做什么运动？', 'personal'],
  ['为什么选择我们公司？', 'personal'],
  ['你最大的优点是什么？', 'personal'],
  ['你怎么看待加班？', 'personal'],
  ['你的职业规划是什么？', 'personal'],
  ['学 ADC 累不累？', 'personal'],
  ['学 STM32 有什么心得？', 'personal'],
  ['学习单片机时压力大怎么办？', 'behavioral'],
  // Technical word false-trigger: contains "技术" but is a personal motivation question.
  ['你为什么选择做技术这一行？', 'personal'],
  ['你觉得自己最大的技术优势是什么？', 'personal'],
  // Software/hardware names must NOT override an explicit reflection / HR ask.
  ['学习Java有什么心得', 'personal'],
  ['学 Java 有什么收获？', 'personal'],
  ['What did you learn from studying Java?', 'personal'],
  // A technical action verb alone is still HR (salary), not a technical question.
  ['如何计算期望薪资', 'personal'],
  // Stress / coping is behavioral, not technical.
  ['最近压力大怎么办？', 'behavioral'],
  ['工作压力大的时候你怎么调节？', 'behavioral'],
  ['How do you deal with stress?', 'behavioral'],

  // --- Behavioral (past behavior, conflict, failure, collaboration).
  ['和同学发生分歧怎么办？', 'behavioral'],
  ['说一次你的失败经历。', 'behavioral'],
  ['你平时如何协作？', 'behavioral'],
  ['讲一个你遇到挫折的故事。', 'behavioral'],
  ['当你和同事有冲突时怎么处理？', 'behavioral'],
  ['你是如何带领团队完成目标的？', 'behavioral'],
  ['和别人合作时意见不一致怎么办？', 'behavioral'],
  ['请分享一次你被拒绝的经历。', 'behavioral'],

  // --- Technical (terms, algorithms, system design, troubleshooting).
  ['讲一下 HashMap 的实现原理。', 'technical'],
  ['如何设计一个高并发秒杀系统？', 'technical'],
  ['线上故障怎么排查？', 'technical'],
  ['说说 MySQL 索引的底层结构。', 'technical'],
  ['手写一个二分查找。', 'technical'],
  ['这个接口的 QPS 怎么优化？', 'technical'],
  ['分布式事务一致性怎么保证？', 'technical'],
  ['Redis 缓存击穿怎么解决？', 'technical'],
  ['多线程死锁怎么定位？', 'technical'],
  ['时间复杂度怎么分析？', 'technical'],
  ['请解释 RAG 如何减少大模型幻觉。', 'technical'],
  ['ADC采样精度受哪些因素影响', 'technical'],
  ['那 ADC 采样精度受哪些因素影响？', 'technical'],
  ['UART和SPI有什么区别？', 'technical'],
  ['I2C为什么需要上拉电阻？', 'technical'],
  ['DMA怎么搬运数据？', 'technical'],
  ['STM32F767 的 ADC 怎么配置？', 'technical'],
  ['中断和轮询有什么区别？', 'technical'],
  ['采样保持时间不足会怎么样？', 'technical'],
  ['那量化误差是什么？', 'technical'],
  // Scientific/engineering knowledge is technical even without a named device.
  ['如何计算信噪比', 'technical'],
  ['信噪比怎么算？', 'technical'],
  // English technical must stay technical.
  ['How does garbage collection work in Java?', 'technical'],

  // --- Project (explicit project-experience phrasing).
  ['介绍一下你负责的订单项目。', 'project'],
  ['讲讲你做过的项目。', 'project'],
  ['你在这个项目里负责哪些模块？', 'project'],
  ['你最有成就感的项目经历是什么？', 'project'],

  // --- Mixed (two separate asks: a technical solution AND a personal/collab ask).
  ['学 ADC 压力大吗？另外采样精度受哪些因素影响？', 'mixed'],

  // --- Behavioral: a technical solution merely *framed* by team communication is a
  // single collaboration ask, not a mixed question.
  ['这个技术方案团队是怎么沟通推进的？', 'behavioral'],
  ['做系统设计的时候如何和团队协作？', 'behavioral'],
  // Merely mentioning a classmate does not turn a technical ask into mixed.
  ['和同学讨论的Java垃圾回收原理是什么', 'technical'],

  // --- Follow-up (pronoun / continuation without an independent topic).
  ['那为什么？', 'follow_up'],
  ['它怎么优化？', 'follow_up'],
  ['继续说说。', 'follow_up'],
  ['那然后呢？', 'follow_up'],
  ['它具体怎么实现的？', 'follow_up'],
  ['接着讲。', 'follow_up'],
  ['那为什么选择这个方案？', 'follow_up'],

  // --- "先不聊技术" must suppress the technical route entirely.
  ['先不聊技术。', 'personal', { allowTechnicalEvidence: false }],
  ['先不聊技术，说说算法题。', 'personal', { allowTechnicalEvidence: false }],
  ['先不聊技术，请讲讲分布式事务。', 'personal', { allowTechnicalEvidence: false }],
  ['先不聊技术，聊聊你上次做的项目。', 'project', { allowTechnicalEvidence: false }],
  ['先不聊技术，聊聊学 ADC 的时候压力大怎么办？', 'behavioral'],

  // --- Boundary refinement: a feelings ask about learning a language/technology
  // is personal, because "how do you feel about" is not a mechanism ask.
  ['How do you feel about learning Java?', 'personal'],
  // A feelings ask whose object is a -ing verb is still not a mechanism ask.
  ['How do you feel about working with Redis?', 'personal'],
  // A challenge/reflection about learning a technology is a past-experience ask,
  // even though it names a technology.
  ['What was challenging about learning Redis?', 'behavioral'],
  // Personal + technical in two independent asks is mixed, even with no behavioral signal.
  ['学习Java有什么心得？另外垃圾回收原理是什么？', 'mixed'],
  // English two-ask questions split on clause boundaries and question words.
  [
    'How does garbage collection work in Java? How do you deal with stress when learning it?',
    'mixed',
  ],
  // A service failing is a troubleshooting ask, not a personal failure story.
  ['这个Redis服务为什么失败？', 'technical'],
  // Mentioning a teammate is not a team-communication ask, so it stays technical.
  ['Explain ADC accuracy to a teammate.', 'technical'],
];

test('embedded abbreviations do not match inside unrelated English words', () => {
  for (const question of ['Do you like badminton?', 'What inspires you?']) {
    assert.equal(classifyInterviewQuestion(question).allowTechnicalEvidence, false, question);
  }
});

test('optical simulation topics enable technical retrieval and anchor a new question', () => {
  for (const question of [
    '什么是Mie散射',
    '什么是TCSPC',
    '蒙特卡罗路径数等于实际发射光子数吗',
    '独立帧确证是怎么避免选择偏差的',
    '水雾256批以后已经收敛了吗',
    '为什么点云不能补全背面',
    '那TCSPC是什么？',
    '这个Mie相函数是什么？',
    '透雾仿真做到哪一步了？',
    'fog-lidar-sim做了什么？',
  ]) {
    assert.deepEqual(classifyInterviewQuestion(question), {
      intent: 'technical', ...FLAGS.technical,
    }, question);
  }
});

test('optical terms preserve personal, behavioral and nontechnical priorities', () => {
  for (const [question, intent] of [
    ['学习Mie散射有什么心得？', 'personal'],
    ['你为什么选择研究TCSPC？', 'personal'],
    ['做透雾仿真时和同学发生分歧怎么办？', 'behavioral'],
    ['先不聊技术，讲讲你做透雾仿真的感受。', 'personal'],
    ['先不聊技术，TCSPC是什么？', 'personal'],
    ['学仿真有什么心得？', 'personal'],
    ['做仿真时和同事发生分歧怎么办？', 'behavioral'],
    ['训练深度网络时压力大怎么办？', 'behavioral'],
    ['先不聊技术，讲讲做仿真的收获。', 'personal'],
  ]) {
    const route = classifyInterviewQuestion(question);
    assert.equal(route.intent, intent, question);
    assert.equal(route.allowTechnicalEvidence, false, question);
  }
});

test('optical abbreviations require ASCII token boundaries', () => {
  for (const question of [
    'Jamie?', 'spade?', 'TCSPCextra?', 'xMie?', 'fog-lidarized?',
    'Poissonextra?', 'xBonferroni?', 'MIT2018extra?', 'EMPEA2025extra?',
    'predelta tracking?', 'delta trackings?', '13x3聚合？', '3x30聚合？',
  ]) {
    assert.equal(classifyInterviewQuestion(question).allowTechnicalEvidence, false, question);
  }
});

test('simulation and statistical method questions activate technical retrieval', () => {
  for (const question of [
    'delta tracking是怎么做的？', '有限孔径为什么要单独建模？',
    '画出来的轨迹是真实探测到的光子吗？', '55皮秒每bin意味着毫米级测距精度吗？',
    '直方图最高峰能直接作为目标距离吗？', '共孔径阵列怎么做？', '泛光和扫描有什么区别？',
    '3×3聚合为什么有时变差？', '3x3聚合为什么有时变差？', '3乘3聚合为什么有时变差？',
    '邻域拟合具体怎么做？', '超几何检验怎么做？', 'Bonferroni校正的边界在哪里？',
    '背景失配会破坏误报保证吗？', '收敛标准怎么定？', 'MIT2018复现到什么程度了？',
    'EMPEA2025复现到什么程度了？', '仿真怎么做？', '从仿真迁移到真实数据怎么做？',
    '损失函数怎么选？', '首事件似然怎么用？', 'Poisson是什么？', '深度网络怎么选？',
    '训练和验证要怎么分组？', '训练验证分组怎么做？', '怎么避免数据泄漏？',
    '那有限孔径怎么做？', '这个Poisson是什么？',
  ]) {
    assert.deepEqual(classifyInterviewQuestion(question), {
      intent: 'technical', ...FLAGS.technical,
    }, question);
  }
});

test('table-driven intent classification covers at least 30 samples', () => {
  assert.ok(CASES.length >= 30, `expected >= 30 cases, got ${CASES.length}`);

  for (const [question, intent, override] of CASES) {
    const route = classifyInterviewQuestion(question);
    const expected = {
      intent,
      ...FLAGS[intent],
      ...(override ?? {}),
    };
    assert.deepEqual(
      { ...route },
      expected,
      `question should route deterministically: ${question}`,
    );
  }
});

test('English feelings are not mechanism asks and English two-ask clauses are split', () => {
  assert.equal(classifyInterviewQuestion('How do you feel about learning Java?').intent, 'personal');
  assert.equal(
    classifyInterviewQuestion('What was challenging about learning Redis?').intent,
    'behavioral',
  );
  assert.equal(
    classifyInterviewQuestion(
      'How does garbage collection work in Java? How do you deal with stress when learning it?',
    ).intent,
    'mixed',
  );
});

test('empty, unknown and non-string input routes to unknown with all evidence disabled', () => {
  const fallback = {
    intent: 'unknown',
    carryPreviousTopic: false,
    allowTechnicalEvidence: false,
    allowPersonalEvidence: false,
  };

  for (const value of ['', '   ', null, undefined, 42, true, {}, [], '嗯嗯', '。。。']) {
    assert.deepEqual(
      { ...classifyInterviewQuestion(value) },
      fallback,
      `unexpected fallback for ${JSON.stringify(value)}`,
    );
  }
});

test('unknown questions never inherit the previous topic', () => {
  for (const value of ['嗯嗯', '。。。', '???']) {
    const route = classifyInterviewQuestion(value);
    assert.equal(route.intent, 'unknown', value);
    assert.equal(route.carryPreviousTopic, false, value);
    assert.equal(route.allowTechnicalEvidence, false, value);
    assert.equal(route.allowPersonalEvidence, false, value);
  }
});

test('negated technical phrasing never enables technical evidence', () => {
  for (const question of ['先不聊技术', '咱们不谈技术', '别说技术细节']) {
    const route = classifyInterviewQuestion(question);
    assert.equal(route.allowTechnicalEvidence, false, question);
    assert.notEqual(route.intent, 'technical', question);
  }
});

test('bare pronoun follow-up carries the previous topic, anchored question does not', () => {
  const bare = classifyInterviewQuestion('它怎么优化？');
  assert.equal(bare.intent, 'follow_up');
  assert.equal(bare.carryPreviousTopic, true);

  // Same technical verb, but with an explicit independent topic anchor.
  const anchored = classifyInterviewQuestion('这个缓存方案怎么优化？');
  assert.equal(anchored.intent, 'technical');
  assert.equal(anchored.carryPreviousTopic, false);
});

test('classification is pure and deterministic', () => {
  const input = '介绍一下你负责的订单项目。';
  const first = classifyInterviewQuestion(input);
  const second = classifyInterviewQuestion(input);
  assert.deepEqual({ ...first }, { ...second });
  assert.equal(input, '介绍一下你负责的订单项目。');
});

test('root integration: motivation, fatigue and product advantages have different intents', () => {
  for (const [question, intent] of [
    ['你为什么选择学习Java？', 'personal'],
    ['学Java为什么这么累？', 'personal'],
    ['Redis有什么优点？', 'technical'],
    ['智能家居能耗监测平台的实时数据链路怎么设计？', 'technical'],
    ['数据库为什么需要索引？', 'technical'],
  ]) assert.equal(classifyInterviewQuestion(question).intent, intent, question);
});
