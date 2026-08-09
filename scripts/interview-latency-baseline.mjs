#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_AUDIO_PATH,
  collectInterviewSnapshot,
  findInterviewLauncherPage,
  playAudioSync,
} from './interview-live-audio.mjs';
import { latencyRecordsToCsv } from './lib/latency-baseline.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopAudioRoot = path.resolve('D:/Users/hanpyder/桌面/面试助手真人化测试音频');
const DEFAULT_CDP_URL = process.env.NATIVELY_CDP_URL || 'http://127.0.0.1:9224';
const FIXTURES = [
  ...['question-01.wav', 'question-02.wav', 'question-03.wav', 'question-04.wav'].map((file) => ({ fixture: file, category: 'ordinary', audio: path.resolve(repoRoot, 'realtime_audio', 'recordings', file) })),
  ...['humanized-01.wav', 'humanized-02.wav'].map((file) => ({ fixture: file, category: 'multi-question', audio: path.resolve(desktopAudioRoot, file) })),
  ...['humanized-04.wav', 'humanized-07.wav'].map((file) => ({ fixture: file, category: 'short-follow-up', audio: path.resolve(desktopAudioRoot, file) })),
  { fixture: 'humanized-06.wav', category: 'tail-hallucination-guard', audio: path.resolve(desktopAudioRoot, 'humanized-06.wav') },
  { fixture: 'question-01.wav#provider-timeout', category: 'provider-fallback', audio: DEFAULT_AUDIO_PATH, injectProviderTimeout: true },
];

function parseArgs(argv) {
  const value = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    const candidate = argv[index + 1];
    return index >= 0 && candidate && !candidate.startsWith('--') ? candidate : fallback;
  };
  return {
    cdpUrl: value('cdp-url', DEFAULT_CDP_URL),
    timeoutMs: Number(value('timeout-ms', '90000')) || 90000,
    output: path.resolve(value('output', path.resolve(repoRoot, 'reports', 'latency', 'latency-baseline.json'))),
  };
}

async function waitForRecord(page, previousCount, timeoutMs) {
  await page.waitForFunction((count) => (window.__nativelyInterviewLatencyRecords?.length || 0) > count, previousCount, { timeout: timeoutMs });
  return page.evaluate(() => window.__nativelyInterviewLatencyRecords || []);
}

async function runBaseline({ cdpUrl = DEFAULT_CDP_URL, timeoutMs = 90_000, output } = {}) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = findInterviewLauncherPage(pages);
  if (!page) throw new Error(`Could not find interview launcher page on ${cdpUrl}`);

  const startButton = page.getByRole('button', { name: '开始面试' });
  const stopButton = page.getByRole('button', { name: '停止采集' });
  if (await startButton.isVisible().catch(() => false)) await startButton.click();
  await stopButton.waitFor({ state: 'visible', timeout: timeoutMs });
  await page.locator('.signal-live').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForTimeout(800);

  const records = [];
  for (const fixture of FIXTURES) {
    if (!fs.existsSync(fixture.audio)) throw new Error(`Audio file not found: ${fixture.audio}`);
    const beforeCount = await page.evaluate(() => window.__nativelyInterviewLatencyRecords?.length || 0);
    await page.evaluate((inject) => { window.__nativelyInjectInterviewProviderTimeout = Boolean(inject); }, Boolean(fixture.injectProviderTimeout));
    playAudioSync(fixture.audio);
    const allRecords = await waitForRecord(page, beforeCount, timeoutMs);
    const latest = allRecords.at(-1);
    if (!latest) throw new Error(`No latency record produced for ${fixture.fixture}`);
    records.push({ ...latest, fixture: fixture.fixture, category: fixture.category });
    await page.evaluate(() => { window.__nativelyInjectInterviewProviderTimeout = false; });
    await page.waitForTimeout(300);
  }

  const target = output || path.resolve(repoRoot, 'reports', 'latency', 'latency-baseline.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(target.replace(/\.json$/i, '.csv'), latencyRecordsToCsv(records), 'utf8');
  const snapshot = await collectInterviewSnapshot(page);
  if (await stopButton.isVisible().catch(() => false)) await stopButton.click();
  console.log(JSON.stringify({ output: target, recordCount: records.length, snapshot }, null, 2));
  return records;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBaseline(parseArgs(process.argv.slice(2))).then(
    () => process.exit(0),
    (error) => {
      console.error('[interview-latency-baseline]', error?.stack || error?.message || error);
      process.exit(1);
    },
  );
}

export { FIXTURES, runBaseline, waitForRecord };
