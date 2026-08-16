#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadKnowledgeBase, searchKnowledgeBase } from '../interview-retriever.mjs';
import { prepareInterviewRequest } from '../prepare-interview-request.mjs';
import { generateAnswer } from '../generate-interview-answer.mjs';
import { diagnoseRetrieval } from './retrieval-diagnostics.mjs';
import { diagnoseAnswer } from './answer-diagnostics.mjs';
import { createSuggestions } from './suggestion-engine.mjs';
import { createCandidateAdapter } from './candidate-adapter.mjs';
import { createInterviewerAdapter } from './interviewer-adapter.mjs';
import { createCppInterviewerAdapter } from './cpp-interviewer-adapter.mjs';
import { runKnowledgeDialog } from './session-runner.mjs';
import { writeKnowledgeDialogReport } from './report.mjs';

const DEFAULTS = {
  kb: path.resolve('knowledge_source/embedded_kb.example.jsonl'),
  fixtures: path.resolve('validation/knowledge-dialog/fixtures/dialog-cases.jsonl'),
  output: path.resolve('validation/knowledge-dialog/results'),
  maxQuestions: 5,
  maxFollowups: 2,
  live: false,
};

export function parseCliArgs(argv) {
  const options = { ...DEFAULTS };
  const valueFlags = new Map([
    ['--kb', 'kb'], ['--fixtures', 'fixtures'], ['--output', 'output'],
    ['--max-questions', 'maxQuestions'], ['--max-followups', 'maxFollowups'],
    ['--interviewer', 'interviewer'], ['--cpp-executable', 'cppExecutable'], ['--cpp-config', 'cppConfig'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--live') {
      options.live = true;
      continue;
    }
    const field = valueFlags.get(argument);
    if (!field) throw new Error(`unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    index += 1;
    options[field] = field.startsWith('max') ? Number(value) : value;
  }
  if (!Number.isInteger(options.maxQuestions) || options.maxQuestions < 1 || options.maxQuestions > 20) {
    throw new Error('--max-questions must be an integer between 1 and 20');
  }
  if (!Number.isInteger(options.maxFollowups) || options.maxFollowups < 0 || options.maxFollowups > 2) {
    throw new Error('--max-followups must be an integer between 0 and 2');
  }
  if (options.interviewer && !['model', 'cpp'].includes(options.interviewer)) {
    throw new Error('--interviewer must be model or cpp');
  }
  if (options.interviewer === 'cpp') {
    if (!options.live) throw new Error('--interviewer cpp requires --live');
    if (!options.cppExecutable) throw new Error('--cpp-executable is required with --interviewer cpp');
    if (!options.cppConfig) throw new Error('--cpp-config is required with --interviewer cpp');
    if (!path.isAbsolute(options.cppExecutable) || !path.isAbsolute(options.cppConfig)) {
      throw new Error('--cpp-executable and --cpp-config must be absolute paths');
    }
  }
  return options;
}

export function normalizeCppEvaluation(value, questionId) {
  if (!Number.isInteger(value?.score) || value.score < 0 || value.score > 100) {
    throw new Error('C++ evaluation score must be an integer between 0 and 100');
  }
  const needFollowup = value.need_followup === true;
  if (needFollowup && (typeof value.followup_question !== 'string' || !value.followup_question.trim())) {
    throw new Error('C++ evaluation followup_question is required when need_followup is true');
  }
  const known = new Set(['score', 'feedback', 'need_followup', 'followup_question', 'strengths', 'weaknesses']);
  const providerMetadata = Object.fromEntries(Object.entries(value).filter(([key]) => !known.has(key)));
  return {
    questionId,
    score: value.score,
    ...(typeof value.feedback === 'string' ? { feedback: value.feedback } : {}),
    needFollowup,
    ...(needFollowup ? { followupQuestion: value.followup_question.trim() } : {}),
    strengths: Array.isArray(value.strengths) ? value.strengths.filter((item) => typeof item === 'string') : [],
    weaknesses: Array.isArray(value.weaknesses) ? value.weaknesses.filter((item) => typeof item === 'string') : [],
    ...(Object.keys(providerMetadata).length ? { providerMetadata } : {}),
  };
}

export function buildQualityGate(issues = []) {
  const blockingIssueIds = issues
    .filter((item) => item.severity === 'high' || item.severity === 'critical')
    .map((item) => item.id);
  return { passed: blockingIssueIds.length === 0, blockingIssueIds };
}

async function readJsonLines(filePath) {
  const text = await fs.readFile(path.resolve(filePath), 'utf8');
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid fixture JSON on line ${index + 1}: ${error.message}`);
    }
  });
}

export async function runValidation(options, env = process.env, dependencies = {}) {
  const entries = await loadKnowledgeBase(options.kb);
  const fixtures = (await readJsonLines(options.fixtures)).slice(0, options.maxQuestions);
  if (fixtures.length === 0) throw new Error('fixtures file contains no cases');

  let liveCandidate;
  let liveInterviewer;
  let cppAdapter;
  let activeFixtures = fixtures;
  const provider = {
    apiKey: env.INTERVIEW_LLM_API_KEY,
    baseUrl: env.INTERVIEW_LLM_BASE_URL,
    model: env.INTERVIEW_LLM_MODEL,
  };
  if (options.live) {
    if (!env.INTERVIEW_LLM_API_KEY) throw new Error('INTERVIEW_LLM_API_KEY is required with --live');
    liveCandidate = createCandidateAdapter({
      prepareRequest: dependencies.prepareRequest ?? prepareInterviewRequest,
      generateAnswer: dependencies.generateAnswer ?? generateAnswer,
      now: dependencies.now,
    });
    if ((options.interviewer ?? 'model') === 'cpp') {
      const fileExists = dependencies.fileExists ?? (async (filePath) => {
        try { await fs.access(filePath); return true; } catch { return false; }
      });
      if (!await fileExists(options.cppExecutable)) throw new Error('--cpp-executable does not exist');
      if (!await fileExists(options.cppConfig)) throw new Error('--cpp-config does not exist');
      cppAdapter = (dependencies.createCppAdapter ?? createCppInterviewerAdapter)({
        executable: options.cppExecutable,
        configPath: options.cppConfig,
        timeoutMs: dependencies.timeoutMs ?? 30_000,
      });
      liveInterviewer = async (turn) => normalizeCppEvaluation(
        await cppAdapter.evaluateAnswer(turn.question, turn.answer),
        turn.questionId,
      );
    } else {
      liveInterviewer = createInterviewerAdapter({
        generateEvaluation: dependencies.generateAnswer ?? generateAnswer,
        provider,
      });
    }
  }

  const deterministicId = createHash('sha256')
    .update(JSON.stringify({ entries, fixtures, maxQuestions: options.maxQuestions, maxFollowups: options.maxFollowups }))
    .digest('hex')
    .slice(0, 12);
  const sessionId = options.live
    ? `knowledge-dialog-live-${dependencies.now?.() ?? Date.now()}`
    : `knowledge-dialog-${deterministicId}`;
  const rounds = [];
  const issues = [];
  let rawRounds;
  if (options.live) {
    try {
      if (cppAdapter) {
        const resumeText = entries.map((entry) => `${entry.title ?? entry.id}\n${entry.content}`).join('\n\n');
        const generated = await cppAdapter.generateQuestions(resumeText, options.maxQuestions);
        if (!Array.isArray(generated) || generated.length === 0) throw new Error('C++ interviewer returned no questions');
        activeFixtures = generated.slice(0, options.maxQuestions).map((item, index) => {
          const question = typeof item === 'string' ? item : item?.question;
          if (typeof question !== 'string' || !question.trim()) throw new Error(`C++ question ${index + 1} is invalid`);
          return { caseId: `cpp-${index + 1}`, question: question.trim(), expectedEvidenceIds: [] };
        });
      }
      const session = await runKnowledgeDialog({
        sessionId,
        seedQuestions: activeFixtures.map((fixture) => fixture.question),
        answerQuestion: (question, context) => liveCandidate(question, {
          kbPath: options.kb,
          provider,
          signal: context.signal,
        }),
        evaluateAnswer: liveInterviewer,
        maxQuestions: options.maxQuestions,
        maxFollowupsPerQuestion: options.maxFollowups,
        timeoutMs: dependencies.timeoutMs ?? 30_000,
      });
      rawRounds = session.rounds;
    } finally {
      if (cppAdapter) await cppAdapter.close();
    }
  } else {
    rawRounds = fixtures.map((fixture, seedIndex) => {
      const matches = searchKnowledgeBase(fixture.question, entries, 5);
      return {
        sessionId,
        round: seedIndex + 1,
        questionId: fixture.caseId ?? `fixture-${seedIndex + 1}`,
        question: fixture.question,
        followupDepth: fixture.conversationContext ? Math.min(1, options.maxFollowups) : 0,
        seedIndex,
        context: fixture.conversationContext,
        answer: {
          question: fixture.question,
          answer: fixture.answer,
          evidenceIds: matches.map(({ entry }) => entry.id),
          matches: matches.map(({ entry, score }) => ({ id: entry.id, score })),
          elapsedMs: 0,
        },
      };
    });
  }

  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  for (const rawRound of rawRounds) {
    const fixture = activeFixtures[rawRound.seedIndex];
    const matches = (rawRound.answer?.matches ?? []).map(({ id, score }) => ({
      entry: entriesById.get(id) ?? { id },
      score,
    }));
    const issueOffset = issues.length;
    const roundIssues = [
      ...diagnoseRetrieval({
        question: rawRound.question,
        entries,
        matches,
        expectedEvidenceIds: fixture.expectedEvidenceIds ?? [],
      }),
      ...diagnoseAnswer({
        question: rawRound.question,
        answer: rawRound.answer?.answer ?? '',
        entries,
        evidenceIds: rawRound.answer?.evidenceIds ?? [],
      }),
    ].map((item, localIndex) => ({ ...item, id: `issue-${issueOffset + localIndex + 1}`, round: rawRound.round }));
    issues.push(...roundIssues);
    const evaluation = rawRound.evaluation ?? { score: roundIssues.length === 0 ? 100 : 50, needFollowup: false };
    rounds.push({
      ...rawRound,
      ...(rawRound.context ? {} : { context: fixture.conversationContext }),
      rawScore: evaluation.score,
      evaluation,
    });
  }
  const suggestions = createSuggestions(issues).map((item, index) => ({ ...item, id: `suggestion-${index + 1}` }));
  const qualityGate = buildQualityGate(issues);
  return {
    sessionId,
    mode: options.live ? 'live' : 'fixture',
    interviewer: options.live ? (options.interviewer ?? 'model') : 'fixture',
    ...(options.live ? { models: {
      candidate: env.INTERVIEW_LLM_MODEL,
      interviewer: (options.interviewer ?? 'model') === 'cpp' ? 'CppInterviewText' : env.INTERVIEW_LLM_MODEL,
    } } : {}),
    limits: { maxQuestions: options.maxQuestions, maxFollowups: options.maxFollowups },
    rounds,
    issues,
    suggestions,
    qualityGate,
  };
}

async function main(argv) {
  const options = parseCliArgs(argv);
  const report = await runValidation(options);
  const paths = await writeKnowledgeDialogReport(report, path.resolve(options.output));
  console.log(`JSON report: ${paths.jsonPath}`);
  console.log(`Markdown report: ${paths.markdownPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[knowledge-dialog] ${error.message}`);
    process.exitCode = 1;
  });
}
