import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalWhisperSequenceCoordinator } from '../localWhisperSequenceCoordinator.ts';

test('partial and final from one provider segment resolve to the same app id', () => {
  const coordinator = new LocalWhisperSequenceCoordinator();
  coordinator.beginMeeting(7);
  assert.equal(coordinator.resolve('interviewer', 7, 101, 1, false), 1);
  assert.equal(coordinator.resolve('interviewer', 7, 101, 1, true), 1);
  assert.equal(coordinator.resolve('interviewer', 7, 101, 2, false), 2);
});

test('rebuilt providers continue one per-channel sequence inside the same session', () => {
  const coordinator = new LocalWhisperSequenceCoordinator();
  coordinator.beginMeeting(7);
  assert.equal(coordinator.resolve('interviewer', 7, 101, 1, true), 1);
  assert.equal(coordinator.resolve('interviewer', 7, 102, 1, false), 2);
  assert.equal(coordinator.resolve('interviewer', 7, 102, 1, true), 2);
  assert.equal(coordinator.resolve('user', 7, 201, 1, false), 1);
});

test('a new meeting resets both channels and rejects finals from an old provider instance', () => {
  const coordinator = new LocalWhisperSequenceCoordinator();
  coordinator.beginMeeting(7);
  assert.equal(coordinator.resolve('interviewer', 7, 101, 1, true), 1);
  coordinator.beginMeeting(8);
  assert.equal(coordinator.resolve('interviewer', 7, 101, 2, false), null);
  assert.equal(coordinator.resolve('interviewer', 8, 102, 1, false), 1);
  assert.equal(coordinator.resolve('user', 8, 201, 1, true), 1);
});

test('recent provider-segment mappings stay bounded', () => {
  const coordinator = new LocalWhisperSequenceCoordinator({ maxMappingsPerChannel: 64 });
  coordinator.beginMeeting(7);
  for (let segmentId = 1; segmentId <= 1_000; segmentId++) {
    coordinator.resolve('interviewer', 7, 101, segmentId, true);
  }
  assert.ok(coordinator.mappingCount('interviewer') <= 64);
});
