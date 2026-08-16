import fs from 'node:fs/promises';
import path from 'node:path';

const CREDENTIAL_FIELD = /api[-_]?key|token|password|authorization|cookie|secret/i;
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function redact(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    CREDENTIAL_FIELD.test(key) ? '[REDACTED]' : redact(child, seen),
  ]));
}

function sortedReport(report) {
  const clean = redact(report);
  clean.rounds = [...(clean.rounds ?? [])].sort((a, b) => a.round - b.round || String(a.questionId).localeCompare(String(b.questionId)));
  clean.issues = [...(clean.issues ?? [])].sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    || (a.round ?? 0) - (b.round ?? 0)
    || String(a.id).localeCompare(String(b.id)));
  clean.suggestions = [...(clean.suggestions ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  return clean;
}

function markdownFor(report) {
  const lines = [
    `# 知识库对话验证报告：${report.sessionId}`,
    '',
    `- 对话轮次：${report.rounds.length}`,
    `- 发现问题：${report.issues.length}`,
    `- 待确认建议：${report.suggestions.filter((item) => item.requiresUserConfirmation).length}`,
    `- 确定性质量门禁：${report.qualityGate?.passed ? '通过' : `未通过（阻断：${report.qualityGate?.blockingIssueIds?.join('、') || '无标识'}）`}`,
    '',
    '## 对话轮次',
    '',
  ];
  for (const round of report.rounds) {
    lines.push(`### 第 ${round.round} 轮（${round.questionId}）`, '');
    lines.push(`- 问题：${round.question}`);
    lines.push(`- 回答：${round.answer?.answer ?? '无'}`);
    lines.push(`- 证据：${(round.answer?.evidenceIds ?? []).join('、') || '无'}`);
    lines.push(`- 原始评分：${round.rawScore ?? round.evaluation?.score ?? '未评分'}`, '');
  }
  lines.push('## 问题', '');
  for (const item of report.issues) {
    lines.push(`- **${item.id} / ${item.severity} / ${item.type}**：${item.explanation}`);
  }
  if (report.issues.length === 0) lines.push('- 未发现确定性问题。');
  lines.push('', '## 建议（仅提议，不自动修改）', '');
  for (const item of report.suggestions) {
    lines.push(`- **${item.id} / ${item.action}**：来源 ${item.sourceIssueIds.join('、')}；需要本人确认：${item.requiresUserConfirmation ? '是' : '否'}`);
  }
  if (report.suggestions.length === 0) lines.push('- 无。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function writeKnowledgeDialogReport(report, outputDir) {
  if (!/^[a-zA-Z0-9._-]+$/.test(report?.sessionId ?? '')) throw new Error('sessionId is not safe for a report filename');
  const normalized = sortedReport(report);
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `${normalized.sessionId}.json`);
  const markdownPath = path.join(outputDir, `${normalized.sessionId}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, markdownFor(normalized), 'utf8');
  return { jsonPath, markdownPath };
}
