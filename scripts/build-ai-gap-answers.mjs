#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REQUIRED_FIELDS = [
  'candidate_id', 'title', 'oral_answer', 'detailed_answer',
  'keywords', 'fact_mode', 'review_notes',
];
const FACT_MODES = new Set(['technical_template', 'conditional_design', 'verified_project']);
const SECRET_PATTERN = /(?:sk-[a-z0-9]{16,}|bearer\s+[a-z0-9._-]{16,}|api[_-]?key\s*[:=]\s*[a-z0-9_-]{12,})/iu;
const LABEL_PATTERN = /【?(?:口述版回答|结合我的项目|详细版回答)】?/u;

function formalId(candidateId) {
  const match = /^ai-gap-(\d{3})$/.exec(candidateId);
  if (!match) throw new Error(`invalid candidate id: ${candidateId}`);
  return `ai.gap.${match[1]}`;
}

function ensureRecordShape(record) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) throw new Error(`${record.candidate_id ?? '<missing>'}: missing field ${field}`);
  }
  if (!Array.isArray(record.keywords) || record.keywords.length < 1) {
    throw new Error(`${record.candidate_id}: keywords must be a non-empty array`);
  }
  if (!Array.isArray(record.review_notes)) {
    throw new Error(`${record.candidate_id}: review_notes must be an array`);
  }
  if (!FACT_MODES.has(record.fact_mode)) {
    throw new Error(`${record.candidate_id}: invalid fact_mode ${record.fact_mode}`);
  }
  for (const field of ['title', 'oral_answer', 'detailed_answer']) {
    if (typeof record[field] !== 'string' || !record[field].trim()) {
      throw new Error(`${record.candidate_id}: ${field} must be non-empty`);
    }
  }
  if (SECRET_PATTERN.test(JSON.stringify(record))) throw new Error(`${record.candidate_id}: secret signature detected`);
  if (LABEL_PATTERN.test(record.oral_answer)) throw new Error(`${record.candidate_id}: oral answer contains a banned label`);
}

export function validateAnswerSet(candidates, answers) {
  if (!Array.isArray(candidates) || !Array.isArray(answers)) throw new Error('candidates and answers must be arrays');
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  if (candidateById.size !== candidates.length) throw new Error('duplicate candidate id');
  const seen = new Set();
  const items = [];

  for (const answer of answers) {
    const normalizedAnswer = typeof answer.review_notes === 'string'
      ? { ...answer, review_notes: [answer.review_notes] }
      : answer;
    ensureRecordShape(normalizedAnswer);
    if (seen.has(normalizedAnswer.candidate_id)) throw new Error(`duplicate answer id: ${normalizedAnswer.candidate_id}`);
    seen.add(normalizedAnswer.candidate_id);
    const candidate = candidateById.get(normalizedAnswer.candidate_id);
    if (!candidate) throw new Error(`unknown answer id: ${normalizedAnswer.candidate_id}`);
    if (candidate.title !== normalizedAnswer.title) throw new Error(`title mismatch: ${normalizedAnswer.candidate_id}`);
    items.push({
      ...candidate,
      ...normalizedAnswer,
      formal_id: formalId(normalizedAnswer.candidate_id),
      review_status: 'answer_review_pending',
      oral_chars: normalizedAnswer.oral_answer.length,
      detailed_chars: normalizedAnswer.detailed_answer.length,
    });
  }

  const missing = candidates.filter((candidate) => !seen.has(candidate.candidate_id));
  if (missing.length) throw new Error(`missing answer ids: ${missing.map((item) => item.candidate_id).join(', ')}`);
  items.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  return { items };
}

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    const category = item.category || '未分类';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }
  return groups;
}

function renderMarkdown(items, answerField, title) {
  const lines = [`# ${title}`, '', `共 ${items.length} 题。`, ''];
  for (const [category, group] of groupByCategory(items)) {
    lines.push(`## ${category}`, '');
    for (const item of group) {
      lines.push(
        `#### ${item.title}`,
        '',
        `> ID: \`${item.formal_id}\``,
        `> 难度: ${item.difficulty} ｜ 题型: ${item.question_type} ｜ 事实模式: \`${item.fact_mode}\``,
        `> 关键词: ${item.keywords.join('、')}`,
        `> 候选来源: \`${item.candidate_id}\``,
        '',
        item[answerField].trim(),
        '',
        '---',
        '',
      );
    }
  }
  return `${lines.join('\n').trim()}\n`;
}

function quantile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function renderQualityReport(items) {
  const oral = items.map((item) => item.oral_chars).sort((a, b) => a - b);
  const detailed = items.map((item) => item.detailed_chars).sort((a, b) => a - b);
  const oralOutliers = items.filter((item) => item.oral_chars < 120 || item.oral_chars > 350);
  const detailedOutliers = items.filter((item) => item.detailed_chars < 300 || item.detailed_chars > 600);
  const conditional = items.filter((item) => item.fact_mode === 'conditional_design').length;
  return [
    '# AI 新增 50 题答案质量报告',
    '',
    `- 答案数量：${items.length}`,
    `- A 版长度：min ${oral[0] ?? 0} / median ${quantile(oral, 0.5)} / P90 ${quantile(oral, 0.9)} / max ${oral.at(-1) ?? 0}`,
    `- B 版长度：min ${detailed[0] ?? 0} / median ${quantile(detailed, 0.5)} / P90 ${quantile(detailed, 0.9)} / max ${detailed.at(-1) ?? 0}`,
    `- conditional_design：${conditional}`,
    `- A 版长度异常：${oralOutliers.length ? oralOutliers.map((item) => item.candidate_id).join(', ') : '0'}`,
    `- B 版长度异常：${detailedOutliers.length ? detailedOutliers.map((item) => item.candidate_id).join(', ') : '0'}`,
    '- 秘密签名：0',
    '- 标题漂移：0',
    '- 缺失/重复 ID：0',
    '',
  ].join('\n');
}

export async function buildAnswerArtifacts({ candidatePath, batchDir, outputDir }) {
  const candidateDoc = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
  const candidates = candidateDoc.items;
  const names = (await fs.readdir(batchDir)).filter((name) => /^batch-\d{2}\.json$/.test(name)).sort();
  const answers = [];
  for (const name of names) {
    const batch = JSON.parse(await fs.readFile(path.join(batchDir, name), 'utf8'));
    if (!Array.isArray(batch)) throw new Error(`${name}: batch must be an array`);
    answers.push(...batch);
  }
  const { items } = validateAnswerSet(candidates, answers);
  await fs.mkdir(outputDir, { recursive: true });
  const canonical = {
    generated_at: new Date().toISOString(),
    source: path.basename(candidatePath),
    status: 'answer_review_pending',
    items,
  };
  await fs.writeFile(path.join(outputDir, 'answer-candidates-50.json'), `${JSON.stringify(canonical, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(outputDir, 'question-answer-50-oral.md'), renderMarkdown(items, 'oral_answer', 'AI 应用系统新增 50 题（A 口述版）'), 'utf8');
  await fs.writeFile(path.join(outputDir, 'question-answer-50-detailed.md'), renderMarkdown(items, 'detailed_answer', 'AI 应用系统新增 50 题（B 详解版）'), 'utf8');
  await fs.writeFile(path.join(outputDir, 'answer-quality-report.md'), renderQualityReport(items), 'utf8');
  return { count: items.length, items };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, '..');
  const researchRoot = process.env.AI_GAP_RESEARCH_ROOT
    ? path.resolve(process.env.AI_GAP_RESEARCH_ROOT)
    : path.resolve(projectRoot, '..', '..', '04_documents', '企业求职准备', 'research', 'ai-agent-interview-sources-20260828');
  const result = await buildAnswerArtifacts({
    candidatePath: path.join(researchRoot, 'question-candidates-50.json'),
    batchDir: path.join(researchRoot, 'answer-batches'),
    outputDir: researchRoot,
  });
  console.log(JSON.stringify({ status: 'ok', count: result.count }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
