import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { answerHistoryReducer, createAnswerHistoryState } from '../answerHistory.ts';
import { createInterviewRecorder } from '../interviewRecorder.ts';
import { createQuestionRoundCoordinator } from '../questionRoundCoordinator.ts';
import {
  createQuestionCorrectionExtractor,
  flushResolvedCorrectionExtractor,
  stripCorrectionSection,
} from '../questionCorrectionExtractor.ts';

const source = fs.readFileSync(new URL('../InterviewConsole.tsx', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing production source boundary: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing production source boundary: ${end}`);
  return source.slice(from, to);
}

// Execute the production queue and its identity/dispatch helpers. Only external
// services and React refs are supplied by the harness; no queue logic is copied.
const executable = ts.transpileModule([
  sourceBetween('const answerExtractorKey =', '\n'),
  sourceBetween('  function dispatchAnswer(', '  useEffect('),
  sourceBetween('  function isCurrentAnswer(', '  function scheduleRoundTick('),
  sourceBetween('  function claimActiveStream(', '  function claimCandidateStream('),
  sourceBetween('  function clearAnswerExtractor(', '  function clearCandidateExtractor('),
  sourceBetween('  function hasBoundProviderStream(', '  function enqueueAnswer('),
  sourceBetween('  async function pumpAnswerQueue(', '\n  useEffect('),
].join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const QUESTION = 'SPI 帧校验如何处理？';
const PARTIAL = '先检查帧头。';
const COMPLETE = `${PARTIAL}再核对长度和校验值。`;
const RESULT = { finalText: `【问题修正】${QUESTION}【/问题修正】${COMPLETE}`, streamId: 41 };
const PROFILE = { company: '合成测试', position: '测试', role: 'embedded_linux', defaultProjectId: '' };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

async function setup(t) {
  const actions = [];
  const writes = [];
  const errors = [];
  const providerStarted = deferred();
  const providerResult = deferred();
  let visible = createAnswerHistoryState();
  const recorder = createInterviewRecorder({
    api: {
      beginInterviewRecord: async () => ({ success: true, id: 'race-session' }),
      saveInterviewRecord: async (_id, rounds) => {
        writes.push(...structuredClone(rounds));
        return { success: true };
      },
      endInterviewRecord: async () => ({ success: true }),
    },
    onStatus: () => {},
    flushDelayMs: 60_000,
  });
  t.after(() => recorder.dispose());
  await recorder.begin({ title: '合成竞态测试', profile: PROFILE, source: 'system', captureCandidate: false });

  const job = {
    id: 7, question: QUESTION, analysisQuestion: QUESTION, conversationContext: '',
    answerLevel: 'student', englishMode: false, customInstructions: '',
    profile: PROFILE, scope: {}, currentProjects: [], manual: true,
    generation: 3, roundId: 7, attemptId: 1, roundSessionGeneration: 3,
  };
  const context = vm.createContext({
    activeAnswerRef: { current: null },
    sessionActiveRef: { current: true },
    sessionGenerationRef: { current: 3 },
    answerQueueRef: { current: [job] },
    roundCoordinatorRef: { current: {
      getSnapshot: () => ({ sessionGeneration: 3 }),
      bindStream: () => true,
      acceptProviderEvent: () => ({ accepted: true }),
    } },
    modelSnapshotRef: { current: 'synthetic-provider' },
    lastSeenStreamIdRef: { current: 0 },
    recorderRef: { current: recorder },
    dispatchVisibleAnswer: (action) => {
      actions.push(action);
      visible = answerHistoryReducer(visible, action);
    },
    questionCorrectionExtractorsRef: { current: new Map() },
    flushResolvedCorrectionExtractor,
    stripCorrectionSection,
    applyExternalCorrection: () => {},
    traceForAnswer: () => null,
    completeLatencyTrace: () => {},
    recordRoundEvent: () => {},
    setStatus: () => {},
    setError: (error) => errors.push(error),
    answerPrewarmRef: { current: {
      consume: async () => ({ retrieval: { success: true, context: '合成上下文', matches: [] }, prompt: '合成提示' }),
    } },
    classifyInterviewQuestion: () => ({ intent: 'technical' }),
    hasIntroductionEvidence: () => false,
    interviewProviderDeadlineMs: () => 10_000,
    providerDeadlineControllerRef: { current: { start() {}, complete() {} } },
    window: { electronAPI: {
      streamGeminiChat: async () => {
        const active = context.activeAnswerRef.current;
        active.streamId = 41;
        const extractor = createQuestionCorrectionExtractor(active.question);
        context.questionCorrectionExtractorsRef.current.set(`answer:${active.id}:${active.attemptId}`, extractor);
        const { display } = extractor.feed(PARTIAL);
        if (display) context.dispatchAnswer({ type: 'token', id: active.id, token: display });
        providerStarted.resolve();
        return providerResult.promise;
      },
    } },
  });
  vm.runInContext(executable, context, { filename: 'InterviewConsole.queue.production.js' });
  context.dispatchAnswer({ type: 'enqueue', id: job.id, question: QUESTION });
  await recorder.flush();

  return {
    context, actions, writes, errors, recorder,
    visible: () => visible.items[0],
    start: async () => {
      const run = context.pumpAnswerQueue();
      await providerStarted.promise;
      return {
        finish: async (result) => { providerResult.resolve(result); await run; await recorder.flush(); },
        fail: async (error) => { providerResult.reject(error); await run; await recorder.flush(); },
      };
    },
  };
}

test('queue uses the complete invoke result when done has not arrived, for UI and archive', async (t) => {
  const h = await setup(t);
  const run = await h.start();
  assert.equal(h.visible().status, 'generating');
  assert.ok(h.visible().answer.length > 0);
  assert.notEqual(h.visible().answer, COMPLETE);
  assert.equal(h.actions.filter((action) => action.type === 'done').length, 0);

  await run.finish(RESULT);

  assert.deepEqual(h.errors, []);
  const done = h.actions.filter((action) => action.type === 'done');
  assert.equal(done.length, 1);
  assert.equal(done[0].finalText, COMPLETE);
  assert.equal(h.visible().answer, COMPLETE);
  assert.equal(h.visible().status, 'answered');
  assert.equal(h.writes.at(-1).answer, COMPLETE);
  assert.equal(h.writes.at(-1).status, 'answered');
  assert.doesNotMatch(h.writes.at(-1).answer, /问题修正/);
});

test('queue ignores a resolved snapshot from an expired session generation', async (t) => {
  const h = await setup(t);
  const run = await h.start();
  const partial = h.visible().answer;
  h.context.sessionGenerationRef.current += 1;
  await run.finish(RESULT);

  assert.deepEqual(h.errors, []);
  assert.equal(h.actions.filter((action) => action.type === 'done').length, 0);
  assert.equal(h.visible().answer, partial);
  assert.equal(h.writes.at(-1).answer, partial);
  assert.equal(h.writes.some((round) => round.status === 'answered'), false);
});

test('queue does not submit a second completion after the done event settled the answer', async (t) => {
  const h = await setup(t);
  const run = await h.start();
  const active = h.context.activeAnswerRef.current;
  active.settled = true;
  h.context.clearAnswerExtractor(active);
  h.context.dispatchAnswer({ type: 'done', id: active.id, finalText: '事件已提交的完整答案。' });
  await h.recorder.flush();
  const revision = h.writes.at(-1).revision;
  await run.finish(RESULT);

  assert.deepEqual(h.errors, []);
  assert.equal(h.actions.filter((action) => action.type === 'done').length, 1);
  assert.equal(h.visible().answer, '事件已提交的完整答案。');
  assert.equal(h.writes.at(-1).answer, '事件已提交的完整答案。');
  assert.equal(h.writes.at(-1).revision, revision);
});

for (const result of [null, undefined]) {
  test(`queue preserves streamed text and its held tail with a legacy ${result} invoke result`, async (t) => {
    const h = await setup(t);
    const run = await h.start();
    await run.finish(result);

    assert.deepEqual(h.errors, []);
    assert.equal(h.actions.filter((action) => action.type === 'done').length, 1);
    assert.equal(h.visible().answer, PARTIAL);
    assert.equal(h.visible().status, 'answered');
    assert.equal(h.writes.at(-1).answer, PARTIAL);
    assert.equal(h.writes.at(-1).status, 'answered');
  });
}


test('queue rejects a completion snapshot belonging to a different provider stream', async (t) => {
  const h = await setup(t);
  const run = await h.start();
  const partial = h.visible().answer;
  await run.finish({ ...RESULT, streamId: 42 });

  assert.deepEqual(h.errors, []);
  assert.equal(h.actions.filter((action) => action.type === 'done').length, 0);
  assert.equal(h.visible().answer, partial);
  assert.equal(h.writes.at(-1).answer, partial);
  assert.equal(h.writes.some((round) => round.status === 'answered'), false);
});

test('queue rejects a resolved snapshot when the coordinator rejects its done identity', async (t) => {
  const h = await setup(t);
  const run = await h.start();
  const partial = h.visible().answer;
  const checked = [];
  h.context.roundCoordinatorRef.current.acceptProviderEvent = (event) => {
    checked.push(event);
    return { accepted: false };
  };
  await run.finish(RESULT);

  assert.deepEqual(h.errors, []);
  assert.equal(checked.length, 1);
  assert.deepEqual({ ...checked[0] }, {
    type: 'done', sessionGeneration: 3, answerId: 7, attemptId: 1, streamId: 41,
  });
  assert.equal(h.actions.filter((action) => action.type === 'done').length, 0);
  assert.equal(h.visible().answer, partial);
  assert.equal(h.writes.at(-1).answer, partial);
  assert.equal(h.writes.some((round) => round.status === 'answered'), false);
});


test('invoke rejection retires the failed stream before the next answer can claim late events', async (t) => {
  const h = await setup(t);
  let nextId = 7;
  const coordinator = createQuestionRoundCoordinator({ allocateAnswerId: () => nextId++ });
  for (let index = 0; index < 3; index += 1) coordinator.resetTranscript();
  const first = coordinator.acceptManualQuestion(QUESTION).actions.find((action) => action.type === 'generate');
  assert.equal(first.answerId, 7);
  assert.equal(first.attemptId, 1);
  coordinator.bindStream({ answerId: first.answerId, attemptId: first.attemptId, streamId: 41 });
  const providerEvents = [];
  h.context.roundCoordinatorRef.current = {
    ...coordinator,
    acceptProviderEvent: (event) => {
      providerEvents.push(event);
      return coordinator.acceptProviderEvent(event);
    },
  };

  const run = await h.start();
  const failedActive = h.context.activeAnswerRef.current;
  const partial = h.visible().answer;
  await run.fail(new Error('synthetic provider disconnect'));

  assert.equal(h.visible().status, 'error');
  assert.equal(h.visible().answer, partial);
  assert.equal(h.writes.at(-1).status, 'error');
  assert.equal(h.actions.filter((action) => action.type === 'done').length, 0);
  assert.ok(h.context.lastSeenStreamIdRef.current >= 41, 'a failed invoke must advance the stale-stream floor');
  const error = providerEvents.find((event) => event.type === 'error');
  assert.ok(error, 'the coordinator must receive an error for the failed attempt');
  assert.equal(error.sessionGeneration, 3);
  assert.equal(error.answerId, 7);
  assert.equal(error.attemptId, 1);
  assert.equal(error.streamId, 41);
  assert.equal(coordinator.getSnapshot().status, 'error');
  assert.equal(coordinator.acceptProviderEvent({
    type: 'token', sessionGeneration: 3, answerId: 7, attemptId: 1, streamId: 41,
  }).accepted, false, 'the failed coordinator identity must be retired');

  const next = coordinator.acceptManualQuestion('UART 帧校验如何处理？').actions.find((action) => action.type === 'generate');
  const nextActive = {
    ...failedActive, id: next.answerId, roundId: next.roundId, attemptId: next.attemptId,
    question: next.question, streamId: undefined, settled: false, stale: false,
  };
  h.context.activeAnswerRef.current = nextActive;
  assert.equal(h.context.claimActiveStream(41), null, 'a delayed failed-stream event cannot bind to the next answer');
  assert.equal(nextActive.streamId, undefined);
  assert.equal(h.context.claimActiveStream(42), nextActive);
  assert.equal(nextActive.streamId, 42);
  assert.equal(coordinator.acceptProviderEvent({
    type: 'token', sessionGeneration: 3, answerId: next.answerId, attemptId: next.attemptId, streamId: 42,
  }).accepted, true, 'the next provider stream must still bind and accept tokens');
});
