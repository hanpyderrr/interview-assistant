export const TRANSCRIPT_DISPLAY_MAX_CHARS = 4000
export const TRANSCRIPT_BOTTOM_THRESHOLD_PX = 32

export type TranscriptDisplayWindow = {
  text: string
  folded: boolean
}

type TranscriptTextItem = { text?: unknown }

function cleanDisplayText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Build a bounded renderer-only view by walking backward from the newest
 * transcript. The source turns remain untouched for context and persistence.
 */
export function buildTranscriptDisplayWindow(
  turns: readonly TranscriptTextItem[],
  partial = '',
  maxChars = TRANSCRIPT_DISPLAY_MAX_CHARS,
): TranscriptDisplayWindow {
  const limit = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : TRANSCRIPT_DISPLAY_MAX_CHARS
  const chunks: string[] = []
  let remaining = limit
  let folded = false

  const appendNewest = (raw: unknown, allowTruncate: boolean): boolean => {
    const text = cleanDisplayText(raw)
    if (!text) return true
    const separator = chunks.length > 0 ? 1 : 0
    if (text.length + separator <= remaining) {
      chunks.push(text)
      remaining -= text.length + separator
      return true
    }
    if (allowTruncate && remaining > separator) chunks.push(text.slice(-(remaining - separator)))
    remaining = 0
    folded = true
    return false
  }

  if (partial && !appendNewest(partial, true)) {
    return { text: chunks.reverse().join(' '), folded: true }
  }

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    // Preserve committed speech as whole segments. Truncation is only needed
    // when the newest committed segment cannot fit even into an empty window.
    if (!appendNewest(turns[index]?.text, chunks.length === 0)) {
      folded = true
      break
    }
    if (remaining <= 0) {
      folded = index > 0
      break
    }
  }

  return { text: chunks.reverse().join(' '), folded }
}

export function isNearTranscriptBottom(metrics: {
  scrollHeight: number
  clientHeight: number
  scrollTop: number
}): boolean {
  return metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop <= TRANSCRIPT_BOTTOM_THRESHOLD_PX
}
