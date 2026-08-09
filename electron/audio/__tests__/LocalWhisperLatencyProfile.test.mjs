import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const compiledPath = path.resolve(__dirname, '../../../dist-electron/electron/audio/LocalWhisperSTT.js');
const { LocalWhisperSTT } = require(compiledPath);

test('Whisper streaming profile starts partial inference sooner without changing agreement', () => {
  const stt = new LocalWhisperSTT('Xenova/whisper-tiny');

  assert.equal(stt.streamingIntervalBaseMs, 1000);
  assert.equal(stt.streamingMinAudioMs, 500);
  assert.equal(stt.skipAgreement, false);
});

test('Moonshine keeps its streaming-native profile', () => {
  const stt = new LocalWhisperSTT('onnx-community/moonshine-tiny');

  assert.equal(stt.streamingIntervalBaseMs, 750);
  assert.equal(stt.streamingMinAudioMs, 400);
  assert.equal(stt.skipAgreement, true);
});
