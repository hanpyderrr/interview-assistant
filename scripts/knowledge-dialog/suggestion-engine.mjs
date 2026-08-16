import { SUGGESTION_ACTIONS } from './contracts.mjs';

const ACTION_BY_ISSUE = {
  'knowledge-gap': 'add-confirmed-fact',
  'retrieval-miss': 'add-keywords',
  'weak-retrieval': 'adjust-retrieval',
  'fact-conflict': 'resolve-conflict',
  'unsupported-claim': 'add-confirmed-fact',
  'generic-answer': 'expand-prepared-answer',
  'missing-detail': 'expand-prepared-answer',
  'needs-model-review': 'adjust-prompt',
  'overlong-answer': 'adjust-prompt',
  'arithmetic-error': 'adjust-prompt',
  'evidence-boundary': 'adjust-prompt',
};

export const CONTENT_CHANGING_ACTIONS = new Set([
  'add-keywords',
  'retitle-entry',
  'split-entry',
  'expand-prepared-answer',
  'add-confirmed-fact',
  'resolve-conflict',
]);

/** Create reviewable proposals only. This function never writes a knowledge file. */
export function createSuggestions(issues = []) {
  return issues.map((sourceIssue, index) => {
    if (!sourceIssue?.id) throw new Error('source issue id is required');
    const action = sourceIssue.suggestedAction ?? ACTION_BY_ISSUE[sourceIssue.type];
    if (!SUGGESTION_ACTIONS.includes(action) || action !== ACTION_BY_ISSUE[sourceIssue.type]) {
      throw new Error(`unsupported suggestion action: ${action}`);
    }
    return Object.freeze({
      id: `suggestion-${index + 1}`,
      action,
      status: 'proposed',
      requiresUserConfirmation: CONTENT_CHANGING_ACTIONS.has(action),
      sourceIssueIds: [sourceIssue.id],
      evidenceIds: [...(sourceIssue.evidenceIds ?? [])],
      explanation: sourceIssue.explanation,
    });
  });
}
