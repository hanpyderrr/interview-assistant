import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aggregateLatencyRecords, latencyRecordsToCsv } from '../lib/latency-baseline.mjs';
import { FIXTURES } from '../interview-latency-baseline.mjs';
import { aggregateBaselineFile } from '../aggregate-latency-baseline.mjs';

test('baseline runner freezes the ten approved fixture roles', () => {
  assert.equal(FIXTURES.length, 10);
  assert.deepEqual(FIXTURES.map((fixture) => fixture.category), [
    'ordinary', 'ordinary', 'ordinary', 'ordinary',
    'multi-question', 'multi-question',
    'short-follow-up', 'short-follow-up',
    'tail-hallucination-guard', 'provider-fallback',
  ]);
});

test('aggregator separates pipeline completeness from provider success', () => {
  const records = [
    {
      fixture: 'ordinary-01',
      questionGenerationId: 'q-1',
      events: { audioEnd: 0, firstInterviewerFinal: 100, questionSettled: 500, retrievalReady: 505, firstAnswerToken: 1500, answerDone: 2500 },
      provider: { outcome: 'success', deadlineMs: 3000, ttftMs: 995, tokensPerSecond: 20 },
    },
    {
      fixture: 'provider-fallback',
      questionGenerationId: 'q-2',
      events: { audioEnd: 0, firstInterviewerFinal: 100, questionSettled: 500, retrievalReady: 505, providerDeadline: 2000, providerError: 2001, fallbackAnswerStart: 2002, firstAnswerToken: 2003, answerDone: 2200 },
      provider: { outcome: 'timeout', deadlineMs: 2000, timeout: true },
    },
  ];

  const summary = aggregateLatencyRecords(records);
  assert.equal(summary.eventCompletenessRate, 1);
  assert.equal(summary.providerFailureRate, 0.5);
  assert.deepEqual(summary.providerSuccessTtftMs, { p50: 995, p95: 995 });
  assert.equal(summary.providerTimeoutFrequency, 0.5);
});

test('CSV export contains stable event and provider columns', () => {
  const csv = latencyRecordsToCsv([{
    fixture: 'ordinary-01',
    questionGenerationId: 'q-1',
    events: { audioEnd: 0, firstInterviewerFinal: 1 },
    provider: { outcome: 'unknown' },
  }]);
  assert.match(csv, /^fixture,questionGenerationId,audioEnd,firstInterviewerFinal/);
  assert.match(csv, /ordinary-01,q-1,0,1/);
});

test('aggregate CLI writes a reusable summary artifact', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-latency-'));
  const input = path.join(tempDir, 'baseline.json');
  const output = path.join(tempDir, 'summary.json');
  fs.writeFileSync(input, JSON.stringify({ records: [{
    fixture: 'ordinary-01',
    questionGenerationId: 'q-1',
    events: { audioEnd: 0, firstInterviewerFinal: 1, questionSettled: 2, retrievalReady: 3, firstAnswerToken: 4, answerDone: 5 },
    provider: { outcome: 'success', ttftMs: 1 },
  }] }));
  const summary = aggregateBaselineFile(input, output);
  assert.equal(summary.sampleCount, 1);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).eventCompletenessRate, 1);
});
