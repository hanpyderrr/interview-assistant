import { performance } from 'node:perf_hooks'

import { appendFinalTurn, buildRecentInterviewContext } from '../../src/interview-console/interviewContext.ts'
import { TRANSCRIPT_DISPLAY_MAX_CHARS, buildTranscriptDisplayWindow } from '../../src/interview-console/transcriptDisplayWindow.ts'

export function runLongSessionStress({ durationMinutes = 90, segmentEveryMs = 1500 } = {}) {
  const totalTurns = Math.max(1, Math.floor((durationMinutes * 60_000) / segmentEveryMs))
  const allTurns = []
  let interviewerTurns = []
  let candidateTurns = []
  let maxVisibleChars = 0
  let finalWindow = { text: '', folded: false }
  let context = ''
  const heapBefore = process.memoryUsage().heapUsed
  const startedAt = performance.now()

  for (let index = 0; index < totalTurns; index += 1) {
    const speaker = index % 2 === 0 ? 'interviewer' : 'user'
    const incoming = {
      speaker,
      text: `${speaker === 'interviewer' ? 'Question' : 'Answer'} ${index}: deterministic long-session segment ${'x'.repeat(index % 37)}`,
      final: true,
      segmentId: index + 1,
      audioStartMs: index * segmentEveryMs,
      audioEndMs: (index + 1) * segmentEveryMs - 1,
    }
    const previous = allTurns.length
    const nextAll = appendFinalTurn(allTurns, incoming)
    if (nextAll.length !== previous + 1) throw new Error(`Turn ${index} was not preserved`)
    allTurns.push(nextAll.at(-1))
    if (speaker === 'interviewer') interviewerTurns = appendFinalTurn(interviewerTurns, incoming)
    else candidateTurns = appendFinalTurn(candidateTurns, incoming)

    const source = speaker === 'interviewer' ? interviewerTurns : candidateTurns
    finalWindow = buildTranscriptDisplayWindow(source, index % 5 === 0 ? `partial-${index}` : '')
    maxVisibleChars = Math.max(maxVisibleChars, finalWindow.text.length)
    context = buildRecentInterviewContext(allTurns)
  }

  return {
    simulatedMinutes: durationMinutes,
    totalTurns,
    fullTurnsPreserved: allTurns.length === totalTurns,
    contextBuildCount: totalTurns,
    maxVisibleChars,
    finalWindowFolded: finalWindow.folded,
    contextChars: context.length,
    elapsedMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
    heapDeltaMB: Math.round(((process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024) * 1000) / 1000,
    displayLimit: TRANSCRIPT_DISPLAY_MAX_CHARS,
  }
}
