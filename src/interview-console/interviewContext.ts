export type InterviewSpeaker = 'interviewer' | 'user';

export interface InterviewTurn {
  speaker: InterviewSpeaker;
  text: string;
  final: boolean;
  timestamp?: number;
  segmentId?: number;
  audioStartMs?: number;
  audioEndMs?: number;
}

export interface InterviewContextOptions {
  maxTurns?: number;
  maxChars?: number;
}

const DEFAULT_MAX_TURNS = 6;
const DEFAULT_MAX_CHARS = 2400;
const HARD_MAX_TURNS = 20;
const HARD_MAX_CHARS = 8000;

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isSpeaker(value: unknown): value is InterviewSpeaker {
  return value === 'interviewer' || value === 'user';
}

function finiteMetadata(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function metadataFields(value: Partial<InterviewTurn>): Pick<InterviewTurn, 'segmentId' | 'audioStartMs' | 'audioEndMs'> {
  const fields: Pick<InterviewTurn, 'segmentId' | 'audioStartMs' | 'audioEndMs'> = {};
  const segmentId = finiteMetadata(value.segmentId);
  const audioStartMs = finiteMetadata(value.audioStartMs);
  const audioEndMs = finiteMetadata(value.audioEndMs);
  if (segmentId !== undefined) fields.segmentId = segmentId;
  if (audioStartMs !== undefined) fields.audioStartMs = audioStartMs;
  if (audioEndMs !== undefined) fields.audioEndMs = audioEndMs;
  return fields;
}

/**
 * Compare two transcript events by the audio provenance supplied by STT.
 * Mixed/incomplete metadata is treated as unknown so legacy providers keep
 * their previous arrival-order behaviour.
 */
export function compareTranscriptOrder(left: Partial<InterviewTurn>, right: Partial<InterviewTurn>): number | null {
  const leftSegmentId = finiteMetadata(left.segmentId);
  const rightSegmentId = finiteMetadata(right.segmentId);
  // The segment sequence is the strongest ordering signal. Audio clocks can
  // overlap slightly at a VAD boundary, but a lower sequence cannot belong to
  // a later accepted segment.
  if (leftSegmentId !== undefined && rightSegmentId !== undefined && leftSegmentId !== rightSegmentId) {
    return Math.sign(leftSegmentId - rightSegmentId);
  }

  const leftStart = finiteMetadata(left.audioStartMs);
  const rightStart = finiteMetadata(right.audioStartMs);
  if (leftStart !== undefined && rightStart !== undefined && leftStart !== rightStart) {
    return Math.sign(leftStart - rightStart);
  }

  const leftEnd = finiteMetadata(left.audioEndMs);
  const rightEnd = finiteMetadata(right.audioEndMs);
  if (leftEnd !== undefined && rightEnd !== undefined && leftEnd !== rightEnd) {
    return Math.sign(leftEnd - rightEnd);
  }

  if ((leftSegmentId !== undefined && rightSegmentId !== undefined)
    || (leftEnd !== undefined && rightEnd !== undefined)
    || (leftStart !== undefined && rightStart !== undefined)) return 0;
  return null;
}

/** Return true when the event belongs to a segment already committed. */
export function isTranscriptAtOrBefore(event: Partial<InterviewTurn>, boundary: Partial<InterviewTurn> | null | undefined): boolean {
  const order = boundary ? compareTranscriptOrder(event, boundary) : null;
  return order !== null && order <= 0;
}

function sameSegment(left: Partial<InterviewTurn>, right: Partial<InterviewTurn>): boolean {
  const leftSegmentId = finiteMetadata(left.segmentId);
  const rightSegmentId = finiteMetadata(right.segmentId);
  if (leftSegmentId !== undefined && rightSegmentId !== undefined && leftSegmentId === rightSegmentId) return true;

  const leftStart = finiteMetadata(left.audioStartMs);
  const rightStart = finiteMetadata(right.audioStartMs);
  const leftEnd = finiteMetadata(left.audioEndMs);
  const rightEnd = finiteMetadata(right.audioEndMs);
  return leftStart !== undefined && rightStart !== undefined
    && leftEnd !== undefined && rightEnd !== undefined
    && Math.abs(leftStart - rightStart) < 1
    && Math.abs(leftEnd - rightEnd) < 1;
}

function overlaps(left: string, right: string): boolean {
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function boundedInteger(value: number | undefined, fallback: number, hardMax: number): number {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(hardMax, Math.max(1, candidate));
}

/** Add one final STT segment while ordering provenance and collapsing overlap. */
export function appendFinalTurn(current: InterviewTurn[], incoming: Partial<InterviewTurn>): InterviewTurn[] {
  if (incoming.final !== true || !isSpeaker(incoming.speaker)) return current;

  const text = cleanText(incoming.text);
  if (!text) return current;

  const next: InterviewTurn = {
    speaker: incoming.speaker,
    text,
    final: true,
    ...(typeof incoming.timestamp === 'number' ? { timestamp: incoming.timestamp } : {}),
    ...metadataFields(incoming),
  };

  // Finals can complete out of order when inference is asynchronous. Compare
  // against the newest accepted event for this speaker before considering any
  // text merge; otherwise an old tail can be mistaken for a new question.
  let previousIndex = -1;
  for (let index = current.length - 1; index >= 0; index -= 1) {
    if (current[index]?.speaker === next.speaker) {
      previousIndex = index;
      break;
    }
  }
  const previous = previousIndex >= 0 ? current[previousIndex] : undefined;
  if (previous) {
    const order = compareTranscriptOrder(next, previous);
    if (order !== null && order < 0) return current;

    if (sameSegment(previous, next)) {
      if (next.text.length > previous.text.length && overlaps(previous.text, next.text)) {
        return [...current.slice(0, previousIndex), next, ...current.slice(previousIndex + 1)];
      }
      return current;
    }

    // Keep the legacy adjacent-overlap rule for providers without provenance;
    // a non-adjacent same-speaker turn may be a legitimate repeated question.
    if (previousIndex === current.length - 1 && overlaps(previous.text, next.text)) {
      if (next.text.length > previous.text.length) {
        return [...current.slice(0, previousIndex), next, ...current.slice(previousIndex + 1)];
      }
      return current;
    }
  }
  return [...current, next];
}

/** Render accepted final turns as one transcript line for the console. */
export function joinTranscriptTurns(turns: InterviewTurn[]): string {
  return turns
    .filter((turn) => turn?.final === true && isSpeaker(turn.speaker))
    .map((turn) => cleanText(turn.text))
    .filter(Boolean)
    .join(' ')
    .trim();
}

function formatTurn(turn: InterviewTurn): string {
  return `${turn.speaker === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${turn.text}`;
}

/** Format the newest bounded turns in chronological order for an answer prompt. */
export function buildRecentInterviewContext(
  turns: InterviewTurn[],
  options: InterviewContextOptions = {},
): string {
  const maxTurns = boundedInteger(options.maxTurns, DEFAULT_MAX_TURNS, HARD_MAX_TURNS);
  const maxChars = boundedInteger(options.maxChars, DEFAULT_MAX_CHARS, HARD_MAX_CHARS);
  const usable = turns
    .filter((turn) => turn?.final === true && isSpeaker(turn.speaker) && Boolean(cleanText(turn.text)))
    .slice(-maxTurns);

  const selected: string[] = [];
  let usedChars = 0;
  for (let index = usable.length - 1; index >= 0; index -= 1) {
    const line = formatTurn({ ...usable[index], text: cleanText(usable[index].text) });
    const separatorChars = selected.length > 0 ? 1 : 0;
    const remaining = maxChars - usedChars - separatorChars;
    if (remaining <= 0) break;
    const kept = line.length <= remaining ? line : line.slice(0, remaining).trimEnd();
    selected.unshift(kept);
    usedChars += kept.length + separatorChars;
  }
  return selected.join('\n').trim();
}

export function shouldTriggerInterviewAnswer(speaker: unknown, final: unknown): boolean {
  return speaker === 'interviewer' && final === true;
}
