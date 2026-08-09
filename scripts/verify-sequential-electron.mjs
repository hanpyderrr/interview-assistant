#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cdpUrl = process.env.NATIVELY_CDP_URL || 'http://127.0.0.1:9224';
const mode = process.argv[2] || 'baseline';
const timeoutMs = Number(process.argv[3] || 180_000);
const audioFiles = [1, 2, 3, 4].map((n) => path.join(root, 'realtime_audio', 'recordings', `question-0${n}.wav`));

function playAudioSync(audioPath) {
  const escaped = path.resolve(audioPath).replace(/'/g, "''");
  const command = `$player = New-Object System.Media.SoundPlayer '${escaped}'; $player.Load(); $player.PlaySync();`;
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Audio playback failed (${result.status})`);
}

async function waitForAnswer(page, previousQuestion, previousAnswer) {
  await page.locator('.confirmed-question p').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForFunction(({ previousQuestion, previousAnswer }) => {
    const question = document.querySelector('.confirmed-question p')?.textContent?.trim() || '';
    const answer = document.querySelector('.spoken-answer p')?.textContent?.trim() || '';
    const statusAnswered = Boolean(document.querySelector('.session-meta .status-answered'));
    return Boolean(question && question !== previousQuestion && answer && answer !== previousAnswer
      && !/正在生成回答/.test(answer) && statusAnswered);
  }, { previousQuestion, previousAnswer }, { timeout: timeoutMs });
  await page.locator('.hit-row').first().waitFor({ state: 'visible', timeout: timeoutMs });
}

async function readSnapshot(page) {
  return page.evaluate(() => ({
    interviewer: document.querySelector('.interviewer-transcript .live-caption')?.textContent?.trim() || '',
    question: document.querySelector('.confirmed-question p')?.textContent?.trim() || '',
    answer: document.querySelector('.spoken-answer p')?.textContent?.trim() || '',
    status: document.querySelector('.session-meta')?.textContent?.trim() || '',
    hits: document.querySelectorAll('.hit-row').length,
  }));
}

async function findLauncher(browser) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.url().includes('interview=1') && page.url().includes('window=launcher')) return page;
    }
  }
  return null;
}

async function main() {
  if (!['baseline', 'meetily-experiment'].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
  for (const audio of audioFiles) if (!fs.existsSync(audio)) throw new Error(`Missing audio: ${audio}`);

  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const page = await findLauncher(browser);
    if (!page) throw new Error(`Interview launcher not found on ${cdpUrl}`);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.evaluate(async (segmenterMode) => {
      await window.electronAPI?.localWhisperSetChannelConfig?.({ segmenterMode });
    }, mode);

    const results = [];
    let previousQuestion = '';
    let previousAnswer = '';
    for (const audio of audioFiles) {
      const startButton = page.locator('.primary-button');
      await startButton.waitFor({ state: 'visible', timeout: timeoutMs });
      await startButton.click();
      await page.locator('.stop-button').waitFor({ state: 'visible', timeout: timeoutMs });
      await page.locator('.signal-live').waitFor({ state: 'visible', timeout: timeoutMs });
      await page.waitForTimeout(800);

      playAudioSync(audio);
      await waitForAnswer(page, previousQuestion, previousAnswer);
      const snapshot = await readSnapshot(page);
      results.push({ audio: path.basename(audio), ...snapshot });
      previousQuestion = snapshot.question;
      previousAnswer = snapshot.answer;

      await page.locator('.stop-button').click();
      await startButton.waitFor({ state: 'visible', timeout: timeoutMs });
      await page.waitForTimeout(500);
    }
    console.log(JSON.stringify({ mode, results }, null, 2));
  } finally {
    // Disconnect the CDP client without closing the Electron process.
    browser.disconnect();
  }
}

main().catch((error) => {
  console.error('[verify-sequential-electron]', error?.stack || error?.message || error);
  process.exit(1);
});
