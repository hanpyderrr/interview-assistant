import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('active interview publishes bounded privacy-safe health snapshots every 30 seconds', async () => {
  const source = await readFile('src/interview-console/InterviewConsole.tsx', 'utf8')

  assert.match(source, /buildLongSessionHealthSnapshot/)
  assert.match(source, /LONG_SESSION_HEALTH_INTERVAL_MS/)
  assert.match(source, /__nativelyInterviewHealthSnapshots/)
  assert.match(source, /\.slice\(-240\)/)
  assert.match(source, /performanceMemory\.memory\?\.usedJSHeapSize/)
  assert.match(source, /window\.setInterval\(publishHealthSnapshot, LONG_SESSION_HEALTH_INTERVAL_MS\)/)
  assert.match(source, /\}, \[isLive\]\)/)
  assert.doesNotMatch(source, /buildLongSessionHealthSnapshot\([\s\S]{0,500}(transcriptText|answerText|questionText)\s*:/)
})
