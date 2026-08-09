import { appendFinalTurn, joinTranscriptTurns, type InterviewTurn } from './interviewContext.ts'
import { normalizeInterviewQuestion } from './questionNormalization.ts'

export const DEFAULT_QUESTION_SETTLE_MS = 2500
export const EXTENDED_QUESTION_SETTLE_MS = 5000
export const QUESTION_SETTLE_MS = EXTENDED_QUESTION_SETTLE_MS

export interface QuestionSettlerSnapshot {
  question: string
  turns: InterviewTurn[]
  deadlineMs: number | null
}

const SHORT_TAIL_MAX_CHARS = 14
const RICH_PENDING_MIN_CHARS = 18
const QUESTION_SIGNAL = /[?？]|(什么|怎么|如何|为什么|哪些|哪个|哪种|是否|能不能|会不会|有没有|讲讲|介绍|解释|设计|处理|排查|优化)/
const FOLLOW_UP_SIGNAL = /(为什么|怎么|如何|代价|缺点|风险|优化|举例|展开|具体|线程安全|安全吗|能说|再说|继续)/
const TECH_SIGNAL = /(RK\s*3568|Buildroot|Linux|C\+\+|Qt|SPI|CRC\s*32|POSIX|UART|PWM|DMA|ECM|TCP|TCSPC|ioctl|read|rootfs|内核|裁剪|设备树|驱动|线程|进程|组件|服务|启动|看门狗|日志|中断|时钟|复位|引脚|电源)/i
const LOW_INFORMATION_TAIL = /(我看你|我们来看|我們來看|欢迎来到|歡迎來到|小朋友|什么力量|什麼力量|感觉|感覺|贴贴|貼貼)/
const REPEATED_SINGLE_CHAR = /(.)\1{5,}/u
const MULTI_PART_QUESTION_SIGNAL = /(还有|另外|第二个|第三个|以及|并且|顺便|接着|然后|再问|再说一下|第一|其次|最后|同时|再补充|换个角度|and|also|another|second|third|then|follow[-\s]?up)/i

const OBVIOUS_QUESTION_SPLIT_SIGNAL = /(\u53e6\u5916|\u7136\u540e|\u63a5\u7740|\u7b2c\u4e8c\u4e2a|\u7b2c\u4e09\u4e2a|\u518d\u95ee|\u518d\u8bf4\u4e00\u4e0b|\u8fd8\u6709\u4e00\u4e2a|and also|also|second|third)/i
const RAW_QUESTION_SPLIT_MARKER = /(?:^|[,\uff0c;\uff1b.\u3002?\uff1f!]\s*|\s+)(\u53e6\u5916|\u7136\u540e|\u63a5\u7740|\u7b2c\u4e8c\u4e2a|\u7b2c\u4e09\u4e2a|\u518d\u95ee|\u518d\u8bf4\u4e00\u4e0b|\u8fd8\u6709\u4e00\u4e2a|and also|also|second|third)(?=$|[\s,\uff0c;\uff1b.\u3002?\uff1f!])[,\uff0c;\uff1b.\u3002?\uff1f!]?\s*/gi

function compactLength(value: string): number {
  return value.replace(/\s+/g, '').length
}

function cleanQuestionText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function compactSemanticText(value: string): string {
  return value.replace(/[\s，。！？,.!?、:：;；()（）"'“”‘’【】\[\]{}<>《》-]+/g, '')
}

function hasQuestionValue(value: string): boolean {
  return QUESTION_SIGNAL.test(value) || FOLLOW_UP_SIGNAL.test(value) || TECH_SIGNAL.test(value)
}

function cleanRawQuestionClause(value: string): string {
  return value.replace(/^[\s,\uff0c;\uff1b.\u3002?\uff1f!]+|[\s,\uff0c;\uff1b]+$/g, '').trim()
}

function shouldAcceptSplitMarker(rawQuestion: string, match: RegExpMatchArray, marker: string): boolean {
  const normalizedMarker = normalizeInterviewQuestion(marker).toLowerCase()
  const matchStart = match.index ?? 0
  const prefix = rawQuestion.slice(0, matchStart)
  const precedingChar = prefix.replace(/\s+$/g, '').slice(-1)
  const rawMatch = match[0] || ''

  if (normalizedMarker === 'also') {
    return /[?？!！。；;,，]/.test(precedingChar)
  }

  if (normalizedMarker === 'second' || normalizedMarker === 'third') {
    return rawMatch.includes(',') || rawMatch.includes('，')
  }

  return true
}

/** Split only clearly marked multi-question utterances while keeping raw STT text. */
export function splitSettledInterviewQuestion(question: string): { firstQuestion: string; remainingQuestions: string[] } {
  const rawQuestion = cleanQuestionText(question)
  const normalizedQuestion = normalizeInterviewQuestion(rawQuestion)
  if (!rawQuestion || !hasQuestionValue(normalizedQuestion)) {
    return { firstQuestion: rawQuestion, remainingQuestions: [] }
  }
  if (!OBVIOUS_QUESTION_SPLIT_SIGNAL.test(normalizedQuestion)) {
    return { firstQuestion: rawQuestion, remainingQuestions: [] }
  }

  const boundaries: Array<{ start: number; end: number }> = []
  for (const match of rawQuestion.matchAll(RAW_QUESTION_SPLIT_MARKER)) {
    const marker = match[1] || ''
    if (OBVIOUS_QUESTION_SPLIT_SIGNAL.test(normalizeInterviewQuestion(marker)) && shouldAcceptSplitMarker(rawQuestion, match, marker)) {
      const matchStart = match.index ?? 0
      const markerStart = matchStart + match[0].lastIndexOf(marker)
      boundaries.push({ start: markerStart, end: matchStart + match[0].length })
    }
  }
  if (boundaries.length === 0) return { firstQuestion: rawQuestion, remainingQuestions: [] }

  const rawClauses = [
    rawQuestion.slice(0, boundaries[0].start),
    ...boundaries.map((boundary, index) => rawQuestion.slice(boundary.end, boundaries[index + 1]?.start)),
  ].map(cleanRawQuestionClause)
  if (rawClauses.some((clause, index) => !clause || (index > 0 && !hasQuestionValue(normalizeInterviewQuestion(clause))))) {
    return { firstQuestion: rawQuestion, remainingQuestions: [] }
  }

  return { firstQuestion: rawClauses[0], remainingQuestions: rawClauses.slice(1) }
}

function isExcessivelyRepetitive(value: string): boolean {
  const compact = compactSemanticText(value)
  if (compact.length < 12) return false
  if (REPEATED_SINGLE_CHAR.test(compact)) return true

  for (let size = 2; size <= 6; size += 1) {
    const counts = new Map<string, number>()
    for (let index = 0; index + size <= compact.length; index += size) {
      const token = compact.slice(index, index + size)
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
    for (const [token, count] of counts) {
      if (count >= 4 && (token.length * count) / compact.length >= 0.6) return true
    }
  }
  return false
}

function shouldIgnoreLowInformationTail(
  currentTurns: InterviewTurn[],
  incoming: Partial<InterviewTurn>,
  recentSettledQuestion = '',
): boolean {
  const currentQuestion = joinTranscriptTurns(currentTurns)
  const referenceQuestion = currentQuestion || recentSettledQuestion
  const normalizedReference = normalizeInterviewQuestion(referenceQuestion)
  if (compactLength(normalizedReference) < RICH_PENDING_MIN_CHARS || !hasQuestionValue(normalizedReference)) return false

  const text = cleanQuestionText(incoming.text)
  if (!text) return false
  const normalizedText = normalizeInterviewQuestion(text)
  if (QUESTION_SIGNAL.test(normalizedText) || FOLLOW_UP_SIGNAL.test(normalizedText) || TECH_SIGNAL.test(normalizedText)) return false

  const shortTail = compactLength(normalizedText) <= SHORT_TAIL_MAX_CHARS
  return LOW_INFORMATION_TAIL.test(normalizedText) || shortTail || isExcessivelyRepetitive(normalizedText)
}

/**
 * Pure predicate for renderer wiring: returns true when the incoming final
 * should be accepted, false when it should be rejected as a low-information tail.
 * Reuses the existing acceptance logic without debounce/deadline state.
 */
export function shouldAcceptQuestionFinal(
  currentTurns: InterviewTurn[],
  incoming: Partial<InterviewTurn>,
  recentSettledQuestion = '',
): boolean {
  return !shouldIgnoreLowInformationTail(currentTurns, incoming, recentSettledQuestion)
}

export function createQuestionSettler(settleMs = QUESTION_SETTLE_MS) {
  const defaultSettleMs = settleMs === QUESTION_SETTLE_MS ? DEFAULT_QUESTION_SETTLE_MS : settleMs
  const extendedSettleMs = settleMs
  let turns: InterviewTurn[] = []
  let deadlineMs: number | null = null
  let recentSettledQuestion = ''

  function pushFinalTurn(incoming: Partial<InterviewTurn>, nowMs: number): boolean {
    if (shouldIgnoreLowInformationTail(turns, incoming, recentSettledQuestion)) return false
    const nextTurns = appendFinalTurn(turns, incoming)
    if (nextTurns === turns) return false
    turns = nextTurns
    const question = joinTranscriptTurns(turns)
    const analysisQuestion = normalizeInterviewQuestion(question)
    const currentSettleMs = MULTI_PART_QUESTION_SIGNAL.test(analysisQuestion) ? extendedSettleMs : defaultSettleMs
    deadlineMs = nowMs + currentSettleMs
    return true
  }

  function isReady(nowMs: number): boolean {
    return deadlineMs !== null && nowMs >= deadlineMs
  }

  function drain(nowMs: number): QuestionSettlerSnapshot | null {
    if (!isReady(nowMs)) return null
    const snapshotTurns = turns.slice()
    const question = joinTranscriptTurns(snapshotTurns)
    turns = []
    deadlineMs = null
    if (question) recentSettledQuestion = question
    return question
      ? { question, turns: snapshotTurns, deadlineMs: null }
      : null
  }

  function peek(): QuestionSettlerSnapshot {
    return {
      question: joinTranscriptTurns(turns),
      turns: turns.slice(),
      deadlineMs,
    }
  }

  function reset(): void {
    turns = []
    deadlineMs = null
    recentSettledQuestion = ''
  }

  return { pushFinalTurn, isReady, drain, peek, reset }
}
