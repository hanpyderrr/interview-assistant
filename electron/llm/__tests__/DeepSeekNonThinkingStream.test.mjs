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
