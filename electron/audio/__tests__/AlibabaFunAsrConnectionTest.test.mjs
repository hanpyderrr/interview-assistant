import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const COMPILED = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../dist-electron/electron/audio/alibabaFunAsrConnectionTest.js',
);
const FAKE_KEY = 'fake-alibaba-fun-asr-key-task5';
const WORKSPACE = 'workspace-task5-private';
const TASK_ID = '123e4567-e89b-42d3-a456-426614174000';

class FakeSocket extends EventEmitter {
  sent = [];
  closeCalls = 0;

  send(value) { this.sent.push(value); }
  close() { this.closeCalls += 1; }
  open() { this.emit('open'); }
  message(value) { this.emit('message', JSON.stringify(value)); }
  serverClose(code = 1006) { this.emit('close', code); }
}

class FakeTimers {
  nextId = 1;
  jobs = new Map();

  setTimeout(callback, delayMs) {
    const id = this.nextId++;
    this.jobs.set(id, { callback, delayMs });
    return id;
  }
  clearTimeout(id) { this.jobs.delete(id); }
  fireOnly() {
    assert.equal(this.jobs.size, 1);
    const [[id, job]] = this.jobs;
    this.jobs.delete(id);
    job.callback();
  }
  delays() { return [...this.jobs.values()].map(job => job.delayMs); }
}

function harness(overrides = {}) {
  const { socket: suppliedSocket, ...optionOverrides } = overrides;
  const socket = suppliedSocket ?? new FakeSocket();
  const timers = new FakeTimers();
  const requests = [];
  const module = require(COMPILED);
  const promise = module.testAlibabaFunAsrConnection({
    apiKey: FAKE_KEY,
    region: 'cn-beijing',
    model: 'fun-asr-realtime',
    workspaceId: WORKSPACE,
    vocabularyId: ' vocab-1 ',
    languageHint: 'zh',
    wsFactory: (url, options) => {
      requests.push({ url, options });
      return socket;
    },
    uuid: () => TASK_ID,
    timers,
    ...optionOverrides,
  });
  return { module, socket, timers, requests, promise };
}

function frame(socket, index = 0) {
  return JSON.parse(socket.sent[index]);
}

function assertClean(h) {
  assert.equal(h.timers.jobs.size, 0);
  assert.equal(h.socket.eventNames().length, 0);
  assert.equal(h.socket.closeCalls, 1);
}

function assertSecretSafe(result) {
  const output = JSON.stringify(result);
  assert.equal(output.includes(FAKE_KEY), false);
  assert.equal(output.includes('Authorization'), false);
  assert.equal(output.includes(WORKSPACE), false);
}

test('succeeds only after open, matching task-started, finish-task, and matching task-finished', async () => {
  const h = harness();
  assert.deepEqual(h.timers.delays(), [10_000]);
  assert.equal(h.socket.sent.length, 0);
  h.socket.open();
  assert.deepEqual(h.timers.delays(), [10_000]);
  assert.equal(frame(h.socket).header.action, 'run-task');
  assert.equal(frame(h.socket).payload.parameters.vocabulary_id, 'vocab-1');
  assert.deepEqual(frame(h.socket).payload.parameters.language_hints, ['zh']);
  assert.equal(h.requests[0].options.headers.Authorization, `Bearer ${FAKE_KEY}`);

  h.socket.message({ header: { event: 'task-started', task_id: TASK_ID }, payload: {} });
  assert.deepEqual(h.timers.delays(), [10_000]);
  assert.equal(frame(h.socket, 1).header.action, 'finish-task');
  h.socket.message({ header: { event: 'task-finished', task_id: TASK_ID }, payload: {} });

  assert.deepEqual(await h.promise, { success: true });
  assert.equal(h.socket.sent.every(value => typeof value === 'string'), true, 'connection test must send no audio');
  assertClean(h);
});

test('treats EmptyAudio after finishing the zero-audio probe as a successful connection', async () => {
  const h = harness();
  h.socket.open();
  h.socket.message({ header: { event: 'task-started', task_id: TASK_ID }, payload: {} });
  h.socket.message({
    header: {
      event: 'task-failed', task_id: TASK_ID,
      error_code: 'EmptyAudio', error_message: 'EmptyAudio',
    },
  });

  assert.deepEqual(await h.promise, { success: true });
  assertClean(h);
});

test('connect, task-started, and task-finished stages each have a fresh deadline', async () => {
  for (const stage of ['connect', 'start', 'finish']) {
    const h = harness();
    if (stage !== 'connect') h.socket.open();
    if (stage === 'finish') {
      h.socket.message({ header: { event: 'task-started', task_id: TASK_ID }, payload: {} });
    }
    h.timers.fireOnly();
    const result = await h.promise;
    assert.equal(result.success, false);
    assert.match(result.error, new RegExp(stage, 'i'));
    assertSecretSafe(result);
    assertClean(h);
  }
});

test('mismatched task IDs never advance and eventually time out', async () => {
  const h = harness();
  h.socket.open();
  h.socket.message({ header: { event: 'task-started', task_id: '123e4567-e89b-42d3-a456-426614174001' }, payload: {} });
  assert.equal(h.socket.sent.length, 1);
  h.timers.fireOnly();
  const result = await h.promise;
  assert.equal(result.success, false);
  assert.match(result.error, /start/i);
  assertClean(h);
});

test('matching task-failed is explicit and does not expose the raw frame body', async () => {
  const h = harness();
  h.socket.open();
  h.socket.message({
    header: {
      event: 'task-failed', task_id: TASK_ID,
      error_code: 'InvalidParameter', error_message: `${FAKE_KEY} Authorization ${WORKSPACE}`,
    },
  });
  const result = await h.promise;
  assert.equal(result.success, false);
  assert.match(result.error, /task failed/i);
  assertSecretSafe(result);
  assertClean(h);
});

test('classifies 401/403 as auth failures and 429/500 as handshake failures', async () => {
  for (const [statusCode, expected] of [[401, /authentication/i], [403, /authentication/i], [429, /handshake/i], [500, /handshake/i]]) {
    const h = harness();
    h.socket.emit('unexpected-response', {}, { statusCode });
    const result = await h.promise;
    assert.equal(result.success, false);
    assert.match(result.error, expected);
    assertSecretSafe(result);
    assertClean(h);
  }
});

test('handles socket errors, closes, and malformed protocol without leaking details', async () => {
  const cases = [
    h => h.socket.emit('error', new Error(`getaddrinfo ENOTFOUND ${WORKSPACE} Authorization: Bearer ${FAKE_KEY}`)),
    h => h.socket.serverClose(1006),
    h => { h.socket.open(); h.socket.emit('message', `{broken ${FAKE_KEY} ${WORKSPACE}`); },
  ];
  for (const trigger of cases) {
    const h = harness();
    trigger(h);
    const result = await h.promise;
    assert.equal(result.success, false);
    assertSecretSafe(result);
    assertClean(h);
  }
});

test('cleanup absorbs the asynchronous error caused by closing a CONNECTING socket and then removes the sink', async () => {
  class ConnectingAbortSocket extends FakeSocket {
    readyState = 0;
    close() {
      this.closeCalls += 1;
      queueMicrotask(() => {
        this.emit('error', new Error(`WebSocket was closed before connection established ${FAKE_KEY}`));
        this.emit('close', 1006);
      });
    }
  }
  const socket = new ConnectingAbortSocket();
  const h = harness({ socket });

  h.timers.fireOnly();
  const result = await h.promise;
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(result.success, false);
  assertSecretSafe(result);
  assertClean(h);
});

test('validates public config without accepting arbitrary region/model/workspace values', () => {
  const { validateAlibabaFunAsrPublicConfig } = require(COMPILED);
  assert.deepEqual(validateAlibabaFunAsrPublicConfig({
    region: 'ap-southeast-1', model: 'fun-asr-realtime-2026-02-28',
    workspaceId: ' valid-workspace ', vocabularyId: ' vocab ',
  }), {
    region: 'ap-southeast-1', model: 'fun-asr-realtime-2026-02-28',
    workspaceId: 'valid-workspace', vocabularyId: 'vocab',
  });
  assert.throws(() => validateAlibabaFunAsrPublicConfig({ region: 'moon', model: 'fun-asr-realtime', workspaceId: 'valid' }), /region/i);
  assert.throws(() => validateAlibabaFunAsrPublicConfig({ region: 'cn-beijing', model: 'anything', workspaceId: 'valid' }), /model/i);
  assert.throws(() => validateAlibabaFunAsrPublicConfig({ region: 'cn-beijing', model: 'fun-asr-realtime', workspaceId: 'Bad.Workspace' }), /workspace/i);
});
