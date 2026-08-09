// Phase 18 Step 5 prerequisite RED contract: an exported pure acceptance
// predicate on questionTiming.ts.
//
// This suite is expected to FAIL because `shouldAcceptQuestionFinal` is not yet
// exported. It pins the renderer-facing contract: the predicate reuses the
// existing low-information/hallucination tail protection without the settler's
// debounce/deadline state, and it must not mutate its inputs.
//
// Wished-for public API:
//   shouldAcceptQuestionFinal(currentTurns, incoming, recentSettledQuestion?) -> boolean
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAcceptQuestionFinal } from '../questionTiming.ts';

const RICH_QUESTION = '你在 RK3568 上怎么裁剪 Buildroot 根文件系统并排查启动失败？';

function turn(text) {
  return { speaker: 'interviewer', text, final: true };
}

test('a low-information tail after a rich current question is rejected', () => {
  assert.equal(
    shouldAcceptQuestionFinal([turn(RICH_QUESTION)], { text: '我看你' }),
    false,
  );
});

test('a repetitive hallucinated tail is rejected against a recent settled question', () => {
  assert.equal(
    shouldAcceptQuestionFinal([], { text: '贴贴贴贴贴贴贴贴贴贴贴贴贴贴' }, RICH_QUESTION),
    false,
  );
});

test('a short technical follow-up is accepted', () => {
  assert.equal(
    shouldAcceptQuestionFinal([turn(RICH_QUESTION)], { text: 'CRC32 呢？' }),
    true,
  );
});

test('a normal rich interviewer final is accepted', () => {
  assert.equal(
    shouldAcceptQuestionFinal([turn(RICH_QUESTION)], { text: '那线程安全怎么保证？' }),
    true,
  );
});

test('the predicate does not mutate its inputs', () => {
  const currentTurns = [turn(RICH_QUESTION)];
  const incoming = { speaker: 'interviewer', text: '我看你', final: true };
  const turnsBefore = structuredClone(currentTurns);
  const incomingBefore = structuredClone(incoming);

  shouldAcceptQuestionFinal(currentTurns, incoming, RICH_QUESTION);

  assert.deepEqual(currentTurns, turnsBefore);
  assert.deepEqual(incoming, incomingBefore);
  assert.equal(currentTurns.length, 1);
});
