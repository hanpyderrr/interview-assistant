#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const BEGIN = '<!-- AI-GAP-20260829-BEGIN -->';
const END = '<!-- AI-GAP-20260829-END -->';
const TOC_LINE = '- [AI Agent 工程化进阶（新增 50 题详解）](#ai-agent-工程化进阶新增-50-题详解) （50 条）';

function extractIds(text) {
  return [...text.matchAll(/> ID: `((?:ai\.gap\.)\d{3})`/g)].map((match) => match[1]);
}

function assertExactIds(sourceIds, expectedIds) {
  const actual = [...new Set(sourceIds)].sort();
  const expected = [...new Set(expectedIds)].sort();
  if (actual.length !== sourceIds.length || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`detailed source ID set mismatch: expected ${expected.length}, got ${actual.length}`);
  }
}

function chapterBody(detailed) {
  const firstSection = detailed.indexOf('\n## ');
  if (firstSection < 0) throw new Error('detailed source has no category sections');
  return detailed.slice(firstSection + 1).replace(/^## /gm, '### ').trim();
}

export function buildDetailedKbCandidate(existing, detailed, { expectedIds }) {
  const sourceIds = extractIds(detailed);
  assertExactIds(sourceIds, expectedIds);
  const existingGapIds = extractIds(existing).filter((id) => /^ai\.gap\./.test(id));
  const hasMarker = existing.includes(BEGIN) || existing.includes(END);
  if (hasMarker) {
    if (!(existing.includes(BEGIN) && existing.includes(END))) throw new Error('incomplete AI gap batch marker');
    assertExactIds(existingGapIds, expectedIds);
    return { changed: false, text: existing };
  }
  if (existingGapIds.length) throw new Error('existing document already contains AI gap IDs without the batch marker');
  if (existing.includes(TOC_LINE)) throw new Error('existing document contains the AI gap TOC line without the batch marker');

  const tocPattern = /(## 目录\r?\n[\s\S]*?)(\r?\n## [^\r\n]+)/;
  if (!tocPattern.test(existing)) throw new Error('cannot locate the complete table of contents');
  const withToc = existing.replace(tocPattern, (match, toc, nextHeading) => {
    const trimmed = toc.replace(/\s+$/u, '');
    return `${trimmed}\n${TOC_LINE}\n${nextHeading}`;
  });
  const chapter = [
    BEGIN,
    '## AI Agent 工程化进阶（新增 50 题详解）',
    '',
    chapterBody(detailed),
    '',
    END,
  ].join('\n');
  const text = `${withToc.trimEnd()}\n\n${chapter}\n`;
  assertExactIds(extractIds(text).filter((id) => /^ai\.gap\./.test(id)), expectedIds);
  return { changed: true, text };
}

function parseArgs(argv) {
  const args = { mode: 'check', target: process.env.AI_DETAILED_KB_TARGET };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') args.mode = 'apply';
    else if (value === '--check') args.mode = 'check';
    else if (value === '--target') args.target = argv[++index];
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!args.target) throw new Error('provide --target or AI_DETAILED_KB_TARGET');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, '..');
  const researchRoot = process.env.AI_GAP_RESEARCH_ROOT
    ? path.resolve(process.env.AI_GAP_RESEARCH_ROOT)
    : path.resolve(projectRoot, '..', '..', '04_documents', '企业求职准备', 'research', 'ai-agent-interview-sources-20260828');
  const answerDoc = JSON.parse(await fs.readFile(path.join(researchRoot, 'answer-candidates-50.json'), 'utf8'));
  const expectedIds = answerDoc.items.map((item) => item.formal_id);
  const detailed = await fs.readFile(path.join(researchRoot, 'question-answer-50-detailed.md'), 'utf8');
  const target = path.resolve(args.target);
  const existing = await fs.readFile(target, 'utf8');
  const result = buildDetailedKbCandidate(existing, detailed, { expectedIds });
  if (args.mode === 'apply' && result.changed) {
    const temp = `${target}.ai-gap.tmp`;
    await fs.writeFile(temp, result.text, 'utf8');
    const staged = await fs.readFile(temp, 'utf8');
    if (staged !== result.text) throw new Error('staged reading document verification failed');
    await fs.rename(temp, target);
  }
  console.log(JSON.stringify({ status: 'ok', mode: args.mode, changed: result.changed, count: expectedIds.length }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
