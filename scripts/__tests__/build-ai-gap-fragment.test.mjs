import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildAiGapFragment } from '../build-ai-gap-fragment.mjs';

test('builds merge-compatible AI records from the canonical oral answers', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-gap-fragment-'));
  const candidatesPath = path.join(dir, 'answers.json');
  const outputPath = path.join(dir, 'fragment.json');
  await writeFile(candidatesPath, JSON.stringify({ items: [{
    formal_id: 'ai.gap.001',
    category: 'Agent架构与边界',
    title: 'Agent 怎么运转？',
    oral_answer: '先解析目标，再规划并执行工具，最后验证结果。',
    keywords: ['Agent Loop', '工具调用'],
    candidate_id: 'ai-gap-001',
  }] }), 'utf8');

  const result = await buildAiGapFragment({
    candidatesPath,
    outputPath,
    sourceFile: 'research/answers.md',
  });

  assert.deepEqual(result, { count: 1, outputPath });
  const records = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.deepEqual(records, [{
    id: 'ai.gap.001',
    direction: 'ai',
    category: 'Agent架构与边界',
    title: 'Agent 怎么运转？',
    fact_status: 'prepared_answer',
    review_status: 'cc_pending',
    content: '先解析目标，再规划并执行工具，最后验证结果。',
    source: { file: 'research/answers.md', ref: 'ai-gap-001' },
    keywords: ['Agent Loop', '工具调用'],
    target_roles: ['ai_agent'],
    evidence_status: 'draft',
  }]);
});

test('rejects missing ids and duplicate ids before writing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-gap-fragment-invalid-'));
  const candidatesPath = path.join(dir, 'answers.json');
  await writeFile(candidatesPath, JSON.stringify({ items: [
    { formal_id: 'ai.gap.001', title: 'A', oral_answer: 'A', keywords: [] },
    { formal_id: 'ai.gap.001', title: 'B', oral_answer: 'B', keywords: [] },
  ] }), 'utf8');
  await assert.rejects(
    buildAiGapFragment({ candidatesPath, outputPath: path.join(dir, 'out.json'), sourceFile: 'x.md' }),
    /duplicate id/i,
  );
});
