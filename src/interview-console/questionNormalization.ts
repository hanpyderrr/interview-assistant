import { toSimplifiedChinese } from './simplifiedChinese.ts'

/** Return an analysis-only question with recurring STT variants made searchable. */
export function normalizeInterviewQuestion(value: unknown): string {
  let normalized = toSimplifiedChinese(value).replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  normalized = normalized
    .replace(/\brk\s*3568\b/gi, 'RK3568')
    .replace(/\bbuild\s*root\b/gi, 'Buildroot')
    .replace(/\bc\s*\+\s*\+/gi, 'C++')
    .replace(/\bc\s+plus\s+plus\b/gi, 'C++')

  return normalized
}
