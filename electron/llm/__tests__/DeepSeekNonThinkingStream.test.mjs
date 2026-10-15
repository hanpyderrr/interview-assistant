import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dist = (file) => path.join(__dirname, '../../../dist-electron/electron', file);

const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: {
      isReady: () => true,
      getPath: () => os.tmpdir(),
      getName: () => 'natively-test',
      getVersion: () => '0.0.0-test',
    },
    shell: { openPath: async () => '' },
    ipcMain: { on: () => {}, handle: () => {}, removeAllListeners: () => {} },
    BrowserWindow: { getAllWindows: () => [] },
  },
};

const { LLMHelper } = require(dist('LLMHelper.js'));

test('DeepSeek streaming explicitly disables thinking for low-latency interactive answers', async () => {
  let capturedRequest;
  const helper = Object.create(LLMHelper.prototype);
  helper.isLocalOnlyMode = false;
  helper.currentModelId = 'deepseek-v4-flash';
  helper.rateLimiters = { deepseek: { acquire: async () => {} } };
  helper.assertOutboundScopes = () => {};
  helper.isDeepseekModel = () => true;
  helper.getDeepseekMaxOutput = () => 180;
  helper.deepseekClient = {
    chat: {
      completions: {
        create: async (request) => {
          capturedRequest = request;
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: 'ok' } }] };
            },
          };
        },
      },
    },
  };

  const chunks = [];
  for await (const chunk of helper.streamWithDeepseek('test prompt')) chunks.push(chunk);

  assert.deepEqual(capturedRequest.thinking, { type: 'disabled' });
  assert.deepEqual(chunks, ['ok']);
});

test('current provider identifies selected online DeepSeek instead of Gemini', () => {
  const helper = Object.create(LLMHelper.prototype);
  helper.currentModelId = 'deepseek-v4-flash';
  helper.useOllama = false;
  assert.equal(helper.getCurrentProvider(), 'deepseek');
});

function summaryHelper(model) {
  const helper = Object.create(LLMHelper.prototype);
  Object.assign(helper, {
    currentModelId: model, getProviderScopePolicy: () => undefined,
    hasNatively: () => false, isCodexAvailable: () => false,
    withTimeout: async promise => promise, processResponse: text => text,
    generateContent: async () => 'wrong Gemini fallback',
    generateWithFlash: async () => 'wrong Gemini fallback',
  });
  return helper;
}

for (const [model, client] of [['deepseek-v4-flash','deepseekClient'], ['gpt-4o','openaiClient']]) {
  test(`meeting summary uses the configured ${client} before other providers`, async () => {
    const helper = summaryHelper(model); helper[client] = {};
    const calls = [];
    helper.streamChat = async function* (...args) { calls.push(args); yield 'clean summary'; };
    assert.equal(await helper.generateMeetingSummary('summary prompt', 'synthetic transcript'), 'clean summary');
    assert.equal(calls.length, 1); assert.equal(calls[0][4], true);
  });
}

test('meeting summary skips Gemini retries when no Gemini client is configured', async () => {
  const helper = summaryHelper('deepseek-v4-flash');
  await assert.rejects(helper.generateMeetingSummary('summary prompt', 'synthetic transcript'), /Failed to generate summary/);
});
