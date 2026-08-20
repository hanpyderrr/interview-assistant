/**
 * Filters common Whisper hallucinations.
 * Returns an empty string if the text is a known hallucination,
 * otherwise returns the trimmed text.
 */

const EXACT_BLOCKS = new Set([
  '[music]',
  '[applause]',
  '[inaudible]',
  '(music)',
  'thank you for watching',
  'thanks for watching',
  '感谢观看',
  '谢谢观看',
  '感谢您的观看',
  'you',
  'bye',
  '...',
  '.',
]);

// Matches any token that is entirely wrapped in square brackets e.g. [Noise], [BLANK_AUDIO]
const BRACKET_TOKEN_RE = /^\[.*\]$/;

export interface HallucinationFilterOptions {
  rejectShortNonQuestion?: boolean;
}

export type HallucinationFilterReason = 'kept' | 'too-short' | 'exact-block' | 'bracket-token' | 'repetition';

export interface HallucinationFilterInspection {
  text: string;
  decision: 'kept' | 'dropped';
  reason: HallucinationFilterReason;
}

function compactSpeech(text: string): string[] {
  return Array.from(text.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase());
}

function isDominantCharacterLoop(text: string): boolean {
  const characters = compactSpeech(text);
  if (characters.length < 8) return false;
  const counts = new Map<string, number>();
  let highest = 0;
  for (const character of characters) {
    const next = (counts.get(character) ?? 0) + 1;
    counts.set(character, next);
    highest = Math.max(highest, next);
  }
  return highest / characters.length >= 0.55;
}

function hasRepeatedShortUnit(text: string): boolean {
  const characters = compactSpeech(text);
  const length = characters.length;
  if (length < 8) return false;
  for (let unitLength = 2; unitLength <= Math.min(12, Math.floor(length / 3)); unitLength++) {
    for (let start = 0; start + unitLength * 3 <= length; start++) {
      const unit = characters.slice(start, start + unitLength).join('');
      let repeats = 1;
      while (start + (repeats + 1) * unitLength <= length
        && characters.slice(start + repeats * unitLength, start + (repeats + 1) * unitLength).join('') === unit) {
        repeats++;
      }
      const repeatedCharacters = repeats * unitLength;
      if (repeats >= 3 && (repeatedCharacters >= 18 || repeatedCharacters / length >= 0.65)) return true;
    }
  }
  return false;
}

function hasDenseSilenceTemplates(text: string): boolean {
  const matches = text.match(/欢迎来到|小?朋友们|我们来(?:看|讲)|感谢(?:您|大家)?(?:的)?观看|谢谢(?:大家)?观看/gu) ?? [];
  return matches.length >= 3;
}

export function inspectHallucination(text: string): HallucinationFilterInspection {
  const trimmed = text.trim();

  if (trimmed.length < 2) return { text: '', decision: 'dropped', reason: 'too-short' };

  const lower = trimmed.toLowerCase();

  if (EXACT_BLOCKS.has(lower)) return { text: '', decision: 'dropped', reason: 'exact-block' };

  if (BRACKET_TOKEN_RE.test(trimmed)) return { text: '', decision: 'dropped', reason: 'bracket-token' };

  if (isDominantCharacterLoop(trimmed) || hasRepeatedShortUnit(trimmed) || hasDenseSilenceTemplates(trimmed)) {
    return { text: '', decision: 'dropped', reason: 'repetition' };
  }

  return { text: trimmed, decision: 'kept', reason: 'kept' };
}

export function filterHallucination(text: string, _options: HallucinationFilterOptions = {}): string {
  return inspectHallucination(text).text;
}
