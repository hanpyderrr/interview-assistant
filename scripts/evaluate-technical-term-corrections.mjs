#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { normalizeInterviewQuestion } from '../src/interview-console/questionNormalization.ts';
import { loadKnowledgeBase, searchKnowledgeBase } from './interview-retriever.mjs';

export function evaluateTechnicalTermFixtures(fixtures, entries) {
  const rows = fixtures.map((fixture) => {
    const normalized = normalizeInterviewQuestion(fixture.rawTranscript);
    const top1Id = searchKnowledgeBase(normalized, entries, 1)[0]?.entry.id ?? null;
    const exactAliasPattern = new RegExp(`\\b${fixture.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return {
      id: fixture.id,
      positive: fixture.positive,
      alias: fixture.alias,
      canonical: fixture.canonical,
      normalized,
      exactAliasPresent: exactAliasPattern.test(normalized),
      canonicalPresent: new RegExp(`\\b${fixture.canonical}\\b`).test(normalized),
      top1Id,
      baselineTop1: fixture.baselineTop1,
    };
  });

  return {
    schemaVersion: 1,
    fixtureCount: rows.length,
    summary: {
      positiveCorrectedCount: rows.filter((row) => row.positive && row.canonicalPresent && !row.exactAliasPresent).length,
      remainingPositiveAliasCount: rows.filter((row) => row.positive && row.exactAliasPresent).length,
      negativeAliasesPreserved: rows.filter((row) => !row.positive && row.exactAliasPresent).length,
      top1MatchesFixtureBaseline: rows.filter((row) => row.top1Id === row.baselineTop1).length,
    },
    rows,
  };
}

function parseArgs(argv) {
  const value = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? fallback : argv[index + 1];
  };
  return {
    fixtures: path.resolve(value('fixtures', 'scripts/__tests__/fixtures/spi-correction-fixtures.json')),
    output: path.resolve(value('output', 'reports/technical-term-corrections/current.json')),
  };
}

async function main(argv) {
  const options = parseArgs(argv);
  const fixtures = JSON.parse(await fs.readFile(options.fixtures, 'utf8'));
  const entries = await loadKnowledgeBase(path.resolve('knowledge_source/interview_kb.jsonl'));
  const result = evaluateTechnicalTermFixtures(fixtures, entries);
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result.summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
