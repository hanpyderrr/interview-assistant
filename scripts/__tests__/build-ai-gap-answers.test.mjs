import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildAnswerArtifacts, validateAnswerSet } from '../build-ai-gap-answers.mjs';

const candidates = [
  { candidate_id: 'ai-gap-001', title: '问题一？', category: 'Agent', question_type: '主问题', difficulty: '基础' },
  { candidate_id: 'ai-gap-002', title: '问题二？', category: 'RAG', question_type: '系统设计', difficulty: '高级' },
];

const answers = [
  {
    candidate_id: 'ai-gap-001', title: '问题一？',
    oral_answer: '先说明核心结论，再解释关键边界和取舍。',
    detailed_answer: '先给出定义，再说明实现步骤、关键取舍、失败风险和常见追问。',
    keywords: ['Agent'], fact_mode: 'technical_template', review_notes: [],
  },
  {
    candidate_id: 'ai-gap-002', title: '问题二？',
    oral_answer: '如果由我设计，我会先建立可评测基线，再分层实现召回、重排和降级。',
    detailed_answer: '如果由我设计，我会先定义目标和数据边界，再实现召回、重排、引用和低分拒绝，并用固定样本验证质量、延迟和成本。',
    keywords: ['RAG', '重排'], fact_mode: 'conditional_design', review_notes: [],
  },
];

test('validates exact candidate IDs and titles', () => {
  const result = validateAnswerSet(candidates, answers);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.formal_id), ['ai.gap.001', 'ai.gap.002']);
  assert.equal(result.items[0].review_status, 'answer_review_pending');
});

test('rejects duplicate IDs and title drift', () => {
  assert.throws(
    () => validateAnswerSet(candidates, [answers[0], { ...answers[0], title: '漂移标题' }]),
    /duplicate answer id|title mismatch/,
  );
});

test('normalizes one review note string into the canonical array', () => {
  const result = validateAnswerSet(candidates.slice(0, 1), [
    { ...answers[0], review_notes: '通用回答，未使用个人项目事实。' },
  ]);
  assert.deepEqual(result.items[0].review_notes, ['通用回答，未使用个人项目事实。']);
});

test('builds deterministic JSON and two Markdown views', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-gap-answers-'));
  const candidatePath = path.join(root, 'candidates.json');
  const batchDir = path.join(root, 'batches');
  const outputDir = path.join(root, 'out');
  await fs.mkdir(batchDir);
  await fs.writeFile(candidatePath, JSON.stringify({ items: candidates }), 'utf8');
  await fs.writeFile(path.join(batchDir, 'batch-01.json'), JSON.stringify(answers), 'utf8');

  const result = await buildAnswerArtifacts({ candidatePath, batchDir, outputDir });
  assert.equal(result.count, 2);
  const canonical = JSON.parse(await fs.readFile(path.join(outputDir, 'answer-candidates-50.json'), 'utf8'));
  assert.equal(canonical.items.length, 2);
  assert.match(await fs.readFile(path.join(outputDir, 'question-answer-50-oral.md'), 'utf8'), /ai\.gap\.001/);
  assert.match(await fs.readFile(path.join(outputDir, 'question-answer-50-detailed.md'), 'utf8'), /## Agent/);
  assert.match(await fs.readFile(path.join(outputDir, 'answer-quality-report.md'), 'utf8'), /答案数量：2/);
});
