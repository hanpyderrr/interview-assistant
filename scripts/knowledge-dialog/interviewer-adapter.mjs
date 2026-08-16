function parseEvaluation(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value;
  try {
    value = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`interviewer evaluation must be valid JSON: ${error.message}`);
  }
  if (!Number.isInteger(value.score) || value.score < 0 || value.score > 100) {
    throw new Error('interviewer score must be an integer between 0 and 100');
  }
  if (typeof value.needFollowup !== 'boolean') throw new Error('interviewer needFollowup must be boolean');
  if (value.needFollowup && (typeof value.followupQuestion !== 'string' || !value.followupQuestion.trim())) {
    throw new Error('interviewer followupQuestion is required when needFollowup is true');
  }
  return value;
}

export function createInterviewerAdapter({ generateEvaluation, provider = {} } = {}) {
  if (typeof generateEvaluation !== 'function') throw new Error('generateEvaluation function is required');
  return async function evaluateAnswer(turn, { signal } = {}) {
    const request = {
      system: [
        '你是严格的技术面试官。仅输出 JSON，不使用 Markdown。',
        '格式：{"score":0到100的整数,"needFollowup":布尔值,"followupQuestion":"仅在需要追问时填写"}。',
        '追问只针对当前回答缺失的事实、职责、依据或上下文，不推断候选人未提供的经历。',
      ].join('\n'),
      user: JSON.stringify({
        question: turn.question,
        answer: turn.answer,
        evidenceIds: turn.evidenceIds ?? [],
        followupDepth: turn.followupDepth ?? 0,
      }),
    };
    const result = await generateEvaluation(request, { ...provider, signal });
    const evaluation = parseEvaluation(result.answer);
    return {
      questionId: turn.questionId,
      score: evaluation.score,
      needFollowup: evaluation.needFollowup,
      ...(evaluation.needFollowup ? { followupQuestion: evaluation.followupQuestion.trim() } : {}),
    };
  };
}
