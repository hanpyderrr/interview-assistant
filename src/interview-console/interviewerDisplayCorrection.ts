import type { InterviewTurn } from './interviewContext.ts'

type CorrectionResult = { status: 'corrected' | 'original'; text: string }

export type InterviewerDisplayCorrectionCoordinator = {
  request: (turn: InterviewTurn) => Promise<void>
  apply: (turns: InterviewTurn[]) => InterviewTurn[]
  putExternalByText: (originalText: string, correctedText: string) => void
  cancel: () => void
  clear: () => void
}

function normalize(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function turnKey(turn: InterviewTurn): string {
  const text = normalize(turn.text)
  if (typeof turn.segmentId === 'number') return `segment:${turn.segmentId}:${text}`
  if (typeof turn.audioStartMs === 'number' && typeof turn.audioEndMs === 'number') {
    return `audio:${turn.audioStartMs}:${turn.audioEndMs}:${text}`
  }
  return `text:${text}`
}

export function createInterviewerDisplayCorrectionCoordinator(deps: {
  correct: (text: string) => Promise<CorrectionResult>
  cancelRemote?: () => void
  onDisplayChanged?: () => void
  minChars?: number
  cacheSize?: number
}): InterviewerDisplayCorrectionCoordinator {
  const minChars = deps.minChars ?? 6
  const cacheSize = deps.cacheSize ?? 32
  const corrections = new Map<string, string>()
  // Corrections produced by the answer pipeline (the model's own reading of
  // the question) outrank the standalone transcript proofread and are keyed by
  // normalized question text, since the answer job has no segment metadata.
  const externalByText = new Map<string, string>()
  let version = 0
  let currentKey = ''

  const put = (key: string, text: string) => {
    corrections.delete(key)
    corrections.set(key, text)
    while (corrections.size > cacheSize) corrections.delete(corrections.keys().next().value as string)
  }

  const cancel = () => {
    version += 1
    currentKey = ''
    deps.cancelRemote?.()
  }

  const request = async (turn: InterviewTurn): Promise<void> => {
    const original = normalize(turn.text)
    if (turn.speaker !== 'interviewer' || turn.final !== true || original.length < minChars) return
    const key = turnKey(turn)
    if (corrections.has(key) || key === currentKey) return

    const myVersion = ++version
    currentKey = key
    deps.cancelRemote?.()
    let result: CorrectionResult
    try {
      result = await deps.correct(original)
    } catch {
      result = { status: 'original', text: original }
    }
    if (myVersion !== version || currentKey !== key) return
    const corrected = result.status === 'corrected' ? normalize(result.text) : ''
    put(key, corrected || original)
    deps.onDisplayChanged?.()
  }

  const putExternalByText = (originalText: string, correctedText: string) => {
    const key = normalize(originalText)
    const value = normalize(correctedText)
    if (!key || !value || key === value) return
    externalByText.set(key, value)
    deps.onDisplayChanged?.()
  }

  const apply = (turns: InterviewTurn[]): InterviewTurn[] => {
    let changed = false
    const display = turns.map((turn) => {
      const external = externalByText.get(normalize(turn.text))
      if (external) {
        changed = true
        return { ...turn, text: external }
      }
      const corrected = corrections.get(turnKey(turn))
      if (!corrected || corrected === turn.text) return turn
      changed = true
      return { ...turn, text: corrected }
    })
    return changed ? display : turns
  }

  const clear = () => {
    cancel()
    corrections.clear()
    externalByText.clear()
  }

  return { request, apply, putExternalByText, cancel, clear }
}
