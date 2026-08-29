import assert from 'node:assert/strict';
import test from 'node:test';

import { createOrReuseVocabulary, hashVocabulary } from '../alibaba-funasr-vocabulary.mjs';

const vocabulary = [{ text: 'TofFrame', lang: 'en', weight: 4 }];

test('creates a vocabulary and polls until it is callable', async () => {
  const calls = [];
  const replies = [
    { output: { vocabulary_id: 'vocab-test-1' } },
    { output: { status: 'UNDEPLOYED', target_model: 'fun-asr-realtime', vocabulary } },
    { output: { status: 'OK', target_model: 'fun-asr-realtime', vocabulary } },
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => replies.shift() };
  };
  const result = await createOrReuseVocabulary({
    apiKey: 'secret-test-key', workspaceId: 'ws-test', vocabulary,
    prefix: 'ia829', state: null, fetchImpl, sleep: async () => {}, maxPolls: 3,
  });
  assert.equal(result.status, 'OK');
  assert.equal(result.vocabularyId, 'vocab-test-1');
  assert.equal(calls[0].body.input.action, 'create_vocabulary');
  assert.equal(calls[0].body.input.target_model, 'fun-asr-realtime');
  assert.equal(calls[1].body.input.action, 'query_vocabulary');
  assert.equal(JSON.stringify(result).includes('secret-test-key'), false);
  assert.equal(result.vocabularyHash, hashVocabulary(vocabulary));
});

test('reuses the matching state instead of creating a duplicate list', async () => {
  const actions = [];
  const fetchImpl = async (_url, options) => {
    actions.push(JSON.parse(options.body).input.action);
    return { ok: true, json: async () => ({ output: { status: 'OK', target_model: 'fun-asr-realtime', vocabulary } }) };
  };
  const state = { vocabularyId: 'vocab-existing', vocabularyHash: hashVocabulary(vocabulary) };
  const result = await createOrReuseVocabulary({
    apiKey: 'secret', workspaceId: 'ws-test', vocabulary, prefix: 'ia829', state, fetchImpl,
  });
  assert.deepEqual(actions, ['query_vocabulary']);
  assert.equal(result.vocabularyId, 'vocab-existing');
});

test('rejects invalid workspaces and out-of-range weights before network access', async () => {
  await assert.rejects(createOrReuseVocabulary({
    apiKey: 'x', workspaceId: 'bad.example/path', vocabulary, prefix: 'ia829', fetchImpl: async () => { throw new Error('called'); },
  }), /workspace/i);
  await assert.rejects(createOrReuseVocabulary({
    apiKey: 'x', workspaceId: 'ws-test', vocabulary: [{ text: 'x', weight: 10 }], prefix: 'ia829', fetchImpl: async () => { throw new Error('called'); },
  }), /weight/i);
});
