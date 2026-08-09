# Same-question Round Aggregation Plan

## Goal

Keep final STT segments from one continuous interviewer utterance in one question round. Later segments must append to the same question and revise the same answer item instead of creating independent answers. Preserve raw transcript and history metadata.

## Root-cause summary

- `InterviewConsole` passes renderer `Date.now()` into `pushFinalTurn`, so settle timing measures event arrival, not the audio timeline.
- Normal questions use a 2500 ms window; the 5000 ms window is enabled only after a multi-part marker is already present.
- Whisper inference is serialized, so a real audio gap of about one second can arrive in the renderer much later.
- After `drain`, `enqueueAnswer` creates a new answer id. There is no round-level append/revision path.
- The SPI/CRC32/half-packet sentence does not split when passed to the splitter as one complete string; the splitter is not the primary root cause for this reproduction.

## Ordered execution and CC gates

### Step 1 - Plan review

Send this plan and the CC root-cause report for review. Do not change business code. Continue only with `VERDICT: APPROVED`.

### Step 2 - Diagnostic telemetry

Add bounded, redacted telemetry at each boundary: `sessionId`, `sequence`, `segmentId`, `audioStartMs`, `audioEndMs`, VAD dispatch time, worker queue/start/result times, main-process emit time, renderer receive time, round id, answer id, attempt id, deadline, drain time, merge/new decision, stream id, and cancellation reason.

Use these clock domains explicitly:

- audio timestamps: integer milliseconds relative to the active meeting audio timeline;
- queue/worker/main timestamps: monotonic milliseconds when the source supports them, otherwise wall-clock milliseconds with an explicit `clock` field;
- renderer arrival: `performance.now()` monotonic milliseconds plus one `Date.now()` correlation timestamp at session start.

Expose only a capped in-memory `window.__nativelyInterviewRoundEvents` array of 200 structured events and clear it on session reset. Record `textLength`, never transcript text or a reversible hash. Correlate events by `(sessionId, sequence, segmentId, roundId, answerId, attemptId, streamId)` where each field exists.

Acceptance: a replay can distinguish audio gap from arrival gap and identify the exact round decision. CC reviews telemetry scope before tests.

### Step 3 - Failing-first tests

Add focused pure coordinator/history tests for:

1. arrival gap greater than 5 s but audio gap below 5 s still merges;
2. a final arriving while generation is active cancels the old attempt and keeps one answer id;
3. a final arriving after the first answer has drained and completed still reopens the same round and reuses the same answer id when its audio gap is below 5 s;
4. at exactly 2500 ms of a non-empty pending question, the coordinator must schedule the provisional prewarm/answer generation once; the round remains appendable until a 5000 ms audio-gap boundary; `MULTI_PART_QUESTION_SIGNAL` is the existing text predicate and can extend pending settle without being the round-close signal;
5. audio gap at/above 5 s, `event.kind === 'reset'`, `sessionId` change, or an accepted `speaker === 'user' && final === true` candidate turn creates/closes a round as specified;
6. stale token/done/error from the cancelled stream is ignored using `(sessionGeneration, answerId, attemptId, streamId)` identity;
7. raw `conversationTurns`, raw final metadata, and interviewer transcript remain unchanged; the visible answer draft remains during regeneration; the final answer is replaced by the new attempt; history still contains one answer item;
8. the fixed complete SPI/CRC32/half-packet input returns one exact splitter clause and no remaining questions.

Acceptance: the new tests fail for the current implementation and existing focused tests remain green. CC approves the RED test scope before implementation.

### Step 4 - Pure round coordinator

Implement a small pure coordinator with a stable round id, original turns, combined question, audio boundaries, session generation, answer id, and generation attempt. Separate the provisional answer trigger from round closure: at 2500 ms the coordinator must emit exactly one provisional-generation action for a non-empty pending question, while a later interviewer final can still append when its real audio gap is below 5000 ms. Use `audioStartMs - previousAudioEndMs` only when both adjacent segments have complete metadata from the same session; otherwise use a bounded 5000 ms renderer-arrival fallback. At exactly 5000 ms create a new round.

Boundary priority is deterministic: session reset or `sessionId` change invalidates the round first; then an accepted candidate final closes it before any later-sequence interviewer event is considered; then audio/arrival gap decides merge versus new round. Existing transcript provenance ordering rejects a delayed older segment before round mutation. Do not mutate raw transcript state.

Acceptance: Step 3 coordinator tests pass. CC reviews the implementation before UI wiring.

### Step 5 - Renderer and answer-history wiring

Route final events through the coordinator. For a same-round append, update the existing question item, synchronously invalidate the old attempt, request cancellation of the previous Provider stream, keep the current visible draft, immediately start a fresh attempt, and commit the fresh result to the same answer id. Cancellation acknowledgement is not required before the new attempt starts because all token/done/error handlers must validate `(sessionGeneration, answerId, attemptId, streamId)`. Keep normal new-round queue behavior unchanged.

Acceptance: integration tests show one history row for the three-part reproduction, correct selection behavior, and no stale stream updates. CC reviews this integration.

### Step 6 - Verification and real replay

Run focused interview-console tests, script tests, renderer/Electron typechecks, build, then sequential Electron/CDP audio replay with the existing fixtures plus a three-part SPI/CRC32 fixture.

Use these fixed acceptance criteria:

- replay the three-part short-gap fixture three times: every run produces exactly one answer id, one history row, all three topic signals in the combined question, and no stale-stream mutation;
- replay the corresponding `>=5000 ms` gap fixture three times: every run produces the expected new answer id at the boundary;
- replay the fixed ten-fixture latency suite already defined in Phase 17 (`reports/latency/latency-baseline.json`, denominator 10, with the injected-timeout fixture evaluated separately): event completeness must remain 100%; Provider outcome/error count must be no higher than the corresponding baseline count; first-token p95 regression must be at most 250 ms; and ordinary independent-question answer count must equal the baseline count;
- run the existing STT/retrieval evaluator for the same fixture set and compare against its stored report (`reports/humanized-audio-eval/`): retrieval pass count and expected top-1 consistency must be no lower than baseline (same denominator, zero-fixture tolerance);
- one infrastructure replay failure permits one clean Electron restart and retry; a repeated failure blocks approval and is recorded rather than averaged away.

Acceptance: no regression in ordinary separate questions, candidate transcript, retrieval correctness, or stop/reset. CC performs final review and must return `VERDICT: APPROVED`.

### Step 7 - Tuning only after approval

Only after Step 6 approval consider adaptive settle or UX tuning. Do not solve the root cause by blindly increasing the debounce constant. If audio metadata is missing in production, retain the bounded arrival-time fallback and keep the limitation documented.

## Rollback boundary

If any focused test, build, or real replay regresses, keep the current final-only behavior, disable adaptive settle, and revert only the new round coordinator wiring after CC review. Do not change the existing raw transcript/history preservation path.
