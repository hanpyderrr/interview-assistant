export const INTERVIEW_PROMPT_STORAGE_KEY = 'natively.interviewConsole.customPrompt.v1'
export const INTERVIEW_PROMPT_MAX_LENGTH = 4000

export function loadInterviewPrompt(storage?: Pick<Storage, 'getItem'>): string {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    const value = target?.getItem(INTERVIEW_PROMPT_STORAGE_KEY)
    return typeof value === 'string' ? value.slice(0, INTERVIEW_PROMPT_MAX_LENGTH).trim() : ''
  } catch {
    return ''
  }
}

export function saveInterviewPrompt(
  value: string,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>,
): string {
  if (typeof value !== 'string') throw new Error('提示词必须是文本')
  if (value.length > INTERVIEW_PROMPT_MAX_LENGTH) throw new Error(`提示词最多 ${INTERVIEW_PROMPT_MAX_LENGTH} 字`)
  const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
  if (!target) throw new Error('本地设置暂不可用')
  const normalized = value.trim()
  if (normalized) target.setItem(INTERVIEW_PROMPT_STORAGE_KEY, normalized)
  else target.removeItem(INTERVIEW_PROMPT_STORAGE_KEY)
  return normalized
}
