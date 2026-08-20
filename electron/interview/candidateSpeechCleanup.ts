export const CANDIDATE_SPEECH_MAX_CHARS = 3200
const CANDIDATE_SPEECH_MIN_CHARS = 24

export type CandidateSpeechCleanupValidation = {
  valid: boolean
  text: string
  reason?: 'empty' | 'too-long' | 'numbers-changed' | 'technical-token-changed' | 'invented-content'
}

export function normalizeCandidateSpeech(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CANDIDATE_SPEECH_MAX_CHARS)
}

export function shouldCleanupCandidateSpeech(value: unknown): boolean {
  return normalizeCandidateSpeech(value).length >= CANDIDATE_SPEECH_MIN_CHARS
}

function escapeTranscriptBoundary(text: string): string {
  return text.replace(/[<>]/g, (character) => character === '<' ? '＜' : '＞')
}

export function buildCandidateSpeechCleanupPrompt(value: unknown): string {
  const text = escapeTranscriptBoundary(normalizeCandidateSpeech(value))
  return [
    '你是面试语音转写清理器。只输出清理后的候选人原话，不要解释。',
    '可以删除明显串音、完全重复、无意义口头填充，并修正标点和断句。',
    '不得补充或编造原文没有的事实、经历、成果、因果、数字或技术术语。',
    '必须保留所有数字、单位、英文技术词和事实含义；不确定时原样保留。',
    '<candidate_transcript>',
    text,
    '</candidate_transcript>',
  ].join('\n')
}

function sortedMatches(text: string, pattern: RegExp): string[] {
  return (text.match(pattern) || []).map((token) => token.toLowerCase()).sort()
}

function sameTokens(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((token, index) => token === right[index])
}

function cjkCharacters(text: string): string[] {
  return text.match(/[\p{Script=Han}]/gu) || []
}

function hasSubstantialNovelContent(original: string, cleaned: string): boolean {
  const originalChars = new Set(cjkCharacters(original))
  const cleanedChars = cjkCharacters(cleaned)
  if (cleanedChars.length === 0) return false
  const novelCount = cleanedChars.filter((character) => !originalChars.has(character)).length
  return novelCount / cleanedChars.length > 0.24
}

export function validateCandidateSpeechCleanup(
  originalValue: unknown,
  cleanedValue: unknown,
): CandidateSpeechCleanupValidation {
  const original = normalizeCandidateSpeech(originalValue)
  const text = normalizeCandidateSpeech(cleanedValue)
  if (!text) return { valid: false, text: original, reason: 'empty' }
  if (text.length > Math.max(original.length * 1.35, original.length + 24)) {
    return { valid: false, text: original, reason: 'too-long' }
  }

  const numberPattern = /\d+(?:[.,]\d+)*(?:%|ms|s|秒|分钟|小时|万|亿)?/giu
  if (!sameTokens(sortedMatches(original, numberPattern), sortedMatches(text, numberPattern))) {
    return { valid: false, text: original, reason: 'numbers-changed' }
  }

  const technicalPattern = /[a-z][a-z0-9]*(?:[.+#/_-][a-z0-9]+)*/giu
  if (!sameTokens(sortedMatches(original, technicalPattern), sortedMatches(text, technicalPattern))) {
    return { valid: false, text: original, reason: 'technical-token-changed' }
  }

  if (hasSubstantialNovelContent(original, text)) {
    return { valid: false, text: original, reason: 'invented-content' }
  }
  return { valid: true, text }
}
