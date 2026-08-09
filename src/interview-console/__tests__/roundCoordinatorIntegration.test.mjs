// Phase 18 Step 5 pure integration suite.
//
// These tests exercise the REAL createQuestionRoundCoordinator together with the
// REAL answerHistoryReducer. Everything else in this file is a deliberately
// small TEST HARNESS that stands in for the renderer's action applier: it is
// NOT a claim about InterviewConsole.tsx's source. The renderer source contract
// lives in scripts/__tests__/interview-console-round-wiring.test.mjs.
//
// The harness only encodes behaviour the Step 5 contract requires of whatever
// applies coordinator actions: one history row per round, synchronous ordered
// application, stale-identity rejection before mutation, and FIFO for
// independent rounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionRoundCoordinator } from '../questionRoundCoordinator.ts';
import { answerHistoryReducer, createAnswerHistoryState } from '../answerHistory.ts';

const PROVISIONAL_MS = 2500;
const ROUND_GAP_MS = 5000;
const SESSION_A = 501;
const SESSION_B = 502;

// --- test harness ----------------------------------------------------------

/**
 * TEST HARNESS (not production code): applies coordinator actions to the real
 * answer-history reducer the way the Step 5 contract requires the renderer to.
 */
function createHarness({ allocateStart = 1 } = {}) {
  let answerSequence = allocateStart - 1;
  const coordinator = createQuestionRoundCoordinator({
    allocateAnswerId: () => ++answerSequence,
  });

  let history = createAnswerHistoryState(10);
  const queue = [];
  let active = null;
  const cancelledStreams = [];
  const staleFloor = { streamId: 0 };
  let nextStreamId = 100;

  const dispatch = (action) => { history = answerHistoryReducer(history, action); };

  function pump() {
    if (active) return;
    const job = queue.shift();
    if (!job) return;
    if (job.roundSessionGeneration !== coordinator.getSnapshot().sessionGeneration) return pump();
    active = { ...job, stale: false, streamId: undefined, deadline: true };
    dispatch({ type: 'start', id: job.answerId });
  }

  /** Cancel the active job only when it is the exact attempt being superseded. */
  function cancelActive(action) {
    if (!active) return;
    if (active.answerId !== action.answerId || active.attemptId !== action.attemptId) return;
    active.stale = true;
    active.deadline = false;
    if (typeof active.streamId === 'number') {
      staleFloor.streamId = Math.max(staleFloor.streamId, active.streamId);
      cancelledStreams.push(active.streamId);
    }
    active = null;
  }

  function applyActions(actions) {
    for (const action of actions) {
      if (action.type === 'reviseHistory') {
        dispatch({ type: 'revise', id: action.id, question: action.question });
        continue;
      }
      if (action.type === 'cancel') {
        cancelActive(action);
        continue;
      }
      // generate
      const job = {
        answerId: action.answerId,
        attemptId: action.attemptId,
        roundId: action.roundId,
        question: action.question,
        roundSessionGeneration: coordinator.getSnapshot().sessionGeneration,
      };
      if (action.reason === 'provisional') {
        dispatch({ type: 'enqueue', id: action.answerId, question: action.question });
        queue.push(job);
      } else {
        const queuedIndex = queue.findIndex(
          (entry) => entry.answerId === action.answerId,
        );
        if (queuedIndex >= 0) queue.splice(queuedIndex, 1, job);
        else queue.unshift(job);
      }
      pump();
    }
  }

  /** Bind the externally assigned stream id on the first tagged callback. */
  function bindStream() {
    if (!active || typeof active.streamId === 'number') return null;
    const streamId = ++nextStreamId;
    active.streamId = streamId;
    coordinator.bindStream({ answerId: active.answerId, attemptId: active.attemptId, streamId });
    return streamId;
  }

  /**
   * Provider event: the full coordinator tuple must validate before any history
   * / queue / status mutation happens.
   */
  function provider(event) {
    const result = coordinator.acceptProviderEvent(event);
    if (!result.accepted) return false;
    if (!active) return false;
    if (active.stale) return false;
    if (active.answerId !== event.answerId || active.attemptId !== event.attemptId) return false;
    if (active.streamId !== event.streamId) return false;
    if (event.type === 'token') {
      dispatch({ type: 'token', id: event.answerId, token: event.token });
      return true;
    }
    if (event.type === 'done') {
      dispatch({ type: 'done', id: event.answerId, finalText: event.finalText });
    } else {
      dispatch({ type: 'error', id: event.answerId, error: event.error });
    }
    active = null;
    pump();
    return true;
  }

  return {
    coordinator,
    get history() { return history; },
    get queue() { return queue.slice(); },
    get active() { return active; },
    get cancelledStreams() { return cancelledStreams.slice(); },
    get staleFloor() { return staleFloor.streamId; },
    interviewerFinal(final) { applyActions(coordinator.acceptInterviewerFinal(final).actions); },
    candidateFinal(final) { applyActions(coordinator.acceptCandidateFinal(final).actions); },
    tick(arrivalMs) { applyActions(coordinator.tick(arrivalMs).actions); },
    reset() { applyActions(coordinator.resetTranscript().actions); dispatch({ type: 'reset' }); },
    bindStream,
    provider,
  };
}

function interviewerFinal(overrides) {
  return {
    speaker: 'interviewer',
    text: '',
    final: true,
    sessionId: SESSION_A,
    ...overrides,
  };
}

/** The fixed SPI + CRC32 + half-packet reproduction: three interviewer finals
 *  with short audio gaps but large renderer arrival gaps. */
const THREE_PARTS = [
  interviewerFinal({
    text: '你怎么设计 SPI 帧头？',
    sequence: 1, segmentId: 1,
    audioStartMs: 0, audioEndMs: 1200, arrivalMs: 1000,
  }),
  interviewerFinal({
    text: '还有 CRC32 校验？',
    sequence: 2, segmentId: 2,
    audioStartMs: 1500, audioEndMs: 2600, arrivalMs: 9000,
  }),
  interviewerFinal({
    text: '半包怎么处理？',
    sequence: 3, segmentId: 3,
    audioStartMs: 2800, audioEndMs: 4000, arrivalMs: 17000,
  }),
];

// ---------------------------------------------------------------------------
// Requirement 1: one answer / one row / one selection / all three signals
// ---------------------------------------------------------------------------

test('three short-audio-gap interviewer finals with delayed arrivals keep one answer id and one history row', () => {
  const h = createHarness();
  for (const part of THREE_PARTS) h.interviewerFinal(part);

  const snapshot = h.coordinator.getSnapshot();
  assert.equal(snapshot.turns.length, 3, 'all three parts belong to the same round');

  h.tick(THREE_PARTS[2].arrivalMs + PROVISIONAL_MS);
  const answerId = h.coordinator.getSnapshot().answerId;
  assert.equal(typeof answerId, 'number', 'the round allocated one answer id');
  assert.equal(h.history.items.length, 1, 'exactly one history row for the round');
  assert.equal(h.history.items[0].id, answerId, 'the row uses the coordinator answer id');
  assert.equal(h.history.selectedId, answerId, 'one stable selection');

  const question = h.history.items[0].question;
  for (const signal of ['SPI', 'CRC32', '半包']) {
    assert.ok(question.includes(signal), `combined question keeps the ${signal} signal, got: ${question}`);
  }
});

test('a fresh same-round final replaces the visible draft only after the new attempt streams', () => {
  const h = createHarness();
  h.interviewerFinal(THREE_PARTS[0]);
  h.tick(THREE_PARTS[0].arrivalMs + PROVISIONAL_MS);
  const answerId = h.coordinator.getSnapshot().answerId;
  const firstAttempt = h.coordinator.getSnapshot().attemptId;
  const streamId = h.bindStream();
  const sg = h.coordinator.getSnapshot().sessionGeneration;

  h.provider({ type: 'token', sessionGeneration: sg, answerId, attemptId: firstAttempt, streamId, token: '先约定字节序。' });
  h.provider({ type: 'done', sessionGeneration: sg, answerId, attemptId: firstAttempt, streamId, finalText: '先约定字节序。' });
  assert.equal(h.history.items[0].answer, '先约定字节序。');

  // Same-round append after completion: the old draft stays visible.
  h.interviewerFinal(THREE_PARTS[1]);
  assert.equal(h.history.items.length, 1, 'still one row');
  assert.equal(h.history.items[0].answer, '先约定字节序。', 'old visible draft retained until the new attempt produces text');
  assert.equal(h.history.items[0].status, 'generating');
  assert.ok(h.history.items[0].question.includes('CRC32'), 'question revised in place');

  const secondAttempt = h.coordinator.getSnapshot().attemptId;
  assert.notEqual(secondAttempt, firstAttempt, 'a fresh attempt id was allocated');
  const streamId2 = h.bindStream();
  h.provider({ type: 'done', sessionGeneration: sg, answerId, attemptId: secondAttempt, streamId: streamId2, finalText: '字节序 + CRC32 + 半包重组。' });
  assert.equal(h.history.items[0].answer, '字节序 + CRC32 + 半包重组。', 'fresh final replaces the draft');
  assert.equal(h.history.items[0].id, answerId, 'answer id never changed');
});

// ---------------------------------------------------------------------------
// Requirement 2: restart during generation; stale tuples rejected
// ---------------------------------------------------------------------------

test('a same-round restart during generation cancels the old attempt and revises in place', () => {
  const h = createHarness();
  h.interviewerFinal(THREE_PARTS[0]);
  h.tick(THREE_PARTS[0].arrivalMs + PROVISIONAL_MS);
  const answerId = h.coordinator.getSnapshot().answerId;
  const oldAttempt = h.coordinator.getSnapshot().attemptId;
  const oldStream = h.bindStream();
  const sg = h.coordinator.getSnapshot().sessionGeneration;
  h.provider({ type: 'token', sessionGeneration: sg, answerId, attemptId: oldAttempt, streamId: oldStream, token: '草稿。' });

  h.interviewerFinal(THREE_PARTS[1]);

  assert.deepEqual(h.cancelledStreams, [oldStream], 'the superseded stream was cancelled');
  assert.equal(h.staleFloor, oldStream, 'cancelling a known stream advances the stale floor');
  assert.equal(h.history.items.length, 1, 'restart reuses the single row');
  assert.equal(h.active.answerId, answerId);
  assert.notEqual(h.active.attemptId, oldAttempt, 'the restart runs a new attempt immediately');
  assert.equal(h.queue.length, 0, 'restart did not leave a duplicate queued attempt');

  const revisedDraft = h.history.items[0].answer;
  const newAttempt = h.active.attemptId;
  const newStream = h.bindStream();

  // Stale token/done/error from the retired attempt must not mutate anything.
  for (const stale of [
    { type: 'token', token: '过期 token' },
    { type: 'done', finalText: '过期 done' },
    { type: 'error', error: '过期 error' },
  ]) {
    const accepted = h.provider({ ...stale, sessionGeneration: sg, answerId, attemptId: oldAttempt, streamId: oldStream });
    assert.equal(accepted, false, `stale ${stale.type} from the retired attempt must be rejected`);
  }
  assert.equal(h.history.items[0].answer, revisedDraft, 'stale events did not mutate the revised answer');
  assert.equal(h.history.items[0].status, 'generating', 'stale events did not change status');
  assert.equal(h.history.items[0].error, undefined, 'stale error did not surface');
  assert.equal(h.active?.attemptId, newAttempt, 'stale events did not release the active slot');

  h.provider({ type: 'done', sessionGeneration: sg, answerId, attemptId: newAttempt, streamId: newStream, finalText: '完整回答。' });
  assert.equal(h.history.items[0].answer, '完整回答。');
  assert.equal(h.history.items[0].status, 'answered');
});

test('a mismatched coordinator tuple is rejected on every field', () => {
  const h = createHarness();
  h.interviewerFinal(THREE_PARTS[0]);
  h.tick(THREE_PARTS[0].arrivalMs + PROVISIONAL_MS);
  const { answerId, attemptId, sessionGeneration } = h.coordinator.getSnapshot();
  const streamId = h.bindStream();

  const bad = [
    ['sessionGeneration', { sessionGeneration: sessionGeneration + 1, answerId, attemptId, streamId }],
    ['answerId', { sessionGeneration, answerId: answerId + 77, attemptId, streamId }],
    ['attemptId', { sessionGeneration, answerId, attemptId: attemptId + 77, streamId }],
    ['streamId', { sessionGeneration, answerId, attemptId, streamId: streamId + 77 }],
  ];
  for (const [field, tuple] of bad) {
    assert.equal(
      h.provider({ type: 'token', token: 'x', ...tuple }),
      false,
      `a wrong ${field} must be rejected before any mutation`,
    );
  }
  assert.equal(h.history.items[0].answer, '', 'no token text leaked through');
});

// ---------------------------------------------------------------------------
// Requirement 4: >=5000 ms independent question
// ---------------------------------------------------------------------------

test('an independent question beyond the round gap gets a new answer id without cancelling the unrelated active job', () => {
  const h = createHarness();
  h.interviewerFinal(THREE_PARTS[0]);
  h.tick(THREE_PARTS[0].arrivalMs + PROVISIONAL_MS);
  const firstAnswerId = h.coordinator.getSnapshot().answerId;
  const firstAttempt = h.coordinator.getSnapshot().attemptId;
  const firstStream = h.bindStream();

  const independent = interviewerFinal({
    text: '换个话题，讲讲你的 CI 流程。',
    sequence: 9, segmentId: 9,
    audioStartMs: THREE_PARTS[0].audioEndMs + ROUND_GAP_MS,
    audioEndMs: THREE_PARTS[0].audioEndMs + ROUND_GAP_MS + 1000,
    arrivalMs: THREE_PARTS[0].arrivalMs + ROUND_GAP_MS + 1000,
  });
  h.interviewerFinal(independent);

  assert.equal(h.coordinator.getSnapshot().boundaryReason, 'audio-gap');
  assert.deepEqual(h.cancelledStreams, [], 'the unrelated active answer was not cancelled');
  assert.equal(h.active.answerId, firstAnswerId, 'the unrelated active job still holds the slot');
  assert.equal(h.active.attemptId, firstAttempt);

  h.tick(independent.arrivalMs + PROVISIONAL_MS);
  const secondAnswerId = h.coordinator.getSnapshot().answerId;
  assert.notEqual(secondAnswerId, firstAnswerId, 'the independent round allocated a new answer id');
  assert.equal(h.history.items.length, 2, 'one row per round');
  assert.equal(h.queue.length, 1, 'FIFO: the new round waits behind the active answer');
  assert.equal(h.queue[0].answerId, secondAnswerId);

  const sg = h.coordinator.getSnapshot().sessionGeneration;
  h.provider({ type: 'done', sessionGeneration: sg, answerId: firstAnswerId, attemptId: firstAttempt, streamId: firstStream, finalText: '第一轮答案。' });
  assert.equal(h.active.answerId, secondAnswerId, 'the queue pumped to the next round in order');
  assert.equal(h.history.items[0].answer, '第一轮答案。');
});

// ---------------------------------------------------------------------------
// Requirement 5: candidate final flush, reset / session invalidation
// ---------------------------------------------------------------------------

test('a candidate final before the 2500 ms provisional delay flushes the round exactly once', () => {
  const h = createHarness();
  h.interviewerFinal(THREE_PARTS[0]);
  h.candidateFinal({ speaker: 'user', final: true, sessionId: SESSION_A, arrivalMs: THREE_PARTS[0].arrivalMs + 800, audioEndMs: 2000 });

  const answerId = h.coordinator.getSnapshot().answerId;
  assert.equal(typeof answerId, 'number', 'candidate final flushed generation without waiting for the tick');
  assert.equal(h.history.items.length, 1);
  assert.equal(h.coordinator.getSnapshot().roundOpen, false, 'the round is closed');

  h.tick(THREE_PARTS[0].arrivalMs + 10_000);
  assert.equal(h.history.items.length, 1, 'a later tick emits no duplicate generation');
});

test('transcript reset invalidates old attempts and clears history', () => {
  const h = createHarness();
  h.interviewerFinal(THREE_PARTS[0]);
  h.tick(THREE_PARTS[0].arrivalMs + PROVISIONAL_MS);
  const answerId = h.coordinator.getSnapshot().answerId;
  const attemptId = h.coordinator.getSnapshot().attemptId;
  const streamId = h.bindStream();
  const staleSg = h.coordinator.getSnapshot().sessionGeneration;

  h.reset();
  assert.equal(h.cancelledStreams.includes(streamId), true, 'reset cancelled the generating attempt');
  assert.equal(h.history.items.length, 0, 'history was reset');
  assert.equal(h.active, null, 'the active slot was released');

  assert.equal(
    h.provider({ type: 'done', sessionGeneration: staleSg, answerId, attemptId, streamId, finalText: '过期' }),
    false,
    'an event from the pre-reset generation must be rejected',
  );
  assert.equal(h.history.items.length, 0);
});

test('a session id change invalidates the previous round attempt', () => {
  const h = createHarness();
  h.interviewerFinal(THREE_PARTS[0]);
  h.tick(THREE_PARTS[0].arrivalMs + PROVISIONAL_MS);
  const answerId = h.coordinator.getSnapshot().answerId;
  const attemptId = h.coordinator.getSnapshot().attemptId;
  const streamId = h.bindStream();
  const staleSg = h.coordinator.getSnapshot().sessionGeneration;

  h.interviewerFinal(interviewerFinal({
    text: '新会话的第一个问题。',
    sessionId: SESSION_B,
    sequence: 1, segmentId: 1,
    audioStartMs: 0, audioEndMs: 900, arrivalMs: 50_000,
  }));

  assert.notEqual(h.coordinator.getSnapshot().sessionGeneration, staleSg, 'session change bumped the coordinator generation');
  assert.equal(h.cancelledStreams.includes(streamId), true, 'the old session attempt was cancelled');
  assert.equal(
    h.provider({ type: 'token', sessionGeneration: staleSg, answerId, attemptId, streamId, token: '过期' }),
    false,
    'an event from the previous session generation must be rejected',
  );
});
