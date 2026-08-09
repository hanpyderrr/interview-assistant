#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_AUDIO_PATH,
  buildPowerShellPlaybackCommand,
  collectInterviewSnapshot,
  findInterviewLauncherPage,
  waitForAnswerArtifacts,
} from './interview-live-audio.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function playAudioAsync(audio) {
  const [command, ...args] = buildPowerShellPlaybackCommand(audio);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Audio playback failed with exit code ${code}`)));
  });
}

async function waitForStableAnswer(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await waitForAnswerArtifacts(page, Math.max(1, deadline - Date.now()));
    await page.waitForTimeout(1200);
    const snapshot = await collectInterviewSnapshot(page);
    if (/回答已生成/.test(snapshot.statusText) && snapshot.answerText.length >= 20) return snapshot;
  }
  throw new Error('Answer did not remain final and useful');
}

function parseArgs(argv) {
  const index = argv.indexOf('--audio');
  return { audio: index >= 0 && argv[index + 1] ? path.resolve(argv[index + 1]) : DEFAULT_AUDIO_PATH };
}

async function runPartialPrewarmPoc({
  cdpUrl = process.env.NATIVELY_CDP_URL || 'http://127.0.0.1:9224',
  audio = DEFAULT_AUDIO_PATH,
  timeoutMs = 90_000,
  output = path.resolve(repoRoot, 'reports', 'latency', 'partial-prewarm-poc.json'),
} = {}) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const page = findInterviewLauncherPage(browser.contexts().flatMap((context) => context.pages()));
  if (!page) throw new Error(`Could not find interview launcher page on ${cdpUrl}`);

  const startButton = page.getByRole('button', { name: '开始面试' });
  const stopButton = page.getByRole('button', { name: '停止采集' });
  if (await startButton.isVisible().catch(() => false)) await startButton.click();
  await stopButton.waitFor({ state: 'visible', timeout: timeoutMs });
  await page.locator('.signal-live').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.evaluate(() => {
    window.__nativelyInterviewLatencyRecords = [];
    window.__nativelyInterviewTranscriptEvents = [];
  });
  await page.waitForTimeout(800);

  const playbackStartedAt = Date.now();
  const candidateObservation = page.waitForFunction(() => {
      const text = document.querySelector('.candidate-answer p')?.textContent?.trim() || '';
      return text.length > 0;
    }, undefined, { timeout: Math.min(timeoutMs, 20_000) })
    .then(async () => ({ text: await page.locator('.candidate-answer p').innerText(), at: Date.now() }))
    .catch(() => ({ text: '', at: null }));
  await playAudioAsync(path.resolve(audio));
  const audioEndedAt = Date.now();
  const observedCandidate = await candidateObservation;
  const candidateText = observedCandidate.text;
  const snapshot = await waitForStableAnswer(page, timeoutMs);
  const data = await page.evaluate(() => ({
    records: window.__nativelyInterviewLatencyRecords || [],
    events: window.__nativelyInterviewTranscriptEvents || [],
  }));
  const record = data.records.at(-1);
  if (!record) throw new Error('No latency record was produced');
  const questionSettled = record.events?.questionSettled;
  const firstAnswerToken = record.events?.firstAnswerToken;
  if (!(Number.isFinite(questionSettled) && Number.isFinite(firstAnswerToken) && firstAnswerToken > questionSettled)) {
    throw new Error('Final-only order failed: firstAnswerToken must follow questionSettled');
  }

  const partialCount = data.events.filter((event) => event?.kind === 'partial' && event?.speaker === 'interviewer').length;
  const finalCount = data.events.filter((event) => event?.kind === 'final' && event?.speaker === 'interviewer').length;
  if (!partialCount || !finalCount) throw new Error('Expected interviewer partial and final events');

  const artifact = {
    generatedAt: new Date().toISOString(),
    fixture: path.basename(audio),
    partialCount,
    finalCount,
    questionSettledToFirstTokenMs: firstAnswerToken - questionSettled,
    providerTtftMs: record.provider?.ttftMs,
    candidateObserved: Boolean(candidateText),
    candidateChars: candidateText.trim().length,
    candidateFromPlaybackStartMs: observedCandidate.at ? observedCandidate.at - playbackStartedAt : null,
    candidateRelativeToAudioEndMs: observedCandidate.at ? observedCandidate.at - audioEndedAt : null,
    answerChars: snapshot.answerText.length,
    hitCount: snapshot.hitCount,
    statusText: snapshot.statusText,
    finalOnlyOrderValid: true,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  if (await stopButton.isVisible().catch(() => false)) await stopButton.click();
  console.log(JSON.stringify({ output, ...artifact }, null, 2));
  return artifact;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPartialPrewarmPoc(parseArgs(process.argv.slice(2))).then(
    () => process.exit(0),
    (error) => {
      console.error('[interview-partial-prewarm-poc]', error?.stack || error?.message || error);
      process.exit(1);
    },
  );
}

export { runPartialPrewarmPoc };
