import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/interview-console/InterviewConsole.tsx', 'utf8');

test('interview console labels the configured local FunASR engine', () => {
  assert.match(source, /getStoredCredentials/);
  assert.match(source, /local-funasr[^\n]+FunASR/);
  assert.match(source, /中文 \/ \{sttEngineLabel\}/);
});
