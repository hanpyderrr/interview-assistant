import { normalizeInterviewQuestion } from './questionNormalization.ts'

export type CandidatePhase = 'idle' | 'prewarm' | 'candidate-stream' | 'final-correction' | 'done' | 'cancelled'

export type CandidateGenerationSnapshot = {
  phase: CandidatePhase
  generationId: number | null
  question: string
  finalQuestion?: string
  candidateText: string
}

type ActiveGeneration = {
  generationId: number
  question: string
  finalQuestion?: string
  candidateText: string
  phase: CandidatePhase
}

type ControllerOptions = {
  onCancel?: (generationId: number) => void
}

type FinalAction = 'correct' | 'restart' | 'stale'

const TECHNICAL_TOKEN = /(RK\s*3568|Buildroot|Linux|C\+\+|Qt|SPI|CRC\s*32|POSIX|UART|PWM|DMA|TCP|ioctl|rootfs|内核|裁剪|设备树|驱动|线程|进程|组件|服务|启动|日志|中断|时钟|复位|引脚|电源)/gi
const LOW_INFORMATION_TAIL = /(我看你|我们来看|我們來看|欢迎来到|歡迎來到|小朋友|什么力量|什麼力量|感觉|感覺|贴贴|貼貼)/

function technicalTerms(value: string): Set<string> {
  return new Set((normalizeInterviewQuestion(value).match(TECHNICAL_TOKEN) || []).map((term) => term.toLowerCase()))
}

function isStructuralQuestionChange(previous: string, next: string): boolean {
  const before = normalizeInterviewQuestion(previous)
  const after = normalizeInterviewQuestion(next)
  const beforeTerms = technicalTerms(before)
  const afterTerms = technicalTerms(after)
  for (const term of beforeTerms) if (!afterTerms.has(term)) return true
  for (const term of afterTerms) if (!beforeTerms.has(term)) return true

  const compactBefore = before.replace(/\s+/g, '')
  const compactAfter = after.replace(/\s+/g, '')
  const maxLength = Math.max(compactBefore.length, compactAfter.length, 1)
  let commonPrefix = 0
  while (commonPrefix < compactBefore.length && commonPrefix < compactAfter.length && compactBefore[commonPrefix] === compactAfter[commonPrefix]) commonPrefix += 1
  return (maxLength - commonPrefix) / maxLength > 0.45
}

function isLowInformationFinal(value: string): boolean {
  const normalized = normalizeInterviewQuestion(value)
  return normalized.replace(/\s+/g, '').length <= 14 || LOW_INFORMATION_TAIL.test(normalized)
}

export function createCandidateGenerationController({ onCancel }: ControllerOptions = {}) {
  let active: ActiveGeneration | null = null

  function snapshot(): CandidateGenerationSnapshot {
    if (!active) return { phase: 'idle', generationId: null, question: '', candidateText: '' }
    return {
      phase: active.phase,
      generationId: active.generationId,
      question: active.question,
      ...(active.finalQuestion ? { finalQuestion: active.finalQuestion } : {}),
      candidateText: active.candidateText,
    }
  }

  function start({ generationId, question }: { generationId: number; question: string }): void {
    active = { generationId, question, candidateText: '', phase: 'prewarm' }
  }

  function acceptCandidateToken({ generationId, token }: { generationId: number; token: string }): boolean {
    if (!active || active.generationId !== generationId || (active.phase !== 'prewarm' && active.phase !== 'candidate-stream')) return false
    if (!token) return false
    active.phase = 'candidate-stream'
    active.candidateText += token
    return true
  }

  function acceptFinal({ generationId, question }: { generationId: number; question: string }): { accepted: boolean; action: FinalAction } {
    if (!active || active.generationId !== generationId) return { accepted: false, action: 'stale' }
    if (active.phase === 'cancelled' || active.phase === 'done') return { accepted: false, action: 'stale' }
    if (isLowInformationFinal(question)) return { accepted: false, action: 'stale' }
    if (isStructuralQuestionChange(active.question, question)) {
      active.phase = 'cancelled'
      onCancel?.(generationId)
      return { accepted: true, action: 'restart' }
    }
    active.finalQuestion = question
    active.phase = 'final-correction'
    return { accepted: true, action: 'correct' }
  }

  function acceptCorrectionToken({ generationId, token }: { generationId: number; token: string }): boolean {
    if (!active || active.generationId !== generationId || active.phase !== 'final-correction' || !token) return false
    active.candidateText += token
    return true
  }

  function complete(generationId: number, finalText?: string): boolean {
    if (!active || active.generationId !== generationId || (active.phase !== 'candidate-stream' && active.phase !== 'final-correction')) return false
    if (typeof finalText === 'string') active.candidateText = finalText
    active.phase = 'done'
    return true
  }

  function cancel(generationId: number): boolean {
    if (!active || active.generationId !== generationId) return false
    active.phase = 'cancelled'
    onCancel?.(generationId)
    return true
  }

  return { start, acceptCandidateToken, acceptFinal, acceptCorrectionToken, complete, cancel, snapshot }
}
