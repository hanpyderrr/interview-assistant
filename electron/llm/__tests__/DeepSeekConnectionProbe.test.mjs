import test from 'node:test';
import assert from 'node:assert/strict';
import { testDeepseekConnection } from '../testDeepseekConnection.ts';

test('connection check requires visible streaming content and disables thinking', async () => {
  let request, signal;
  const client = { chat: { completions: { create: async (body, options) => {
    request = body; signal = options.signal;
    return (async function* () { yield { choices: [{ delta: { content: 'OK' } }] }; })();
  } } } };
  await testDeepseekConnection(client);
  assert.equal(request.stream, true);
  assert.deepEqual(request.thinking, { type: 'disabled' });
  assert.equal(signal.aborted, true, 'smoke test closes its request after first content');
});

test('HTTP success without useful text is a failed connection check', async () => {
  const client = { chat: { completions: { create: async () => (async function* () {
    yield { choices: [{ delta: { reasoning_content: 'hidden', content: ' ' } }] };
  })() } } };
  await assert.rejects(testDeepseekConnection(client), /未返回/);
});

test('a hung connection is bounded and aborted', async () => {
  let signal;
  const client = { chat: { completions: { create: async (_body, options) => {
    signal = options.signal; return new Promise(() => {});
  } } } };
  await assert.rejects(testDeepseekConnection(client, 20), /超时/);
  assert.equal(signal.aborted, true);
});

test('provider errors remain observable', async () => {
  const error = Object.assign(new Error('Service busy'), { status: 503 });
  const client = { chat: { completions: { create: async () => { throw error; } } } };
  await assert.rejects(testDeepseekConnection(client), e => e === error);
});
