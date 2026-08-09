import { normalizeInterviewQuestion } from './questionNormalization.ts'

export const DEFAULT_PARTIAL_PREWARM_STABLE_MS = 500
export const MIN_PARTIAL_PREWARM_CHARS = 18

const QUESTION_SIGNAL = /[?？]|(什么|怎么|如何|为什么|哪些|哪个|哪种|是否|能不能|会不会|有没有|讲讲|介绍|解释|设计|处理|排查|优化)/
const TECHNICAL_SIGNAL = /(RK\s*3568|Buildroot|Linux|C\+\+|Qt|SPI|CRC\s*32|POSIX|UART|PWM|DMA|TCP|ioctl|rootfs|内核|裁剪|设备树|驱动|线程|进程|组件|服务|启动|日志|中断|时钟|复位|引脚|电源)/i

export type PartialPrewarmPayload = {
  speaker: string
  segmentId: number
  question: string
}

type PartialObservation = {
  speaker: string
  segmentId?: number
  text: string
}

type TimerHandle = ReturnType<typeof setTimeout>

type GateOptions = {
  stableMs?: number
  minChars?: number
  setTimeout?: (callback: () => void, delayMs: number) => TimerHandle
  clearTimeout?: (handle: TimerHandle) => void
  onStable: (payload: PartialPrewarmPayload) => void | Promise<void>
}

type Pending = {
  key: string
  payload: PartialPrewarmPayload
  timer: TimerHandle
}

function compactLength(value: string): number {
  return value.replace(/\s+/g, '').length
}

function hasEnoughSignal(value: string): boolean {
  let score = 0
  if (QUESTION_SIGNAL.test(value)) score += 1
  if (TECHNICAL_SIGNAL.test(value)) score += 1
  return score >= 2
}

function segmentKey(segmentId: number, question: string): string {
  return `${segmentId}\u0000${question}`
}

/**
 * Schedule retrieval/prompt prewarm only after a useful partial stops changing.
 * The gate is deliberately independent of answer generation and uses injected
 * timers so cancellation and stability can be tested without wall-clock waits.
 */
export function createPartialPrewarmGate({
  stableMs = DEFAULT_PARTIAL_PREWARM_STABLE_MS,
  minChars = MIN_PARTIAL_PREWARM_CHARS,
  setTimeout: schedule = setTimeout,
  clearTimeout: cancelTimer = clearTimeout,
  onStable,
}: GateOptions) {
  const pending = new Map<number, Pending>()
  const fired = new Set<string>()

  function cancelSegment(segmentId: number): void {
    const current = pending.get(segmentId)
    if (current) {
      cancelTimer(current.timer)
      pending.delete(segmentId)
    }
  }

  function observe({ speaker, segmentId, text }: PartialObservation): boolean {
    if (speaker !== 'interviewer' || typeof segmentId !== 'number' || !Number.isFinite(segmentId) || segmentId <= 0) return false
    const normalized = normalizeInterviewQuestion(text)
    if (compactLength(normalized) < minChars || !hasEnoughSignal(normalized)) {
      cancelSegment(segmentId)
      return false
    }

    const id = segmentId
    const key = segmentKey(id, normalized)
    if (fired.has(key)) return false
    const previous = pending.get(id)
    if (previous?.key === key) return false
    if (previous) cancelTimer(previous.timer)

    const payload: PartialPrewarmPayload = { speaker, segmentId: id, question: normalized }
    const timer = schedule(() => {
      const current = pending.get(id)
      if (!current || current.key !== key) return
      pending.delete(id)
      if (fired.has(key)) return
      fired.add(key)
      void onStable(payload)
    }, stableMs)
    pending.set(id, { key, payload, timer })
    return true
  }

  function clear(): void {
    for (const item of pending.values()) cancelTimer(item.timer)
    pending.clear()
    fired.clear()
  }

  return { observe, cancelSegment, clear }
}
