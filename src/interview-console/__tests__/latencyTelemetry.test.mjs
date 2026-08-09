import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLatencyTrace,
  isCompleteLatencyRecord,
  classifyLatencyRecord,
} from '../latencyTelemetry.ts';

test('latency trace keeps event timestamps strictly increasing', () => {
  let now = 1000;
  const trace = createLatencyTrace('q-1', () => now);

  trace.mark('audioEnd');
  trace.mark('firstInterviewerFinal');
  now = 1001;
  trace.mark('questionSettled');

  const record = trace.snapshot();
  assert.deepEqual(record.events, {
    audioEnd: 1000,
    firstInterviewerFinal: 1000.001,
    questionSettled: 1001,
  });
  assert.equal(record.questionGenerationId, 'q-1');
});

test('normal record is complete only when required events are ordered', () => {
  const complete = {
    questionGenerationId: 'q-2',
    events: {
      audioEnd: 1,
      firstInterviewerFinal: 2,
      questionSettled: 3,
      retrievalReady: 4,
      firstAnswerToken: 5,
      answerDone: 6,
    },
    provider: { outcome: 'success' },
  };
  assert.equal(isCompleteLatencyRecord(complete), true);
  assert.equal(isCompleteLatencyRecord({ ...complete, events: { ...complete.events, answerDone: 4 } }), false);
});

test('provider timeout with completed local fallback is pipeline-complete but provider-failed', () => {
  const record = {
    questionGenerationId: 'q-3',
    events: {
      audioEnd: 1,
      firstInterviewerFinal: 2,
      questionSettled: 3,
      retrievalReady: 4,
      providerDeadline: 5,
      providerError: 6,
      fallbackAnswerStart: 7,
      firstAnswerToken: 8,
      answerDone: 9,
    },
    provider: { outcome: 'timeout' },
  };
  assert.equal(isCompleteLatencyRecord(record), true);
  assert.deepEqual(classifyLatencyRecord(record), {
    pipelineComplete: true,
    providerSuccess: false,
    providerFailure: true,
  });
});
