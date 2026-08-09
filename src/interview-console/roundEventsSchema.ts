/**
 * Phase 18 Step 2 — bounded, redacted diagnostic telemetry schema.
 *
 * This module is renderer-safe and contains only pure schema validation,
 * no Electron-specific imports. Both main process and renderer can import
 * from this shared location.
 *
 * Hard invariants (see docs/superpowers/plans/2026-08-08-question-round-aggregation.md):
 *   - audio-timeline gap vs renderer-arrival gap between adjacent finals;
 *   - VAD/worker queue+inference delay;
 *   - main-process emit -> renderer receive delay;
 *   - the current questionSettler pending/merge/reject/drain decision;
 *   - answer/generation-attempt/stream lifecycle where those IDs already
 *     genuinely exist in production code today.
 *
 * Hard invariants (see docs/superpowers/plans/2026-08-08-question-round-aggregation.md
 * Step 2 and the Phase 18 Step 2 task contract):
 *   - capped in-memory FIFO of EXACTLY 200 records;
 *   - never record transcript/prompt/answer text, only textLength;
 *   - cancellation/error reasons are a small allowlisted enum, never raw
 *     exception strings;
 *   - no invented identity: an id is included only when it genuinely exists
 *     at the observation point;
 *   - recording must never throw and must never influence caller control
 *     flow — a malformed event is dropped, not raised.
 */

export const ROUND_EVENT_CAP = 200;

/** Allowlisted cancellation / error / decision reasons. Never raw exception text. */
export const ROUND_EVENT_REASONS = [
  'stale-generation',
  'settled',
  'session-reset',
  'provider-error',
  'provider-timeout',
  'user-stop',
  'superseded-by-final',
  'low-information-tail',
  'unknown',
] as const;
export type RoundEventReason = typeof ROUND_EVENT_REASONS[number];

export type ClockDomain = 'monotonic' | 'wall';

/** Questionsettler observations use non-future, non-durable decision labels.
 * These must never be confused with a future stable "round" concept. */
export const SETTLER_DECISIONS = [
  'pending-accepted',
  'ignored-stale',
  'drain',
] as const;
export type SettlerDecision = typeof SETTLER_DECISIONS[number];

interface BaseFields {
  /** Canonical sessionId = main-process AudioManager._transcriptSessionId. */
  sessionId?: number;
  sequence?: number;
  segmentId?: number;
}

export interface SttDispatchEvent extends BaseFields {
  type: 'stt-dispatch';
  /** LocalWhisperSTT.sessionGeneration — distinct identity domain from sessionId. */
  sttSessionGeneration?: number;
  audioStartMs?: number;
  audioEndMs?: number;
  textLength?: number;
  hostClockMs: number;
  clock: ClockDomain;
}

export interface WorkerResultEvent extends BaseFields {
  type: 'worker-result';
  sttSessionGeneration?: number;
  /** Duration computed inside the worker from worker-local performance.now()
   * endpoints only. Never a cross-clock subtraction. */
  workerQueueWaitMs?: number;
  workerInferenceMs?: number;
  textLength?: number;
}

export interface SttHostRoundTripEvent extends BaseFields {
  type: 'stt-host-roundtrip';
  sttSessionGeneration?: number;
  /** Host-local performance.now() duration: dispatch -> worker message received. */
  hostRoundTripMs: number;
  textLength?: number;
}

export interface MainEmitEvent extends BaseFields {
  type: 'main-emit';
  kind: 'partial' | 'final' | 'reset';
  speaker?: string;
  audioStartMs?: number;
  audioEndMs?: number;
  textLength?: number;
  mainEmitWallMs: number;
  clock: 'wall';
}

export interface RendererReceiveEvent extends BaseFields {
  type: 'renderer-receive';
  kind: 'partial' | 'final' | 'reset';
  speaker?: string;
  audioStartMs?: number;
  audioEndMs?: number;
  textLength?: number;
  rendererReceiveMonotonicMs: number;
  clock: 'monotonic';
}

export interface SessionCorrelationEvent {
  type: 'session-correlation';
  sessionId?: number;
  /** Recorded once per session: the one place wall and monotonic domains
   * are allowed to appear side by side, purely for later correlation. Never
   * subtract these two fields directly against different-domain timestamps. */
  wallMs: number;
  rendererMonotonicMs: number;
}

export interface SettlerDecisionEvent extends BaseFields {
  type: 'settler-decision';
  decision: SettlerDecision;
  /** Provisional observation id — explicitly NOT a stable roundId. Must never
   * be renamed/aliased to roundId; Step 2 has no genuine round identity. */
  observationId?: number;
  deadlineMs?: number;
  reason?: RoundEventReason;
  /** Observational audio gap (audio timeline) between adjacent accepted finals.
   * Computed only when both finals have complete metadata in the same session.
   * Never fed back into control flow. */
  audioGapMs?: number;
  /** Observational arrival gap (renderer monotonic) between adjacent accepted finals.
   * Never fed back into control flow. */
  arrivalGapMs?: number;
}

export interface AnswerLifecycleEvent extends BaseFields {
  type: 'answer-lifecycle';
  stage: 'enqueue' | 'start' | 'token' | 'done' | 'error' | 'cancel';
  /** Numeric answer id as it genuinely exists in production (never stringified). */
  answerId?: number;
  streamId?: number;
  textLength?: number;
  reason?: RoundEventReason;
}

export interface SessionResetEvent extends BaseFields {
  type: 'session-reset';
  reason: RoundEventReason;
}

export type RoundDiagnosticEvent =
  | SttDispatchEvent
  | WorkerResultEvent
  | SttHostRoundTripEvent
  | MainEmitEvent
  | RendererReceiveEvent
  | SessionCorrelationEvent
  | SettlerDecisionEvent
  | AnswerLifecycleEvent
  | SessionResetEvent;

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'stt-dispatch',
  'worker-result',
  'stt-host-roundtrip',
  'main-emit',
  'renderer-receive',
  'session-correlation',
  'settler-decision',
  'answer-lifecycle',
  'session-reset',
]);

/** Fields that must never carry text-like content, even if a caller passes
 * them by mistake. Anything not explicitly allowlisted per event type below
 * is stripped by the generic pass, and these names are rejected outright. */
const DENYLISTED_FIELD_NAMES = new Set([
  'text',
  'question',
  'answer',
  'prompt',
  'context',
  'retrievedContext',
  'filePath',
  'path',
  'error',
  'message',
  'stack',
  'hash',
  'token',
]);

/**
 * Phase 18 Step 2 fix: real source-local monotonic/wall timestamps
 * (performance.now(), Date.now()-derived diffs) are legitimately fractional.
 * The sanitizer must accept a finite non-negative number and round it here,
 * at the storage boundary, rather than rejecting fractional values outright
 * — otherwise genuine renderer/host timing data is silently dropped.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Rounds a validated non-negative finite number for storage. Ids, durations,
 * and timestamps are stored as non-negative integers after rounding. */
function roundNonNegative(value: number): number {
  return Math.round(value);
}

/**
 * audioGapMs is the one intentional signed exception: overlapping adjacent
 * audio segments can legitimately produce a negative gap. Everything else
 * (including arrivalGapMs) stays non-negative.
 */
function isFiniteSignedNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function sanitizeReason(value: unknown): RoundEventReason | undefined {
  if (typeof value !== 'string') return undefined;
  return (ROUND_EVENT_REASONS as readonly string[]).includes(value)
    ? (value as RoundEventReason)
    : 'unknown';
}

function pickBase(input: Record<string, unknown>): BaseFields {
  const out: BaseFields = {};
  if (isFiniteNumber(input.sessionId)) out.sessionId = roundNonNegative(input.sessionId);
  if (isFiniteNumber(input.sequence)) out.sequence = roundNonNegative(input.sequence);
  if (isFiniteNumber(input.segmentId)) out.segmentId = roundNonNegative(input.segmentId);
  return out;
}

/**
 * Validate + redact an arbitrary candidate event into a RoundDiagnosticEvent,
 * or return null when the shape is unusable. This is the single choke point
 * that enforces the privacy allowlist: unknown fields, text-like fields, and
 * non-allowlisted reason strings are stripped/rejected here, never passed
 * through.
 *
 * Returning null (rather than throwing) is deliberate — telemetry must never
 * change control flow, so a caller can always do
 * `recordRoundEvent(sanitizeRoundEvent(candidate))` without a try/catch.
 */
export function sanitizeRoundEvent(candidate: unknown): RoundDiagnosticEvent | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const input = candidate as Record<string, unknown>;
  const type = input.type;
  if (typeof type !== 'string' || !KNOWN_EVENT_TYPES.has(type)) return null;

  // Reject outright if any denylisted text-like field name is present with a
  // string value — this is a stronger signal of misuse than silently
  // stripping, so callers notice during development/tests.
  for (const key of Object.keys(input)) {
    if (DENYLISTED_FIELD_NAMES.has(key) && typeof input[key] === 'string') {
      return null;
    }
  }

  const base = pickBase(input);
  const textLength = isFiniteNumber(input.textLength) ? roundNonNegative(input.textLength) : undefined;

  switch (type) {
    case 'stt-dispatch': {
      if (!isFiniteNumber(input.hostClockMs)) return null;
      if (input.clock !== 'wall' && input.clock !== 'monotonic') return null;
      const clock: ClockDomain = input.clock;
      return {
        type: 'stt-dispatch',
        ...base,
        ...(isFiniteNumber(input.sttSessionGeneration) ? { sttSessionGeneration: roundNonNegative(input.sttSessionGeneration) } : {}),
        ...(isFiniteNumber(input.audioStartMs) ? { audioStartMs: roundNonNegative(input.audioStartMs) } : {}),
        ...(isFiniteNumber(input.audioEndMs) ? { audioEndMs: roundNonNegative(input.audioEndMs) } : {}),
        ...(textLength !== undefined ? { textLength } : {}),
        hostClockMs: roundNonNegative(input.hostClockMs),
        clock,
      };
    }
    case 'worker-result': {
      return {
        type: 'worker-result',
        ...base,
        ...(isFiniteNumber(input.sttSessionGeneration) ? { sttSessionGeneration: roundNonNegative(input.sttSessionGeneration) } : {}),
        ...(isFiniteNumber(input.workerQueueWaitMs) ? { workerQueueWaitMs: roundNonNegative(input.workerQueueWaitMs) } : {}),
        ...(isFiniteNumber(input.workerInferenceMs) ? { workerInferenceMs: roundNonNegative(input.workerInferenceMs) } : {}),
        ...(textLength !== undefined ? { textLength } : {}),
      };
    }
    case 'stt-host-roundtrip': {
      if (!isFiniteNumber(input.hostRoundTripMs)) return null;
      return {
        type: 'stt-host-roundtrip',
        ...base,
        ...(isFiniteNumber(input.sttSessionGeneration) ? { sttSessionGeneration: roundNonNegative(input.sttSessionGeneration) } : {}),
        hostRoundTripMs: roundNonNegative(input.hostRoundTripMs),
        ...(textLength !== undefined ? { textLength } : {}),
      };
    }
    case 'main-emit': {
      if (!isFiniteNumber(input.mainEmitWallMs)) return null;
      if (input.kind !== 'partial' && input.kind !== 'final' && input.kind !== 'reset') return null;
      return {
        type: 'main-emit',
        ...base,
        kind: input.kind,
        ...(isNonEmptyString(input.speaker) ? { speaker: input.speaker } : {}),
        ...(isFiniteNumber(input.audioStartMs) ? { audioStartMs: roundNonNegative(input.audioStartMs) } : {}),
        ...(isFiniteNumber(input.audioEndMs) ? { audioEndMs: roundNonNegative(input.audioEndMs) } : {}),
        ...(textLength !== undefined ? { textLength } : {}),
        mainEmitWallMs: roundNonNegative(input.mainEmitWallMs),
        clock: 'wall',
      };
    }
    case 'renderer-receive': {
      if (!isFiniteNumber(input.rendererReceiveMonotonicMs)) return null;
      if (input.kind !== 'partial' && input.kind !== 'final' && input.kind !== 'reset') return null;
      return {
        type: 'renderer-receive',
        ...base,
        kind: input.kind,
        ...(isNonEmptyString(input.speaker) ? { speaker: input.speaker } : {}),
        ...(isFiniteNumber(input.audioStartMs) ? { audioStartMs: roundNonNegative(input.audioStartMs) } : {}),
        ...(isFiniteNumber(input.audioEndMs) ? { audioEndMs: roundNonNegative(input.audioEndMs) } : {}),
        ...(textLength !== undefined ? { textLength } : {}),
        rendererReceiveMonotonicMs: roundNonNegative(input.rendererReceiveMonotonicMs),
        clock: 'monotonic',
      };
    }
    case 'session-correlation': {
      if (!isFiniteNumber(input.wallMs) || !isFiniteNumber(input.rendererMonotonicMs)) return null;
      return {
        type: 'session-correlation',
        ...(isFiniteNumber(input.sessionId) ? { sessionId: roundNonNegative(input.sessionId) } : {}),
        wallMs: roundNonNegative(input.wallMs),
        rendererMonotonicMs: roundNonNegative(input.rendererMonotonicMs),
      };
    }
    case 'settler-decision': {
      if (!(SETTLER_DECISIONS as readonly string[]).includes(input.decision as string)) return null;
      // audioGapMs is the one signed exception — overlapping segments can produce negative gaps
      const audioGapMs = isFiniteSignedNumber(input.audioGapMs) ? Math.round(input.audioGapMs) : undefined;
      return {
        type: 'settler-decision',
        ...base,
        decision: input.decision as SettlerDecision,
        ...(isFiniteNumber(input.observationId) ? { observationId: roundNonNegative(input.observationId) } : {}),
        ...(isFiniteNumber(input.deadlineMs) ? { deadlineMs: roundNonNegative(input.deadlineMs) } : {}),
        ...(sanitizeReason(input.reason) ? { reason: sanitizeReason(input.reason) } : {}),
        ...(audioGapMs !== undefined ? { audioGapMs } : {}),
        ...(isFiniteNumber(input.arrivalGapMs) ? { arrivalGapMs: roundNonNegative(input.arrivalGapMs) } : {}),
      };
    }
    case 'answer-lifecycle': {
      const stage = input.stage;
      if (
        stage !== 'enqueue' && stage !== 'start' && stage !== 'token' &&
        stage !== 'done' && stage !== 'error' && stage !== 'cancel'
      ) return null;
      return {
        type: 'answer-lifecycle',
        ...base,
        stage,
        ...(isFiniteNumber(input.answerId) ? { answerId: roundNonNegative(input.answerId) } : {}),
        ...(isFiniteNumber(input.streamId) ? { streamId: roundNonNegative(input.streamId) } : {}),
        ...(textLength !== undefined ? { textLength } : {}),
        ...(sanitizeReason(input.reason) ? { reason: sanitizeReason(input.reason) } : {}),
      };
    }
    case 'session-reset': {
      const reason = sanitizeReason(input.reason) ?? 'unknown';
      return {
        type: 'session-reset',
        ...base,
        reason,
      };
    }
    default:
      return null;
  }
}

/**
 * Bounded FIFO store, capped at exactly ROUND_EVENT_CAP (200) records.
 * `reset()` clears prior-session records before new-session records are
 * appended — callers invoke it on session invalidation before recording any
 * new-session event.
 */
export class RoundEventStore {
  private events: RoundDiagnosticEvent[] = [];

  /** Sanitizes and appends. Never throws; a malformed candidate is silently
   * dropped so telemetry can never influence caller control flow. */
  record(candidate: unknown): void {
    try {
      const event = sanitizeRoundEvent(candidate);
      if (!event) return;
      this.events.push(event);
      if (this.events.length > ROUND_EVENT_CAP) {
        this.events.splice(0, this.events.length - ROUND_EVENT_CAP);
      }
    } catch {
      // Telemetry must never throw into production control flow.
    }
  }

  reset(): void {
    this.events = [];
  }

  snapshot(): RoundDiagnosticEvent[] {
    return this.events.slice();
  }
}
