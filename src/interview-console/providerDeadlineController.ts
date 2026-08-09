import { DEFAULT_PROVIDER_DEADLINE_MS } from './latencyTelemetry.ts'

export type ProviderDeadlineState = 'idle' | 'pending' | 'streaming' | 'done' | 'error' | 'timeout'

type TimerHandle = ReturnType<typeof setTimeout>

export type ProviderDeadlineController = {
  start: (generationId: number) => void
  observeToken: (generationId: number, token: string) => boolean
  complete: (generationId: number, outcome?: 'done' | 'error') => boolean
  clear: () => void
  snapshot: () => { generationId: number | null; state: ProviderDeadlineState; usefulText: string }
}

export function createProviderDeadlineController(options: {
  deadlineMs?: number
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
  onTimeout?: (generationId: number) => void
} = {}): ProviderDeadlineController {
  const deadlineMs = Math.max(1, Math.floor(options.deadlineMs ?? DEFAULT_PROVIDER_DEADLINE_MS))
  const schedule = options.setTimeout || setTimeout
  const cancel = options.clearTimeout || clearTimeout
  let timer: TimerHandle | null = null
  let epoch = 0
  let generationId: number | null = null
  let state: ProviderDeadlineState = 'idle'
  let usefulText = ''

  function clearTimer(): void {
    if (timer !== null) cancel(timer)
    timer = null
  }

  function clear(): void {
    clearTimer()
    epoch += 1
    generationId = null
    state = 'idle'
    usefulText = ''
  }

  function start(nextGenerationId: number): void {
    clear()
    generationId = nextGenerationId
    state = 'pending'
    const scheduledEpoch = epoch
    timer = schedule(() => {
      if (scheduledEpoch !== epoch || generationId !== nextGenerationId || state !== 'pending') return
      timer = null
      state = 'timeout'
      options.onTimeout?.(nextGenerationId)
    }, deadlineMs)
  }

  function observeToken(nextGenerationId: number, token: string): boolean {
    if (generationId !== nextGenerationId || (state !== 'pending' && state !== 'streaming')) return false
    usefulText += token || ''
    if (state === 'pending' && /\S/.test(usefulText)) {
      state = 'streaming'
      clearTimer()
    }
    return state === 'streaming'
  }

  function complete(nextGenerationId: number, outcome: 'done' | 'error' = 'done'): boolean {
    if (generationId !== nextGenerationId || (state !== 'pending' && state !== 'streaming')) return false
    clearTimer()
    state = outcome
    return true
  }

  return {
    start,
    observeToken,
    complete,
    clear,
    snapshot: () => ({ generationId, state, usefulText }),
  }
}
