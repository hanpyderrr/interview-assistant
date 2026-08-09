import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const compiledPath = path.resolve(__dirname, '../../../dist-electron/electron/audio/LocalWhisperSTT.js');
const { LocalWhisperSTT } = require(compiledPath);

test('LocalWhisperSTT converts stored language keys to worker BCP-47 keys', () => {
  const stt = new LocalWhisperSTT('Xenova/whisper-tiny');

  stt.setRecognitionLanguage('chinese');
  assert.equal(stt.language, 'zh-CN');

  stt.setRecognitionLanguage('english-us');
  assert.equal(stt.language, 'en-US');

  stt.setRecognitionLanguage('auto');
  assert.equal(stt.language, 'auto');
});
