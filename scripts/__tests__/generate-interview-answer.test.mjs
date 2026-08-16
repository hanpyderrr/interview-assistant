import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatRequest, extractAnswer, generateAnswer } from '../generate-interview-answer.mjs';

const request = { system: '系统提示', user: '面试官问题：请介绍项目' };

test('builds an OpenAI-compatible request without credentials', () => {
  assert.deepEqual(buildChatRequest(request, 'gpt-test'), {
    model: 'gpt-test',
    messages: [
      { role: 'system', content: '系统提示' },
      { role: 'user', content: '面试官问题：请介绍项目' },
    ],
    temperature: 0.2,
  });
});

test('extracts the first chat completion answer', () => {
  assert.equal(extractAnswer({ choices: [{ message: { content: '回答内容' } }] }), '回答内容');
});

test('sends request and returns answer with injected fetch', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, async json() { return { choices: [{ message: { content: '云端回答' } }] }; } };
  };
  const result = await generateAnswer(request, {
    baseUrl: 'https://example.test/v1',
    apiKey: 'secret-not-printed',
    model: 'model-test',
    fetchImpl,
    signal,
  });
  assert.equal(result.answer, '云端回答');
  assert.equal(calls[0].url, 'https://example.test/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-not-printed');
  assert.equal(calls[0].options.signal, signal);
});

test('rejects an unsuccessful provider response', async () => {
  await assert.rejects(
    generateAnswer(request, {
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret',
      fetchImpl: async () => ({ ok: false, status: 429, async text() { return 'rate limited'; } }),
    }),
    /provider request failed \(429\)/,
  );
});
