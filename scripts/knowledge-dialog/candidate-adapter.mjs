export function createCandidateAdapter({ prepareRequest, generateAnswer, now = Date.now } = {}) {
  if (typeof prepareRequest !== 'function') throw new Error('prepareRequest function is required');
  if (typeof generateAnswer !== 'function') throw new Error('generateAnswer function is required');

  return async function answerQuestion(question, options = {}) {
    const startedAt = now();
    const { provider = {}, signal, ...prepareOptions } = options;
    const request = await prepareRequest(question, prepareOptions);
    const result = await generateAnswer(request, { ...provider, signal });
    return {
      question,
      answer: result.answer,
      evidenceIds: (request.matches ?? []).map(({ entry }) => entry.id),
      matches: (request.matches ?? []).map(({ entry, score }) => ({ id: entry.id, score })),
      elapsedMs: Math.max(0, now() - startedAt),
    };
  };
}
