import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKbFileCandidates, resolveKbFilePath } from '../../electron/knowledge/kbRetriever.ts';

test('maps roots to the unified interview knowledge base', () => {
  assert.deepEqual(
    buildKbFileCandidates(['/root/knowledge_source']),
    { filePaths: ['/root/knowledge_source/interview_kb.jsonl'] },
  );
});

test('normalizes trailing separators on candidate roots', () => {
  assert.deepEqual(
    buildKbFileCandidates(['/root/knowledge_source/', '/other/']),
    { filePaths: ['/root/knowledge_source/interview_kb.jsonl', '/other/interview_kb.jsonl'] },
  );
});

test('userData root wins over development roots when both exist', () => {
  const userData = '/userData/knowledge_source';
  const dev = '/repo/knowledge_source';
  const exists = (p) => p === `${userData}/interview_kb.jsonl` || p === `${dev}/interview_kb.jsonl`;
  const result = resolveKbFilePath([userData, dev], exists);
  assert.deepEqual(result, { kbPath: `${userData}/interview_kb.jsonl` });
});

test('cwd is used when the private userData KB is missing', () => {
  const userData = '/userData/knowledge_source';
  const dev = '/repo/knowledge_source';
  const exists = (p) => p === `${dev}/interview_kb.jsonl`;
  const result = resolveKbFilePath([userData, dev], exists);
  assert.deepEqual(result, { kbPath: `${dev}/interview_kb.jsonl` });
});

test('fail-closed when the unified KB is missing in every root', () => {
  const result = resolveKbFilePath(['/a', '/b'], () => false);
  assert.ok('error' in result);
  assert.equal(result.error, 'Unified interview knowledge base is unavailable');
});
