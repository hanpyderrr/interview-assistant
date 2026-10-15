// Regression tests for natural TOF continuation questions that lost their
// retained project, plus the fail-closed boundaries around them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInterviewQuestion } from '../questionIntent.ts';
import {
  detectInterviewProjects,
  resolveInterviewScope,
} from '../interviewScope.ts';

// The failing session profile: AI / Agent direction whose retained project is
// TOF because the first question explicitly named it.
const AI = { company: '', position: '', role: 'ai_agent', defaultProjectId: 'genealogy_agent' };
const RETAINED_TOF = ['tof'];
const EMBEDDED = { company: '', position: '', role: 'embedded_linux', defaultProjectId: 'tof' };

test('recorded component and implementation follow-ups retain the current project', () => {
  for (const question of [
    '为什么不直接在RK3568上采集相机并计算深度，而是多加一台N97？这套双平台设计解决了什么限制，又增加了什么代价？',
    '接着讲你提到的SPI传输：谁是主机、谁是从机？一帧深度数据有哪些字段，如何知道一帧有多长，当前链路有没有确认和重传？',
    '你说RK3568是从机，是直接使用RK的原生SPI控制器，还是中间有适配设备？另外刚才的表述像是只有v2带CRC，v1也有CRC校验吗？请按实际实现确认。',
    '你刚才说一边用rename，另一边用flock。如果把RK3568也改成每帧rename新文件，然后读写双方各自打开received.dat再加flock，会不会仍然安全？为什么？',
    '你说改成双路同源外触发后复测通过。请具体说通过是看到了哪些现象或指标？如何证明两路同步正常，而不是仅仅SDK函数返回成功？没有实测记录的数值不要补。',
  ]) {
    const route = classifyInterviewQuestion(question);
    assert.equal(route.intent, 'follow_up', question);
    assert.equal(route.carryPreviousTopic, true, question);
    assert.equal(route.allowTechnicalEvidence, true, question);
    assert.deepEqual(resolveInterviewScope(question, EMBEDDED, RETAINED_TOF), { projectIds: ['tof'] }, question);
    assert.deepEqual(resolveInterviewScope(question, AI, RETAINED_TOF), { projectIds: ['tof'] }, question);
  }
});

test('context references preserve personal boundaries and explicit topic switches', () => {
  for (const question of [
    '那你上学累不累？',
    '那你最近压力大，怎么调节？',
    '那学习 SPI 有什么心得？',
    '那先不聊技术，说说你的兴趣。',
    '你刚才提到SPI，学习它有什么心得？',
    '你说最近压力大，怎么调节？',
    '你说期望薪资如何计算？',
    '先不聊技术，讲讲刚才的方案让你有什么收获。',
  ]) {
    assert.equal(classifyInterviewQuestion(question).allowTechnicalEvidence, false, question);
    assert.deepEqual(resolveInterviewScope(question, EMBEDDED, RETAINED_TOF), {}, question);
  }
  for (const question of [
    '那 ADC 采样精度受哪些因素影响？',
    '这个缓存方案怎么优化？',
    '你说说 ADC 采样精度受哪些因素影响？',
    '你说明一下SPI和I2C的区别？',
    'RK3568和N97有什么区别？',
    '这套设计旁边的zorbax呢？',
  ]) {
    assert.equal(classifyInterviewQuestion(question).carryPreviousTopic, false, question);
    assert.equal(resolveInterviewScope(question, EMBEDDED, RETAINED_TOF).projectIds, undefined, question);
  }
  assert.deepEqual(resolveInterviewScope('你刚才提到的族谱 Agent 怎么检索？', EMBEDDED, RETAINED_TOF), { projectIds: ['genealogy_agent'] });
  assert.deepEqual(resolveInterviewScope('回到自我介绍里提到的冰体温度项目，SPI怎么连接？', EMBEDDED, RETAINED_TOF), { projectIds: ['ice_temperature'] });
});

test('natural TOF continuation questions keep the retained TOF project', () => {
  const questions = [
    '为什么要拆成两台机器？不能都放在RK3568上吗？',
    '那你们进程之间怎么交换一帧数据，怎么避免读到半帧？',
    'TofFrame 的 CRC 和重同步能恢复已经丢失的数据吗？',
  ];
  for (const question of questions) {
    assert.deepEqual(
      resolveInterviewScope(question, AI, RETAINED_TOF),
      { projectIds: ['tof'] },
      question,
    );
  }
});

test('TofFrame is an explicit TOF alias, not a generic English word', () => {
  assert.deepEqual(detectInterviewProjects('TofFrame 的 CRC 怎么设计'), ['tof']);
  assert.deepEqual(detectInterviewProjects('unknown_project 和 inspired 都不要匹配'), []);
});

test('context-dependent continuations carry the previous topic', () => {
  for (const question of [
    '为什么要拆成两台机器？不能都放在RK3568上吗？',
    '那你们进程之间怎么交换一帧数据，怎么避免读到半帧？',
  ]) {
    const route = classifyInterviewQuestion(question);
    assert.equal(route.carryPreviousTopic, true, question);
    assert.equal(route.allowTechnicalEvidence, true, question);
  }
});

test('HR and reflection questions never become technical or project', () => {
  for (const question of ['你上学累不累？', '学习Java有什么心得', '学习Java有什么心得？']) {
    const route = classifyInterviewQuestion(question);
    assert.notEqual(route.intent, 'technical', question);
    assert.notEqual(route.intent, 'project', question);
    assert.deepEqual(resolveInterviewScope(question, AI, RETAINED_TOF), {}, question);
  }
});

test('generic independent technical questions do not bind the retained project', () => {
  for (const question of ['SPI是什么', 'Java垃圾回收机制是什么']) {
    assert.equal(classifyInterviewQuestion(question).intent, 'technical', question);
    assert.deepEqual(
      resolveInterviewScope(question, AI, RETAINED_TOF),
      { role: 'ai_agent' },
      question,
    );
  }
});

test('an explicit other project still switches the scope', () => {
  assert.deepEqual(
    resolveInterviewScope('那族谱 Agent 怎么检索？', AI, RETAINED_TOF),
    { projectIds: ['genealogy_agent'] },
  );
  assert.deepEqual(
    resolveInterviewScope('回到 TOF 项目，CRC16 和重同步怎么处理？', AI, RETAINED_TOF),
    { projectIds: ['tof'] },
  );
});

test('arbitrary unknown input stays fail-closed even with a retained project', () => {
  for (const question of ['嗯嗯', '。。。', 'zorbax呢', '']) {
    assert.equal(classifyInterviewQuestion(question).intent, 'unknown', question);
    assert.deepEqual(resolveInterviewScope(question, AI, RETAINED_TOF), {}, question);
  }
});

test('embedded follow-up detection still respects a named device anchor', () => {
  // A named device opens its own technical topic rather than inheriting TOF.
  assert.deepEqual(resolveInterviewScope('那 ADC 采样精度受哪些因素影响？', EMBEDDED, RETAINED_TOF), {
    role: 'embedded_linux',
  });
});

test('frame terminology alone cannot turn an independent topic into a project follow-up', () => {
  for (const question of ['TCP粘包是什么？', '能解释一下半包和粘包的区别吗？']) {
    assert.equal(classifyInterviewQuestion(question).intent, 'technical', question);
    assert.deepEqual(resolveInterviewScope(question, AI, RETAINED_TOF), { role: 'ai_agent' }, question);
  }
});

test('reflection about a contextual technical object still excludes project evidence', () => {
  const question = '学习两台机器的协作有什么心得？';
  assert.equal(classifyInterviewQuestion(question).allowTechnicalEvidence, false);
  assert.deepEqual(resolveInterviewScope(question, AI, RETAINED_TOF), {});
});
