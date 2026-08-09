// Phase 18 Step 2 diagnostic-only telemetry (renderer side). NOT the round
// coordinator — observational recording only, must never influence control
// flow. See docs/superpowers/plans/2026-08-08-question-round-aggregation.md
// Step 2 and roundEventsSchema.ts for the shared schema.
//
// Exposes window.__nativelyInterviewRoundEvents — a NEW, independent
// capped-200 redacted probe. This is intentionally separate from the
// existing capped-500 window.__nativelyInterviewTranscriptEvents; never
// merge, rename, or copy text-bearing fields between the two.
import { RoundEventStore, type RoundDiagnosticEvent } from './roundEventsSchema.ts'
import type { NativeAudioTranscriptEvent } from '../types/electron.js'

type RoundEventsWindow = Window & {
  __nativelyInterviewRoundEvents?: RoundDiagnosticEvent[]
}

const store = new RoundEventStore()

/** Once-per-session wall/monotonic correlation, recorded only when the first
 * event carrying a genuine canonical sessionId arrives. */
let sessionCorrelation: { sessionId: number; wallMs: number; rendererMonotonicMs: number } | null = null

/** Previous accepted interviewer final, used to compute audioGapMs and
 * arrivalGapMs for the next accepted final. Reset on session invalidation. */
let previousFinal: {
  sessionId: number
  audioEndMs?: number
  rendererReceiveMonotonicMs: number
} | null = null

function publish(): void {
  try {
    ;(window as RoundEventsWindow).__nativelyInterviewRoundEvents = store.snapshot()
  } catch {
    // Telemetry must never throw into renderer control flow.
  }
}

/** Record one diagnostic event. Never throws; a malformed candidate is
 * silently dropped by the shared sanitizer. */
export function recordRoundEvent(candidate: unknown): void {
  try {
    store.record(candidate)
    publish()
  } catch {
    // no-op — observational only
  }
}

/**
 * Materialize all applicable diagnostic events from one NativeAudioTranscriptEvent
 * plus renderer receive timestamp. This is the single production transformation
 * that converts carried diagnostics into the structured event list.
 *
 * Returns an array of events to record (may be empty). Caller must iterate and
 * call recordRoundEvent for each.
 */
export function materializeTranscriptDiagnostics(
  event: NativeAudioTranscriptEvent,
  rendererReceiveMonotonicMs: number
): RoundDiagnosticEvent[] {
  const events: RoundDiagnosticEvent[] = []
  const d = event.diagnostics

  // Record once-per-session correlation when the first event carrying a genuine
  // canonical sessionId arrives. Include that sessionId.
  if (
    typeof event.sessionId === 'number' &&
    (!sessionCorrelation || sessionCorrelation.sessionId !== event.sessionId)
  ) {
    sessionCorrelation = {
      sessionId: event.sessionId,
      wallMs: Date.now(),
      rendererMonotonicMs: performance.now(),
    }
    events.push({
      type: 'session-correlation',
      sessionId: event.sessionId,
      wallMs: sessionCorrelation.wallMs,
      rendererMonotonicMs: sessionCorrelation.rendererMonotonicMs,
    })
  }

  if (!d) {
    // No diagnostics carried — only materialize renderer-receive
    events.push({
      type: 'renderer-receive',
      kind: event.kind,
      speaker: event.speaker,
      sessionId: event.sessionId,
      sequence: event.sequence,
      ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
      ...(typeof event.audioStartMs === 'number' ? { audioStartMs: event.audioStartMs } : {}),
      ...(typeof event.audioEndMs === 'number' ? { audioEndMs: event.audioEndMs } : {}),
      rendererReceiveMonotonicMs,
      clock: 'monotonic',
    })
    return events
  }

  // STT dispatch (if hostDispatchMonotonicMs is present)
  if (typeof d.hostDispatchMonotonicMs === 'number') {
    events.push({
      type: 'stt-dispatch',
      sessionId: event.sessionId,
      sequence: event.sequence,
      ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
      ...(typeof d.sttSessionGeneration === 'number' ? { sttSessionGeneration: d.sttSessionGeneration } : {}),
      ...(typeof event.audioStartMs === 'number' ? { audioStartMs: event.audioStartMs } : {}),
      ...(typeof event.audioEndMs === 'number' ? { audioEndMs: event.audioEndMs } : {}),
      ...(typeof d.textLength === 'number' ? { textLength: d.textLength } : {}),
      hostClockMs: d.hostDispatchMonotonicMs,
      clock: 'monotonic',
    })
  }

  // Worker result (if worker diagnostics are present)
  if (
    typeof d.workerQueueWaitMs === 'number' ||
    typeof d.workerInferenceMs === 'number'
  ) {
    events.push({
      type: 'worker-result',
      sessionId: event.sessionId,
      sequence: event.sequence,
      ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
      ...(typeof d.sttSessionGeneration === 'number' ? { sttSessionGeneration: d.sttSessionGeneration } : {}),
      ...(typeof d.workerQueueWaitMs === 'number' ? { workerQueueWaitMs: d.workerQueueWaitMs } : {}),
      ...(typeof d.workerInferenceMs === 'number' ? { workerInferenceMs: d.workerInferenceMs } : {}),
      ...(typeof d.textLength === 'number' ? { textLength: d.textLength } : {}),
    })
  }

  // STT host round-trip (if present)
  if (typeof d.hostRoundTripMs === 'number') {
    events.push({
      type: 'stt-host-roundtrip',
      sessionId: event.sessionId,
      sequence: event.sequence,
      ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
      ...(typeof d.sttSessionGeneration === 'number' ? { sttSessionGeneration: d.sttSessionGeneration } : {}),
      hostRoundTripMs: d.hostRoundTripMs,
      ...(typeof d.textLength === 'number' ? { textLength: d.textLength } : {}),
    })
  }

  // Main emit (if present)
  if (typeof d.mainEmitWallMs === 'number') {
    events.push({
      type: 'main-emit',
      kind: event.kind,
      speaker: event.speaker,
      sessionId: event.sessionId,
      sequence: event.sequence,
      ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
      ...(typeof event.audioStartMs === 'number' ? { audioStartMs: event.audioStartMs } : {}),
      ...(typeof event.audioEndMs === 'number' ? { audioEndMs: event.audioEndMs } : {}),
      ...(typeof d.textLength === 'number' ? { textLength: d.textLength } : {}),
      mainEmitWallMs: d.mainEmitWallMs,
      clock: 'wall',
    })
  }

  // Renderer receive (always)
  events.push({
    type: 'renderer-receive',
    kind: event.kind,
    speaker: event.speaker,
    sessionId: event.sessionId,
    sequence: event.sequence,
    ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
    ...(typeof event.audioStartMs === 'number' ? { audioStartMs: event.audioStartMs } : {}),
    ...(typeof event.audioEndMs === 'number' ? { audioEndMs: event.audioEndMs } : {}),
    ...(typeof d.textLength === 'number' ? { textLength: d.textLength } : {}),
    rendererReceiveMonotonicMs,
    clock: 'monotonic',
  })

  return events
}

/**
 * Compute observational audioGapMs and arrivalGapMs for an accepted interviewer
 * final. These are diagnostic-only values and must never influence control flow.
 *
 * Returns { audioGapMs?, arrivalGapMs? } or empty object if gaps cannot be
 * computed (no previous final, different session, missing metadata).
 */
export function computeAcceptedFinalGaps(
  event: NativeAudioTranscriptEvent,
  rendererReceiveMonotonicMs: number
): { audioGapMs?: number; arrivalGapMs?: number } {
  const gaps: { audioGapMs?: number; arrivalGapMs?: number } = {}

  // Only compute for same-session adjacent finals when both have complete metadata
  if (
    previousFinal &&
    typeof event.sessionId === 'number' &&
    previousFinal.sessionId === event.sessionId &&
    typeof previousFinal.audioEndMs === 'number' &&
    typeof event.audioStartMs === 'number'
  ) {
    gaps.audioGapMs = Math.round(event.audioStartMs - previousFinal.audioEndMs)
  }

  // Arrival gap always computable when there's a previous final (non-negative)
  if (previousFinal && previousFinal.sessionId === event.sessionId) {
    gaps.arrivalGapMs = Math.max(0, Math.round(rendererReceiveMonotonicMs - previousFinal.rendererReceiveMonotonicMs))
  }

  // Update previous final for next observation
  previousFinal = {
    sessionId: event.sessionId,
    audioEndMs: event.audioEndMs,
    rendererReceiveMonotonicMs,
  }

  return gaps
}

/**
 * Single production function: materialize, sanitize, store, and publish atomically.
 * This is the one function InterviewConsole calls for transcript events. Tests
 * must call this same function and inspect the exported read-only snapshot.
 */
export function recordTranscriptDiagnostics(
  event: NativeAudioTranscriptEvent,
  receiveMonotonicMs: number
): void {
  try {
    const materialized = materializeTranscriptDiagnostics(event, receiveMonotonicMs)
    materialized.forEach(recordRoundEvent)
  } catch {
    // Telemetry must never throw into caller control flow
  }
}

/** Clear the previous session first, then retain the canonical transcript
 * reset boundary as the first observation of the cleared probe. */
export function recordTranscriptResetDiagnostics(
  event: NativeAudioTranscriptEvent,
  receiveMonotonicMs: number
): void {
  try {
    resetRoundEvents()
    recordTranscriptDiagnostics(event, receiveMonotonicMs)
    recordRoundEvent({
      type: 'session-reset',
      sessionId: event.sessionId,
      sequence: event.sequence,
      ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
      reason: 'session-reset',
    })
  } catch {
    // Telemetry must never throw into transcript control flow.
  }
}

/** Clear prior-session records, correlation, and previous-final state before
 * new-session records are appended. */
export function resetRoundEvents(): void {
  try {
    store.reset()
    sessionCorrelation = null
    previousFinal = null
    publish()
  } catch {
    // no-op
  }
}

/** Read-only snapshot for tests and diagnostics. */
export function getRoundEventsSnapshot(): RoundDiagnosticEvent[] {
  try {
    return store.snapshot()
  } catch {
    return []
  }
}
