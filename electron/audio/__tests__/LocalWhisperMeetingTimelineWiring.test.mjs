import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const main = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
const local = fs.readFileSync(path.join(root, 'electron', 'audio', 'LocalWhisperSTT.ts'), 'utf8');

test('meeting owns one monotonic origin and gives it to both local whisper channels', () => {
  assert.match(main, /private _captureOriginMonotonicMs[^\n]*=/);
  assert.match(main, /const captureOriginMonotonicMs = performance\.now\(\)[\s\S]{0,200}?this\._captureOriginMonotonicMs = captureOriginMonotonicMs/);
  assert.match(main, /this\.googleSTT\?\.beginSession\?\.\(this\._transcriptSessionId, captureOriginMonotonicMs\)/);
  assert.match(main, /this\.googleSTT_User\?\.beginSession\?\.\(this\._transcriptSessionId, captureOriginMonotonicMs\)/);
});

test('local whisper reconfigure and resume reuse the current meeting origin', () => {
  assert.match(main, /lws\.beginSession\(this\._transcriptSessionId, this\._captureOriginMonotonicMs\)/);
  assert.doesNotMatch(main, /beginSession\(this\._transcriptSessionId, performance\.now\(\)\)/);
  assert.match(local, /beginSession\(meetingGeneration: number, originMonotonicMs: number\)/);
  assert.match(local, /this\.sessionGeneration === meetingGeneration[\s\S]{0,120}?this\.captureTimeline\?\.originMonotonicMs === originMonotonicMs[\s\S]{0,80}?return/);
  assert.match(local, /CapturePcmTimelineMapper/);
});

test('same-meeting stop and start keep the local segment cursor monotonic', () => {
  const startBody = local.slice(local.indexOf('start(): void'), local.indexOf('stop(): void'));
  const stopBody = local.slice(local.indexOf('stop(): void'), local.indexOf('write(chunk: Buffer)'));
  assert.doesNotMatch(startBody, /this\.segmentSequence = 0/);
  assert.doesNotMatch(stopBody, /this\.segmentSequence = 0/);
});

test('main maps local partial and final ids by provider instance and gates stale sessions', () => {
  assert.match(main, /_localWhisperSequenceCoordinator\.beginMeeting\(this\._transcriptSessionId\)/);
  assert.match(main, /localWhisperInstanceEpoch/);
  assert.match(main, /_localWhisperSequenceCoordinator\.resolve\(\s*speaker,\s*segment\.sttSessionGeneration,\s*localWhisperInstanceEpoch,\s*segment\.segmentId,\s*segment\.isFinal/);
  assert.match(local, /sttSessionGeneration: metadata\?\.sessionId \?\? this\.sessionGeneration/);
});

test('local partials and finals use the same provider-local segment axis across restart', () => {
  assert.match(local, /private segmentIdBase = 0/);
  assert.match(local, /this\.segmentIdBase = this\.segmentSequence/);
  assert.match(local, /segmentId: this\.segmentIdBase \+ this\.trackedSegmentId/);
  assert.match(local, /this\.segmentIdBase \+ segment\.sequenceId/);
});
