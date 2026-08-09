import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderDeadlineController } from '../providerDeadlineController.ts';

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
    pendingCount() {
      return timers.size;
    },
  };
}

test('times out a pending generation exactly once at its deadline', () => {
  const timers = createFakeTimers();
  const timeouts = [];
  const controller = createProviderDeadlineController({
    deadlineMs: 7000,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onTimeout: (generationId) => timeouts.push(generationId),
  });

  controller.start(11);
  timers.advance(6999);
  assert.deepEqual(timeouts, []);
  timers.advance(1);
  timers.advance(7000);
  assert.deepEqual(timeouts, [11]);
  assert.equal(controller.snapshot().state, 'timeout');
});

test('ignores a stale generation and clears its timer when a newer generation starts', () => {
  const timers = createFakeTimers();
  const timeouts = [];
  const controller = createProviderDeadlineController({
    deadlineMs: 100,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onTimeout: (generationId) => timeouts.push(generationId),
  });

  controller.start(1);
  controller.start(2);
  timers.advance(100);
  assert.deepEqual(timeouts, [2]);
  assert.equal(controller.snapshot().generationId, 2);
});

test('whitespace-only tokens do not cancel the first-useful deadline', () => {
  const timers = createFakeTimers();
  const timeouts = [];
  const controller = createProviderDeadlineController({
    deadlineMs: 100,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onTimeout: (generationId) => timeouts.push(generationId),
  });

  controller.start(3);
  assert.equal(controller.observeToken(3, ' \n\t'), false);
  assert.equal(controller.snapshot().state, 'pending');
  timers.advance(100);
  assert.deepEqual(timeouts, [3]);
});

test('a useful token cancels the deadline and protects the streamed answer', () => {
  const timers = createFakeTimers();
  const timeouts = [];
  const controller = createProviderDeadlineController({
    deadlineMs: 100,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onTimeout: (generationId) => timeouts.push(generationId),
  });

  controller.start(4);
  assert.equal(controller.observeToken(4, '答案'), true);
  assert.equal(controller.snapshot().state, 'streaming');
  assert.equal(timers.pendingCount(), 0);
  timers.advance(1000);
  assert.deepEqual(timeouts, []);
});

test('done, error, and timeout are terminal and invoke only the first transition', () => {
  const timers = createFakeTimers();
  const timeouts = [];
  const controller = createProviderDeadlineController({
    deadlineMs: 100,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onTimeout: (generationId) => timeouts.push(generationId),
  });

  controller.start(5);
  assert.equal(controller.complete(5, 'done'), true);
  assert.equal(controller.complete(5, 'error'), false);
  timers.advance(1000);
  assert.deepEqual(timeouts, []);

  controller.start(6);
  controller.clear();
  timers.advance(1000);
  assert.deepEqual(timeouts, []);
});

test('two queued generations can each release once after timeout', () => {
  const timers = createFakeTimers();
  const released = [];
  const controller = createProviderDeadlineController({
    deadlineMs: 100,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onTimeout: (generationId) => released.push(generationId),
  });

  controller.start(7);
  timers.advance(100);
  controller.start(8);
  timers.advance(100);
  assert.deepEqual(released, [7, 8]);
});
