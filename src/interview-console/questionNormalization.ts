import { toSimplifiedChinese } from './simplifiedChinese.ts'

// ASR term variants: reassembled spaced/dotted/hyphenated acronyms and observed
// aliases. Uppercase only — lowercase sequences stay untouched. Negative
// lookarounds keep embedded tokens (PUSBI, SPIBus, SBIO) untouched. Only a
// trailing dot may be consumed; the space after the term is preserved.
const SEP = '[.\\-]?';
const TERM_RULES: Array<[RegExp, string]> = [
  [new RegExp(`(?<![A-Za-z])S\\s*${SEP}\\s*P\\s*${SEP}\\s*I\\.?(?!\\.?[A-Za-z])`), 'SPI'],
  [/(?<![A-Za-z])S\s*B\s*I(?![A-Za-z])/, 'SPI'],
  [/(?<![A-Za-z])SBI(?![A-Za-z])/, 'SPI'],
  [new RegExp(`(?<![A-Za-z])P\\s*${SEP}\\s*O\\s*${SEP}\\s*S\\s*${SEP}\\s*I\\s*${SEP}\\s*X\\.?(?!\\.?[A-Za-z])`), 'POSIX'],
  [new RegExp(`(?<![A-Za-z])D\\s*${SEP}\\s*M\\s*${SEP}\\s*A\\.?(?!\\.?[A-Za-z])`), 'DMA'],
  [new RegExp(`(?<![A-Za-z])P\\s*${SEP}\\s*W\\s*${SEP}\\s*M\\.?(?!\\.?[A-Za-z])`), 'PWM'],
  [new RegExp(`(?<![A-Za-z])C\\s*${SEP}\\s*R\\s*${SEP}\\s*C\\.?(?!\\.?[A-Za-z])`), 'CRC'],
  [new RegExp(`(?<![A-Za-z])U\\s*${SEP}\\s*A\\s*${SEP}\\s*R\\s*${SEP}\\s*T\\.?(?!\\.?[A-Za-z])`), 'UART'],
  [new RegExp(`(?<![A-Za-z])U\\s*${SEP}\\s*S\\s*${SEP}\\s*B\\.?(?!\\.?[A-Za-z])`), 'USB'],
  [new RegExp(`(?<![A-Za-z])A\\s*${SEP}\\s*P\\s*${SEP}\\s*I\\.?(?!\\.?[A-Za-z])`), 'API'],
  [/\bi\s*two\s*c\b/i, 'I2C'],
  [/\bi\s*2\s*c\b/i, 'I2C'],
  [/\brk\s*3568\b/i, 'RK3568'],
  [/\bbuild\s*root\b/i, 'Buildroot'],
  [/\bc\s*\+\s*\+/i, 'C++'],
  [/\bc\s+plus\s+plus\b/i, 'C++'],
]

/** Return an analysis-only question with recurring STT variants made searchable. */
export function normalizeInterviewQuestion(value: unknown): string {
  let normalized = toSimplifiedChinese(value).replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  for (const [pattern, replacement] of TERM_RULES) {
    normalized = normalized.replace(pattern, replacement)
  }

  return normalized
}
