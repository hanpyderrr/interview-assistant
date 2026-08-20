import test from 'node:test'
import assert from 'node:assert/strict'

import { runLongSessionStress } from '../lib/interview-long-session-stress.mjs'

test('90-minute equivalent stress keeps renderer windows bounded and full turns intact', () => {
  const result = runLongSessionStress({ durationMinutes: 90, segmentEveryMs: 1500 })

  assert.equal(result.simulatedMinutes, 90)
  assert.equal(result.totalTurns, 3600)
  assert.equal(result.fullTurnsPreserved, true)
  assert.equal(result.contextBuildCount, result.totalTurns)
  assert.ok(result.maxVisibleChars <= 4000)
  assert.equal(result.finalWindowFolded, true)
  assert.ok(result.contextChars > 0)
  assert.ok(result.elapsedMs >= 0)
  assert.equal(Number.isFinite(result.heapDeltaMB), true)
})
