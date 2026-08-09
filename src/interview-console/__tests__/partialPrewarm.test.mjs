import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartialPrewarmGate } from '../partialPrewarm.ts';

function createFakeTimers() {
  let nextId = 0;
  let now = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

test('stable technical partial prewarms once after the stability window', () => {
  const timers = createFakeTimers();
  const calls = [];
  const gate = createPartialPrewarmGate({
    stableMs: 500,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onStable: (payload) => calls.push(payload),
  });

  gate.observe({
    speaker: 'interviewer',
    segmentId: 3,
    text: '你会怎么设计 Buildroot 裁剪方案并说明驱动保留策略？',
  });
  timers.advance(499);
  assert.equal(calls.length, 0);
  timers.advance(1);
  assert.deepEqual(calls, [{
    speaker: 'interviewer',
    segmentId: 3,
    question: '你会怎么设计 Buildroot 裁剪方案并说明驱动保留策略？',
  }]);

  gate.observe({
    speaker: 'interviewer',
    segmentId: 3,
    text: '你会怎么设计 Buildroot 裁剪方案并说明驱动保留策略？',
  });
  timers.advance(500);
  assert.equal(calls.length, 1);
});

test('a changed partial cancels the older candidate and only the latest stable text prewarms', () => {
  const timers = createFakeTimers();
  const calls = [];
  const gate = createPartialPrewarmGate({
    stableMs: 500,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onStable: (payload) => calls.push(payload),
  });

  gate.observe({ speaker: 'interviewer', segmentId: 4, text: '如何排查 Linux 启动问题并定位驱动错误？' });
  timers.advance(300);
  gate.observe({ speaker: 'interviewer', segmentId: 4, text: '如何排查 Linux 启动问题并定位设备树驱动错误？' });
  timers.advance(200);
  assert.equal(calls.length, 0);
  timers.advance(300);
  assert.deepEqual(calls.map((call) => call.question), ['如何排查 Linux 启动问题并定位设备树驱动错误？']);
});

test('short or non-question partials do not prewarm, and final/reset cancel pending work', () => {
  const timers = createFakeTimers();
  const calls = [];
  const gate = createPartialPrewarmGate({
    stableMs: 500,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onStable: (payload) => calls.push(payload),
  });

  gate.observe({ speaker: 'interviewer', segmentId: 5, text: '嗯嗯' });
  timers.advance(1000);
  assert.equal(calls.length, 0);

  gate.observe({ speaker: 'interviewer', segmentId: 6, text: '你会怎么优化 RK3568 启动时间和日志采集？' });
  gate.cancelSegment(6);
  timers.advance(1000);
  assert.equal(calls.length, 0);

  gate.observe({ speaker: 'interviewer', segmentId: 7, text: '你会怎么优化 RK3568 启动时间和日志采集？' });
  gate.clear();
  timers.advance(1000);
  assert.equal(calls.length, 0);
});
