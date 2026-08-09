#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DEFAULT_AUDIO_PATH, findInterviewLauncherPage, playAudioSync } from './interview-live-audio.mjs';
import { validatePartialEventSequence } from './lib/partial-ipc-poc.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function runPartialIpcPoc({
  cdpUrl = process.env.NATIVELY_CDP_URL || 'http://127.0.0.1:9224',
  audio = DEFAULT_AUDIO_PATH,
  timeoutMs = 90_000,
  output = path.resolve(repoRoot, 'reports', 'latency', 'partial-ipc-poc.json'),
} = {}) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const page = findInterviewLauncherPage(browser.contexts().flatMap((context) => context.pages()));
  if (!page) throw new Error(`Could not find interview launcher page on ${cdpUrl}`);
  const startButton = page.getByRole('button', { name: '开始面试' });
  const stopButton = page.getByRole('button', { name: '停止采集' });
  if (await startButton.isVisible().catch(() => false)) await startButton.click();
  await stopButton.waitFor({ state: 'visible', timeout: timeoutMs });
  await page.locator('.signal-live').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.evaluate(() => { window.__nativelyInterviewTranscriptEvents = []; });
  await page.waitForTimeout(800);
  playAudioSync(path.resolve(audio));
  await page.waitForFunction(() => {
    const events = window.__nativelyInterviewTranscriptEvents || [];
    return events.some((event) => event.kind === 'partial' && event.speaker === 'interviewer' && Number.isFinite(event.segmentId))
      && events.some((event) => event.kind === 'final' && event.speaker === 'interviewer' && Number.isFinite(event.segmentId));
  }, undefined, { timeout: timeoutMs });
  await stopButton.click();
  await page.waitForFunction(() => (window.__nativelyInterviewTranscriptEvents || []).some((event) => event.kind === 'reset'), undefined, { timeout: timeoutMs });
  const events = await page.evaluate(() => window.__nativelyInterviewTranscriptEvents || []);
  const result = validatePartialEventSequence(events);
  if (!result.valid) throw new Error(`Partial IPC event order failed: ${JSON.stringify(result)}`);
  const artifact = { generatedAt: new Date().toISOString(), fixture: path.basename(audio), events, result };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output, ...result }, null, 2));
  return artifact;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPartialIpcPoc().then(
    () => process.exit(0),
    (error) => {
      console.error('[interview-partial-ipc-poc]', error?.stack || error?.message || error);
      process.exit(1);
    },
  );
}

export { runPartialIpcPoc };
