export const TRANSCRIPT_TEXT_MAX_CHARS = 1200
const TRANSCRIPT_TEXT_MIN_CHARS = 6

export type TranscriptTextCorrectionValidation = {
  valid: boolean
  text: string
  reason?: 'empty' | 'too-long' | 'metrics-changed' | 'technical-shape-changed' | 'rewrite-too-large'
}

export function normalizeTranscriptText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TRANSCRIPT_TEXT_MAX_CHARS)
}

export function shouldCorrectTranscriptText(value: unknown): boolean {
  return normalizeTranscriptText(value).length >= TRANSCRIPT_TEXT_MIN_CHARS
}

function escapeBoundary(text: string): string {
  return text.replace(/[<>]/g, (character) => character === '<' ? '＜' : '＞')
}

export function buildTranscriptTextCorrectionPrompt(value: unknown): string {
  const text = escapeBoundary(normalizeTranscriptText(value))
  return [
    '你是面试官语音转写校对器。只输出校对后的原句，不要解释。',
    '只允许修正同音字、错别字、标点、断句，以及明显的 ASR 技术词拼写错误。',
    '不得补充信息，不得改写事实、问题意图、数字指标或技术含义。',
    '无法确定时保留原文；不要回答问题。',
    '<interviewer_transcript>',
    text,
    '</interviewer_transcript>',
  ].join('\n')
}

function matches(text: string, pattern: RegExp): string[] {
  return (text.match(pattern) ?? []).map((token) => token.toLowerCase())
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row++) {
    const current = [row]
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length]
}

function technicalShapeIsSafe(original: string, corrected: string): boolean {
  const pattern = /[a-z][a-z0-9]*(?:[.+#/_-][a-z0-9]+)*/giu
  const before = matches(original, pattern)
  const after = matches(corrected, pattern)
  if (before.length !== after.length) return false
  return before.every((token, index) => {
    const replacement = after[index]
    if (token === replacement) return true
    const longest = Math.max(token.length, replacement.length)
    return Math.min(token.length, replacement.length) >= 4
      && levenshtein(token, replacement) / longest <= 0.65
  })
}

function meaningfulText(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

export function validateTranscriptTextCorrection(
  originalValue: unknown,
  correctedValue: unknown,
): TranscriptTextCorrectionValidation {
  const original = normalizeTranscriptText(originalValue)
  const text = normalizeTranscriptText(correctedValue)
  if (!text) return { valid: false, text: original, reason: 'empty' }
  if (text.length > Math.max(original.length * 1.25, original.length + 12)) {
    return { valid: false, text: original, reason: 'too-long' }
  }

  const metricPattern = /(?<![A-Za-z0-9])\d+(?:[.,]\d+)*(?:%|ms|s|秒|分钟|小时|万|亿)?(?![A-Za-z0-9])/giu
  if (matches(original, metricPattern).join('\u0000') !== matches(text, metricPattern).join('\u0000')) {
    return { valid: false, text: original, reason: 'metrics-changed' }
  }
  if (!technicalShapeIsSafe(original, text)) {
    return { valid: false, text: original, reason: 'technical-shape-changed' }
  }

  const before = meaningfulText(original)
  const after = meaningfulText(text)
  const longest = Math.max(before.length, after.length, 1)
  if (levenshtein(before, after) > Math.max(3, Math.ceil(longest * 0.35))) {
    return { valid: false, text: original, reason: 'rewrite-too-large' }
  }
  return { valid: true, text }
}
