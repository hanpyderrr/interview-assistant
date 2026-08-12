// Phase 18 Step 3 RED contract for the future pure question-round coordinator.
//
// This suite is expected to FAIL at module resolution
// (ERR_MODULE_NOT_FOUND for ../questionRoundCoordinator.ts) because Step 3 must
// not create the module or any placeholder. The assertions below are the
// specification Step 4 implements against.
//
// Wished-for public API (kept deliberately small):
//   createQuestionRoundCoordinator({ allocateAnswerId, provisionalDelayMs?, roundGapMs? })
//     .acceptInterviewerFinal(final) -> { actions }
//     .acceptCandidateFinal(final)   -> { actions }
//     .tick(arrivalMs)               -> { actions }
//     .resetTranscript()             -> { actions }
//     .bindStream({ answerId, attemptId, streamId })
//     .acceptProviderEvent(event)    -> { accepted, actions }
//     .getSnapshot()                 -> plain round state
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionRoundCoordinator } from '../questionRoundCoordinator.ts';

const PROVISIONAL_MS = 2500;
const ROUND_GAP_MS = 5000;
const SESSION_A = 101;
const SESSION_B = 102;

function makeAllocator(start = 1000) {
  let next = start;
  return () => next++;
}

function createCoordinator() {
  return createQuestionRoundCoordinator({ allocateAnswerId: makeAllocator() });
}

/** Interviewer final; audio fields are optional so metadata-gap fallbacks are testable. */
function interviewerFinal(overrides) {
  return {
    speaker: 'interviewer',
    text: '你怎么设计 SPI 帧头？',
    final: true,
    sessionId: SESSION_A,
    sequence: 1,
    segmentId: 1,
    arrivalMs: 0,
    audioStartMs: 0,
    audioEndMs: 1000,
    ...overrides,
  };
}

function generateActions(result) {
  return result.actions.filter((action) => action.type === 'generate');
}

// ---------------------------------------------------------------------------
// Requirement 1 + metadata fallback rules
// ---------------------------------------------------------------------------

test('a renderer arrival gap above 5000 ms still merges when the same-session audio gap is below 5000 ms', () => {
  const coordinator = createCoordinator();

  const first = coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '你怎么设计 SPI 帧头？',
    arrivalMs: 0,
    audioStartMs: 0,
    audioEndMs: 1000,
  }));
  const firstRoundId = coordinator.getSnapshot().roundId;

  // Renderer stalled for 9s, but the audio timeline only advanced 400ms.
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '还有 CRC32 校验怎么处理？',
    arrivalMs: 9000,
    audioStartMs: 1400,
    audioEndMs: 2200,
  }));

  const snapshot = coordinator.getSnapshot();
  assert.equal(snapshot.roundId, firstRoundId, 'audio metadata must win over renderer arrival time');
  assert.ok(snapshot.pendingQuestion.includes('SPI 帧头'));
  assert.ok(snapshot.pendingQuestion.includes('CRC32'));
  assert.equal(generateActions(first).length, 0, 'a final alone must not start generation');
});

test('incomplete adjacent audio metadata in the same session falls back to the renderer arrival gap', () => {
  const coordinator = createCoordinator();

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '你怎么设计 SPI 帧头？',
    arrivalMs: 0,
    audioStartMs: 0,
    audioEndMs: undefined, // missing previousAudioEndMs for the next comparison
  }));
  const firstRoundId = coordinator.getSnapshot().roundId;

  // Renderer arrival gap is 400ms -> below the boundary -> merge.
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '还有 CRC32 校验怎么处理？',
    arrivalMs: 400,
    audioStartMs: undefined,
    audioEndMs: undefined,
  }));
  assert.equal(coordinator.getSnapshot().roundId, firstRoundId);

  // Renderer arrival gap is 6000ms -> at/above the boundary -> new round.
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '再讲一下半包怎么处理？',
    arrivalMs: 6400,
    audioStartMs: undefined,
    audioEndMs: undefined,
  }));
  assert.notEqual(coordinator.getSnapshot().roundId, firstRoundId);
});

test('exactly 5000 ms of same-session audio gap starts a new round', () => {
  const coordinator = createCoordinator();

  coordinator.acceptInterviewerFinal(interviewerFinal({ audioStartMs: 0, audioEndMs: 1000 }));
  const firstRoundId = coordinator.getSnapshot().roundId;

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '换个话题，讲讲 I2C。',
    arrivalMs: 10,
    audioStartMs: 1000 + ROUND_GAP_MS,
    audioEndMs: 1000 + ROUND_GAP_MS + 800,
  }));

  const snapshot = coordinator.getSnapshot();
  assert.notEqual(snapshot.roundId, firstRoundId, '>= 5000 ms is inclusive and closes the round');
  assert.equal(snapshot.pendingQuestion, '换个话题，讲讲 I2C。');
});

test('a 4999 ms same-session audio gap still merges into the same round', () => {
  const coordinator = createCoordinator();

  coordinator.acceptInterviewerFinal(interviewerFinal({ audioStartMs: 0, audioEndMs: 1000 }));
  const firstRoundId = coordinator.getSnapshot().roundId;

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '还有 CRC32 校验怎么处理？',
    arrivalMs: 10,
    audioStartMs: 1000 + ROUND_GAP_MS - 1,
    audioEndMs: 1000 + ROUND_GAP_MS + 500,
  }));

  assert.equal(coordinator.getSnapshot().roundId, firstRoundId);
});

test('a session change never compares audio timestamps across sessions', () => {
  const coordinator = createCoordinator();

  coordinator.acceptInterviewerFinal(interviewerFinal({
    sessionId: SESSION_A,
    audioStartMs: 0,
    audioEndMs: 60000,
  }));
  const firstSnapshot = coordinator.getSnapshot();

  // New session restarts its own audio timeline at 0; a naive subtraction would
  // produce a large negative gap and could look like a merge.
  coordinator.acceptInterviewerFinal(interviewerFinal({
    sessionId: SESSION_B,
    text: '我们换一个题目。',
    arrivalMs: 5,
    audioStartMs: 0,
    audioEndMs: 900,
  }));

  const snapshot = coordinator.getSnapshot();
  assert.notEqual(snapshot.roundId, firstSnapshot.roundId, 'a session change always opens a new round');
  assert.ok(
    snapshot.sessionGeneration > firstSnapshot.sessionGeneration,
    'a session change must bump sessionGeneration to invalidate in-flight work',
  );
  assert.equal(snapshot.pendingQuestion, '我们换一个题目。');
});

test('coordinator operations do not mutate raw final objects or their metadata', () => {
  const coordinator = createCoordinator();
  const rawTurns = [
    interviewerFinal({
      text: '你怎么设计 SPI 帧头？',
      sequence: 11,
      segmentId: 31,
      arrivalMs: 100,
      audioStartMs: 500,
      audioEndMs: 1500,
    }),
    interviewerFinal({
      text: '还有 CRC32 校验怎么处理？',
      sequence: 12,
      segmentId: 32,
      arrivalMs: 8000,
      audioStartMs: 1800,
      audioEndMs: 2600,
    }),
  ];
  const before = structuredClone(rawTurns);

  for (const turn of rawTurns) coordinator.acceptInterviewerFinal(turn);
  coordinator.tick(10500);

  assert.deepEqual(rawTurns, before, 'raw turns and provenance metadata are immutable inputs');
  assert.equal(rawTurns[0].text, before[0].text);
  assert.equal(rawTurns[1].segmentId, before[1].segmentId);
  assert.equal(rawTurns[1].audioStartMs, before[1].audioStartMs);
  assert.deepEqual(
    coordinator.getSnapshot().turns,
    before,
    'the round keeps immutable copies of its original accepted finals for later wiring',
  );
});

test('combined question keeps a separator between unpunctuated STT finals', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: 'SPI 帧头和长度',
    sequence: 1,
    segmentId: 1,
    arrivalMs: 0,
    audioStartMs: 0,
    audioEndMs: 1000,
  }));
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: 'CRC32 校验和半包处理',
    sequence: 2,
    segmentId: 2,
    arrivalMs: 1500,
    audioStartMs: 1200,
    audioEndMs: 2200,
  }));

  assert.equal(coordinator.getSnapshot().pendingQuestion, 'SPI 帧头和长度 CRC32 校验和半包处理');
});

// ---------------------------------------------------------------------------
// Requirement 4: provisional trigger at exactly 2500 ms
// ---------------------------------------------------------------------------

test('exactly 2500 ms after a non-empty pending question emits one provisional generate action', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0 }));

  assert.equal(generateActions(coordinator.tick(PROVISIONAL_MS - 1)).length, 0, 'must not fire early');

  const fired = generateActions(coordinator.tick(PROVISIONAL_MS));
  assert.equal(fired.length, 1, 'exactly one provisional generation action at 2500 ms');
  assert.equal(fired[0].answerId, coordinator.getSnapshot().answerId);
  assert.equal(fired[0].attemptId, coordinator.getSnapshot().attemptId);

  assert.equal(generateActions(coordinator.tick(PROVISIONAL_MS + 1)).length, 0, 'no duplicate fire');
  assert.equal(generateActions(coordinator.tick(PROVISIONAL_MS + 10000)).length, 0, 'still no duplicate fire');
});

test('an empty pending question never triggers a provisional generation', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ text: '   ', arrivalMs: 0 }));

  assert.equal(generateActions(coordinator.tick(PROVISIONAL_MS)).length, 0);
  assert.equal(coordinator.getSnapshot().answerId, null);
});

test('the round stays appendable after the provisional fire, until the 5000 ms audio-gap boundary', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));
  coordinator.tick(PROVISIONAL_MS);

  const roundId = coordinator.getSnapshot().roundId;
  const answerId = coordinator.getSnapshot().answerId;

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '还有 CRC32 校验怎么处理？',
    arrivalMs: PROVISIONAL_MS + 100,
    audioStartMs: 2000,
    audioEndMs: 2800,
  }));

  const snapshot = coordinator.getSnapshot();
  assert.equal(snapshot.roundId, roundId, 'generation in flight does not close the round');
  assert.equal(snapshot.answerId, answerId, 'the same round keeps one answerId');
  assert.ok(snapshot.pendingQuestion.includes('CRC32'));
});

test('the multi-part text predicate may extend a pending settle but never closes the round', () => {
  const coordinator = createCoordinator();
  // Multi-part wording; the round-close signal is still the audio gap only.
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '你怎么设计字节序、帧头、长度，还有 CRC32 校验？',
    arrivalMs: 0,
    audioStartMs: 0,
    audioEndMs: 1000,
  }));

  const roundId = coordinator.getSnapshot().roundId;
  coordinator.tick(PROVISIONAL_MS);
  assert.equal(coordinator.getSnapshot().roundId, roundId, 'the predicate is not a round-close signal');

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '如果出现半包呢？',
    arrivalMs: 3000,
    audioStartMs: 1500,
    audioEndMs: 2300,
  }));
  assert.equal(coordinator.getSnapshot().roundId, roundId);
});

// ---------------------------------------------------------------------------
// Requirements 2 and 3: regeneration inside the same round
// ---------------------------------------------------------------------------

test('a same-round final during generation cancels the attempt, bumps attemptId, and reuses roundId/answerId', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));
  coordinator.tick(PROVISIONAL_MS);

  const before = coordinator.getSnapshot();
  assert.equal(before.status, 'generating');

  const result = coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '还有 CRC32 校验怎么处理？',
    arrivalMs: PROVISIONAL_MS + 200,
    audioStartMs: 2000,
    audioEndMs: 2800,
  }));

  const after = coordinator.getSnapshot();
  assert.equal(after.roundId, before.roundId, 'roundId is reused');
  assert.equal(after.answerId, before.answerId, 'answerId is reused');
  assert.ok(after.attemptId > before.attemptId, 'attemptId must increment');

  const cancels = result.actions.filter((action) => action.type === 'cancel');
  assert.equal(cancels.length, 1, 'the old attempt must be cancelled exactly once');
  assert.equal(cancels[0].attemptId, before.attemptId);

  const restarts = generateActions(result);
  assert.equal(restarts.length, 1, 'a new attempt starts immediately, without waiting another 2500 ms');
  assert.equal(restarts[0].answerId, before.answerId);
  assert.equal(restarts[0].attemptId, after.attemptId);
  assert.equal(restarts[0].question, after.pendingQuestion);

  assert.equal(after.status, 'generating');

  const revises = result.actions.filter((action) => action.type === 'reviseHistory');
  assert.equal(revises.length, 1, 'history keeps one item via a revise action');
  assert.equal(revises[0].id, before.answerId);
  assert.equal(revises[0].question, after.pendingQuestion);
});

test('a same-round final after the first attempt completed reopens the round and starts a new attempt', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));
  coordinator.tick(PROVISIONAL_MS);

  const first = coordinator.getSnapshot();
  coordinator.bindStream({ answerId: first.answerId, attemptId: first.attemptId, streamId: 77 });
  coordinator.acceptProviderEvent({
    type: 'done',
    sessionGeneration: first.sessionGeneration,
    answerId: first.answerId,
    attemptId: first.attemptId,
    streamId: 77,
    finalText: '第一版答案',
  });
  assert.equal(coordinator.getSnapshot().status, 'answered');

  const result = coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '还有 CRC32 校验怎么处理？',
    arrivalMs: 4000,
    audioStartMs: 2000,
    audioEndMs: 2800,
  }));

  const after = coordinator.getSnapshot();
  assert.equal(after.roundId, first.roundId, 'the completed round is reopened, not replaced');
  assert.equal(after.answerId, first.answerId, 'answerId is reused after completion');
  assert.ok(after.attemptId > first.attemptId);
  assert.equal(after.status, 'generating');

  const restarts = generateActions(result);
  assert.equal(restarts.length, 1);
  assert.equal(restarts[0].attemptId, after.attemptId);
});

test('a new round allocates a fresh answerId from the injected allocator', () => {
  const coordinator = createQuestionRoundCoordinator({ allocateAnswerId: makeAllocator(500) });

  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));
  coordinator.tick(PROVISIONAL_MS);
  assert.equal(coordinator.getSnapshot().answerId, 500);

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '换个话题，讲讲 I2C。',
    arrivalMs: PROVISIONAL_MS + 10,
    audioStartMs: 1000 + ROUND_GAP_MS,
    audioEndMs: 1000 + ROUND_GAP_MS + 800,
  }));
  coordinator.tick(PROVISIONAL_MS + 10 + PROVISIONAL_MS);
  assert.equal(coordinator.getSnapshot().answerId, 501, 'each round consumes exactly one allocator value');
});

// ---------------------------------------------------------------------------
// Requirement 5: boundary sources and deterministic priority
// ---------------------------------------------------------------------------

test('a transcript reset clears the pending round and invalidates in-flight generation', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0 }));
  coordinator.tick(PROVISIONAL_MS);
  const before = coordinator.getSnapshot();

  const result = coordinator.resetTranscript();
  const after = coordinator.getSnapshot();

  assert.equal(after.pendingQuestion, '');
  assert.equal(after.answerId, null);
  assert.equal(after.status, 'idle');
  assert.ok(after.sessionGeneration > before.sessionGeneration, 'a reset bumps sessionGeneration');
  assert.equal(
    result.actions.filter((action) => action.type === 'cancel').length,
    1,
    'the in-flight attempt is cancelled on reset',
  );
});

test('a candidate final stays pending until the next interviewer final proves a candidate turn', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));
  const firstRoundId = coordinator.getSnapshot().roundId;

  coordinator.acceptCandidateFinal({
    speaker: 'user',
    text: '我先说一下我的方案。',
    final: true,
    sessionId: SESSION_A,
    sequence: 2,
    segmentId: 2,
    arrivalMs: 1200,
    audioStartMs: 1100,
    audioEndMs: 2000,
  });
  assert.equal(coordinator.getSnapshot().roundOpen, true, 'candidate evidence alone does not close the round');

  // The next interviewer final belongs to a new round even inside the gap window.
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '那 CRC32 呢？',
    arrivalMs: 1400,
    audioStartMs: 2100,
    audioEndMs: 2900,
  }));
  assert.notEqual(coordinator.getSnapshot().roundId, firstRoundId);
  assert.equal(coordinator.getSnapshot().boundaryReason, 'candidate-turn');
});

test('an inverted candidate audio interval cannot create a candidate-turn boundary', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ audioStartMs: 0, audioEndMs: 1000 }));
  const firstRoundId = coordinator.getSnapshot().roundId;

  coordinator.acceptCandidateFinal(candidateFinal({ audioStartMs: 2000, audioEndMs: 1500 }));
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '还有 CRC32 呢？',
    sequence: 3,
    segmentId: 3,
    arrivalMs: 3000,
    audioStartMs: 3000,
    audioEndMs: 3800,
  }));

  assert.equal(coordinator.getSnapshot().roundId, firstRoundId);
  assert.notEqual(coordinator.getSnapshot().boundaryReason, 'candidate-turn');
});

test('candidate evidence is bounded to the latest 32 finals', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ audioStartMs: 0, audioEndMs: 1000 }));
  const firstRoundId = coordinator.getSnapshot().roundId;

  coordinator.acceptCandidateFinal(candidateFinal({ audioStartMs: 1500, audioEndMs: 2000 }));
  for (let index = 0; index < 32; index += 1) {
    coordinator.acceptCandidateFinal(candidateFinal({
      sequence: 10 + index,
      segmentId: 10 + index,
      audioStartMs: 500,
      audioEndMs: 900,
    }));
  }
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '继续说 CRC32。',
    sequence: 50,
    segmentId: 50,
    arrivalMs: 4000,
    audioStartMs: 4000,
    audioEndMs: 4800,
  }));

  assert.equal(coordinator.getSnapshot().roundId, firstRoundId, 'the evicted old candidate interval cannot split the round');
});

test('the newest valid candidate interval survives a batch larger than the evidence cap', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ audioStartMs: 0, audioEndMs: 1000 }));

  for (let index = 0; index < 33; index += 1) {
    coordinator.acceptCandidateFinal(candidateFinal({
      sequence: 10 + index,
      segmentId: 10 + index,
      audioStartMs: 500,
      audioEndMs: 900,
    }));
  }
  coordinator.acceptCandidateFinal(candidateFinal({ sequence: 50, segmentId: 50, audioStartMs: 1500, audioEndMs: 2000 }));
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '新的问题。',
    sequence: 51,
    segmentId: 51,
    arrivalMs: 4000,
    audioStartMs: 3000,
    audioEndMs: 3800,
  }));

  assert.equal(coordinator.getSnapshot().boundaryReason, 'candidate-turn');
});

test('boundary priority is deterministic: session change outranks the audio gap', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({
    sessionId: SESSION_A,
    arrivalMs: 0,
    audioStartMs: 0,
    audioEndMs: 1000,
  }));
  const before = coordinator.getSnapshot();

  // Audio gap would say "merge" (1200 - 1000 = 200 ms), but the session changed.
  const result = coordinator.acceptInterviewerFinal(interviewerFinal({
    sessionId: SESSION_B,
    text: '新的一场面试。',
    arrivalMs: 100,
    audioStartMs: 1200,
    audioEndMs: 2000,
  }));

  const after = coordinator.getSnapshot();
  assert.notEqual(after.roundId, before.roundId);
  assert.ok(after.sessionGeneration > before.sessionGeneration);
  assert.equal(after.boundaryReason, 'session-change', 'the highest-priority boundary reason is reported');
  assert.equal(result.actions.filter((action) => action.type === 'generate').length, 0);
});

test('the audio-gap boundary reason is reported when only the gap closes the round', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '换个话题。',
    arrivalMs: 10,
    audioStartMs: 1000 + ROUND_GAP_MS,
    audioEndMs: 1000 + ROUND_GAP_MS + 500,
  }));

  assert.equal(coordinator.getSnapshot().boundaryReason, 'audio-gap');
});

test('audio-gap outranks candidate-turn when both boundaries are present', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ audioStartMs: 0, audioEndMs: 1000 }));
  coordinator.acceptCandidateFinal(candidateFinal({ audioStartMs: 1500, audioEndMs: 2000 }));

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '间隔后的新问题。',
    sequence: 3,
    segmentId: 3,
    arrivalMs: 7000,
    audioStartMs: 1000 + ROUND_GAP_MS,
    audioEndMs: 1000 + ROUND_GAP_MS + 800,
  }));

  assert.equal(coordinator.getSnapshot().boundaryReason, 'audio-gap');
});

// ---------------------------------------------------------------------------
// Requirement 6: full identity tuple validation
// ---------------------------------------------------------------------------

/** Arrange a coordinator with one active attempt bound to an external streamId. */
function armedCoordinator(streamId = 42) {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0 }));
  coordinator.tick(PROVISIONAL_MS);
  const active = coordinator.getSnapshot();
  coordinator.bindStream({ answerId: active.answerId, attemptId: active.attemptId, streamId });
  return { coordinator, active, streamId };
}

function identity(active, streamId, overrides) {
  return {
    sessionGeneration: active.sessionGeneration,
    answerId: active.answerId,
    attemptId: active.attemptId,
    streamId,
    ...overrides,
  };
}

test('a token matching the full identity tuple is accepted', () => {
  const { coordinator, active, streamId } = armedCoordinator();

  const result = coordinator.acceptProviderEvent({
    type: 'token',
    token: '字节序',
    ...identity(active, streamId),
  });

  assert.equal(result.accepted, true);
  assert.equal(coordinator.getSnapshot().status, 'generating');
});

for (const [label, overrides] of [
  ['a stale sessionGeneration', { sessionGeneration: -1 }],
  ['a stale answerId', { answerId: 999999 }],
  ['a stale attemptId', { attemptId: 999999 }],
  ['an unbound streamId', { streamId: 999999 }],
]) {
  test(`${label} token is ignored without changing state`, () => {
    const { coordinator, active, streamId } = armedCoordinator();
    const before = coordinator.getSnapshot();

    const result = coordinator.acceptProviderEvent({
      type: 'token',
      token: '不该出现',
      ...identity(active, streamId, overrides),
    });

    assert.equal(result.accepted, false);
    assert.deepEqual(result.actions, []);
    assert.deepEqual(coordinator.getSnapshot(), before, 'stale events must not mutate state');
  });

  test(`${label} done is ignored without changing state`, () => {
    const { coordinator, active, streamId } = armedCoordinator();
    const before = coordinator.getSnapshot();

    const result = coordinator.acceptProviderEvent({
      type: 'done',
      finalText: '不该出现',
      ...identity(active, streamId, overrides),
    });

    assert.equal(result.accepted, false);
    assert.deepEqual(coordinator.getSnapshot(), before);
  });

  test(`${label} error is ignored without changing state`, () => {
    const { coordinator, active, streamId } = armedCoordinator();
    const before = coordinator.getSnapshot();

    const result = coordinator.acceptProviderEvent({
      type: 'error',
      error: '不该出现',
      ...identity(active, streamId, overrides),
    });

    assert.equal(result.accepted, false);
    assert.deepEqual(coordinator.getSnapshot(), before);
  });
}

test('events from a cancelled attempt are ignored after the attempt is superseded', () => {
  const { coordinator, active, streamId } = armedCoordinator();

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '还有 CRC32 校验怎么处理？',
    arrivalMs: PROVISIONAL_MS + 100,
    audioStartMs: 2000,
    audioEndMs: 2800,
  }));
  const before = coordinator.getSnapshot();
  assert.ok(before.attemptId > active.attemptId);

  const result = coordinator.acceptProviderEvent({
    type: 'done',
    finalText: '过期的答案',
    ...identity(active, streamId),
  });

  assert.equal(result.accepted, false, 'the superseded attempt must not finish the round');
  assert.deepEqual(coordinator.getSnapshot(), before);
});

test('a done for the current attempt is accepted and closes that attempt', () => {
  const { coordinator, active, streamId } = armedCoordinator();

  coordinator.acceptProviderEvent({ type: 'token', token: '草稿', ...identity(active, streamId) });
  const result = coordinator.acceptProviderEvent({
    type: 'done',
    finalText: '最终答案',
    ...identity(active, streamId),
  });

  assert.equal(result.accepted, true);
  const snapshot = coordinator.getSnapshot();
  assert.equal(snapshot.status, 'answered');
});

test('a delayed older interviewer segment is rejected before round mutation', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '较新的问题主体',
    sequence: 10,
    segmentId: 10,
    arrivalMs: 5000,
    audioStartMs: 3000,
    audioEndMs: 4000,
  }));
  const before = coordinator.getSnapshot();

  const result = coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '延迟到达的旧尾巴',
    sequence: 9,
    segmentId: 9,
    arrivalMs: 9000,
    audioStartMs: 1000,
    audioEndMs: 2000,
  }));

  assert.deepEqual(result.actions, []);
  assert.deepEqual(coordinator.getSnapshot(), before);
});

for (const invalidCandidate of [
  { speaker: 'interviewer', final: true },
  { speaker: 'user', final: false },
]) {
  test(`only an accepted user final closes a round: ${JSON.stringify(invalidCandidate)}`, () => {
    const coordinator = createCoordinator();
    coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0 }));

    coordinator.acceptCandidateFinal(interviewerFinal({
      ...invalidCandidate,
      text: '不应关闭当前轮次',
      arrivalMs: 1000,
    }));

    assert.equal(coordinator.getSnapshot().roundOpen, true);
  });
}

test('a new independent round does not invalidate the prior round provider identity', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));
  coordinator.tick(PROVISIONAL_MS);
  const prior = coordinator.getSnapshot();

  coordinator.acceptInterviewerFinal(interviewerFinal({
    text: '这是音频间隔后的独立问题',
    sequence: 2,
    segmentId: 2,
    arrivalMs: 8000,
    audioStartMs: 6000,
    audioEndMs: 7000,
  }));
  const currentRound = coordinator.getSnapshot();
  assert.notEqual(currentRound.roundId, prior.roundId);

  coordinator.bindStream({ answerId: prior.answerId, attemptId: prior.attemptId, streamId: 88 });
  const accepted = coordinator.acceptProviderEvent({
    type: 'token',
    token: '旧轮次仍可正常完成',
    ...identity(prior, 88),
  });

  assert.equal(accepted.accepted, true);
  assert.deepEqual(coordinator.getSnapshot(), currentRound, 'old-round output cannot mutate the new round');
});

// ---------------------------------------------------------------------------
// Phase 18 Step 5 prerequisite: candidate-final flush of a pending round
//
// Primary decision: an accepted `speaker: 'user' && final === true` flushes a
// non-empty round before provisional generation, but remains pending evidence
// until the next interviewer final can compare all three audio intervals.
// ---------------------------------------------------------------------------

/** Accepted candidate final; defaults provide comparable boundary evidence. */
function candidateFinal(overrides) {
  return {
    speaker: 'user',
    text: '我先说一下我的思路',
    final: true,
    sessionId: SESSION_A,
    sequence: 2,
    segmentId: 2,
    arrivalMs: 1200,
    audioStartMs: 1100,
    audioEndMs: 1800,
    ...overrides,
  };
}

test('a candidate final before the provisional delay flushes the pending round exactly once and keeps it open', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));

  const pending = coordinator.getSnapshot();
  const result = coordinator.acceptCandidateFinal(candidateFinal({ arrivalMs: 1200 }));
  const generates = generateActions(result);

  assert.equal(generates.length, 1, 'exactly one provisional generate on candidate flush');
  assert.equal(generates[0].reason, 'provisional');
  assert.equal(generates[0].roundId, pending.roundId);
  assert.equal(generates[0].question, pending.pendingQuestion);

  const after = coordinator.getSnapshot();
  assert.equal(after.answerId, generates[0].answerId, 'action carries the allocated answer ID');
  assert.equal(after.attemptId, generates[0].attemptId, 'action carries the allocated attempt ID');
  assert.equal(typeof generates[0].answerId, 'number');
  assert.equal(typeof generates[0].attemptId, 'number');
  assert.equal(after.roundOpen, true, 'the round stays open until the candidate boundary is proven');
});

test('a later tick after a candidate flush emits no duplicate generation', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));
  const flushed = generateActions(coordinator.acceptCandidateFinal(candidateFinal({ arrivalMs: 1200 })));
  assert.equal(flushed.length, 1);

  const before = coordinator.getSnapshot();
  const tickResult = coordinator.tick(1200 + PROVISIONAL_MS);

  assert.deepEqual(tickResult.actions, [], 'no duplicate generation from a later tick');
  assert.deepEqual(coordinator.getSnapshot(), before, 'the later tick does not mutate round state');
});

test('a candidate final after provisional generation records pending evidence without another generation', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));
  const provisional = generateActions(coordinator.tick(PROVISIONAL_MS));
  assert.equal(provisional.length, 1, 'the tick fires the provisional generation');

  const result = coordinator.acceptCandidateFinal(candidateFinal({ arrivalMs: PROVISIONAL_MS + 200 }));

  assert.deepEqual(generateActions(result), [], 'no second generation for the same round');
  const after = coordinator.getSnapshot();
  assert.equal(after.roundOpen, true);
  assert.equal(after.answerId, provisional[0].answerId, 'the answer ID stays stable');
  assert.equal(after.attemptId, provisional[0].attemptId, 'the attempt ID stays stable');
});

test('a candidate final does not generate for an empty pending round', () => {
  const coordinator = createCoordinator();
  coordinator.acceptInterviewerFinal(interviewerFinal({ text: '   ', arrivalMs: 0, audioStartMs: 0, audioEndMs: 1000 }));

  const result = coordinator.acceptCandidateFinal(candidateFinal({ arrivalMs: 1200 }));

  assert.deepEqual(result.actions, [], 'an empty question never produces generation');
  assert.equal(coordinator.getSnapshot().answerId, null);
});
