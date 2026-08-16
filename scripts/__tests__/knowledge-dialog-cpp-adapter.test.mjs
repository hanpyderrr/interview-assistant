import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createCppInterviewerAdapter } from '../knowledge-dialog/cpp-interviewer-adapter.mjs';

function fakeSpawn() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.writes = [];
  child.stdin = {
    write(text) { child.writes.push(JSON.parse(text)); return true; },
    end() { child.stdinEnded = true; },
  };
  child.kill = () => { child.killed = true; };
  return child;
}

function success(request, result, type = 'success') {
  return JSON.stringify({ protocol_version: 1, request_id: request.request_id, type, result });
}

test('correlates out-of-order responses and ignores stderr protocol-like text', async () => {
  const child = fakeSpawn();
  const adapter = createCppInterviewerAdapter({
    executable: 'CppInterviewText.exe', configPath: 'fixture-config.json', spawnImpl: () => child,
  });
  const first = adapter.evaluateAnswer('q1', 'a1');
  const second = adapter.evaluateAnswer('q2', 'a2');
  const [firstRequest, secondRequest] = child.writes;
  child.stderr.emit('data', Buffer.from(success(firstRequest, { score: 1 })));
  child.stdout.emit('data', Buffer.from(`${success(secondRequest, { score: 82 })}\n${success(firstRequest, { score: 61 })}\n`));
  assert.equal((await second).score, 82);
  assert.equal((await first).score, 61);
});

test('times out one request without poisoning later requests', async () => {
  const child = fakeSpawn();
  const adapter = createCppInterviewerAdapter({
    executable: 'CppInterviewText.exe', configPath: 'fixture-config.json', timeoutMs: 10, spawnImpl: () => child,
  });
  await assert.rejects(() => adapter.evaluateAnswer('slow', 'answer'), /timed out/);
  const later = adapter.generateQuestions('fictional resume', 2);
  const request = child.writes.at(-1);
  child.stdout.emit('data', `${success(request, [{ question: 'q' }])}\n`);
  assert.equal((await later)[0].question, 'q');
});

test('process exit rejects every pending request', async () => {
  const child = fakeSpawn();
  const adapter = createCppInterviewerAdapter({
    executable: 'CppInterviewText.exe', configPath: 'fixture-config.json', spawnImpl: () => child,
  });
  const one = adapter.evaluateAnswer('q1', 'a1');
  const two = adapter.generateSummary([{ question: 'q', answer: 'a' }]);
  child.emit('exit', 7, null);
  await assert.rejects(one, /exited/);
  await assert.rejects(two, /exited/);
});

test('close sends shutdown exactly once and accepts a complete response', async () => {
  const child = fakeSpawn();
  const adapter = createCppInterviewerAdapter({
    executable: 'CppInterviewText.exe', configPath: 'fixture-config.json', spawnImpl: () => child,
  });
  const closing = adapter.close();
  const shutdown = child.writes.at(-1);
  assert.equal(shutdown.operation, 'shutdown');
  child.stdout.emit('data', `${success(shutdown, { status: 'shutdown' }, 'complete')}\n`);
  await closing;
  await adapter.close();
  assert.equal(child.writes.filter((request) => request.operation === 'shutdown').length, 1);
  assert.equal(child.stdinEnded, true);
});

test('rejects credential-like fields in child responses', async () => {
  const child = fakeSpawn();
  const adapter = createCppInterviewerAdapter({
    executable: 'CppInterviewText.exe', configPath: 'fixture-config.json', spawnImpl: () => child,
  });
  const pending = adapter.evaluateAnswer('q', 'a');
  const request = child.writes.at(-1);
  child.stdout.emit('data', `${success(request, { score: 80, apiKey: 'fixture' })}\n`);
  await assert.rejects(pending, /credential/i);
});
