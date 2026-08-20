import test from 'node:test'
import assert from 'node:assert/strict'

import { buildLongSessionHealthSnapshot } from '../longSessionHealth.ts'

test('health snapshot contains only bounded numeric session signals', () => {
  const snapshot = buildLongSessionHealthSnapshot({
    sessionDurationSec: 5400.8,
    interviewerTurnCount: 1800,
    candidateTurnCount: 1700,
    visibleChars: 3990,
    folded: true,
    rendererHeapBytes: 300 * 1024 * 1024,
    latencyRecords: [
      { questionGenerationId: 'secret-question-id', events: { audioEnd: 10, answerDone: 810 }, provider: { outcome: 'success' } },
      { questionGenerationId: 'another-id', events: { audioEnd: 20, answerDone: 1220 }, provider: { outcome: 'success' } },
    ],
  })

  assert.deepEqual(snapshot, {
    sessionDurationSec: 5400,
    committedTurnCount: 3500,
    visibleChars: 3990,
    folded: true,
    rendererHeapMB: 300,
    recentAnswerLatencyP95Ms: 1200,
    sampledAnswerCount: 2,
  })
  assert.equal(JSON.stringify(snapshot).includes('secret-question-id'), false)
})

test('health snapshot ignores incomplete latency and unavailable heap metrics', () => {
  const snapshot = buildLongSessionHealthSnapshot({
    sessionDurationSec: -10,
    interviewerTurnCount: 2,
    candidateTurnCount: 1,
    visibleChars: 42,
    folded: false,
    latencyRecords: [
      { questionGenerationId: 'x', events: { audioEnd: 10 }, provider: { outcome: 'unknown' } },
    ],
  })

  assert.equal(snapshot.sessionDurationSec, 0)
  assert.equal(snapshot.committedTurnCount, 3)
  assert.equal(snapshot.sampledAnswerCount, 0)
  assert.equal(snapshot.recentAnswerLatencyP95Ms, undefined)
  assert.equal(snapshot.rendererHeapMB, undefined)
})
