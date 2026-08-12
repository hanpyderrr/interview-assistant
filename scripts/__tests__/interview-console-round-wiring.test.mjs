// Phase 18 Step 5 renderer source-contract suite.
//
// A browser DOM test of InterviewConsole is impractical without new
// dependencies, so this suite asserts the wiring contract against the component
// source. Assertions are semantic regexes (whitespace-tolerant), each with a
// failure message naming the missing wiring. Behaviour itself is covered by
// src/interview-console/__tests__/roundCoordinatorIntegration.test.mjs.
//
// This suite is expected to be RED until the Step 5 wiring lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const consoleSource = fs.readFileSync(
  path.join(repoRoot, 'src', 'interview-console', 'InterviewConsole.tsx'),
  'utf8',
);

const has = (pattern, message) => assert.match(consoleSource, pattern, message);
const hasNot = (pattern, message) => assert.doesNotMatch(consoleSource, pattern, message);

test('the console imports the round coordinator and the pure acceptance predicate', () => {
  has(
    /import\s*\{[^}]*createQuestionRoundCoordinator[^}]*\}\s*from\s*'\.\/questionRoundCoordinator'/,
    'expected an import of createQuestionRoundCoordinator from ./questionRoundCoordinator',
  );
  has(
    /import\s*\{[^}]*shouldAcceptQuestionFinal[^}]*\}\s*from\s*'\.\/questionTiming'/,
    'expected shouldAcceptQuestionFinal to be imported from ./questionTiming as the low-information gate',
  );
});

test('the old Date.now settler/splitter is no longer the answer trigger', () => {
  hasNot(
    /createQuestionSettler/,
    'createQuestionSettler must no longer drive answer generation in the renderer',
  );
  hasNot(
    /splitSettledInterviewQuestion/,
    'coordinator generation must produce one row per round and must not call splitSettledInterviewQuestion',
  );
  hasNot(
    /questionSettlerRef\.current\.drain/,
    'the settler drain must no longer be the answer trigger',
  );
});

test('answer jobs and active answers carry round identity', () => {
  const jobType = /type\s+AnswerJob\s*=\s*\{[^}]*\}/.exec(consoleSource)?.[0] || '';
  for (const field of ['roundId', 'attemptId', 'roundSessionGeneration']) {
    assert.match(jobType, new RegExp(field), `AnswerJob must carry ${field}; got: ${jobType || '<AnswerJob type not found>'}`);
  }
  const activeType = /type\s+ActiveAnswer\s*=\s*[^\n]*\n?/.exec(consoleSource)?.[0] || '';
  assert.match(
    `${activeType}${jobType}`,
    /roundId/,
    'ActiveAnswer must carry round identity (directly or by extending AnswerJob)',
  );
});

test('one coordinator ref allocates answer ids through answerSequenceRef', () => {
  has(
    /useRef\(\s*createQuestionRoundCoordinator\(\s*\{[\s\S]{0,300}?allocateAnswerId\s*:\s*\(\s*\)\s*=>\s*\+\+\s*answerSequenceRef\.current/,
    'expected a coordinator ref whose allocateAnswerId returns ++answerSequenceRef.current',
  );
});

test('the interviewer final gate uses immutable current-round turns and complete event metadata', () => {
  has(
    /shouldAcceptQuestionFinal\(\s*[\s\S]{0,200}?getSnapshot\(\)\.turns/,
    'expected shouldAcceptQuestionFinal to be called with the coordinator snapshot turns (immutable current round)',
  );
  has(
    /acceptInterviewerFinal\(\s*\{[\s\S]{0,600}?\}\s*\)/,
    'expected acceptInterviewerFinal to be called with an inline final metadata object',
  );
  const call = /acceptInterviewerFinal\(\s*\{[\s\S]{0,900}?\}\s*\)/.exec(consoleSource)?.[0] || '';
  for (const field of ['sessionId', 'sequence', 'segmentId', 'audioStartMs', 'audioEndMs']) {
    assert.match(call, new RegExp(field), `acceptInterviewerFinal metadata must include ${field}; got: ${call || '<call not found>'}`);
  }
  assert.match(
    call,
    /arrivalMs\s*:\s*rendererReceiveMonotonicMs/,
    'arrivalMs must be the renderer monotonic receive time (arrivalMs: rendererReceiveMonotonicMs)',
  );
});

test('an accepted candidate final carries complete timing metadata into the coordinator', () => {
  const start = consoleSource.indexOf('acceptCandidateFinal({');
  const end = consoleSource.indexOf('}).actions', start);
  const call = start >= 0 && end > start ? consoleSource.slice(start, end + 2) : '';
  assert.ok(call, 'a user final must call coordinator.acceptCandidateFinal with an inline metadata object');
  for (const field of ['sessionId', 'sequence', 'segmentId', 'audioStartMs', 'audioEndMs']) {
    assert.match(call, new RegExp(field), `acceptCandidateFinal metadata must include ${field}; got: ${call || '<call not found>'}`);
  }
  assert.match(
    call,
    /arrivalMs\s*:\s*rendererReceiveMonotonicMs/,
    'candidate arrivalMs must be the renderer monotonic receive time',
  );
});

test('the provisional tick runs on the renderer monotonic clock and actions apply synchronously', () => {
  has(
    /\.tick\(\s*performance\.now\(\)\s*\)/,
    'expected the scheduler to call coordinator.tick(performance.now())',
  );
  has(
    /applyRoundActions\s*\(/,
    'expected a synchronous applyRoundActions helper for coordinator actions',
  );
  hasNot(
    /async\s+function\s+applyRoundActions/,
    'action application must be synchronous, not async',
  );
});

test('action application maps reviseHistory, provisional generate, and restart correctly', () => {
  has(
    /'reviseHistory'[\s\S]{0,200}?dispatchAnswer\(\s*\{\s*type:\s*'revise'/,
    "a reviseHistory action must dispatch dispatchAnswer({ type: 'revise' })",
  );
  has(
    /action\.answerId/,
    'generate actions must use the coordinator-provided answerId',
  );
  has(
    /'restart'/,
    'the applier must distinguish the restart generate reason from provisional',
  );
  has(
    /action\.attemptId/,
    'restart must match the queued/active attempt by attemptId',
  );
  has(
    /activeAnswerRef\.current[\s\S]{0,400}?action\.answerId[\s\S]{0,200}?action\.attemptId/,
    'cancellation must match the active job on both answerId and attemptId so unrelated active jobs are never cancelled',
  );
});

test('cancelling a known stream advances the stale floor before cancelChatStream', () => {
  has(
    /lastSeenStreamIdRef\.current\s*=\s*Math\.max\([\s\S]{0,120}?\)[\s\S]{0,200}?cancelChatStream/,
    'a known cancelled stream must advance lastSeenStreamIdRef before requesting cancelChatStream',
  );
});

test('cancelling a known candidate stream advances the stale floor before releasing it', () => {
  const start = consoleSource.indexOf('function cancelCandidateStream()');
  const end = consoleSource.indexOf('function hasBoundProviderStream', start);
  const cancelCandidateBody = start >= 0 && end > start ? consoleSource.slice(start, end) : '';
  assert.match(
    cancelCandidateBody,
    /candidate\.streamId[\s\S]*?lastSeenStreamIdRef\.current\s*=\s*Math\.max\([\s\S]*?candidate\.streamId[\s\S]*?candidateControllerRef\.current\.cancel/,
    'a cancelled candidate stream must become stale before a replacement answer can bind delayed candidate events',
  );
});

test('the first tagged active callback binds the stream id to the coordinator', () => {
  has(
    /bindStream\(\s*\{[\s\S]{0,200}?streamId/,
    'expected coordinator.bindStream({ answerId, attemptId, streamId }) on the first tagged active event',
  );
});

test('token, done and error each validate the full coordinator tuple before mutating', () => {
  has(
    /acceptProviderEvent\(/,
    'provider callbacks must validate identity through coordinator.acceptProviderEvent',
  );
  const accepts = consoleSource.match(/acceptProviderEvent\(/g) || [];
  assert.ok(
    accepts.length >= 3,
    `token, done and error must each validate through acceptProviderEvent; found ${accepts.length} call(s)`,
  );
  for (const type of ['token', 'done', 'error']) {
    has(
      new RegExp(`acceptProviderEvent\\(\\s*\\{[\\s\\S]{0,400}?type:\\s*'${type}'`),
      `the ${type} callback must build an acceptProviderEvent with type: '${type}'`,
    );
  }
  const guardedCall = /acceptProviderEvent\(\s*\{[\s\S]{0,500}?\}\s*\)/.exec(consoleSource)?.[0] || '';
  for (const field of ['sessionGeneration', 'answerId', 'attemptId', 'streamId']) {
    assert.match(
      guardedCall,
      new RegExp(field),
      `the validated tuple must include ${field}; got: ${guardedCall || '<no acceptProviderEvent call found>'}`,
    );
  }
});

test('reset and clear invoke the coordinator transcript reset', () => {
  has(
    /resetTranscript\(\)/,
    'reset/clear must invoke coordinator.resetTranscript()',
  );
});

test('latency traces bind the coordinator answer id, not a predicted sequence', () => {
  hasNot(
    /answerSequenceRef\.current\s*\+\s*1/,
    'latency traces must not predict answerSequenceRef.current + 1; bind the coordinator action.answerId instead',
  );
  has(
    /createLatencyTrace\(/,
    'latency tracing must remain wired',
  );
});
