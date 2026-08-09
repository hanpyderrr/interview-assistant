export const LATENCY_EVENT_NAMES = [
  'audioEnd',
  'firstInterviewerFinal',
  'questionSettled',
  'retrievalReady',
  'providerDeadline',
  'providerError',
  'fallbackAnswerStart',
  'firstAnswerToken',
  'answerDone',
] as const

export type LatencyEventName = typeof LATENCY_EVENT_NAMES[number]
export type LatencyProviderOutcome = 'success' | 'timeout' | 'error' | 'unknown'
export const DEFAULT_PROVIDER_DEADLINE_MS = 7000

export type LatencyRecord = {
  questionGenerationId: string
  events: Partial<Record<LatencyEventName, number>>
  provider: {
    outcome: LatencyProviderOutcome
    deadlineMs?: number
    ttftMs?: number
    tokensPerSecond?: number
    timeout?: boolean
    error?: string
  }
}

const NORMAL_EVENTS: LatencyEventName[] = [
  'audioEnd',
  'firstInterviewerFinal',
  'questionSettled',
  'retrievalReady',
  'firstAnswerToken',
  'answerDone',
]

const FALLBACK_EVENTS: LatencyEventName[] = [
  'audioEnd',
  'firstInterviewerFinal',
  'questionSettled',
  'retrievalReady',
  'providerDeadline',
  'providerError',
  'fallbackAnswerStart',
  'firstAnswerToken',
  'answerDone',
]

function hasStrictlyIncreasingEvents(record: LatencyRecord, names: LatencyEventName[]): boolean {
  let previous = -Infinity
  for (const name of names) {
    const value = record.events[name]
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= previous) return false
    previous = value
  }
  return true
}

export function isCompleteLatencyRecord(record: LatencyRecord): boolean {
  const outcome = record.provider?.outcome
  if (outcome === 'timeout' || outcome === 'error') {
    return hasStrictlyIncreasingEvents(record, FALLBACK_EVENTS)
  }
  if (outcome !== 'success') return false
  return hasStrictlyIncreasingEvents(record, NORMAL_EVENTS)
}

export function classifyLatencyRecord(record: LatencyRecord): {
  pipelineComplete: boolean
  providerSuccess: boolean
  providerFailure: boolean
} {
  const providerFailure = record.provider?.outcome === 'timeout' || record.provider?.outcome === 'error'
  return {
    pipelineComplete: isCompleteLatencyRecord(record),
    providerSuccess: !providerFailure && isCompleteLatencyRecord(record),
    providerFailure,
  }
}

export function createLatencyTrace(
  questionGenerationId: string,
  now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
) {
  const events: Partial<Record<LatencyEventName, number>> = {}
  let lastTimestamp = -Infinity
  let provider: LatencyRecord['provider'] = { outcome: 'unknown', deadlineMs: DEFAULT_PROVIDER_DEADLINE_MS }

  return {
    mark(name: LatencyEventName, timestamp = now()): number {
      const value = Number.isFinite(timestamp) ? Math.max(timestamp, lastTimestamp + 0.001) : lastTimestamp + 0.001
      events[name] = value
      lastTimestamp = value
      return value
    },
    setProvider(next: Partial<LatencyRecord['provider']>): void {
      provider = { ...provider, ...next }
    },
    snapshot(): LatencyRecord {
      return {
        questionGenerationId,
        events: { ...events },
        provider: { ...provider },
      }
    },
  }
}
