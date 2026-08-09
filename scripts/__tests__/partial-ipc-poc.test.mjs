import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePartialEventSequence } from '../lib/partial-ipc-poc.mjs';

test('partial IPC POC accepts ordered partial-final-reset events', () => {
  const result = validatePartialEventSequence([
    { sequence: 1, sessionId: 2, kind: 'partial', speaker: 'interviewer', segmentId: 4 },
    { sequence: 2, sessionId: 2, kind: 'partial', speaker: 'interviewer', segmentId: 4 },
    { sequence: 3, sessionId: 2, kind: 'final', speaker: 'interviewer', segmentId: 4 },
    { sequence: 4, sessionId: 2, kind: 'reset', speaker: 'system' },
  ]);
  assert.deepEqual(result, { valid: true, partialCount: 2, finalCount: 1, resetCount: 1 });
});

test('partial IPC POC rejects out-of-order or cross-segment finals', () => {
  assert.equal(validatePartialEventSequence([
    { sequence: 2, sessionId: 2, kind: 'partial', speaker: 'interviewer', segmentId: 4 },
    { sequence: 1, sessionId: 2, kind: 'final', speaker: 'interviewer', segmentId: 5 },
    { sequence: 3, sessionId: 2, kind: 'reset', speaker: 'system' },
  ]).valid, false);
});

test('partial IPC POC rejects events mixed across meeting sessions', () => {
  assert.equal(validatePartialEventSequence([
    { sequence: 1, sessionId: 2, kind: 'partial', speaker: 'interviewer', segmentId: 4 },
    { sequence: 2, sessionId: 3, kind: 'final', speaker: 'interviewer', segmentId: 4 },
    { sequence: 3, sessionId: 3, kind: 'reset', speaker: 'system' },
  ]).valid, false);
});
