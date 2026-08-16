function validateOptions({ sessionId, seedQuestions, answerQuestion, evaluateAnswer, maxQuestions, maxFollowupsPerQuestion, timeoutMs }) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('sessionId is required');
  if (!Array.isArray(seedQuestions) || seedQuestions.length === 0 || seedQuestions.some((q) => typeof q !== 'string' || !q.trim())) {
    throw new Error('seedQuestions must contain at least one non-empty question');
  }
  if (typeof answerQuestion !== 'function') throw new Error('answerQuestion function is required');
  if (typeof evaluateAnswer !== 'function') throw new Error('evaluateAnswer function is required');
  if (!Number.isInteger(maxQuestions) || maxQuestions < 1 || maxQuestions > 20) throw new Error('maxQuestions must be between 1 and 20');
  if (!Number.isInteger(maxFollowupsPerQuestion) || maxFollowupsPerQuestion < 0 || maxFollowupsPerQuestion > 2) {
    throw new Error('maxFollowupsPerQuestion must be between 0 and 2');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive');
}

async function callBounded(fn, input, timeoutMs, label) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(input, { signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeAnswer(result) {
  if (!result || typeof result.answer !== 'string') throw new Error('answer result must contain an answer string');
  return {
    answer: result.answer,
    evidenceIds: Array.isArray(result.evidenceIds) ? result.evidenceIds.filter((id) => typeof id === 'string') : [],
    matches: Array.isArray(result.matches)
      ? result.matches.filter((match) => match && typeof match.id === 'string')
        .map((match) => ({ id: match.id, score: Number(match.score) || 0 }))
      : [],
    ...(Number.isFinite(result.elapsedMs) ? { elapsedMs: result.elapsedMs } : {}),
  };
}

function sanitizeEvaluation(result) {
  if (!result || typeof result !== 'object') return {};
  return {
    questionId: result.questionId,
    ...(Number.isFinite(result.score) ? { score: result.score } : {}),
    needFollowup: result.needFollowup === true,
    ...(typeof result.supported === 'boolean' ? { supported: result.supported } : {}),
    ...(typeof result.feedback === 'string' ? { feedback: result.feedback } : {}),
    ...(Array.isArray(result.strengths) ? { strengths: result.strengths.filter((item) => typeof item === 'string') } : {}),
    ...(Array.isArray(result.weaknesses) ? { weaknesses: result.weaknesses.filter((item) => typeof item === 'string') } : {}),
    ...(Array.isArray(result.missingPoints) ? { missingPoints: result.missingPoints.filter((item) => typeof item === 'string') } : {}),
    ...(Array.isArray(result.contradictions) ? { contradictions: result.contradictions.filter((item) => typeof item === 'string') } : {}),
    ...(typeof result.followupQuestion === 'string' ? { followupQuestion: result.followupQuestion } : {}),
    ...(result.providerMetadata && typeof result.providerMetadata === 'object'
      ? { providerMetadata: structuredClone(result.providerMetadata) }
      : {}),
  };
}

export async function runKnowledgeDialog({
  sessionId,
  seedQuestions,
  answerQuestion,
  evaluateAnswer,
  maxQuestions = 5,
  maxFollowupsPerQuestion = 2,
  timeoutMs = 30_000,
}) {
  validateOptions({ sessionId, seedQuestions, answerQuestion, evaluateAnswer, maxQuestions, maxFollowupsPerQuestion, timeoutMs });
  const rounds = [];
  const events = [];
  let roundNumber = 0;

  for (const [seedIndex, seedQuestion] of seedQuestions.slice(0, maxQuestions).entries()) {
    let question = seedQuestion;
    for (let followupDepth = 0; followupDepth <= maxFollowupsPerQuestion; followupDepth += 1) {
      roundNumber += 1;
      const questionId = `${sessionId}-q${seedIndex + 1}${followupDepth ? `-f${followupDepth}` : ''}`;
      const round = { sessionId, round: roundNumber, questionId, question, followupDepth, seedIndex };
      rounds.push(round);
      events.push({ type: followupDepth === 0 ? 'question' : 'followup', sessionId, round: roundNumber, questionId, question, followupDepth });

      try {
        round.answer = sanitizeAnswer(await callBounded(
          (input, context) => answerQuestion(input.question, { ...context, questionId: input.questionId, sessionId, round: roundNumber, followupDepth }),
          { question, questionId },
          timeoutMs,
          'answer',
        ));
        events.push({ type: 'answer', sessionId, round: roundNumber, questionId, ...round.answer });
      } catch (error) {
        events.push({ type: 'error', sessionId, round: roundNumber, questionId, stage: 'answer', message: error.message });
        break;
      }

      let evaluation;
      try {
        evaluation = sanitizeEvaluation(await callBounded(
          evaluateAnswer,
          { sessionId, round: roundNumber, questionId, question, followupDepth, ...round.answer },
          timeoutMs,
          'evaluation',
        ));
      } catch (error) {
        events.push({ type: 'error', sessionId, round: roundNumber, questionId, stage: 'evaluation', message: error.message });
        break;
      }

      if (evaluation?.questionId !== questionId) {
        events.push({ type: 'error', sessionId, round: roundNumber, questionId, stage: 'evaluation', message: 'stale evaluation discarded' });
        break;
      }
      round.evaluation = evaluation;
      events.push({ type: 'evaluation', sessionId, round: roundNumber, questionId, ...evaluation });

      if (!evaluation.needFollowup || followupDepth >= maxFollowupsPerQuestion) break;
      if (typeof evaluation.followupQuestion !== 'string' || !evaluation.followupQuestion.trim()) {
        events.push({ type: 'error', sessionId, round: roundNumber, questionId, stage: 'evaluation', message: 'follow-up requested without a question' });
        break;
      }
      question = evaluation.followupQuestion;
    }
  }

  events.push({ type: 'complete', sessionId, round: roundNumber });
  return { sessionId, rounds, events };
}
