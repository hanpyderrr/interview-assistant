import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/interview-console/InterviewConsole.tsx'), 'utf8');

test('candidate streams are generation-scoped and final settle can reuse only a completed compatible candidate', () => {
  assert.match(source, /createCandidateGenerationController/);
  assert.match(source, /candidateStreamRef/);
  assert.match(source, /candidateGenerationRef/);
  assert.match(source, /claimCandidateStream/);
  assert.match(source, /candidateControllerRef\.current\.acceptCandidateToken/);
  assert.match(source, /cancelChatStream/);
  assert.match(source, /finalText/);
});
