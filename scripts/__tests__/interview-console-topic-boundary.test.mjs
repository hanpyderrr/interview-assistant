import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewConsolePrompt } from '../../src/interview-console/interviewPrompt.ts';

test('all seniority levels preserve HR topic boundaries despite technical retrieval/context', () => {
  for (const level of ['student', 'mid', 'senior']) {
    const prompt = buildInterviewConsolePrompt('你上学累不累？', '示例资料：数据库项目、SLO。', '上一题讨论了索引。', level);
    assert.match(prompt, /技术问题才应用/);
    assert.match(prompt, /HR|综合素质/);
    assert.match(prompt, /不得.*(?:硬套|强行).*(?:技术|项目)/);
    assert.match(prompt, /不能.*(?:推断|编造).*(?:爱好|感受)/);
    assert.match(prompt, /当前问题.*优先/);
    assert.doesNotMatch(prompt, /上一题讨论了索引/);
  }
});

test('a bare follow-up may carry the previous technical topic', () => {
  const prompt = buildInterviewConsolePrompt('那为什么？', '示例资料：数据库项目、SLO。', '上一题讨论了索引。', 'student');
  assert.match(prompt, /上一题讨论了索引/);
});

test('ADC knowledge uses the technical route without inheriting the preceding HR topic', () => {
  const prompt = buildInterviewConsolePrompt('那 ADC 采样精度受哪些因素影响？', '', '上一题讨论了学习压力。', 'student');
  assert.match(prompt, /当前题型：technical/);
  assert.doesNotMatch(prompt, /上一题讨论了学习压力/);
  assert.match(prompt, /通用技术知识[^。]*不[^。]*参考表达/);
  assert.match(prompt, /仅当[^。]*个人[^。]*参考表达/);
});
