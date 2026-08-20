export type InterviewFontSizes = {
  question: number
  answer: number
}

export const INTERVIEW_FONT_DEFAULTS: InterviewFontSizes = {
  question: 20,
  answer: 20,
}

export const INTERVIEW_FONT_MIN = 14
export const INTERVIEW_FONT_MAX = 32
export const INTERVIEW_FONT_STEP = 2
export const INTERVIEW_FONT_STORAGE_KEY = 'natively.interviewConsole.fontSizes.v1'

function normalizeFontSize(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(INTERVIEW_FONT_MAX, Math.max(INTERVIEW_FONT_MIN, value))
}

export function loadInterviewFontSizes(
  storage?: Pick<Storage, 'getItem'>,
): InterviewFontSizes {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    if (!target) return { ...INTERVIEW_FONT_DEFAULTS }
    const serialized = target.getItem(INTERVIEW_FONT_STORAGE_KEY)
    if (!serialized) return { ...INTERVIEW_FONT_DEFAULTS }
    const parsed = JSON.parse(serialized) as Partial<InterviewFontSizes> | null
    if (!parsed || typeof parsed !== 'object') return { ...INTERVIEW_FONT_DEFAULTS }
    return {
      question: normalizeFontSize(parsed.question, INTERVIEW_FONT_DEFAULTS.question),
      answer: normalizeFontSize(parsed.answer, INTERVIEW_FONT_DEFAULTS.answer),
    }
  } catch {
    return { ...INTERVIEW_FONT_DEFAULTS }
  }
}

export function saveInterviewFontSizes(
  sizes: InterviewFontSizes,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    if (!target) return
    target.setItem(INTERVIEW_FONT_STORAGE_KEY, JSON.stringify({
      question: normalizeFontSize(sizes.question, INTERVIEW_FONT_DEFAULTS.question),
      answer: normalizeFontSize(sizes.answer, INTERVIEW_FONT_DEFAULTS.answer),
    }))
  } catch {
    // Storage can be disabled without preventing in-session font adjustment.
  }
}

export function adjustInterviewFontSize(value: number, direction: -1 | 1): number {
  return normalizeFontSize(value + (direction * INTERVIEW_FONT_STEP), INTERVIEW_FONT_DEFAULTS.question)
}
