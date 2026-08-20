import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const { LocalWhisperSTT } = await import(pathToFileURL(path.resolve(dirname, '../../../dist-electron/electron/audio/LocalWhisperSTT.js')).href);
const { CapturePcmTimelineMapper } = await import(pathToFileURL(path.resolve(dirname, '../../../dist-electron/electron/audio/capturePcmTimelineMapper.js')).href);

const speechFrames = () => new Float32Array(14 * 480).map((_, index) => index < (4 * 480) ? 0.02 : 0);

function throwingSegmenter(operation) {
  return {
    push() { if (operation === 'push') throw new Error('injected push failure'); return []; },
    flush() { if (operation === 'flush') throw new Error('injected flush failure'); return []; },
    peekOpenSegment() { return null; },
    softCommit() { return null; },
    reset() {},
    isInSpeech() { return false; },
    currentSegmentId() { return 0; },
  };
}

test('push fallback replays the chunk at its current compressed-axis start', () => {
  const stt = new LocalWhisperSTT('Xenova/whisper-tiny');
  const mapper = new CapturePcmTimelineMapper({ originMonotonicMs: 0 });
  mapper.appendChunk(1_000, 1_000);
  mapper.appendChunk(420, 1_420);
  stt.captureTimeline = mapper;
  stt.segmentAxisBaseMs = 0;
  stt.sessionAudioMs = 1_000;
  stt.vad = throwingSegmenter('push');
  const segment = stt.pushSegmentsWithFallback(speechFrames())[0];
  stt.sessionAudioMs += 420;
  const metadata = stt.normalizeSegment(segment);
  assert.deepEqual([metadata.startMs, metadata.endMs], [1_000, 1_420]);
});

test('flush fallback resumes at the mapper cursor rather than the meeting origin', () => {
  const stt = new LocalWhisperSTT('Xenova/whisper-tiny');
  const mapper = new CapturePcmTimelineMapper({ originMonotonicMs: 0 });
  mapper.appendChunk(1_420, 1_420);
  stt.captureTimeline = mapper;
  stt.segmentAxisBaseMs = 0;
  stt.sessionAudioMs = 1_420;
  stt.vad = throwingSegmenter('flush');
  stt.flushSegmentsWithFallback();
  assert.equal(stt.segmentAxisBaseMs, 1_420);
  assert.equal(stt.sessionAudioMs, 0);
});
