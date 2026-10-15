import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInterviewPrompt, saveInterviewPrompt, INTERVIEW_PROMPT_MAX_LENGTH, INTERVIEW_PROMPT_STORAGE_KEY } from '../interviewPromptSettings.ts';
import { buildInterviewConsolePrompt } from '../interviewPrompt.ts';
import { createAnswerPrewarmCache } from '../answerPrewarm.ts';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('saved instructions survive loading and reset only clears this setting', () => {
  const storage = memoryStorage();
  storage.setItem('unrelated', 'keep');
  assert.equal(loadInterviewPrompt(storage), '');
  saveInterviewPrompt('  用短句回答，先说核心理解。  ', storage);
  assert.equal(loadInterviewPrompt(storage), '用短句回答，先说核心理解。');
  saveInterviewPrompt('', storage);
  assert.equal(storage.getItem(INTERVIEW_PROMPT_STORAGE_KEY), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
});

test('invalid or oversized instructions cannot replace saved preferences', () => {
  const storage = memoryStorage();
  saveInterviewPrompt('先讲核心原理', storage);
  assert.throws(() => saveInterviewPrompt('a'.repeat(INTERVIEW_PROMPT_MAX_LENGTH + 1), storage), /最多/);
  assert.throws(() => saveInterviewPrompt(null, storage), /文本/);
  assert.equal(loadInterviewPrompt(storage), '先讲核心原理');
});

test('storage failure is reported on save, while reading retains defaults', () => {
  const broken = { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); }, removeItem() { throw Error('unavailable'); } };
  assert.equal(loadInterviewPrompt(broken), '');
  assert.throws(() => saveInterviewPrompt('简洁', broken), /unavailable/);
  assert.throws(() => saveInterviewPrompt('', broken), /unavailable/);
});

test('supplemental preferences reach prompt while factual, marker and language boundaries remain', () => {
  const custom = '优先用两句日常口语解释，再等追问。';
  const prompt = buildInterviewConsolePrompt('ADC是什么？', '', undefined, 'student', true, custom);
  assert.ok(prompt.includes(custom));
  assert.match(prompt, /用户补充提示词/);
  assert.match(prompt, /不得虚构经历/);
  assert.match(prompt, /【问题修正】/);
  assert.ok(prompt.lastIndexOf('OUTPUT LANGUAGE: English') > prompt.indexOf(custom));
  assert.doesNotMatch(buildInterviewConsolePrompt('ADC是什么？', ''), /用户补充提示词/);
});

test('newly saved instructions cannot consume a prompt warmed under old instructions', async () => {
  const cache = createAnswerPrewarmCache(async () => ({ success: true, context: '通用原理' }));
  await cache.prewarm('ADC是什么？', '', 'student', false, '先解释再举例');
  await assert.rejects(cache.consume('ADC是什么？', '', 'student', false, '只讲重点'), /no prewarm/);
  await cache.prewarm('ADC是什么？', '', 'student', false, '只讲重点');
  const result = await cache.consume('ADC是什么？', '', 'student', false, '只讲重点');
  assert.match(result.prompt, /只讲重点/);
  assert.doesNotMatch(result.prompt, /先解释再举例/);
});
