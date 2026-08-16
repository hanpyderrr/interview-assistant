// Shared message protocol for the text knowledge dialog validator.
//
// The design (docs/superpowers/specs/2026-08-16-text-knowledge-dialog-validation-design.md)
// fixes every protocol message to { protocolVersion: 1, sessionId, type } plus
// per-type fields. Parsing is strict: unknown types, missing identifiers,
// out-of-range scores, follow-ups beyond the two-round cap, and credential-like
// keys are rejected. No API key ever travels inside a protocol message.

export const PROTOCOL_VERSION = 1;

export const MESSAGE_TYPES = ['start', 'question', 'answer', 'evaluation', 'followup', 'complete'];

export const ISSUE_TYPES = [
  'knowledge-gap',
  'retrieval-miss',
  'weak-retrieval',
  'fact-conflict',
  'unsupported-claim',
  'overlong-answer',
  'arithmetic-error',
  'evidence-boundary',
  'generic-answer',
  'missing-detail',
  'context-loss',
  'needs-model-review',
  'retrieval-design',
  'prompt-design',
];

export const SUGGESTION_ACTIONS = [
  'add-keywords',
  'retitle-entry',
  'split-entry',
  'expand-prepared-answer',
  'add-confirmed-fact',
  'resolve-conflict',
  'adjust-retrieval',
  'adjust-prompt',
];

export const MAX_FOLLOWUP_DEPTH = 2;
export const MIN_SCORE = 0;
export const MAX_SCORE = 100;

const CREDENTIAL_KEY = /api[-_]?key|token|password|authorization|cookie|secret/i;

// Required fields per message type, each mapped to a validator id.
const REQUIRED_FIELDS = {
  start: { round: 'nonNegativeInteger' },
  question: { round: 'positiveInteger', questionId: 'nonEmptyString', question: 'nonEmptyString' },
  answer: { round: 'positiveInteger', questionId: 'nonEmptyString', answer: 'string', evidenceIds: 'stringArray' },
  evaluation: { round: 'positiveInteger', questionId: 'nonEmptyString', score: 'score', needFollowup: 'boolean' },
  followup: { round: 'positiveInteger', questionId: 'nonEmptyString', question: 'nonEmptyString', followupDepth: 'followupDepth' },
  complete: { round: 'nonNegativeInteger' },
};

// Optional fields per message type; still type-checked when present.
const OPTIONAL_FIELDS = {
  evaluation: {
    supported: 'boolean',
    missingPoints: 'stringArray',
    contradictions: 'stringArray',
    followupQuestion: 'string',
  },
};

const CHECKERS = {
  nonNegativeInteger: (value) => Number.isInteger(value) && value >= 0,
  positiveInteger: (value) => Number.isInteger(value) && value >= 1,
  nonEmptyString: (value) => typeof value === 'string' && value.trim().length > 0,
  string: (value) => typeof value === 'string',
  boolean: (value) => typeof value === 'boolean',
  stringArray: (value) => Array.isArray(value) && value.every((item) => typeof item === 'string'),
  score: (value) => Number.isInteger(value) && value >= MIN_SCORE && value <= MAX_SCORE,
  followupDepth: (value) => Number.isInteger(value) && value >= 1 && value <= MAX_FOLLOWUP_DEPTH,
};

const CHECKER_REASONS = {
  nonNegativeInteger: 'must be a non-negative integer',
  positiveInteger: 'must be a positive integer',
  nonEmptyString: 'must be a non-empty string',
  string: 'must be a string',
  boolean: 'must be a boolean',
  stringArray: 'must be an array of strings',
  score: `must be an integer between ${MIN_SCORE} and ${MAX_SCORE}`,
  followupDepth: `must be an integer between 1 and ${MAX_FOLLOWUP_DEPTH}`,
};

function fail(field, reason) {
  throw new Error(`invalid dialog message: ${field} ${reason}`);
}

function findCredentialLikeKey(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIAL_KEY.test(key)) return key;
    const nested = findCredentialLikeKey(child, seen);
    if (nested) return nested;
  }
  return null;
}

/**
 * Strictly parse and validate one protocol message.
 *
 * @param {unknown} value raw message
 * @returns {Readonly<object>} a shallow-frozen object holding only the
 *   recognized protocol fields
 */
export function parseDialogMessage(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('message', 'must be a plain object');
  }
  const credentialKey = findCredentialLikeKey(value);
  if (credentialKey) fail(credentialKey, 'is not allowed in dialog messages');
  if (value.protocolVersion !== PROTOCOL_VERSION) fail('protocolVersion', `must be ${PROTOCOL_VERSION}`);
  if (typeof value.sessionId !== 'string' || value.sessionId.trim().length === 0) {
    fail('sessionId', 'must be a non-empty string');
  }
  if (!MESSAGE_TYPES.includes(value.type)) fail('type', `must be one of: ${MESSAGE_TYPES.join(', ')}`);

  const clean = { protocolVersion: PROTOCOL_VERSION, sessionId: value.sessionId, type: value.type };
  for (const [field, checker] of Object.entries(REQUIRED_FIELDS[value.type])) {
    if (!(field in value)) fail(field, 'is required');
    if (!CHECKERS[checker](value[field])) fail(field, CHECKER_REASONS[checker]);
    clean[field] = value[field];
  }
  for (const [field, checker] of Object.entries(OPTIONAL_FIELDS[value.type] ?? {})) {
    if (field in value) {
      if (!CHECKERS[checker](value[field])) fail(field, CHECKER_REASONS[checker]);
      clean[field] = value[field];
    }
  }
  return Object.freeze(clean);
}
