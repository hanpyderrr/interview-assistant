import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const compiledPath = path.resolve(__dirname, '../../../dist-electron/electron/audio/whisper/meetilyVadProcessor.js');
const { MeetilyVadProcessor } = require(compiledPath);

const FRAME_SAMPLES = 480;

function frame(amplitude) {
  return Float32Array.from({ length: FRAME_SAMPLES }, () => amplitude);
}

function frames(count, amplitude) {
  const output = new Float32Array(count * FRAME_SAMPLES);
  for (let i = 0; i < count; i++) output.set(frame(amplitude), i * FRAME_SAMPLES);
  return output;
}

function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function shape(segment) {
  return {
    sequenceId: segment.sequenceId,
    startMs: segment.startMs,
    endMs: segment.endMs,
    durationMs: segment.durationMs,
  };
}

function runWithChunkPattern(pattern) {
  const vad = new MeetilyVadProcessor();
  const input = concat(
    frames(10, 0.005),
    frames(20, 0.08),
    frames(27, 0),
    frames(20, 0.08),
    frames(44, 0),
  );
  const segments = [];
  let offset = 0;
  let patternIndex = 0;
  while (offset < input.length) {
    const requested = pattern[patternIndex++ % pattern.length];
    const size = Math.min(requested, input.length - offset);
    segments.push(...vad.push(input.subarray(offset, offset + size)));
    offset += size;
  }
  segments.push(...vad.flush());
  return segments;
}

test('requires 250ms of speech and keeps 300ms pre-padding', () => {
  const vad = new MeetilyVadProcessor();
  const segments = vad.push(concat(frames(10, 0.005), frames(20, 0.08), frames(44, 0)));
  assert.equal(segments.length, 1);
  assert.equal(segments[0].startMs, 0);
  assert.equal(segments[0].endMs, 2100);
  assert.equal(segments[0].durationMs, 1320);
  assert.ok((segments[0].confidence ?? 0) > 0.5);
});

test('redemption bridges an 810ms natural pause and closes after 1200ms', () => {
  const vad = new MeetilyVadProcessor();
  const segments = vad.push(concat(
    frames(10, 0.005),
    frames(20, 0.08),
    frames(27, 0),
    frames(20, 0.08),
    frames(44, 0),
  ));
  assert.equal(segments.length, 1);
  assert.equal(segments[0].startMs, 0);
  assert.equal(segments[0].endMs, 3510);
  assert.equal(segments[0].durationMs, 2730);
});

test('closes at the configured 1200ms redemption boundary', () => {
  const vad = new MeetilyVadProcessor();
  const segments = vad.push(concat(frames(20, 0.08), frames(40, 0)));
  assert.equal(segments.length, 1);
  assert.equal(segments[0].endMs, 1800);
});

test('natural segment boundaries never reuse post-padding in the next pre-roll', () => {
  const vad = new MeetilyVadProcessor();
  const segments = vad.push(concat(
    frames(20, 0.08),
    frames(41, 0),
    frames(20, 0.08),
    frames(44, 0),
  ));
  const all = [...segments, ...vad.flush()];
  assert.equal(all.length, 2);
  assert.ok(all[1].startMs >= all[0].endMs);
});

test('softCommit starts the next segment without overlapping tail audio', () => {
  const vad = new MeetilyVadProcessor();
  vad.push(frames(40, 0.08));
  const first = vad.softCommit();
  vad.push(frames(20, 0.08));
  const second = vad.softCommit();
  assert.equal(first?.sequenceId, 1);
  assert.equal(second?.sequenceId, 2);
  assert.ok((second?.startMs ?? 0) >= (first?.endMs ?? 0));
});

test('a final is stamped with the identity of the open segment, not an independent counter', () => {
  const vad = new MeetilyVadProcessor();
  vad.push(frames(12, 0.08));
  assert.equal(vad.currentSegmentId(), 1);
  vad.sequenceIdCounter = 41;
  assert.equal(vad.flush()[0]?.sequenceId, 1);
});

test('arbitrary chunk boundaries produce the same segment boundaries', () => {
  const whole = runWithChunkPattern([999999]).map(shape);
  const split = runWithChunkPattern([20, 100, 1920, 480, 777]).map(shape);
  assert.deepEqual(split, whole);
});

test('flush emits the final tail once and reset restarts sequence ids', () => {
  const vad = new MeetilyVadProcessor();
  vad.push(frames(12, 0.08));
  const first = vad.flush()[0];
  assert.equal(first?.sequenceId, 1);
  assert.equal(vad.flush().length, 0);
  vad.reset();
  vad.push(frames(12, 0.08));
  assert.equal(vad.flush()[0]?.sequenceId, 1);
});
