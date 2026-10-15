import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { suggestInterviewProfile } from '../interviewScope.ts';

const settingsPath = fileURLToPath(
  new URL('../../components/settings/InterviewAnswerSettings.tsx', import.meta.url),
);
const source = readFileSync(settingsPath, 'utf8');

test('settings offer the profile form above the prompt textarea with clear Chinese labels', () => {
  for (const label of ['公司', '岗位', '方向', '主讲项目', '未指定', '未限定', 'AI / Agent', '嵌入式 / Linux']) {
    assert.ok(source.includes(label), `missing label: ${label}`);
  }
  for (const id of [
    'interview-profile-company',
    'interview-profile-position',
    'interview-profile-role',
    'interview-profile-default-project',
    'interview-custom-prompt',
  ]) {
    assert.ok(source.includes(id), `missing control: ${id}`);
  }
  assert.ok(source.indexOf('interview-profile-company') < source.indexOf('interview-custom-prompt'));
});

test('settings keep the prompt save action and add a separate profile save with independent messages', () => {
  assert.ok(source.includes('保存提示词'));
  assert.ok(source.includes('保存面试配置'));
  assert.ok(source.includes('saveInterviewPrompt'));
  assert.ok(source.includes('saveInterviewProfile'));
  assert.ok(/profileMessage/.test(source) && /profileError/.test(source));
});

test('the extraction button only fills the draft and asks for confirmation', () => {
  assert.ok(source.includes('从补充提示词提取建议'));
  assert.ok(source.includes('请核对后保存'));
  const handler = source.slice(
    source.indexOf('function extractProfileSuggestion'),
    source.indexOf('const visibleProjects'),
  );
  assert.ok(handler.includes('suggestInterviewProfile'));
  assert.ok(handler.includes('setProfileDraft'));
  assert.ok(!handler.includes('saveInterviewProfile'), 'extraction must not persist');
});

test('suggestInterviewProfile is pure and never writes to storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let writes = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => { writes += 1; },
    },
  });
  try {
    const suggestion = suggestInterviewProfile('公司：示例公司\n岗位：AI 应用工程师\n主讲项目：族谱 Agent');
    assert.equal(suggestion.company, '示例公司');
    assert.equal(suggestion.role, 'ai_agent');
    assert.equal(suggestion.defaultProjectId, 'genealogy_agent');
    assert.equal(writes, 0);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
