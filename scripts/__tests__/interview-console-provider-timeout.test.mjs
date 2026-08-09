import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/interview-console/InterviewConsole.tsx', 'utf8');

test('InterviewConsole wires provider deadline lifecycle around the final stream', () => {
  assert.match(source, /createProviderDeadlineController/);
  assert.match(source, /providerDeadlineControllerRef/);
  assert.match(source, /activeAnswerRef\.current === active/);
  assert.match(source, /active\.generation === sessionGenerationRef\.current/);
  assert.match(source, /providerDeadline/);
  assert.match(source, /fallbackAnswerStart/);
  assert.match(source, /cancelChatStream/);
  assert.match(source, /pumpAnswerQueue\(\)/);
});

test('provider timeout cleanup clears the controller before invalidating the session', () => {
  assert.match(source, /providerDeadlineControllerRef\.current\.clear\(\)/);
  assert.match(source, /sessionGenerationRef\.current \+= 1/);
  assert.match(source, /activeAnswerRef\.current = null/);
});

test('finalText-only completion records a first answer token before answerDone', () => {
  assert.match(source, /firstAnswerToken.*undefined[\s\S]{0,180}data\?\.finalText/);
});

test('a done event without useful tokens or finalText enters the provider failure path', () => {
  assert.match(source, /providerDeadlineControllerRef\.current\.snapshot\(\)\.state === 'pending'/);
  assert.match(source, /completeLatencyTrace\(active\.id, 'timeout'/);
  assert.match(source, /dispatchAnswer\(\{ type: 'error', id: active\.id/);
});

test('start/observeToken/complete all use the answer-id identity domain, not session generation', () => {
  // Regression: production observeToken/complete calls key on `active.id`/`job.id` (the
  // per-answer identity). If start() is keyed on `active.generation` (the per-session
  // identity) instead, the controller's internal generationId never matches the ids used
  // by observeToken/complete, so every useful token and terminal event after the first
  // answer in a session is silently rejected.
  assert.match(source, /providerDeadlineControllerRef\.current\.start\(active\.id\)/);
  assert.doesNotMatch(source, /providerDeadlineControllerRef\.current\.start\(active\.generation\)/);
  assert.match(source, /providerDeadlineControllerRef\.current\.observeToken\(active\.id,/);
  assert.match(source, /providerDeadlineControllerRef\.current\.complete\(active\.id, 'done'\)/);
  assert.match(source, /providerDeadlineControllerRef\.current\.complete\(active\.id, 'error'\)/);
});

test('handleProviderTimeout checks answer id, active-answer identity, and session generation jointly', () => {
  assert.match(
    source,
    /function handleProviderTimeout\(answerId: number\)[\s\S]{0,120}active\.id !== answerId[\s\S]{0,60}active\.generation !== sessionGenerationRef\.current[\s\S]{0,60}active\.settled\) return/,
  );
});
