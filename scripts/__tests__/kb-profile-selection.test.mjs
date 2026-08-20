import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKbFileCandidates, resolveKbFilePath } from '../../electron/knowledge/kbRetriever.ts';

test('maps ai/embedded directions to <direction>_kb.jsonl', () => {
  assert.deepEqual(
    buildKbFileCandidates(['/root/knowledge_source'], 'ai'),
    { filePaths: ['/root/knowledge_source/ai_kb.jsonl'] },
  );
  assert.deepEqual(
    buildKbFileCandidates(['/root/knowledge_source'], 'embedded'),
    { filePaths: ['/root/knowledge_source/embedded_kb.jsonl'] },
  );
});

test('normalizes trailing separators on candidate roots', () => {
  assert.deepEqual(
    buildKbFileCandidates(['/root/knowledge_source/', '/other/'], 'ai'),
    { filePaths: ['/root/knowledge_source/ai_kb.jsonl', '/other/ai_kb.jsonl'] },
  );
});

test('invalid direction is rejected without touching candidates', () => {
  const result = buildKbFileCandidates(['/root'], 'cooking');
  assert.deepEqual(result, {
    filePaths: [],
    error: 'Invalid interview knowledge base direction: cooking',
  });
  const resolved = resolveKbFilePath(['/root'], null, () => true);
  assert.ok('error' in resolved && resolved.error.includes('Invalid'));
});

test('packaged root wins over cwd when both exist', () => {
  const packaged = '/app.asar/knowledge_source';
  const dev = '/repo/knowledge_source';
  const exists = (p) => p === `${packaged}/ai_kb.jsonl` || p === `${dev}/ai_kb.jsonl`;
  const result = resolveKbFilePath([packaged, dev], 'ai', exists);
  assert.deepEqual(result, { kbPath: `${packaged}/ai_kb.jsonl` });
});

test('cwd is used when the packaged KB is missing', () => {
  const packaged = '/app.asar/knowledge_source';
  const dev = '/repo/knowledge_source';
  const exists = (p) => p === `${dev}/embedded_kb.jsonl`;
  const result = resolveKbFilePath([packaged, dev], 'embedded', exists);
  assert.deepEqual(result, { kbPath: `${dev}/embedded_kb.jsonl` });
});

test('fail-closed: selected direction KB missing in every root is an error, never a fallback', () => {
  const result = resolveKbFilePath(['/a', '/b'], 'ai', () => false);
  assert.ok('error' in result);
  assert.equal(result.error, 'ai knowledge base is unavailable');
  assert.ok(!result.error.includes('embedded'), 'must not mention or fall back to the other direction');
});
