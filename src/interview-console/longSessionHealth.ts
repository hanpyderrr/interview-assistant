import type { LatencyRecord } from './latencyTelemetry'

export const LONG_SESSION_HEALTH_INTERVAL_MS = 30_000
const BYTES_PER_MB = 1024 * 1024

export type LongSessionHealthSnapshot = {
  sessionDurationSec: number
  committedTurnCount: number
  visibleChars: number
  folded: boolean
  rendererHeapMB?: number
  recentAnswerLatencyP95Ms?: number
  sampledAnswerCount: number
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function percentile95(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}

export function buildLongSessionHealthSnapshot(input: {
  sessionDurationSec: number
  interviewerTurnCount: number
  candidateTurnCount: number
  visibleChars: number
  folded: boolean
  rendererHeapBytes?: number
  latencyRecords?: readonly LatencyRecord[]
}): LongSessionHealthSnapshot {
  const answerLatencies = (input.latencyRecords || []).flatMap((record) => {
    const start = record.events?.audioEnd
    const end = record.events?.answerDone
    if (!Number.isFinite(start) || !Number.isFinite(end) || end! < start!) return []
    return [Math.round(end! - start!)]
  })
  const rendererHeapMB = Number.isFinite(input.rendererHeapBytes) && input.rendererHeapBytes! >= 0
    ? Math.round(input.rendererHeapBytes! / BYTES_PER_MB)
    : undefined

  return {
    sessionDurationSec: safeCount(input.sessionDurationSec),
    committedTurnCount: safeCount(input.interviewerTurnCount) + safeCount(input.candidateTurnCount),
    visibleChars: safeCount(input.visibleChars),
    folded: Boolean(input.folded),
    ...(rendererHeapMB !== undefined ? { rendererHeapMB } : {}),
    ...(answerLatencies.length > 0 ? { recentAnswerLatencyP95Ms: percentile95(answerLatencies) } : {}),
    sampledAnswerCount: answerLatencies.length,
  }
}
