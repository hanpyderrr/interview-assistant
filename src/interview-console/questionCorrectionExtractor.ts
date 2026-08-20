export const QUESTION_CORRECTION_OPEN = '【问题修正】';
export const QUESTION_CORRECTION_CLOSE = '【/问题修正】';

const TECHNICAL_TOKEN = /(RK\s*3568|Buildroot|Linux|C\+\+|Qt|SPI|CRC\s*32|POSIX|UART|PWM|DMA|TCP|ioctl|rootfs|内核|裁剪|设备树|驱动|线程|进程|组件|服务|启动|日志|中断|时钟|复位|引脚|电源)/gi;

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function technicalTerms(value: string): string[] {
  return (value.match(TECHNICAL_TOKEN) ?? []).map((term) => term.toLowerCase());
}

export function isValidQuestionCorrection(original: string, corrected: string): boolean {
  const before = normalize(original);
  const after = normalize(corrected);
  if (!after || !before) return false;
  if (after.length < Math.max(3, Math.floor(before.length * 0.3)) || after.length > Math.ceil(before.length * 2)) return false;
  const beforeTerms = technicalTerms(before);
  const afterTerms = technicalTerms(after);
  if (beforeTerms.length !== afterTerms.length) return false;
  return beforeTerms.every((term) => afterTerms.includes(term));
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
 * emits at the start of an answer. Chunks swallowed by the parser are returned
 * from `finish()` so an unterminated section never eats the answer head.
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
        const abandoned = buffered;
        buffered = '';
        phase = 'closed';
        return { display: QUESTION_CORRECTION_OPEN + abandoned, corrected: null };
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
    // Invalid correction: show the model output verbatim, correct nothing.
    return { display: QUESTION_CORRECTION_OPEN + candidate + QUESTION_CORRECTION_CLOSE + rest, corrected: null };
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
        const leftover = QUESTION_CORRECTION_OPEN + buffered;
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
 * Best-effort strip of a complete correction section from a final text.
 * Returns the corrected question only when the section is well-formed and
 * passes the same validity gate; otherwise the text is returned unchanged.
 */
export function stripCorrectionSection(text: string, originalQuestion: string): { text: string; corrected: string | null } {
  const openIndex = text.indexOf(QUESTION_CORRECTION_OPEN);
  if (openIndex === -1) return { text, corrected: null };
  const afterOpen = openIndex + QUESTION_CORRECTION_OPEN.length;
  const closeIndex = text.indexOf(QUESTION_CORRECTION_CLOSE, afterOpen);
  if (closeIndex === -1) return { text, corrected: null };
  const candidate = normalize(text.slice(afterOpen, closeIndex));
  if (!isValidQuestionCorrection(originalQuestion, candidate)) return { text, corrected: null };
  const stripped = text.slice(0, openIndex) + text.slice(closeIndex + QUESTION_CORRECTION_CLOSE.length);
  return { text: stripped, corrected: candidate };
}
