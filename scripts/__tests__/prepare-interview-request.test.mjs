import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareInterviewRequest } from '../prepare-interview-request.mjs';

test('prepares a model-ready request from a question and the embedded KB', async () => {
  const request = await prepareInterviewRequest('SPI 如何保证 CRC32 完整性？');
  assert.match(request.system, /不能|不得/);
  assert.match(request.user, /SPI/);
  assert.match(request.user, /CRC32/i);
  assert.ok(request.matches.length > 0);
});
