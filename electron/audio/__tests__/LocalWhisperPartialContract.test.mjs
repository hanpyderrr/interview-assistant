import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const compiledPath = path.resolve(__dirname, '../../../dist-electron/electron/audio/LocalWhisperSTT.js');
const { LocalWhisperSTT } = require(compiledPath);

test('streaming partial carries the current VAD segment id', () => {
  const stt = new LocalWhisperSTT('onnx-community/moonshine-tiny');
  stt.segmentIdBase = 5;
  stt.segmentSequence = 5;
  stt.trackedSegmentId = 7;
  stt.skipAgreement = true;
  const events = [];
  stt.on('transcript', (event) => events.push(event));

  stt.handleStreamingPartial('partial question');

  assert.equal(events.length, 1);
  assert.equal(events[0].isFinal, false);
  assert.equal(events[0].segmentId, 12);
  const final = stt.normalizeSegment({
    samples: new Float32Array(1600),
    durationMs: 100,
    sequenceId: 7,
    startMs: 0,
    endMs: 100,
  });
  assert.equal(final.sequenceId, events[0].segmentId);
});
