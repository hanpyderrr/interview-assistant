#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

export const DEFAULT_CDP_URL = process.env.NATIVELY_CDP_URL || 'http://127.0.0.1:9224';
export const DEFAULT_AUDIO_PATH = path.resolve(repoRoot, 'realtime_audio', 'recordings', 'question-01.wav');

function escapeSingleQuotedPowerShell(value) {
  return value.replace(/'/g, "''");
}

export function buildPowerShellPlaybackCommand(wavPath) {
  const resolved = path.resolve(wavPath);
  const quoted = escapeSingleQuotedPowerShell(resolved);
  const script = `$player = New-Object System.Media.SoundPlayer '${quoted}'; $player.Load(); $player.PlaySync();`;
  return ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script];
}

export function findInterviewLauncherPage(pages) {
  return pages.find((page) => {
    const url = typeof page?.url === 'function' ? page.url() : '';
    return url.includes('interview=1') && url.includes('window=launcher');
  }) || null;
}

async function waitForVisibleText(page, selector, timeoutMs, { forbidPattern } = {}) {
  await page.waitForFunction(({ selector, forbidPattern: pattern }) => {
    const text = document.querySelector(selector)?.textContent?.trim() || '';
    if (!text) return false;
    if (pattern && new RegExp(pattern, 'i').test(text)) return false;
    return true;
  }, { selector, forbidPattern: forbidPattern ? forbidPattern.source : '' }, { timeout: timeoutMs });
  return (await page.locator(selector).innerText()).trim();
}

export async function collectInterviewSnapshot(page) {
  const [candidateVisible, candidateText, interviewerText, confirmedCount, confirmedQuestion, answerCount, answerText, liveText, statusText, hitCount] = await Promise.all([
    page.locator('.candidate-transcript').isVisible().catch(() => false),
    page.locator('.candidate-transcript p').innerText().catch(() => ''),
    page.locator('.interviewer-transcript .live-caption').innerText().catch(() => ''),
    page.locator('.confirmed-question').count().catch(() => 0),
    page.locator('.confirmed-question p').innerText().catch(() => ''),
    page.locator('.spoken-answer').count().catch(() => 0),
    page.locator('.spoken-answer p').innerText().catch(() => ''),
    page.locator('.signal-header').innerText().catch(() => ''),
    page.locator('.session-meta').innerText().catch(() => ''),
    page.locator('.hit-row').count().catch(() => 0),
  ]);

  return {
    url: page.url(),
    candidateVisible,
    candidateText: candidateText.trim(),
    interviewerText: interviewerText.trim(),
    confirmedQuestion,
    answerText,
    liveText: liveText.trim(),
    statusText: statusText.trim(),
    hitCount,
    confirmedCount,
    answerCount,
  };
}

export function playAudioSync(wavPath) {
  if (process.platform !== 'win32') {
    throw new Error('Audio playback helper currently only supports Windows PowerShell playback.');
  }
  const command = buildPowerShellPlaybackCommand(wavPath);
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Audio playback failed with exit code ${result.status ?? 'unknown'}`);
  }
}

export async function waitForAnswerArtifacts(page, timeoutMs) {
  await page.locator('.confirmed-question').waitFor({ state: 'visible', timeout: timeoutMs });
  await waitForVisibleText(page, '.confirmed-question p', timeoutMs);

  await page.locator('.session-meta .status-answered').waitFor({ state: 'visible', timeout: timeoutMs });
  await waitForVisibleText(page, '.spoken-answer p', timeoutMs, { forbidPattern: /正在生成回答/ });

  await page.locator('.hit-row').first().waitFor({ state: 'visible', timeout: timeoutMs });
}

function parseArgs(argv) {
  const nextValue = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    if (index === -1) return fallback;
    const value = argv[index + 1];
    return value && !value.startsWith('--') ? value : fallback;
  };

  return {
    cdpUrl: nextValue('cdp-url', DEFAULT_CDP_URL),
    audio: nextValue('audio', DEFAULT_AUDIO_PATH),
    timeoutMs: Number(nextValue('timeout-ms', '90000')) || 90000,
  };
}

export async function runInterviewLiveAudioReplay({
  cdpUrl = DEFAULT_CDP_URL,
  audio = DEFAULT_AUDIO_PATH,
  timeoutMs = 90_000,
} = {}) {
  const resolvedAudio = path.resolve(audio);
  if (!fs.existsSync(resolvedAudio)) {
    throw new Error(`Audio file not found: ${resolvedAudio}`);
  }

  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = findInterviewLauncherPage(pages);
    if (!page) {
      throw new Error(`Could not find interview launcher page on ${cdpUrl}`);
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const startButton = page.getByRole('button', { name: '开始面试' });
    const stopButton = page.getByRole('button', { name: '停止采集' });

    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
    }

    await stopButton.waitFor({ state: 'visible', timeout: timeoutMs });
    await page.locator('.signal-live').waitFor({ state: 'visible', timeout: timeoutMs });
    await page.waitForTimeout(800);

    playAudioSync(resolvedAudio);

    await waitForAnswerArtifacts(page, timeoutMs);

    const snapshot = await collectInterviewSnapshot(page);
    if (!snapshot.confirmedQuestion) {
      throw new Error('Confirmed question did not appear');
    }
    if (!snapshot.answerText || /正在生成回答/.test(snapshot.answerText)) {
      throw new Error('Answer suggestion did not finish streaming');
    }
    if (!snapshot.hitCount) {
      throw new Error('Knowledge hits did not appear');
    }

    console.log(JSON.stringify(snapshot, null, 2));

    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      await startButton.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    }

    return snapshot;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const { cdpUrl, audio, timeoutMs } = parseArgs(process.argv.slice(2));
  await runInterviewLiveAudioReplay({ cdpUrl, audio, timeoutMs });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[interview-live-audio]', error?.stack || error?.message || error);
    process.exit(1);
  });
}
