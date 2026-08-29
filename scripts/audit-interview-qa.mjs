#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SCRIPT_DIR = path.dirname(path.resolve(process.argv[1] ?? new URL(import.meta.url).pathname));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE = path.resolve(PROJECT_ROOT, '..', '..', '企业求职准备', '个人求职与学习资料', '简历与个人档案', '嵌入式软件工程师技术面试准备', '嵌入式软件工程师问题答案.md');
const KB = path.resolve(PROJECT_ROOT, 'knowledge_source', 'interview_kb.jsonl');
const REPORT = path.resolve(PROJECT_ROOT, 'knowledge_source', 'interview_qa_preflight.md');

const TERM_LIST = [
  'C++', 'C', 'malloc', 'free', 'new', 'delete', 'const', 'volatile', 'RAII', 'RK3568', 'Buildroot', 'TCSPC', 'SPI', 'CRC32', 'CRC16', 'DMA', 'read', 'ioctl', 'Qt',
  'QOpenGLWidget', 'MIPI-DSI', 'TCP', 'UDP', 'ECM', '心跳', '退避', '共享内存', 'POSIX',
  '信号量', '互斥锁', '条件变量', '线程', '进程', '协程', 'fcntl', 'epoll', 'sysroot',
  '交叉编译', 'init.d', 'FreeRTOS', 'DS18B20', '1-Wire', 'RS485', 'Modbus RTU', 'T3.5',
  '看门狗', 'Flash', 'MQTT', 'ESP8266', '8051', 'Altium Designer', '状态机', '环形缓冲区',
  '逻辑分析仪', '示波器', 'UART', 'dmesg', 'PWM', '设备节点', '设备树', '内存对齐', 'RAII',
];

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[\s`*_#，。！？、（）()“”"'：:；;,.!?/\\-]/g, '');
}

function terms(value) {
  const text = String(value ?? '').toLowerCase();
  return new Set(TERM_LIST.filter((term) => text.includes(term.toLowerCase())));
}

function extractKeywords(record) {
  const text = `${record.question}\n${record.answer}`;
  const technical = [...terms(text)];
  const latin = record.question.match(/[A-Za-z][A-Za-z0-9_+#.-]{1,}/g) ?? [];
  const chinese = record.question.match(/[\u4e00-\u9fff]{2,8}/g) ?? [];
  return [...new Set([...technical, ...latin, ...chinese])]
    .filter((keyword) => keyword.length > 1)
    .slice(0, 16);
}

function parseQuestions(markdown) {
  const lines = markdown.split(/\r?\n/);
  const records = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^###\s+(E\d+\.\d+)\s+(.+?)\s*$/);
    if (match) {
      if (current) records.push(current);
      current = { key: match[1], question: match[2], answerLines: [] };
      continue;
    }
    if (current) current.answerLines.push(line);
  }
  if (current) records.push(current);
  return records.map((record) => ({ ...record, answer: record.answerLines.join('\n').trim() }));
}

function confirmationPhrases(record, resumeText) {
  const phrases = [];
  const answer = record.answer;
  const unknownMarkers = answer.match(/(?:具体[^。；\n]{0,35}(?:未|需|需要)[^。；\n]*|[^。；\n]{0,15}(?:需本人补充|需要本人确认|未在简历中记录)[^。；\n]*)/g) ?? [];
  phrases.push(...unknownMarkers.map((item) => item.trim()));
  if (/(最终根因|真实根因|故障根因)/.test(answer) && !/(最终根因|真实根因|故障根因)/.test(resumeText)) {
    phrases.push('故障最终根因和修复措施');
  }
  if (/(团队|队友|独立完成|个人贡献|负责了)/.test(answer) && !/(团队|队友|独立完成|个人贡献|负责了)/.test(resumeText)) {
    phrases.push('团队分工和个人贡献范围');
  }
  const numbers = answer.match(/\b\d+(?:\.\d+)?\s*(?:ms|秒|个|次|字节|节点|帧|%|KB|MB)\b/gi) ?? [];
  const unknownNumbers = numbers.filter((item) => !resumeText.includes(item));
  if (unknownNumbers.length) phrases.push(`答案中的数值或阈值：${[...new Set(unknownNumbers)].join('、')}`);
  return [...new Set(phrases)].slice(0, 8);
}

function parseBaseline(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  return [...new Set(left)].filter((item) => right.has(item)).length / union.size;
}

export async function auditInterviewQa({ sourcePath = SOURCE, kbPath = KB, reportPath = REPORT } = {}) {
  const [source, baselineText] = await Promise.all([
    fs.readFile(sourcePath, 'utf8'),
    fs.readFile(kbPath, 'utf8'),
  ]);
  const records = parseQuestions(source);
  const baseline = parseBaseline(baselineText).filter((entry) => !entry.id.startsWith('qa.embedded.'));
  const resumeText = baseline.filter((entry) => entry.fact_status === 'resume_fact').map((entry) => entry.content).join('\n');
  const baselineTerms = baseline.map((entry) => ({ entry, terms: terms(`${entry.title}\n${entry.content}\n${entry.keywords?.join(' ')}`) }));
  const enriched = records.map((record) => {
    const key = record.key.toLowerCase();
    const id = `qa.embedded.${key}`;
    const keywords = extractKeywords(record);
    const needs = confirmationPhrases(record, resumeText);
    const personalClaim = /(?:我|我的|本人|我们项目|项目中使用|我使用|我负责)/.test(record.answer);
    const keywordSet = new Set(keywords);
    const overlaps = baselineTerms.map(({ entry, terms: otherTerms }) => {
      const shared = [...keywordSet].filter((term) => otherTerms.has(term));
      return { id: entry.id, title: entry.title, score: jaccard(keywordSet, otherTerms), shared };
    }).filter((item) => item.score >= 0.8 && item.shared.length >= 2).sort((a, b) => b.score - a.score);
    return {
      id,
      key: record.key,
      group: `E${record.key.split('.')[0].slice(1)}`,
      question: record.question,
      content: record.answer,
      category: record.key.split('.')[0],
      fact_status: 'prepared_answer',
      personal_claim: personalClaim,
      needs_confirmation_phrases: needs,
      keywords: keywords.length >= 3 ? keywords : [...new Set([...keywords, ...['嵌入式', '面试']])],
      source_paths: ['source-files/嵌入式软件工程师问题答案.md'],
      duplicate_candidates: overlaps,
    };
  });
  const normalized = new Map();
  const exactDuplicates = [];
  for (const entry of enriched) {
    const normalizedQuestion = normalize(entry.question);
    if (normalized.has(normalizedQuestion)) exactDuplicates.push([normalized.get(normalizedQuestion), entry.id]);
    else normalized.set(normalizedQuestion, entry.id);
  }
  const groups = Object.groupBy ? Object.groupBy(enriched, (entry) => entry.group) : enriched.reduce((acc, entry) => {
    (acc[entry.group] ??= []).push(entry);
    return acc;
  }, {});
  const lines = [
    '# 嵌入式面试问答导入预审报告',
    '',
    `- 来源题目数：${records.length}`,
    `- 可生成记录数：${enriched.length}`,
    `- 已有知识库记录数：${baseline.length}`,
    `- 含第一人称/个人主张的答案：${enriched.filter((entry) => entry.personal_claim).length}`,
    `- 含需确认短语的答案：${enriched.filter((entry) => entry.needs_confirmation_phrases.length).length}`,
    `- 组内规范化重复：${exactDuplicates.length}`,
    '',
    '## 分组统计',
    '',
    '| 分组 | 题数 | 个人主张数 | 需确认数 |',
    '| --- | ---: | ---: | ---: |',
    ...Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([group, items]) => `| ${group} | ${items.length} | ${items.filter((entry) => entry.personal_claim).length} | ${items.filter((entry) => entry.needs_confirmation_phrases.length).length} |`),
    '',
    '## 需要人工复核的记录',
    '',
    ...enriched.filter((entry) => entry.needs_confirmation_phrases.length || entry.duplicate_candidates.length).map((entry) => [
      `### ${entry.id} ${entry.question}`,
      `- personal_claim: ${entry.personal_claim}`,
      `- needs_confirmation_phrases: ${entry.needs_confirmation_phrases.length ? entry.needs_confirmation_phrases.join('；') : '无'}`,
      `- duplicate_candidates: ${entry.duplicate_candidates.length ? entry.duplicate_candidates.map((item) => `${item.id} (${item.score.toFixed(2)}; ${item.shared.join('/')})`).join('、') : '无'}`,
      '',
    ].join('\n')),
  ];
  if (exactDuplicates.length) lines.push('## 组内规范化重复', '', ...exactDuplicates.map(([left, right]) => `- ${left} 与 ${right}`));
  await fs.writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
  return { records: enriched, exactDuplicates, reportPath };
}

if (process.argv[1] && path.basename(process.argv[1]) === 'audit-interview-qa.mjs') {
  const result = await auditInterviewQa();
  console.log(JSON.stringify({ count: result.records.length, exactDuplicates: result.exactDuplicates.length, reportPath: result.reportPath }, null, 2));
}
