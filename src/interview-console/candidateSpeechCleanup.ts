import type { InterviewTurn } from './interviewContext.ts'

export type CandidateCleanupStatus = 'idle' | 'cleaning' | 'cleaned' | 'original'
type CleanupResult = { status: 'cleaned' | 'original'; text: string }
type CandidateBlock = { start: number; end: number; text: string; key: string }

export type CandidateSpeechCleanupCoordinator = {
  observe: (turns: InterviewTurn[], enabled: boolean) => void
  buildContextTurns: (turns: InterviewTurn[], enabled: boolean, waitMs?: number) => Promise<InterviewTurn[]>
  cancel: () => void
  clear: () => void
}

function normalize(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function latestCandidateBlock(turns: InterviewTurn[]): CandidateBlock | null {
  let end = turns.length - 1
  while (end >= 0 && (turns[end]?.final !== true || turns[end]?.speaker !== 'user')) end -= 1
  if (end < 0) return null
  let start = end
  while (start > 0 && turns[start - 1]?.final === true && turns[start - 1]?.speaker === 'user') start -= 1
  const text = turns.slice(start, end + 1).map((turn) => normalize(turn.text)).filter(Boolean).join(' ')
  return text ? { start, end, text, key: text } : null
}

function withTimeout<T>(promise: Promise<T>, waitMs: number): Promise<T | null> {
  if (waitMs <= 0) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), waitMs)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, () => { clearTimeout(timer); resolve(null) })
  })
}

function replaceCandidateBlock(turns: InterviewTurn[], block: CandidateBlock, text: string): InterviewTurn[] {
  const first = turns[block.start]
  const last = turns[block.end]
  return [
    ...turns.slice(0, block.start),
    { ...first, text, segmentId: last.segmentId, audioEndMs: last.audioEndMs },
    ...turns.slice(block.end + 1),
  ]
}

export function createCandidateSpeechCleanupCoordinator(deps: {
  cleanup: (text: string) => Promise<CleanupResult>
  cancelRemote?: () => void
  onStatus?: (status: CandidateCleanupStatus) => void
  minChars?: number
  cacheSize?: number
}): CandidateSpeechCleanupCoordinator {
  const minChars = deps.minChars ?? 24
  const cacheSize = deps.cacheSize ?? 24
  const cache = new Map<string, CleanupResult>()
  let version = 0
  let currentKey = ''
  let currentPromise: Promise<CleanupResult> | null = null

  const publish = (status: CandidateCleanupStatus) => deps.onStatus?.(status)
  const putCache = (key: string, value: CleanupResult) => {
    cache.delete(key)
    cache.set(key, value)
    while (cache.size > cacheSize) cache.delete(cache.keys().next().value as string)
  }

  const cancel = () => {
    version += 1
    currentKey = ''
    currentPromise = null
    deps.cancelRemote?.()
    publish('idle')
  }

  const observe = (turns: InterviewTurn[], enabled: boolean) => {
    const block = latestCandidateBlock(turns)
    if (!enabled) {
      cancel()
      return
    }
    if (!block) {
      publish('original')
      return
    }
    if (block.text.length < minChars) {
      if (block.key !== currentKey) {
        version += 1
        currentKey = block.key
        currentPromise = null
        deps.cancelRemote?.()
      }
      publish('original')
      return
    }
    if (block.key === currentKey) return
    const cached = cache.get(block.key)
    currentKey = block.key
    if (cached) {
      currentPromise = Promise.resolve(cached)
      publish(cached.status)
      return
    }
    const myVersion = ++version
    deps.cancelRemote?.()
    publish('cleaning')
    currentPromise = deps.cleanup(block.text)
      .then((result) => {
        const normalized: CleanupResult = result.status === 'cleaned' && normalize(result.text)
          ? { status: 'cleaned', text: normalize(result.text) }
          : { status: 'original', text: block.text }
        if (myVersion === version && currentKey === block.key) {
          putCache(block.key, normalized)
          publish(normalized.status)
        }
        return normalized
      })
      .catch(() => {
        const fallback: CleanupResult = { status: 'original', text: block.text }
        if (myVersion === version && currentKey === block.key) {
          putCache(block.key, fallback)
          publish('original')
        }
        return fallback
      })
  }

  const buildContextTurns = async (turns: InterviewTurn[], enabled: boolean, waitMs = 300): Promise<InterviewTurn[]> => {
    if (!enabled) return turns
    const block = latestCandidateBlock(turns)
    if (!block || block.text.length < minChars) return turns
    observe(turns, true)
    const cached = cache.get(block.key)
    const result = cached || (currentKey === block.key && currentPromise
      ? await withTimeout(currentPromise, waitMs)
      : null)
    if (!result || result.status !== 'cleaned') {
      if (!result) publish('original')
      return turns
    }
    return replaceCandidateBlock(turns, block, result.text)
  }

  const clear = () => {
    cancel()
    cache.clear()
  }

  return { observe, buildContextTurns, cancel, clear }
}
