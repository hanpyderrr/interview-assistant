#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decodePcmWav, resampleMono } from './transcribe-audio.mjs';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const AUDIO_ROOT = path.resolve(process.env.BENCH_AUDIO_ROOT || 'E:/workspace/01_projects/音频');
const SPLIT_DIR = path.join(AUDIO_ROOT, 'split_004_052_16k_mono');
const OUTPUT_DIR = path.resolve(process.env.BENCH_OUTPUT_DIR || path.join(AUDIO_ROOT, 'funasr_benchmark_20260828'));
const RESULT_JSON = path.join(OUTPUT_DIR, 'funasr-benchmark-results.json');
const REPORT_MD = path.join(OUTPUT_DIR, 'funasr-benchmark-report.md');
const OLD_REPORT = path.join(AUDIO_ROOT, 'app_test_results', 'audio-benchmark-app-test.json');
const TARGET_RATE = 16_000;
const CHUNK_BYTES = 3_200;
const CHUNK_DELAY_MS = 100;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function buildRunConfiguration(env) {
  const take = name => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };
  const condition = take('BENCH_CONDITION');
  const vocabularyId = env.BENCH_VOCABULARY_ID?.trim() || '';
  const publicBasis = {
    condition,
    region: take('BENCH_REGION'),
    model: take('BENCH_MODEL'),
    asrOnly: env.BENCH_ASR_ONLY === '1',
    vocabularyConfigured: Boolean(vocabularyId),
    vocabularyIdHash: vocabularyId ? crypto.createHash('sha256').update(vocabularyId).digest('hex') : null,
    audioSet: '53-samples-v1',
    sampleRate: TARGET_RATE,
    chunkBytes: CHUNK_BYTES,
    chunkDelayMs: CHUNK_DELAY_MS,
  };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(publicBasis)).digest('hex');
  return {
    apiKey: take('DASHSCOPE_API_KEY'),
    workspaceId: take('BENCH_WS_ID'),
    region: publicBasis.region,
    model: publicBasis.model,
    vocabularyId,
    condition,
    asrOnly: publicBasis.asrOnly,
    fingerprint,
    publicMetadata: { ...publicBasis, configFingerprint: fingerprint },
  };
}

export function assertCompatibleExisting(existing, run) {
  if (!existing) return;
  if (existing.metadata?.configFingerprint !== run.fingerprint) {
    throw new Error('Existing benchmark fingerprint does not match this run; use an isolated output directory');
  }
}

function safeError(error) {
  return String(error?.message || error)
    .replace(/authorization\s*:\s*[^\r\n]*/giu, 'Authorization: [REDACTED]')
    .replace(/bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/\bsk-[a-z0-9_-]+\b/giu, '[REDACTED]')
    .slice(0, 300);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeSpherePcm(buffer) {
  if (buffer.subarray(0, 7).toString('ascii') !== 'NIST_1A') {
    throw new Error('Unsupported non-RIFF audio container');
  }
  const headerLength = Number(buffer.subarray(8, 16).toString('ascii').trim());
  const header = buffer.subarray(0, headerLength).toString('ascii');
  const field = name => {
    const match = header.match(new RegExp(`(?:^|\\n)${name}\\s+-[is]\\d*\\s+([^\\r\\n]+)`));
    if (!match) throw new Error(`Missing SPHERE field: ${name}`);
    return match[1].trim();
  };
  const channels = Number(field('channel_count'));
  const sampleRate = Number(field('sample_rate'));
  const sampleBytes = Number(field('sample_n_bytes'));
  const sampleCount = Number(field('sample_count'));
  const coding = field('sample_coding');
  if (coding !== 'pcm' || sampleBytes !== 1 || ![1, 2].includes(channels)) {
    throw new Error('Only 8-bit signed PCM SPHERE with one or two channels is supported');
  }
  const needed = headerLength + sampleCount * channels * sampleBytes;
  if (buffer.length < needed) throw new Error('SPHERE audio data is truncated');
  const samples = new Float32Array(sampleCount);
  for (let frame = 0; frame < sampleCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += buffer.readInt8(headerLength + frame * channels + channel) / 128;
    }
    samples[frame] = sum / channels;
  }
  return { sampleRate, channels, samples, sourceContainer: 'NIST SPHERE' };
}

function decodeAudio(buffer) {
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
    return { ...decodePcmWav(buffer), sourceContainer: 'RIFF/WAVE' };
  }
  return decodeSpherePcm(buffer);
}

function floatToPcm16(samples) {
  const output = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    output.writeInt16LE(value < 0 ? Math.round(value * 32_768) : Math.round(value * 32_767), i * 2);
  }
  return output;
}

function makeRunTask(taskId, config) {
  const parameters = {
    format: 'pcm',
    sample_rate: TARGET_RATE,
    heartbeat: true,
    semantic_punctuation_enabled: false,
    max_sentence_silence: 1300,
    language_hints: ['zh'],
  };
  if (config.vocabularyId) parameters.vocabulary_id = config.vocabularyId;
  return {
    header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
    payload: {
      task_group: 'audio',
      task: 'asr',
      function: 'recognition',
      model: config.model,
      parameters,
      input: {},
    },
  };
}

function makeFinishTask(taskId) {
  return {
    header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
    payload: { input: {} },
  };
}

async function transcribePcm(pcm, config, durationSeconds) {
  const taskId = crypto.randomUUID().replaceAll('-', '');
  const endpoint = `wss://${config.workspaceId}.${config.region}.maas.aliyuncs.com/api-ws/v1/inference`;
  const startAt = Date.now();
  const sentences = new Map();
  let firstResultAt = null;
  let lastAudioSentAt = null;
  let settled = false;

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    const timeoutMs = Math.max(45_000, Math.ceil(durationSeconds * 1_500) + 30_000);
    const timeout = setTimeout(() => finish(new Error('Fun-ASR task timed out')), timeoutMs);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { socket.terminate(); } catch {}
      if (error) reject(error);
      else resolve(value);
    }

    socket.on('error', error => finish(error));
    socket.on('open', () => socket.send(JSON.stringify(makeRunTask(taskId, config))));
    socket.on('message', async raw => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message?.header?.task_id !== taskId) return;
      const event = message?.header?.event;
      if (event === 'task-started') {
        try {
          for (let offset = 0; offset < pcm.length; offset += CHUNK_BYTES) {
            socket.send(pcm.subarray(offset, Math.min(offset + CHUNK_BYTES, pcm.length)));
            if (offset + CHUNK_BYTES < pcm.length) await delay(CHUNK_DELAY_MS);
          }
          lastAudioSentAt = Date.now();
          socket.send(JSON.stringify(makeFinishTask(taskId)));
        } catch (error) {
          finish(error);
        }
        return;
      }
      if (event === 'result-generated') {
        const sentence = message?.payload?.output?.sentence;
        if (!sentence?.heartbeat && typeof sentence?.text === 'string') {
          if (firstResultAt === null) firstResultAt = Date.now();
          sentences.set(Number(sentence.sentence_id || 0), {
            text: sentence.text.trim(),
            final: Boolean(sentence.sentence_end),
            beginTime: sentence.begin_time,
            endTime: sentence.end_time,
          });
        }
        return;
      }
      if (event === 'task-failed') {
        finish(new Error(`Fun-ASR task failed (${message?.header?.error_code || 'unknown'})`));
        return;
      }
      if (event === 'task-finished') {
        const finishedAt = Date.now();
        const orderedSentences = [...sentences.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([sentenceId, sentence]) => ({ sentenceId, ...sentence }));
        finish(null, {
          text: orderedSentences.map(item => item.text).filter(Boolean).join(''),
          sentences: orderedSentences,
          elapsedMs: finishedAt - startAt,
          firstResultMs: firstResultAt === null ? null : firstResultAt - startAt,
          postAudioFinalizeMs: lastAudioSentAt === null ? null : finishedAt - lastAudioSentAt,
        });
      }
    });
  });
}

async function transcribeWithRetry(pcm, config, durationSeconds, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { ...(await transcribePcm(pcm, config, durationSeconds)), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(1_000 * attempt);
    }
  }
  throw lastError;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

function levenshtein(left, right) {
  const a = [...left];
  const b = [...right];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function similarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return Number((1 - levenshtein(a, b) / Math.max([...a].length, [...b].length)).toFixed(4));
}

function quantile(values, fraction) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function mean(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function round(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function tableText(value, limit = 90) {
  const text = String(value ?? '').replaceAll('|', '\\|').replace(/\s+/gu, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function buildReport(document) {
  const { summary, rows, metadata } = document;
  const splitRows = rows.filter(row => row.group === 'split');
  const standaloneRows = rows.filter(row => row.group === 'standalone');
  const aggregateRows = rows.filter(row => row.group === 'aggregate');
  const lines = [
    '# Fun-ASR 真人音频基准对比报告',
    '',
    `- 生成时间：${metadata.generatedAt}`,
    `- 本次模型：${metadata.model}`,
    `- 样本总数：${summary.total}（49 个切片 + 3 个独立单问句 + 1 个连续多问句）`,
    `- Fun-ASR 成功 / 失败 / 空文本：${summary.asrSuccess} / ${summary.asrFailed} / ${summary.asrEmpty}`,
    `- 回答成功 / 跳过或失败：${summary.answerSuccess} / ${summary.total - summary.answerSuccess}`,
    `- 首结果延迟中位数 / P95：${summary.firstResultMedianMs ?? '—'} ms / ${summary.firstResultP95Ms ?? '—'} ms`,
    `- 音频发送完毕后的收尾延迟中位数 / P95：${summary.postAudioMedianMs ?? '—'} ms / ${summary.postAudioP95Ms ?? '—'} ms`,
    `- 49 条重叠切片与旧 Whisper 文本的一致度均值 / 中位数：${summary.oldTranscriptSimilarityMean ?? '—'} / ${summary.oldTranscriptSimilarityMedian ?? '—'}`,
    '',
    '> 注意：当前没有人工逐字标注。本报告中的“一致度”只是 Fun-ASR 与旧 Whisper 输出之间的字符相似度，不能当作真实准确率或 WER。',
    '',
    '## 49 个切片：Fun-ASR 与旧 Whisper 对比',
    '',
    '| 文件 | 时长(s) | Fun-ASR | 旧 Whisper | 一致度 | 首结果(ms) | 收尾(ms) | 状态 |',
    '|---|---:|---|---|---:|---:|---:|---|',
  ];
  for (const row of splitRows) {
    lines.push(`| ${row.file} | ${row.durationSeconds ?? '—'} | ${tableText(row.transcribedText)} | ${tableText(row.oldWhisperText)} | ${row.oldTranscriptSimilarity ?? '—'} | ${row.firstResultMs ?? '—'} | ${row.postAudioFinalizeMs ?? '—'} | ${row.asrStatus} |`);
  }
  lines.push(
    '',
    '## 新增的 4 个原始录音',
    '',
    '| 文件 | 类型 | 容器 | 时长(s) | Fun-ASR | 首结果(ms) | 收尾(ms) | 状态/错误 |',
    '|---|---|---|---:|---|---:|---:|---|',
  );
  for (const row of [...standaloneRows, ...aggregateRows]) {
    const status = row.asrError ? `${row.asrStatus}: ${row.asrError}` : row.asrStatus;
    lines.push(`| ${row.file} | ${row.group === 'aggregate' ? '连续多问句压力样本' : '独立单问句'} | ${row.sourceContainer || '—'} | ${row.durationSeconds ?? '—'} | ${tableText(row.transcribedText, 160)} | ${row.firstResultMs ?? '—'} | ${row.postAudioFinalizeMs ?? '—'} | ${tableText(status, 120)} |`);
  }
  lines.push(
    '',
    '## 逐条识别与回答',
    '',
  );
  for (const row of rows) {
    lines.push(
      `### ${row.file}${row.group === 'aggregate' ? '（连续多问句压力样本）' : ''}`,
      '',
      `- 识别状态：${row.asrStatus}`,
      `- 识别文本：${row.transcribedText || '（空）'}`,
      `- 回答状态：${row.answerStatus || '未执行'}`,
    );
    if (row.asrError) lines.push(`- 识别错误：${row.asrError}`);
    if (row.oldWhisperText != null) {
      lines.push(`- 旧 Whisper 文本：${row.oldWhisperText || '（空）'}`, `- 两模型文本一致度：${row.oldTranscriptSimilarity ?? '—'}`);
    }
    if (row.matches?.length) {
      lines.push(`- RAG 命中：${row.matches.map(match => `${match.id} ${match.title}`).join('；')}`);
    }
    lines.push('', row.answer || '（未生成回答）', '');
  }
  return `${lines.join('\n')}\n`;
}

async function loadExisting() {
  try {
    return JSON.parse(await fs.readFile(RESULT_JSON, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function save(document) {
  document.metadata.updatedAt = new Date().toISOString();
  await fs.writeFile(RESULT_JSON, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

export async function main() {
  const reportOnly = process.env.BENCH_REPORT_ONLY === '1';
  const run = buildRunConfiguration(process.env);
  const config = run;
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const oldDocument = JSON.parse(await fs.readFile(OLD_REPORT, 'utf8'));
  const oldRows = new Map(oldDocument.rows.map(row => [row.file, row]));
  const splitNames = Array.from({ length: 49 }, (_, index) => `${String(index + 4).padStart(3, '0')}.wav`);
  const inputs = [
    ...splitNames.map(file => ({ file, group: 'split', inputPath: path.join(SPLIT_DIR, file) })),
    { file: '1.wav', group: 'standalone', inputPath: path.join(AUDIO_ROOT, '1.wav') },
    { file: '2.wav', group: 'standalone', inputPath: path.join(AUDIO_ROOT, '2.wav') },
    { file: '3.wav', group: 'standalone', inputPath: path.join(AUDIO_ROOT, '3.wav') },
    { file: '4-52.wav', group: 'aggregate', inputPath: path.join(AUDIO_ROOT, '4-52.wav') },
  ];
  const existing = await loadExisting();
  assertCompatibleExisting(existing, run);
  const rowsByKey = new Map((existing?.rows || []).map(row => [`${row.group}:${row.file}`, row]));
  const document = existing || {
    metadata: {
      generatedAt: new Date().toISOString(),
      model: config.model,
      language: 'zh',
      sampleRate: TARGET_RATE,
      chunkBytes: CHUNK_BYTES,
      chunkDelayMs: CHUNK_DELAY_MS,
      oldBaselineModel: oldDocument.model,
      note: '4-52.wav is an aggregate multi-question stress sample and is excluded from single-question agreement metrics.',
      ...run.publicMetadata,
    },
    rows: [],
    summary: {},
  };

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const key = `${input.group}:${input.file}`;
    const prior = rowsByKey.get(key);
    if (reportOnly) continue;
    if (prior?.asrStatus === 'ok' && prior.transcribedText) {
      console.log(`[ASR ${index + 1}/${inputs.length}] ${input.file} resume-ok`);
      continue;
    }
    const row = prior || { file: input.file, group: input.group, inputPath: input.inputPath };
    try {
      const decoded = decodeAudio(await fs.readFile(input.inputPath));
      const mono16k = resampleMono(decoded.samples, decoded.sampleRate, TARGET_RATE);
      const durationSeconds = Number((mono16k.length / TARGET_RATE).toFixed(3));
      row.sourceContainer = decoded.sourceContainer;
      row.sourceSampleRate = decoded.sampleRate;
      row.sourceChannels = decoded.channels;
      row.durationSeconds = durationSeconds;
      const result = await transcribeWithRetry(floatToPcm16(mono16k), config, durationSeconds);
      Object.assign(row, {
        asrStatus: result.text ? 'ok' : 'empty',
        transcribedText: result.text,
        sentences: result.sentences,
        elapsedMs: result.elapsedMs,
        firstResultMs: result.firstResultMs,
        postAudioFinalizeMs: result.postAudioFinalizeMs,
        realtimeRatio: Number((result.elapsedMs / (durationSeconds * 1_000)).toFixed(3)),
        attempts: result.attempts,
        asrError: null,
      });
      const oldRow = oldRows.get(input.file);
      if (oldRow) {
        row.oldWhisperText = oldRow.transcribedText;
        row.oldWhisperElapsedMs = oldRow.elapsedMs;
        row.oldTranscriptSimilarity = similarity(result.text, oldRow.transcribedText);
      }
      console.log(`[ASR ${index + 1}/${inputs.length}] ${input.file} ${row.asrStatus} ${durationSeconds}s first=${row.firstResultMs ?? '-'}ms`);
    } catch (error) {
      row.asrStatus = 'failed';
      row.asrError = safeError(error);
      console.log(`[ASR ${index + 1}/${inputs.length}] ${input.file} failed`);
    }
    rowsByKey.set(key, row);
    document.rows = inputs.map(item => rowsByKey.get(`${item.group}:${item.file}`)).filter(Boolean);
    await save(document);
  }

  document.rows = inputs.map(item => rowsByKey.get(`${item.group}:${item.file}`)).filter(Boolean);
  const answerable = document.rows.filter(row => row.group !== 'aggregate');
  if (run.asrOnly && !reportOnly) {
    for (const row of document.rows) {
      row.answerStatus = 'skipped: asr-only benchmark';
      row.answer = null;
      delete row.answerError;
    }
    await save(document);
  }

  let prepareInterviewRequest;
  let generateAnswer;
  if (!reportOnly && !run.asrOnly) {
    ({ prepareInterviewRequest } = await import('./prepare-interview-request.mjs'));
    ({ generateAnswer } = await import('./generate-interview-answer.mjs'));
  }

  for (let index = 0; !reportOnly && !run.asrOnly && index < document.rows.length; index += 1) {
    const row = document.rows[index];
    if (row.group === 'aggregate') {
      row.answerStatus = 'skipped: aggregate multi-question stress sample';
      row.answer = null;
      await save(document);
      continue;
    }
    if (row.answerStatus === 'generated via deepseek-chat' && row.answer) continue;
    if (row.asrStatus !== 'ok' || !row.transcribedText) {
      row.answerStatus = 'skipped: no successful transcript';
      await save(document);
      continue;
    }
    const answerNumber = answerable.findIndex(candidate => candidate === row) + 1;
    try {
      const request = await prepareInterviewRequest(row.transcribedText, {
        kbPath: path.resolve('knowledge_source/interview_kb.jsonl'),
        topK: 5,
        maxChars: 6_000,
      });
      row.matches = request.matches.map(match => ({
        id: match.id,
        score: match.score,
        title: match.title,
        category: match.category,
      }));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      try {
        const generated = await generateAnswer(request, {
          baseUrl: 'https://api.deepseek.com',
          apiKey: requiredEnv('DEEPSEEK_API_KEY'),
          model: 'deepseek-chat',
          signal: controller.signal,
        });
        row.answer = generated.answer;
        row.answerStatus = 'generated via deepseek-chat';
        row.answerModel = generated.model;
        row.answerEndpoint = 'https://api.deepseek.com';
        row.answerError = null;
        console.log(`[ANSWER ${answerNumber}/${answerable.length}] ${row.file} ok`);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      row.answerStatus = 'failed';
      row.answerError = safeError(error);
      console.log(`[ANSWER ${answerNumber}/${answerable.length}] ${row.file} failed`);
    }
    await save(document);
  }

  const rows = document.rows;
  const successfulRows = rows.filter(row => row.asrStatus === 'ok');
  const comparisonRows = rows.filter(row => row.group === 'split' && Number.isFinite(row.oldTranscriptSimilarity));
  const firstResults = successfulRows.map(row => row.firstResultMs);
  const finalizeResults = successfulRows.map(row => row.postAudioFinalizeMs);
  const similarities = comparisonRows.map(row => row.oldTranscriptSimilarity);
  document.summary = {
    total: rows.length,
    split: rows.filter(row => row.group === 'split').length,
    standalone: rows.filter(row => row.group === 'standalone').length,
    aggregate: rows.filter(row => row.group === 'aggregate').length,
    asrSuccess: successfulRows.length,
    asrFailed: rows.filter(row => row.asrStatus === 'failed').length,
    asrEmpty: rows.filter(row => row.asrStatus === 'empty').length,
    answerSuccess: rows.filter(row => row.answerStatus === 'generated via deepseek-chat').length,
    comparisonCount: comparisonRows.length,
    firstResultMeanMs: round(mean(firstResults)),
    firstResultMedianMs: round(quantile(firstResults, 0.5)),
    firstResultP95Ms: round(quantile(firstResults, 0.95)),
    postAudioMeanMs: round(mean(finalizeResults)),
    postAudioMedianMs: round(quantile(finalizeResults, 0.5)),
    postAudioP95Ms: round(quantile(finalizeResults, 0.95)),
    oldTranscriptSimilarityMean: round(mean(similarities), 4),
    oldTranscriptSimilarityMedian: round(quantile(similarities, 0.5), 4),
  };
  await save(document);
  await fs.writeFile(REPORT_MD, buildReport(document), 'utf8');
  console.log(`COMPLETE rows=${rows.length} asr=${document.summary.asrSuccess} answers=${document.summary.answerSuccess}`);
  console.log(`RESULT_JSON=${RESULT_JSON}`);
  console.log(`REPORT_MD=${REPORT_MD}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[funasr-benchmark] ${safeError(error)}`);
    process.exitCode = 1;
  });
}
