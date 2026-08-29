import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('package includes only the fictional knowledge example, never a real personal KB', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const files = packageJson.build?.files ?? [];
  assert.ok(!files.includes('knowledge_source'), 'broad knowledge_source inclusion can package private JSONL files');
  assert.ok(files.includes('knowledge_source/README.md'));
  assert.ok(files.includes('knowledge_source/interview_kb.example.jsonl'));
  assert.ok(files.includes('!knowledge_source/*_kb.jsonl'));
});
