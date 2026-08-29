#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { auditInterviewQa } from './audit-interview-qa.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(path.resolve(process.argv[1])), '..');
const KB = path.resolve(PROJECT_ROOT, 'knowledge_source', 'interview_kb.jsonl');

const GROUP_NAMES = {
  E1: '项目概览与工程取舍',
  E2: 'C/C++ 与内存',
  E3: 'Linux 进程、线程与 IPC',
  E4: 'SPI、协议解析、CRC 与 DMA',
  E5: '网络、5G 与 Buildroot',
  E6: 'Qt、显示与执行机构',
  E7: 'STM32、FreeRTOS 与现场总线',
  E8: 'Flash、MQTT、硬件与实习',
};

export async function importInterviewQa({ kbPath = KB } = {}) {
  const audit = await auditInterviewQa({ kbPath });
  const original = await fs.readFile(kbPath, 'utf8');
  const existingLines = original.split(/\r?\n/).filter((line) => line.trim());
  const existing = existingLines.map((line) => JSON.parse(line));
  const existingIds = new Set(existing.map((entry) => entry.id));
  const prepareRecord = (entry) => {
    const { key, group, duplicate_candidates: _duplicates, ...record } = entry;
    const question = record.question.replace('出xia现', '出现');
    const content = record.content.replace('出xia现', '出现');
    return {
      ...record,
      question,
      content,
      keywords: record.keywords.filter((keyword) => keyword.toLowerCase() !== 'xia'),
      title: `${key} ${question}`,
      category: GROUP_NAMES[group] ?? record.category,
      source_group: group,
      claim_mode: record.personal_claim ? 'requires_resume_validation' : 'technical_template',
    };
  };
  const generated = audit.records.map(prepareRecord);
  const generatedById = new Map(generated.map((entry) => [entry.id, entry]));
  const updated = existing.filter((entry) => generatedById.has(entry.id)).length;
  const additions = generated.filter((entry) => !existingIds.has(entry.id));
  const merged = existing.map((entry) => generatedById.get(entry.id) ?? entry).concat(additions);
  if (!additions.length && updated === 0) return { added: 0, updated: 0, total: existing.length };
  await fs.writeFile(kbPath, `${merged.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
  return { added: additions.length, updated, total: merged.length };
}

if (process.argv[1] && path.basename(process.argv[1]) === 'import-interview-qa.mjs') {
  console.log(JSON.stringify(await importInterviewQa(), null, 2));
}
