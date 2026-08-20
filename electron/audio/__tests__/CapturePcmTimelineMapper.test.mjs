import test from 'node:test';
import assert from 'node:assert/strict';
import { CapturePcmTimelineMapper } from '../capturePcmTimelineMapper.ts';
import { createQuestionRoundCoordinator } from '../../../src/interview-console/questionRoundCoordinator.ts';

test('maps compressed PCM offsets onto monotonic capture time across a long silence', () => {
  const mapper = new CapturePcmTimelineMapper({ originMonotonicMs: 1_000 });
  mapper.appendChunk(1_000, 2_000);
  mapper.appendChunk(1_000, 13_000);

  assert.deepEqual(mapper.mapRange(0, 1_000), { startMs: 0, endMs: 1_000 });
  assert.deepEqual(mapper.mapRange(1_000, 2_000), { startMs: 11_000, endMs: 12_000 });
  assert.equal(mapper.ledgerEntryCount, 2);
});

test('many contiguous chunks coalesce and the tail still maps without a linear ledger', () => {
  const mapper = new CapturePcmTimelineMapper({ originMonotonicMs: 1_000 });
  for (let index = 1; index <= 10_000; index++) {
    mapper.appendChunk(100, 1_000 + (index * 100));
  }
  assert.equal(mapper.ledgerEntryCount, 1);
  assert.deepEqual(mapper.mapRange(999_900, 1_000_000), { startMs: 999_900, endMs: 1_000_000 });
});

test('rolling prune hard-bounds a 10k jittered ledger while preserving the tail', () => {
  const mapper = new CapturePcmTimelineMapper({ originMonotonicMs: 1_000 });
  for (let index = 1; index <= 10_000; index++) {
    mapper.appendChunk(100, 1_000 + (index * 100.1));
    mapper.pruneBefore(Math.max(0, mapper.compressedCursorMs - 30_000));
  }
  assert.ok(mapper.ledgerEntryCount <= 302, `ledger retained ${mapper.ledgerEntryCount} entries`);
  const tail = mapper.mapRange(999_900, 1_000_000);
  assert.ok(Math.abs(tail.startMs - 1_000_900) < 0.01);
  assert.ok(Math.abs(tail.endMs - 1_001_000) < 0.01);
});

test('rolling prune preserves a retained long-silence boundary', () => {
  const mapper = new CapturePcmTimelineMapper({ originMonotonicMs: 0 });
  for (let index = 1; index <= 400; index++) {
    mapper.appendChunk(100, index * 100);
    mapper.pruneBefore(Math.max(0, mapper.compressedCursorMs - 30_000));
  }
  mapper.appendChunk(100, 50_100);
  mapper.pruneBefore(mapper.compressedCursorMs - 30_000);
  assert.equal(mapper.ledgerEntryCount, 2);
  assert.deepEqual(mapper.mapRange(40_000, 40_100), { startMs: 50_000, endMs: 50_100 });
});

test('a real ten-second silence creates an audio-gap round even with under five seconds of PCM', () => {
  const mapper = new CapturePcmTimelineMapper({ originMonotonicMs: 1_000 });
  mapper.appendChunk(1_000, 2_000);
  mapper.appendChunk(1_000, 13_000);
  const first = mapper.mapRange(0, 1_000);
  const second = mapper.mapRange(1_000, 2_000);
  let answerId = 0;
  const coordinator = createQuestionRoundCoordinator({ allocateAnswerId: () => ++answerId });
  coordinator.acceptInterviewerFinal({ text: '第一问', final: true, sessionId: 7, audioStartMs: first.startMs, audioEndMs: first.endMs, arrivalMs: 1_000 });
  coordinator.acceptInterviewerFinal({ text: '第二问', final: true, sessionId: 7, audioStartMs: second.startMs, audioEndMs: second.endMs, arrivalMs: 1_100 });
  assert.equal(coordinator.getSnapshot().boundaryReason, 'audio-gap');
  assert.equal(coordinator.getSnapshot().roundId, 2);
});

test('late first audio and burst delivery remain on a monotonic capture axis', () => {
  const mapper = new CapturePcmTimelineMapper({ originMonotonicMs: 1_000 });
  mapper.appendChunk(500, 6_500);
  mapper.appendChunk(500, 6_500);
  assert.deepEqual(mapper.mapRange(0, 500), { startMs: 5_000, endMs: 5_500 });
  assert.deepEqual(mapper.mapRange(500, 1_000), { startMs: 5_500, endMs: 6_000 });
});

test('each mapper keeps an independent compressed cursor on one shared origin', () => {
  const system = new CapturePcmTimelineMapper({ originMonotonicMs: 5_000 });
  const mic = new CapturePcmTimelineMapper({ originMonotonicMs: 5_000 });
  system.appendChunk(1_000, 7_000);
  mic.appendChunk(500, 8_000);
  assert.equal(system.compressedCursorMs, 1_000);
  assert.equal(mic.compressedCursorMs, 500);
  assert.deepEqual(mic.mapRange(0, 500), { startMs: 2_500, endMs: 3_000 });
});
