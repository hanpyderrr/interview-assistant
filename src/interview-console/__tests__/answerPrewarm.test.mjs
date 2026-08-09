import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerPrewarmCache } from '../answerPrewarm.ts';
import { normalizeInterviewQuestion } from '../questionNormalization.ts';

test('deduplicates prewarm work for the same normalized question and context', async () => {
  let calls = 0;
  const cache = createAnswerPrewarmCache(async (question) => {
    calls += 1;
    return { success: true, context: `context:${question}`, matches: [] };
  });

  const first = cache.prewarm('  How  do I debug Linux? ', 'prior answer');
  const second = cache.prewarm('How do I debug Linux?', 'prior answer');

  assert.strictEqual(first, second);
  const result = await first;
  assert.equal(calls, 1);
  assert.match(result.prompt, /How do I debug Linux\?/);
  assert.match(result.prompt, /prior answer/);
});

test('does not consume prewarm work when question or context changes', async () => {
  const cache = createAnswerPrewarmCache(async (question) => ({
    success: true,
    context: `context:${question}`,
    matches: [],
  }));

  cache.prewarm('first question?', 'context A');
  await assert.rejects(cache.consume('second question?', 'context A'), /no prewarm/i);
  await assert.rejects(cache.consume('first question?', 'context B'), /no prewarm/i);
});

test('consuming a matching prewarm removes it from the cache', async () => {
  const cache = createAnswerPrewarmCache(async (question) => ({
    success: true,
    context: `context:${question}`,
    matches: [],
  }));

  const prewarmed = cache.prewarm('question?', 'context');
  const consumed = await cache.consume('question?', 'context');
  assert.strictEqual(await consumed, await prewarmed);
  await assert.rejects(cache.consume('question?', 'context'), /no prewarm/i);
});

test('raw SBI prewarm is consumed by its normalized SPI analysis question', async () => {
  const cache = createAnswerPrewarmCache(async (question) => ({
    success: true,
    context: `context:${question}`,
    matches: [],
  }));

  const rawQuestion = 'SBI 驱动怎么设计？';
  const prewarmed = cache.prewarm(rawQuestion, 'context');
  const consumed = await cache.consume(normalizeInterviewQuestion(rawQuestion), 'context');

  assert.strictEqual(await consumed, await prewarmed);
  assert.match((await consumed).context, /SPI/);
});
