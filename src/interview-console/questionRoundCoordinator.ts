// Phase 18 pure question-round coordinator.
//
// Owns round/attempt identity and lifecycle for interviewer question rounds.
// It is deliberately free of React, Electron, IPC, audio and telemetry: callers
// feed it finals/ticks/provider events and apply the returned actions.
//
// The coordinator is answer-text agnostic: Provider token/finalText payloads stay
// opaque and only move attempt lifecycle forward. Draft/final answer text belongs
// to the answer-history reducer.

export type RoundStatus = 'idle' | 'generating' | 'answered' | 'error';

export type RoundBoundaryReason =
  | 'session-change'
  | 'audio-gap'
  | 'arrival-gap'
  | 'candidate-turn'
  | 'round-closed'
  | 'first-round'
  | null;

/** Minimal shape the coordinator reads from an accepted transcript final. */
export interface TranscriptFinal {
  speaker?: string;
  text?: string;
  final?: boolean;
  sessionId?: number | null;
  sequence?: number;
  segmentId?: number;
  arrivalMs?: number;
  audioStartMs?: number;
  audioEndMs?: number;
}

export interface GenerateAction {
  type: 'generate';
  roundId: number;
  answerId: number;
  attemptId: number;
  question: string;
  reason: 'provisional' | 'restart';
}

export interface CancelAction {
  type: 'cancel';
  roundId: number;
  answerId: number;
  attemptId: number;
}

export interface ReviseHistoryAction {
  type: 'reviseHistory';
  id: number;
  question: string;
}

export type RoundAction = GenerateAction | CancelAction | ReviseHistoryAction;

export interface RoundSnapshot {
  roundId: number | null;
  roundOpen: boolean;
  pendingQuestion: string;
  turns: TranscriptFinal[];
  answerId: number | null;
  attemptId: number | null;
  status: RoundStatus;
  sessionGeneration: number;
  sessionId: number | null;
  lastArrivalMs: number | null;
  lastAudioEndMs: number | null;
  boundaryReason: RoundBoundaryReason;
  streamId: number | null;
}

export interface ProviderEvent {
  type: 'token' | 'done' | 'error';
  sessionGeneration?: number;
  answerId?: number;
  attemptId?: number;
  streamId?: number;
  token?: string;
  finalText?: string;
  error?: string;
}

export interface QuestionRoundCoordinatorOptions {
  allocateAnswerId: () => number;
  provisionalDelayMs?: number;
  roundGapMs?: number;
}

export interface QuestionRoundCoordinator {
  acceptInterviewerFinal(final: TranscriptFinal): { actions: RoundAction[] };
  acceptCandidateFinal(final: TranscriptFinal): { actions: RoundAction[] };
  tick(arrivalMs: number): { actions: RoundAction[] };
  resetTranscript(): { actions: RoundAction[] };
  bindStream(binding: { answerId: number; attemptId: number; streamId: number }): void;
  acceptProviderEvent(event: ProviderEvent): { accepted: boolean; actions: RoundAction[] };
  getSnapshot(): RoundSnapshot;
}

const DEFAULT_PROVISIONAL_DELAY_MS = 2500;
const DEFAULT_ROUND_GAP_MS = 5000;
const MAX_PENDING_CANDIDATE_FINALS = 32;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeSessionId(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

export function createQuestionRoundCoordinator(
  options: QuestionRoundCoordinatorOptions,
): QuestionRoundCoordinator {
  const allocateAnswerId = options.allocateAnswerId;
  const provisionalDelayMs = isFiniteNumber(options.provisionalDelayMs)
    ? options.provisionalDelayMs
    : DEFAULT_PROVISIONAL_DELAY_MS;
  const roundGapMs = isFiniteNumber(options.roundGapMs)
    ? options.roundGapMs
    : DEFAULT_ROUND_GAP_MS;

  let roundSequence = 0;
  let attemptSequence = 0;

  let roundId: number | null = null;
  let roundOpen = false;
  let pendingQuestion = '';
  let turns: TranscriptFinal[] = [];
  let answerId: number | null = null;
  let attemptId: number | null = null;
  let status: RoundStatus = 'idle';
  let sessionGeneration = 0;
  let sessionId: number | null = null;
  let lastArrivalMs: number | null = null;
  let lastAudioEndMs: number | null = null;
  let boundaryReason: RoundBoundaryReason = null;
  let streamId: number | null = null;
  let provisionalFired = false;
  let pendingCandidateFinals: TranscriptFinal[] = [];

  // Minimal prior provenance, kept internal so delayed older finals can be
  // rejected before any mutation. Not exposed on the snapshot.
  let lastSequence: number | null = null;
  let lastSegmentId: number | null = null;
  let lastAudioStartMs: number | null = null;

  /**
   * Live attempt identities that may still receive Provider events, including
   * an attempt inherited from a previous same-session round. Bounded so a long
   * session cannot grow it without limit.
   */
  interface AttemptIdentity {
    sessionGeneration: number;
    answerId: number;
    attemptId: number;
    streamId: number | null;
  }
  const MAX_LIVE_ATTEMPTS = 8;
  const liveAttempts = new Map<string, AttemptIdentity>();

  function attemptKey(sg: number, aid: number, att: number): string {
    return `${sg}:${aid}:${att}`;
  }

  function registerAttempt(aid: number, att: number): void {
    const key = attemptKey(sessionGeneration, aid, att);
    liveAttempts.delete(key);
    liveAttempts.set(key, { sessionGeneration, answerId: aid, attemptId: att, streamId: null });
    while (liveAttempts.size > MAX_LIVE_ATTEMPTS) {
      const oldest = liveAttempts.keys().next();
      if (oldest.done) break;
      liveAttempts.delete(oldest.value);
    }
  }

  function retireAttempt(sg: number, aid: number | null, att: number | null): void {
    if (aid === null || att === null) return;
    liveAttempts.delete(attemptKey(sg, aid, att));
  }

  function isCurrentAttempt(entry: AttemptIdentity): boolean {
    return entry.sessionGeneration === sessionGeneration
      && entry.answerId === answerId
      && entry.attemptId === attemptId;
  }

  function getSnapshot(): RoundSnapshot {
    return {
      roundId,
      roundOpen,
      pendingQuestion,
      turns: turns.map((turn) => ({ ...turn })),
      answerId,
      attemptId,
      status,
      sessionGeneration,
      sessionId,
      lastArrivalMs,
      lastAudioEndMs,
      boundaryReason,
      streamId,
    };
  }

  function cancelActiveAttempt(actions: RoundAction[]): void {
    if (status !== 'generating' || roundId === null || answerId === null || attemptId === null) return;
    actions.push({ type: 'cancel', roundId, answerId, attemptId });
    retireAttempt(sessionGeneration, answerId, attemptId);
    streamId = null;
  }

  function rememberProvenance(final: TranscriptFinal): void {
    lastArrivalMs = isFiniteNumber(final.arrivalMs) ? final.arrivalMs : lastArrivalMs;
    lastAudioEndMs = isFiniteNumber(final.audioEndMs) ? final.audioEndMs : null;
    lastAudioStartMs = isFiniteNumber(final.audioStartMs) ? final.audioStartMs : null;
    lastSequence = isFiniteNumber(final.sequence) ? final.sequence : null;
    lastSegmentId = isFiniteNumber(final.segmentId) ? final.segmentId : null;
    sessionId = normalizeSessionId(final.sessionId);
  }

  /**
   * True when this final is provably older than the last accepted one within the
   * same session, i.e. a delayed duplicate/tail that must be dropped before any
   * mutation. Sequence wins when both sides have one, then segmentId, then
   * complete audio provenance as a last fallback.
   */
  function isDelayedOlderFinal(final: TranscriptFinal): boolean {
    if (roundId === null) return false;
    if (normalizeSessionId(final.sessionId) !== sessionId) return false;

    if (isFiniteNumber(final.sequence) && lastSequence !== null) {
      return final.sequence < lastSequence;
    }
    if (isFiniteNumber(final.segmentId) && lastSegmentId !== null) {
      return final.segmentId < lastSegmentId;
    }
    if (
      isFiniteNumber(final.audioStartMs)
      && isFiniteNumber(final.audioEndMs)
      && lastAudioStartMs !== null
      && lastAudioEndMs !== null
    ) {
      return final.audioEndMs <= lastAudioStartMs;
    }
    return false;
  }

  /** Decide whether this final continues the open round or opens a new one. */
  function classifyBoundary(final: TranscriptFinal): RoundBoundaryReason {
    if (roundId === null) return 'first-round';
    if (normalizeSessionId(final.sessionId) !== sessionId) return 'session-change';
    if (!roundOpen) return 'round-closed';

    if (isFiniteNumber(lastAudioEndMs) && isFiniteNumber(final.audioStartMs)) {
      const previousInterviewerAudioEndMs = lastAudioEndMs;
      const nextInterviewerAudioStartMs = final.audioStartMs;
      if (nextInterviewerAudioStartMs - previousInterviewerAudioEndMs >= roundGapMs) return 'audio-gap';
      const hasCandidateTurn = pendingCandidateFinals.some((candidate) => (
        normalizeSessionId(candidate.sessionId) === sessionId
        && isFiniteNumber(candidate.audioStartMs)
        && isFiniteNumber(candidate.audioEndMs)
        && candidate.audioStartMs < candidate.audioEndMs
        && candidate.audioStartMs > previousInterviewerAudioEndMs
        && candidate.audioEndMs < nextInterviewerAudioStartMs
      ));
      if (hasCandidateTurn) return 'candidate-turn';
      return null;
    }
    if (isFiniteNumber(final.arrivalMs) && isFiniteNumber(lastArrivalMs)) {
      return final.arrivalMs - lastArrivalMs >= roundGapMs ? 'arrival-gap' : null;
    }
    return null;
  }

  function startRound(final: TranscriptFinal, reason: RoundBoundaryReason): void {
    roundSequence += 1;
    roundId = roundSequence;
    roundOpen = true;
    pendingQuestion = String(final.text ?? '').trim();
    turns = [{ ...final }];
    answerId = null;
    attemptId = null;
    status = 'idle';
    boundaryReason = reason;
    streamId = null;
    provisionalFired = false;
    pendingCandidateFinals = [];
  }

  function acceptInterviewerFinal(final: TranscriptFinal): { actions: RoundAction[] } {
    const actions: RoundAction[] = [];
    if (isDelayedOlderFinal(final)) return { actions };

    const reason = classifyBoundary(final);
    pendingCandidateFinals = [];

    if (reason !== null) {
      if (reason === 'session-change') {
        cancelActiveAttempt(actions);
        sessionGeneration += 1;
        liveAttempts.clear();
      }
      startRound(final, reason);
      rememberProvenance(final);
      return { actions };
    }

    // Same round: append the new text and restart generation when an attempt
    // already exists for this round.
    const addition = String(final.text ?? '').trim();
    pendingQuestion = [pendingQuestion, addition].filter(Boolean).join(' ');
    turns = [...turns, { ...final }];
    rememberProvenance(final);

    if (answerId === null || attemptId === null) return { actions };

    cancelActiveAttempt(actions);
    // A same-round restart supersedes the previous attempt regardless of whether
    // it was still generating (completed/errored attempts are retired too).
    retireAttempt(sessionGeneration, answerId, attemptId);
    attemptSequence += 1;
    attemptId = attemptSequence;
    status = 'generating';
    streamId = null;
    registerAttempt(answerId, attemptId);
    actions.push({ type: 'reviseHistory', id: answerId, question: pendingQuestion });
    actions.push({
      type: 'generate',
      roundId: roundId as number,
      answerId,
      attemptId,
      question: pendingQuestion,
      reason: 'restart',
    });
    return { actions };
  }

  /**
   * Internal helper: allocate answer/attempt IDs and create one provisional
   * generate action for the current pending round. Extracted from tick() to
   * support both timer-based and candidate-final-flush triggers.
   */
  function fireProvisionalGeneration(): GenerateAction {
    if (answerId === null) answerId = allocateAnswerId();
    attemptSequence += 1;
    attemptId = attemptSequence;
    status = 'generating';
    provisionalFired = true;
    streamId = null;
    registerAttempt(answerId, attemptId);
    return {
      type: 'generate',
      roundId: roundId as number,
      answerId,
      attemptId,
      question: pendingQuestion,
      reason: 'provisional',
    };
  }

  function acceptCandidateFinal(final: TranscriptFinal): { actions: RoundAction[] } {
    if (roundId === null) return { actions: [] };
    if (final.speaker !== 'user' || final.final !== true) return { actions: [] };

    pendingCandidateFinals.push({ ...final });
    if (pendingCandidateFinals.length > MAX_PENDING_CANDIDATE_FINALS) {
      pendingCandidateFinals.splice(0, pendingCandidateFinals.length - MAX_PENDING_CANDIDATE_FINALS);
    }

    // Candidate-final flush: generate for a non-empty round that has not fired
    // provisionally, but keep the round open until the next interviewer final
    // proves whether this was a real candidate turn or overlapping cross-talk.
    const shouldFlush = pendingQuestion.trim()
      && !provisionalFired
      && answerId === null
      && status === 'idle';

    if (shouldFlush) {
      const action = fireProvisionalGeneration();
      return { actions: [action] };
    }

    return { actions: [] };
  }

  function tick(arrivalMs: number): { actions: RoundAction[] } {
    if (!roundOpen || provisionalFired || status !== 'idle') return { actions: [] };
    if (!pendingQuestion.trim()) return { actions: [] };
    if (!isFiniteNumber(arrivalMs) || !isFiniteNumber(lastArrivalMs)) return { actions: [] };
    if (arrivalMs - lastArrivalMs < provisionalDelayMs) return { actions: [] };

    const action = fireProvisionalGeneration();
    return { actions: [action] };
  }

  function resetTranscript(): { actions: RoundAction[] } {
    const actions: RoundAction[] = [];
    cancelActiveAttempt(actions);
    sessionGeneration += 1;
    roundId = null;
    roundOpen = false;
    pendingQuestion = '';
    turns = [];
    answerId = null;
    attemptId = null;
    status = 'idle';
    sessionId = null;
    lastArrivalMs = null;
    lastAudioEndMs = null;
    boundaryReason = null;
    streamId = null;
    provisionalFired = false;
    lastSequence = null;
    lastSegmentId = null;
    lastAudioStartMs = null;
    pendingCandidateFinals = [];
    liveAttempts.clear();
    return { actions };
  }

  function bindStream(binding: { answerId: number; attemptId: number; streamId: number }): void {
    if (!isFiniteNumber(binding.streamId)) return;
    if (!isFiniteNumber(binding.answerId) || !isFiniteNumber(binding.attemptId)) return;
    const entry = liveAttempts.get(attemptKey(sessionGeneration, binding.answerId, binding.attemptId));
    if (!entry) return;
    entry.streamId = binding.streamId;
    if (isCurrentAttempt(entry)) streamId = binding.streamId;
  }

  /** Resolve the live attempt this event belongs to, or null when stale. */
  function resolveAttempt(event: ProviderEvent): AttemptIdentity | null {
    if (!isFiniteNumber(event.sessionGeneration)) return null;
    if (!isFiniteNumber(event.answerId) || !isFiniteNumber(event.attemptId)) return null;
    const entry = liveAttempts.get(
      attemptKey(event.sessionGeneration, event.answerId, event.attemptId),
    );
    if (!entry) return null;
    if (entry.streamId === null || event.streamId !== entry.streamId) return null;
    return entry;
  }

  function acceptProviderEvent(event: ProviderEvent): { accepted: boolean; actions: RoundAction[] } {
    const entry = resolveAttempt(event);
    if (!entry) return { accepted: false, actions: [] };

    const current = isCurrentAttempt(entry);

    // Token text is opaque: only the attempt lifecycle moves, and only when the
    // event belongs to the current round's attempt.
    if (event.type === 'token') {
      if (current) status = 'generating';
      return { accepted: true, actions: [] };
    }

    if (current) status = event.type === 'done' ? 'answered' : 'error';
    // Terminal events retire the attempt; a completed current attempt can still
    // be reopened by a same-round append, which registers a fresh attempt.
    retireAttempt(entry.sessionGeneration, entry.answerId, entry.attemptId);
    if (current) streamId = null;
    return { accepted: true, actions: [] };
  }

  return {
    acceptInterviewerFinal,
    acceptCandidateFinal,
    tick,
    resetTranscript,
    bindStream,
    acceptProviderEvent,
    getSnapshot,
  };
}
