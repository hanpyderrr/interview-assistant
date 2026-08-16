const NUMERIC_CLAIM = /(?<![A-Za-z0-9_.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/g;
const RESPONSIBILITY_QUESTION = /负责|职责|承担|主导|参与.*哪些/;
const RESPONSIBILITY_ANSWER = /我(?:负责|承担|主导|参与)|职责|负责了|承担了/;
import { analyzeAnswerQuality, canonicalNumericClaim, hasUnsafePlaceholder } from './answer-quality-rules.mjs';

const PLACEHOLDER = '【需本人补充】';
const GENERIC_KEYWORDS = new Set(['优化', '内存', '项目', '系统', '设计', '方法', '测试']);

const ISSUE_DEFS = {
  'knowledge-gap': { severity: 'high', suggestedAction: 'add-confirmed-fact' },
  'unsupported-claim': { severity: 'high', suggestedAction: 'add-confirmed-fact' },
  'generic-answer': { severity: 'medium', suggestedAction: 'expand-prepared-answer' },
  'missing-detail': { severity: 'medium', suggestedAction: 'expand-prepared-answer' },
  'needs-model-review': { severity: 'low', suggestedAction: 'adjust-prompt' },
  'overlong-answer': { severity: 'medium', suggestedAction: 'adjust-prompt' },
  'arithmetic-error': { severity: 'high', suggestedAction: 'adjust-prompt' },
  'evidence-boundary': { severity: 'high', suggestedAction: 'adjust-prompt' },
};

function issue(type, question, evidenceIds, explanation, index, extra = {}) {
  return {
    id: `issue-${index}`,
    type,
    severity: ISSUE_DEFS[type].severity,
    question,
    evidenceIds: [...evidenceIds],
    explanation,
    suggestedAction: ISSUE_DEFS[type].suggestedAction,
    ...extra,
  };
}

function numericClaims(text) {
  const claims = [];
  for (const match of String(text).matchAll(NUMERIC_CLAIM)) {
    const canonical = canonicalNumericClaim(match[0]);
    if (canonical) claims.push({ canonical, raw: match[0], index: match.index });
  }
  return claims;
}

function entryText(entry) {
  return [entry?.title, entry?.content, ...(entry?.keywords ?? [])].filter(Boolean).join(' ');
}

/**
 * Apply conservative, deterministic grounding checks to one answer.
 * Semantic contradictions are intentionally left to an injected evaluator.
 */
export function diagnoseAnswer({
  question,
  answer,
  entries = [],
  evidenceIds = [],
  expectedDetailTerms = [],
}) {
  const issues = [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const missingEvidenceIds = evidenceIds.filter((id) => !byId.has(id));

  if (hasUnsafePlaceholder(answer)) {
    return [issue(
      'knowledge-gap',
      question,
      evidenceIds,
      `回答包含${PLACEHOLDER}占位符，需要本人确认并补充事实。`,
      1,
    )];
  }

  if (missingEvidenceIds.length > 0) {
    return [issue(
      'knowledge-gap',
      question,
      missingEvidenceIds,
      `引用的知识条目不存在：${missingEvidenceIds.join('、')}。`,
      1,
    )];
  }

  const citedEntries = evidenceIds.map((id) => byId.get(id)).filter(Boolean);
  const citedText = citedEntries.map(entryText).join(' ');
  const corpusText = entries.map(entryText).join(' ');
  const quality = analyzeAnswerQuality({ question, answer, citedEntries });
  for (const qualityIssue of quality.issues) {
    issues.push(issue(
      qualityIssue.type,
      question,
      evidenceIds,
      qualityIssue.explanation,
      issues.length + 1,
    ));
  }
  const answerNumbers = numericClaims(answer);
  const citedNumbers = new Set(numericClaims(citedText).map((claim) => claim.canonical));
  const corpusNumbers = new Set(numericClaims(corpusText).map((claim) => claim.canonical));
  const unsupported = answerNumbers.filter((claim) =>
    !quality.verifiedDerivedOccurrences.has(`${claim.canonical}@${claim.index}`)
    && !citedNumbers.has(claim.canonical));
  const foundOnlyOutsideCitations = unsupported.filter((claim) => corpusNumbers.has(claim.canonical));
  const absentFromCorpus = unsupported.filter((claim) => !corpusNumbers.has(claim.canonical));
  const displayClaims = (claims) => [...new Set(claims.map((claim) => claim.raw))].join('、');

  if (foundOnlyOutsideCitations.length > 0) {
    issues.push(issue(
      'needs-model-review',
      question,
      evidenceIds,
      `数字 ${displayClaims(foundOnlyOutsideCitations)} 只出现在未引用条目中，需要模型或人工复核上下文。`,
      issues.length + 1,
      { needsModelReview: true },
    ));
  }
  if (absentFromCorpus.length > 0) {
    issues.push(issue(
      'unsupported-claim',
      question,
      evidenceIds,
      `回答中的数字 ${displayClaims(absentFromCorpus)} 未被引用知识条目记录。`,
      issues.length + 1,
    ));
  }

  const citedKeywords = citedEntries.flatMap((entry) => entry.keywords ?? [])
    .map((keyword) => String(keyword).trim())
    .filter((keyword) => keyword.length >= 2 && !GENERIC_KEYWORDS.has(keyword));
  const usesCitedProjectTerm = citedKeywords.length === 0
    ? evidenceIds.length > 0
    : citedKeywords.some((keyword) => String(answer).toLowerCase().includes(keyword.toLowerCase()));
  const missingTerms = expectedDetailTerms.filter((term) => !String(answer).includes(term));
  if (missingTerms.length > 0) {
    issues.push(issue(
      'missing-detail',
      question,
      evidenceIds,
      `回答缺少问题要求的细节：${missingTerms.join('、')}。`,
      issues.length + 1,
    ));
  } else if (expectedDetailTerms.length === 0
    && RESPONSIBILITY_QUESTION.test(String(question))
    && !RESPONSIBILITY_ANSWER.test(String(answer))) {
    issues.push(issue(
      'missing-detail',
      question,
      evidenceIds,
      '问题要求说明个人职责，但回答没有明确个人承担的工作。',
      issues.length + 1,
    ));
  }

  if ((evidenceIds.length === 0 || !usesCitedProjectTerm) && issues.length === 0) {
    issues.push(issue(
      'generic-answer',
      question,
      evidenceIds,
      '回答没有使用所引用条目的项目特征，可能只有通用原理。',
      issues.length + 1,
    ));
  }

  return issues;
}
