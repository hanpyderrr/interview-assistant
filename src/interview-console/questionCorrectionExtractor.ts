import { normalizeInterviewQuestion } from './questionNormalization.ts';

export const QUESTION_CORRECTION_OPEN = '【问题修正】';
export const QUESTION_CORRECTION_CLOSE = '【/问题修正】';

const TECHNICAL_TOKEN = /(RK\s*3568|Buildroot|Linux|C\+\+|Qt|SPI|CRC\s*32|POSIX|UART|PWM|DMA|TCP|ioctl|rootfs|内核|裁剪|设备树|驱动|线程|进程|组件|服务|启动|日志|中断|时钟|复位|引脚|电源)/gi;

/**
 * Conservative edit budgets for the correction gate.
 *
 * A genuine ASR/typo/homophone/punctuation fix only touches a handful of
 * characters. Anything that adds substantially more than that is treated as
 * new content (typically a truncated tail completed into a fresh follow-up
 * question) and the original question is kept instead.
 *
 * All budgets are deliberately small: when the gate cannot confirm that a
 * correction only repaired the existing question, it must reject it.
 */
const MAX_INSERTED_CONTENT_CHARS = 6;
const INSERTED_CONTENT_RATIO = 0.2;
const MIN_INSERTED_CONTENT_CHARS = 3;
const MIN_DELETED_CONTENT_CHARS = 6;
const DELETED_CONTENT_RATIO = 0.3;
/**
 * Content that is inserted without deleting anything is new text. A single
 * missing connector is plausible; a whole added clause is not.
 */
const MAX_PURE_INSERTED_CONTENT_CHARS = 2;
/** Refuse to diff beyond this size instead of guessing (conservative). */
const MAX_DIFF_CELLS = 1_000_000;

const INTERROGATIVE_MARKERS = ['怎么', '如何', '为什么', '为何', '什么', '哪些', '哪个', '哪种', '是否', '多少', '吗', '呢'];

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function technicalTerms(value: string): string[] {
  return (value.match(TECHNICAL_TOKEN) ?? []).map((term) => term.toLowerCase());
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function questionMarkCount(value: string): number {
  return (value.match(/[?？]/g) ?? []).length;
}

function interrogativeCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const marker of INTERROGATIVE_MARKERS) {
    const count = countOccurrences(value, marker);
    if (count > 0) counts.set(marker, count);
  }
  return counts;
}

/**
 * Punctuation-, symbol- and whitespace-free view of a question, used to reason
 * about real content changes. Full-width digits are folded so a digit is a
 * digit regardless of the input width.
 */
function contentOf(value: string): string {
  return value
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toLowerCase();
}

/** True when `after` contains a digit that `before` did not account for. */
function introducesNewDigits(before: string, after: string): boolean {
  const remaining = new Map<string, number>();
  for (const char of before) {
    if (char >= '0' && char <= '9') remaining.set(char, (remaining.get(char) ?? 0) + 1);
  }
  for (const char of after) {
    if (char < '0' || char > '9') continue;
    const left = remaining.get(char) ?? 0;
    if (left <= 0) return true;
    remaining.set(char, left - 1);
  }
  return false;
}

/**
 * Character-level LCS edit counts. `inserted` is content present only in the
 * correction, `deleted` is content present only in the original. Returns null
 * when the inputs are too large to verify confidently.
 */
function diffContent(before: string, after: string): { inserted: number; deleted: number } | null {
  const rows = before.length;
  const columns = after.length;
  if (rows * columns > MAX_DIFF_CELLS) return null;
  if (rows === 0) return { inserted: columns, deleted: 0 };
  if (columns === 0) return { inserted: 0, deleted: rows };
  const width = columns + 1;
  const table = new Int32Array((rows + 1) * width);
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      table[row * width + column] = before[row] === after[column]
        ? table[(row + 1) * width + column + 1] + 1
        : Math.max(table[(row + 1) * width + column], table[row * width + column + 1]);
    }
  }
  const matched = table[0];
  return { inserted: columns - matched, deleted: rows - matched };
}

/**
 * Whether the model's corrected question is a plausible repair of the original
 * rather than a replacement or an extension of it.
 *
 * The gate is deterministic and conservative: it keeps the existing length and
 * technical-term protections, then additionally rejects any correction that
 * introduces digits, multiplies questions/interrogatives, or adds more content
 * than a small typo/homophone fix could explain. Anything it cannot confirm is
 * rejected so the caller keeps the original question.
 */
export function isValidQuestionCorrection(original: string, corrected: string): boolean {
  const before = normalizeInterviewQuestion(original);
  const after = normalize(corrected);
  if (!after || !before) return false;
  if (after.length < Math.max(3, Math.floor(before.length * 0.3)) || after.length > Math.ceil(before.length * 2)) return false;

  // Technical terms must be preserved exactly (multiset equality).
  const beforeTerms = technicalTerms(before);
  const afterTerms = technicalTerms(after);
  if (beforeTerms.length !== afterTerms.length) return false;
  if (!beforeTerms.every((term) => afterTerms.includes(term))) return false;

  const beforeContent = contentOf(before);
  const afterContent = contentOf(after);
  if (!beforeContent || !afterContent) return false;

  // A correction must never invent numbers the question did not contain.
  if (introducesNewDigits(beforeContent, afterContent)) return false;

  const edits = diffContent(beforeContent, afterContent);
  if (!edits) return false;
  const { inserted, deleted } = edits;

  // A repair only rewrites a few characters; more than that is new semantics.
  const insertedBudget = Math.min(
    MAX_INSERTED_CONTENT_CHARS,
    Math.max(MIN_INSERTED_CONTENT_CHARS, Math.floor(beforeContent.length * INSERTED_CONTENT_RATIO)),
  );
  const deletedBudget = Math.max(
    MIN_DELETED_CONTENT_CHARS,
    Math.floor(beforeContent.length * DELETED_CONTENT_RATIO),
  );
  if (inserted > insertedBudget) return false;
  if (deleted > deletedBudget) return false;

  // Pure insertion never repairs existing text; it only appends new text.
  if (deleted === 0 && inserted > MAX_PURE_INSERTED_CONTENT_CHARS) return false;

  // Extra questions are only tolerated when the fix adds no net new content
  // (homophone or punctuation repairs), never when text was appended.
  if (questionMarkCount(after) > questionMarkCount(before) && inserted > deleted) return false;

  // Interrogative words must not be multiplied by a correction.
  const beforeMarkers = interrogativeCounts(before);
  for (const [marker, count] of interrogativeCounts(after)) {
    if (count > (beforeMarkers.get(marker) ?? 0) && inserted > deleted) return false;
  }

  return true;
}

export type CorrectionExtractor = {
  feed: (chunk: string) => { display: string; corrected: string | null }
  finish: () => string
  done: () => boolean
}

export function flushResolvedCorrectionExtractor(
  extractor: CorrectionExtractor | undefined,
  acceptVisible: (leftover: string) => void,
): void {
  const leftover = extractor?.finish() ?? '';
  if (leftover) acceptVisible(leftover);
}

/**
 * Streaming parser for the `【问题修正】…【/问题修正】` section the model
 * emits at the start of an answer. Unterminated sections use the same recovery
 * as final text so answer content survives without leaking the control marker.
 */
export function createQuestionCorrectionExtractor(originalQuestion: string, maxBufferedChars = 400): CorrectionExtractor {
  const original = normalize(originalQuestion);
  let phase: 'scanning' | 'consuming' | 'closed' = 'scanning';
  let buffered = '';
  let tail = '';

  function consume(text: string): { display: string; corrected: string | null } {
    buffered += text;
    const closeIndex = buffered.indexOf(QUESTION_CORRECTION_CLOSE);
    if (closeIndex === -1) {
      if (buffered.length > maxBufferedChars) {
        const abandoned = stripCorrectionSection(QUESTION_CORRECTION_OPEN + buffered, original).text;
        buffered = '';
        phase = 'closed';
        return { display: abandoned, corrected: null };
      }
      return { display: '', corrected: null };
    }
    const candidate = normalize(buffered.slice(0, closeIndex));
    const rest = buffered.slice(closeIndex + QUESTION_CORRECTION_CLOSE.length);
    buffered = '';
    phase = 'closed';
    if (isValidQuestionCorrection(original, candidate)) {
      return { display: rest, corrected: candidate };
    }
    // Closed correction metadata is never spoken answer text, even when rejected.
    return { display: rest, corrected: null };
  }

  return {
    feed(chunk: string): { display: string; corrected: string | null } {
      if (phase === 'closed') return { display: chunk, corrected: null };
      if (phase === 'scanning') {
        const combined = tail + chunk;
        const openIndex = combined.indexOf(QUESTION_CORRECTION_OPEN);
        if (openIndex === -1) {
          const keepLength = Math.min(combined.length, QUESTION_CORRECTION_OPEN.length - 1);
          tail = combined.slice(-keepLength);
          return { display: combined.slice(0, combined.length - keepLength), corrected: null };
        }
        phase = 'consuming';
        tail = '';
        const before = combined.slice(0, openIndex);
        const after = combined.slice(openIndex + QUESTION_CORRECTION_OPEN.length);
        const consumed = consume(after);
        return { display: before + consumed.display, corrected: consumed.corrected };
      }
      return consume(chunk);
    },
    finish(): string {
      if (phase === 'scanning') {
        phase = 'closed';
        const leftover = tail;
        tail = '';
        return leftover;
      }
      if (phase === 'consuming') {
        phase = 'closed';
        const leftover = stripCorrectionSection(QUESTION_CORRECTION_OPEN + buffered, original).text;
        buffered = '';
        return leftover;
      }
      return '';
    },
    done(): boolean {
      return phase === 'closed';
    },
  };
}

/**
 * Strip correction metadata from final text or an unterminated stream buffer.
 * Only a closed section may change the question, and it must pass the validity
 * gate. An unclosed section may discard an unchanged question on its own line;
 * otherwise preserve the ambiguous content without its internal opening marker.
 */
export function stripCorrectionSection(text: string, originalQuestion: string): { text: string; corrected: string | null } {
  const openIndex = text.indexOf(QUESTION_CORRECTION_OPEN);
  if (openIndex === -1) return { text, corrected: null };
  const afterOpen = openIndex + QUESTION_CORRECTION_OPEN.length;
  const closeIndex = text.indexOf(QUESTION_CORRECTION_CLOSE, afterOpen);
  if (closeIndex === -1) {
    // A newline separates a repeated question from the spoken answer. Never
    // infer an answer boundary from an unclosed rewrite or consume its content.
    const lineEnd = text.indexOf('\n', afterOpen);
    const line = lineEnd >= 0 ? normalize(text.slice(afterOpen, lineEnd)) : '';
    if (line && line === normalize(originalQuestion)) {
      return { text: text.slice(0, openIndex) + text.slice(lineEnd + 1), corrected: line };
    }
    return { text: text.slice(0, openIndex) + text.slice(afterOpen), corrected: null };
  }
  const candidate = normalize(text.slice(afterOpen, closeIndex));
  const stripped = text.slice(0, openIndex) + text.slice(closeIndex + QUESTION_CORRECTION_CLOSE.length);
  return { text: stripped, corrected: isValidQuestionCorrection(originalQuestion, candidate) ? candidate : null };
}
