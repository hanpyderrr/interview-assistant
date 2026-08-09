/**
 * Phase 18 Step 2 correction: end-to-end test proving that a real
 * NativeAudioTranscriptEvent carrying diagnostics materializes all
 * boundaries in the final window probe, using the same production
 * helper that InterviewConsole calls.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as roundEvents from '../roundEventsWindow.ts'

const {
  computeAcceptedFinalGaps,
  getRoundEventsSnapshot,
  recordTranscriptDiagnostics,
  resetRoundEvents,
} = roundEvents

test('transcript diagnostics materialize all carried boundaries', () => {
  resetRoundEvents()
  const event = {
    speaker: 'interviewer',
    text: 'sample question',
    final: true,
    kind: 'final',
    sequence: 1,
    sessionId: 101,
    timestamp: Date.now(),
    confidence: 0.9,
    segmentId: 5,
    audioStartMs: 1000,
    audioEndMs: 3000,
    diagnostics: {
      sttSessionGeneration: 2,
      hostDispatchMonotonicMs: 123.456,
      workerQueueWaitMs: 50.789,
      workerInferenceMs: 200.123,
      hostRoundTripMs: 300.456,
      mainEmitWallMs: Date.now(),
      textLength: 15,
    },
  }
  recordTranscriptDiagnostics(event, performance.now())
  const snapshot = getRoundEventsSnapshot()
  const types = snapshot.map(e => e.type)
  assert.ok(types.includes('session-correlation'), 'expected session-correlation')
  assert.ok(types.includes('stt-dispatch'), 'expected stt-dispatch')
  assert.ok(types.includes('worker-result'), 'expected worker-result')
  assert.ok(types.includes('stt-host-roundtrip'), 'expected stt-host-roundtrip')
  assert.ok(types.includes('main-emit'), 'expected main-emit')
  assert.ok(types.includes('renderer-receive'), 'expected renderer-receive')
  const correlation = snapshot.find(e => e.type === 'session-correlation')
  assert.strictEqual(correlation.sessionId, 101, 'correlation includes canonical sessionId')
  const dispatch = snapshot.find(e => e.type === 'stt-dispatch')
  assert.strictEqual(dispatch.clock, 'monotonic', 'stt-dispatch uses monotonic clock')
  assert.strictEqual(typeof dispatch.hostClockMs, 'number', 'hostClockMs is present')
  assert.equal(JSON.stringify(snapshot).includes(event.text), false, 'probe must not contain transcript text')
})

test('session correlation recorded only once with genuine sessionId', () => {
  resetRoundEvents()
  const event = { speaker: 'interviewer', text: 'q1', final: true, kind: 'final', sequence: 1, sessionId: 201, timestamp: Date.now(), confidence: 0.9 }
  recordTranscriptDiagnostics(event, performance.now())
  const snapshot1 = getRoundEventsSnapshot()
  const correlations1 = snapshot1.filter(e => e.type === 'session-correlation')
  assert.strictEqual(correlations1.length, 1, 'first event generates one correlation')
  const event2 = { ...event, sequence: 2, text: 'q2' }
  recordTranscriptDiagnostics(event2, performance.now())
  const snapshot2 = getRoundEventsSnapshot()
  const correlations2 = snapshot2.filter(e => e.type === 'session-correlation')
  assert.strictEqual(correlations2.length, 1, 'same session does not duplicate correlation')
})

test('adjacent accepted finals yield audioGapMs and arrivalGapMs', () => {
  resetRoundEvents()
  const event1 = { speaker: 'interviewer', text: 'q1', final: true, kind: 'final', sequence: 1, sessionId: 301, timestamp: Date.now(), confidence: 0.9, segmentId: 1, audioStartMs: 1000, audioEndMs: 2000 }
  recordTranscriptDiagnostics(event1, 1000)
  assert.deepEqual(computeAcceptedFinalGaps(event1, 1000), {})
  const event2 = { ...event1, sequence: 2, segmentId: 2, audioStartMs: 3000, audioEndMs: 4000, text: 'q2' }
  recordTranscriptDiagnostics(event2, 5300)
  assert.deepEqual(computeAcceptedFinalGaps(event2, 5300), {
    audioGapMs: 1000,
    arrivalGapMs: 4300,
  })
})

test('reset clears correlation and previous-final state', () => {
  resetRoundEvents()
  const event1 = { speaker: 'interviewer', text: 'q1', final: true, kind: 'final', sequence: 1, sessionId: 401, timestamp: Date.now(), confidence: 0.9 }
  recordTranscriptDiagnostics(event1, performance.now())
  assert.ok(getRoundEventsSnapshot().length > 0, 'events recorded')
  resetRoundEvents()
  assert.strictEqual(getRoundEventsSnapshot().length, 0, 'reset cleared store')
  const event2 = { ...event1, sessionId: 402 }
  recordTranscriptDiagnostics(event2, performance.now())
  const correlations = getRoundEventsSnapshot().filter(e => e.type === 'session-correlation')
  assert.strictEqual(correlations.length, 1, 'new session records new correlation')
  assert.strictEqual(correlations[0].sessionId, 402, 'correlation has new sessionId')
})

test('transcript reset clears prior state before retaining the canonical reset boundary', () => {
  assert.equal(typeof roundEvents.recordTranscriptResetDiagnostics, 'function', 'production reset recorder must exist')
  resetRoundEvents()
  const finalEvent = { speaker: 'interviewer', text: 'old session text', final: true, kind: 'final', sequence: 1, sessionId: 701, timestamp: Date.now(), confidence: 0.9, audioStartMs: 0, audioEndMs: 1000 }
  recordTranscriptDiagnostics(finalEvent, 1000)
  computeAcceptedFinalGaps(finalEvent, 1000)

  const resetEvent = { speaker: 'system', text: '', final: false, kind: 'reset', sequence: 2, sessionId: 701, timestamp: Date.now(), confidence: 1 }
  roundEvents.recordTranscriptResetDiagnostics(resetEvent, 1500)

  const snapshot = getRoundEventsSnapshot()
  assert.equal(snapshot.some(event => event.sessionId !== undefined && event.sessionId !== 701), false)
  assert.equal(snapshot.some(event => event.type === 'session-reset' && event.sessionId === 701), true)

  const nextEvent = { ...finalEvent, sessionId: 702, sequence: 1, text: 'new session text' }
  assert.deepEqual(computeAcceptedFinalGaps(nextEvent, 2000), {}, 'reset must clear the previous-final gap baseline')
})

test('LocalWhisper retains the original VAD-final host timestamp across pending worker flush', () => {
  const source = fs.readFileSync('electron/audio/LocalWhisperSTT.ts', 'utf8')
  assert.match(source, /type FinalSegmentMetadata = \{[\s\S]*?hostDispatchMonotonicMs\?: number;/)
  assert.match(source, /private dispatchFinal\([^)]*\): void \{[\s\S]{0,240}metadata\.hostDispatchMonotonicMs \?\?= performance\.now\(\)/)
  assert.match(source, /hostDispatchMonotonicMs: Math\.round\(metadata\.hostDispatchMonotonicMs\)/)
  assert.doesNotMatch(source, /hostDispatchMonotonicMs: Math\.round\(dispatchedAt\)/)
})

test('sanitization rejects fractional/negative timestamps and invalid clock', () => {
  resetRoundEvents()
  // Real production path: performance.now() returns fractional monotonic ms.
  // The sanitizer must accept and round them, not reject.
  const fractionalEvent = {
    speaker: 'interviewer', text: 'q', final: true, kind: 'final',
    sequence: 1, sessionId: 501, timestamp: Date.now(), confidence: 0.9,
    diagnostics: { hostDispatchMonotonicMs: 123.456, mainEmitWallMs: Date.now() + 0.789 },
  }
  recordTranscriptDiagnostics(fractionalEvent, 9876.543)
  const snapshot = getRoundEventsSnapshot()
  const dispatch = snapshot.find(e => e.type === 'stt-dispatch')
  const mainEmit = snapshot.find(e => e.type === 'main-emit')
  const rendererReceive = snapshot.find(e => e.type === 'renderer-receive')
  assert.ok(dispatch, 'stt-dispatch event present after rounding')
  assert.strictEqual(typeof dispatch.hostClockMs, 'number', 'hostClockMs is a number')
  assert.ok(Number.isInteger(dispatch.hostClockMs), 'hostClockMs was rounded to integer')
  assert.ok(mainEmit, 'main-emit event present after rounding')
  assert.ok(Number.isInteger(mainEmit.mainEmitWallMs), 'mainEmitWallMs was rounded')
  assert.ok(rendererReceive, 'renderer-receive event present after rounding')
  assert.ok(Number.isInteger(rendererReceive.rendererReceiveMonotonicMs), 'rendererReceiveMonotonicMs was rounded')
})

test('no diagnostics still materializes renderer-receive', () => {
  resetRoundEvents()
  const bareEvent = { speaker: 'user', text: 'answer', final: true, kind: 'final', sequence: 1, sessionId: 601, timestamp: Date.now(), confidence: 0.9 }
  recordTranscriptDiagnostics(bareEvent, performance.now())
  const snapshot = getRoundEventsSnapshot()
  assert.ok(snapshot.some(e => e.type === 'session-correlation'), 'correlation still recorded')
  assert.ok(snapshot.some(e => e.type === 'renderer-receive'), 'renderer-receive still recorded')
  assert.ok(!snapshot.some(e => e.type === 'worker-result'), 'no worker-result without diagnostics')
})
