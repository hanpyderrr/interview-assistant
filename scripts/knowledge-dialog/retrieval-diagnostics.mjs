// Deterministic retrieval diagnostics without a model.
//
// Given the question, the knowledge corpus, and the retriever's matches, this
// module distinguishes:
//   - knowledge-gap   : the corpus or the expected evidence does not support
//                       the question (missing content, not a ranking problem);
//   - retrieval-miss  : the expected evidence exists but did not reach topK;
//   - weak-retrieval  : evidence was hit but relevance/coverage is below the
//                       minimum score.
//
// All rules are pure and deterministic; the same inputs always produce the
// same issues, which keeps the fixtures regression-safe.

const ISSUE_DEFS = {
  'knowledge-gap': { severity: 'high', suggestedAction: 'add-confirmed-fact' },
  'retrieval-miss': { severity: 'high', suggestedAction: 'add-keywords' },
  'weak-retrieval': { severity: 'medium', suggestedAction: 'adjust-retrieval' },
};

function makeIssue(question, type, evidenceIds, explanation, id) {
  return {
    id,
    type,
    severity: ISSUE_DEFS[type].severity,
    question,
    evidenceIds,
    explanation,
    suggestedAction: ISSUE_DEFS[type].suggestedAction,
  };
}

/**
 * Diagnose one retrieval result.
 *
 * @param {object} input
 * @param {string} input.question the interview question
 * @param {Array<{id:string}>} input.entries the knowledge corpus
 * @param {Array<{entry?:{id:string},id?:string,score:number}>} input.matches
 *   retriever matches, sorted best-first (as produced by
 *   scripts/interview-retriever.mjs)
 * @param {string[]} [input.expectedEvidenceIds] evidence ids that should
 *   support the question
 * @param {number} [input.minimumScore=1] minimum acceptable top score
 * @returns {Array<object>} deterministic issue list (empty when retrieval is fine)
 */
export function diagnoseRetrieval({
  question,
  entries,
  matches,
  expectedEvidenceIds = [],
  minimumScore = 1,
}) {
  const issues = [];
  const entryIds = new Set((entries ?? []).map((entry) => entry.id));
  const matchIds = new Set((matches ?? []).map((match) => match.entry?.id ?? match.id));
  const matchIdList = (matches ?? []).map((match) => match.entry?.id ?? match.id).filter(Boolean);

  // 1. Expected evidence that cannot be found at all is a knowledge gap;
  //    expected evidence that exists but missed topK is a retrieval miss.
  for (const expectedId of expectedEvidenceIds) {
    if (!entryIds.has(expectedId)) {
      issues.push(makeIssue(
        question,
        'knowledge-gap',
        [expectedId],
        `期望证据 ${expectedId} 在知识库中不存在，属于内容缺失而非检索失败，需要先补充该事实。`,
        `issue-${issues.length + 1}`,
      ));
    } else if (!matchIds.has(expectedId)) {
      issues.push(makeIssue(
        question,
        'retrieval-miss',
        [expectedId],
        `期望证据 ${expectedId} 存在于知识库但未进入 topK，可能是关键词覆盖不足或评分/路由问题。`,
        `issue-${issues.length + 1}`,
      ));
    }
  }

  // 2. An empty corpus cannot support any question.
  if ((entries ?? []).length === 0) {
    issues.push(makeIssue(
      question,
      'knowledge-gap',
      [],
      '知识库为空，没有任何条目支持当前问题。',
      `issue-${issues.length + 1}`,
    ));
  }

  // 3. No lexical match at all is a knowledge gap (unless already reported).
  if ((matches ?? []).length === 0 && issues.length === 0) {
    issues.push(makeIssue(
      question,
      'knowledge-gap',
      [],
      '没有检索到任何匹配条目，知识库中缺少支持当前问题的内容。',
      `issue-${issues.length + 1}`,
    ));
  }

  // 4. Hits whose relevance is below the minimum score are weak retrievals.
  if ((matches ?? []).length > 0) {
    const topScore = Math.max(...(matches ?? []).map((match) => Number(match.score) || 0));
    if (topScore < minimumScore) {
      issues.push(makeIssue(
        question,
        'weak-retrieval',
        matchIdList,
        `命中证据但相关度不足：最高分 ${topScore} 低于阈值 ${minimumScore}，需要提高关键词覆盖或调整评分。`,
        `issue-${issues.length + 1}`,
      ));
    }
  }

  return issues;
}
