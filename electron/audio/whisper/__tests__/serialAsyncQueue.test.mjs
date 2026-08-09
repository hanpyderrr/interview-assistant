import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const compiledPath = path.resolve(__dirname, '../../../../dist-electron/electron/audio/whisper/serialAsyncQueue.js');
const { createSerialAsyncQueue } = require(compiledPath);
const workerSource = fs.readFileSync(path.resolve(__dirname, '../whisperWorker.ts'), 'utf8');

test('serial async queue processes transcriptions in FIFO order', async () => {
  const events = [];
  const queue = createSerialAsyncQueue(async (value) => {
    events.push(`start:${value}`);
    await new Promise((resolve) => setTimeout(resolve, value === 'first' ? 25 : 1));
    events.push(`end:${value}`);
  });

  queue.enqueue('first');
  queue.enqueue('second');
  queue.enqueue('third');
  await queue.idle();

  assert.deepEqual(events, [
    'start:first', 'end:first',
    'start:second', 'end:second',
    'start:third', 'end:third',
  ]);
});

test('serial async queue continues after one task rejects', async () => {
  const completed = [];
  const errors = [];
  const queue = createSerialAsyncQueue(
    async (value) => {
      if (value === 'bad') throw new Error('expected failure');
      completed.push(value);
    },
    (error, value) => errors.push(`${value}:${error.message}`),
  );

  queue.enqueue('bad');
  queue.enqueue('good');
  await queue.idle();

  assert.deepEqual(errors, ['bad:expected failure']);
  assert.deepEqual(completed, ['good']);
});

test('Whisper worker routes parent messages through the FIFO queue', () => {
  assert.match(workerSource, /createSerialAsyncQueue/);
  assert.match(workerSource, /parentPort\.on\('message', \(msg: any\) => messageQueue\.enqueue\(msg\)\)/);
  assert.doesNotMatch(workerSource, /parentPort\.on\('message', async/);
});
