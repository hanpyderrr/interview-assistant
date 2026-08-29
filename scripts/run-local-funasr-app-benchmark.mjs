#!/usr/bin/env node

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_INPUT_DIR = 'E:\\workspace\\01_projects\\音频';
export const TARGET_SAMPLE_RATE = 16_000;
export const LOCAL_FUNASR_ORIGIN = 'http://127.0.0.1:8765';

const CHUNK_BYTES = 3_200; // 100 ms of 16 kHz mono S16LE
const SPLIT_FILE_RE = /^split_?(\d{2,})\.wav$/i;
const NUMERIC_FILE_RE = /^(\d{2,})\.wav$/i;

const USAGE = [
  'Usage: node scripts/run-local-funasr-app-benchmark.mjs [--smoke] [--input-dir DIR] [--output-root DIR]',
  '',
  '  --smoke        Only transcribe 1.wav, 2.wav and 3.wav (default: full 53-sample manifest).',
  '  --input-dir    Audio input directory (default: E:\\workspace\\01_projects\\音频).',
  '  --output-root  Output root (default: output).',
].join('\n');

function safeError(error) {
  return String(error?.message || error).slice(0, 500);
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function readAscii(buffer, offset, length) {
  return buffer.toString('ascii', offset, offset + length);
}

function readInt24LE(buffer, offset) {
  const value = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
  return value & 0x800000 ? value - 0x1000000 : value;
}

/**
 * Decode an uncompressed PCM RIFF/WAVE into mono Float32 samples.
 * Supports 8/16/24/32-bit PCM (and WAVE_FORMAT_EXTENSIBLE with a PCM subformat),
 * any channel count, and mixes channels down to mono.
 */
export function decodeWavPcm(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new Error('Invalid WAV: file is too short');
  }
  if (readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 4) !== 'WAVE') {
    throw new Error('Invalid WAV: missing RIFF/WAVE signature');
  }

  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = readAscii(buffer, offset, 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) break;
    if (id === 'fmt ') format = buffer.subarray(start, end);
    if (id === 'data') data = buffer.subarray(start, end);
    offset = end + (size % 2);
  }

  if (!format || format.length < 16 || !data) {
    throw new Error('Invalid WAV: missing fmt or data chunk');
  }
  const audioFormat = format.readUInt16LE(0);
  const channels = format.readUInt16LE(2);
  const sampleRate = format.readUInt32LE(4);
  const bitsPerSample = format.readUInt16LE(14);
  if (audioFormat === 0xfffe) {
    if (format.length < 40 || format.readUInt16LE(24) !== 1) {
      throw new Error('Unsupported WAV: non-PCM WAVE_FORMAT_EXTENSIBLE subformat');
    }
  } else if (audioFormat !== 1) {
    throw new Error('Unsupported WAV: only uncompressed PCM is supported');
  }
  if (![8, 16, 24, 32].includes(bitsPerSample)) {
    throw new Error(`Unsupported WAV sample width: ${bitsPerSample}-bit`);
  }
  if (channels < 1 || sampleRate < 1) {
    throw new Error('Invalid WAV: requires at least one channel and a positive sample rate');
  }

  const bytesPerSample = bitsPerSample / 8;
  const bytesPerFrame = channels * bytesPerSample;
  if (data.length % bytesPerFrame !== 0) {
    throw new Error('Invalid WAV: data is not frame-aligned');
  }
  const frameCount = data.length / bytesPerFrame;
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset = frame * bytesPerFrame + channel * bytesPerSample;
      let value;
      if (bitsPerSample === 8) value = data.readUInt8(sampleOffset) - 128;
      else if (bitsPerSample === 16) value = data.readInt16LE(sampleOffset);
      else if (bitsPerSample === 24) value = readInt24LE(data, sampleOffset);
      else value = data.readInt32LE(sampleOffset);
      sum += value / (2 ** (bitsPerSample - 1));
    }
    samples[frame] = sum / channels;
  }
  return { sampleRate, channels, samples, sourceContainer: 'RIFF/WAVE' };
}

/**
 * Decode a NIST/SPHERE (NIST_1A) PCM file into mono Float32 samples.
 * Supports 8-bit signed and 16-bit signed PCM with any channel count.
 */
export function decodeSpherePcm(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 7).toString('ascii') !== 'NIST_1A') {
    throw new Error('Unsupported audio container: expected RIFF/WAVE or NIST_1A SPHERE');
  }
  const headerLength = Number(buffer.subarray(8, 16).toString('ascii').trim());
  if (!Number.isInteger(headerLength) || headerLength < 0 || headerLength > buffer.length) {
    throw new Error('Invalid SPHERE header length');
  }
  const header = buffer.subarray(0, headerLength).toString('ascii');
  const field = (name) => {
    const match = header.match(new RegExp(`(?:^|\\n)${name}\\s+-[is]\\d*\\s+([^\\r\\n]+)`));
    if (!match) throw new Error(`Missing SPHERE field: ${name}`);
    return match[1].trim();
  };
  const channels = Number(field('channel_count'));
  const sampleRate = Number(field('sample_rate'));
  const sampleBytes = Number(field('sample_n_bytes'));
  const sampleCount = Number(field('sample_count'));
  const coding = field('sample_coding');
  if (coding !== 'pcm') throw new Error(`Unsupported SPHERE coding: ${coding}`);
  if (![1, 2].includes(sampleBytes)) throw new Error('Only 8-bit and 16-bit SPHERE PCM is supported');
  if (channels < 1 || sampleRate < 1) throw new Error('Invalid SPHERE channel count or sample rate');

  const needed = headerLength + sampleCount * channels * sampleBytes;
  if (buffer.length < needed) throw new Error('SPHERE audio data is truncated');

  const samples = new Float32Array(sampleCount);
  for (let frame = 0; frame < sampleCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset = headerLength + (frame * channels + channel) * sampleBytes;
      const value = sampleBytes === 1
        ? buffer.readInt8(sampleOffset) / 128
        : buffer.readInt16LE(sampleOffset) / 32768;
      sum += value;
    }
    samples[frame] = sum / channels;
  }
  return { sampleRate, channels, samples, sourceContainer: 'NIST/SPHERE' };
}

export function decodeAudio(buffer) {
  if (Buffer.isBuffer(buffer) && readAscii(buffer, 0, 4) === 'RIFF') return decodeWavPcm(buffer);
  return decodeSpherePcm(buffer);
}

/** Linear resampling, sufficient for speech preprocessing in this benchmark. */
export function resampleMono(samples, sourceRate, targetRate = TARGET_SAMPLE_RATE) {
  if (!(samples instanceof Float32Array) || samples.length === 0) return new Float32Array();
  if (sourceRate === targetRate) return samples.slice();
  const outputLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const output = new Float32Array(outputLength);
  const scale = sourceRate / targetRate;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * scale;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = position - left;
    output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

export function float32ToS16le(samples) {
  const output = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const value = clamped < 0 ? Math.round(clamped * 32_768) : Math.round(clamped * 32_767);
    output.writeInt16LE(value, index * 2);
  }
  return output;
}

export function chunkPcm(pcm, chunkBytes = CHUNK_BYTES) {
  if (!Buffer.isBuffer(pcm)) throw new TypeError('PCM must be a Buffer');
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new RangeError('Chunk size must be a positive safe integer');
  }
  const chunks = [];
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    chunks.push(pcm.subarray(offset, Math.min(offset + chunkBytes, pcm.length)));
  }
  return chunks;
}

function splitLabel(index) {
  return `split_${String(index).padStart(3, '0')}.wav`;
}

/**
 * Read-only discovery of the split audio segments (indices 4..52) under the
 * input directory. The on-disk layout is not hardcoded: both `NNN.wav` files
 * inside a split subdirectory and top-level `split_NNN.wav` files are accepted,
 * and the original (non 16k/mono/converted) source directory is preferred.
 */
export async function discoverSplitEntries(inputDir) {
  const topLevel = await fs.readdir(inputDir, { withFileTypes: true });
  const candidates = [];

  for (const entry of topLevel) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(SPLIT_FILE_RE);
    if (match) {
      const index = Number(match[1]);
      candidates.push({ index, name: splitLabel(index), path: path.join(inputDir, entry.name) });
    }
  }

  const subdirectories = [];
  for (const entry of topLevel) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(inputDir, entry.name);
    let names;
    try {
      names = await fs.readdir(dirPath);
    } catch {
      continue;
    }
    const items = [];
    for (const file of names) {
      let match = file.match(NUMERIC_FILE_RE);
      if (!match) match = file.match(SPLIT_FILE_RE);
      if (!match) continue;
      const index = Number(match[1]);
      items.push({ index, name: splitLabel(index), path: path.join(dirPath, file) });
    }
    if (items.length) subdirectories.push({ dirName: entry.name, items });
  }

  if (subdirectories.length) {
    const isConverted = (name) => /16k|mono|convert|resampl/i.test(name);
    const preferred = subdirectories.filter((dir) => !isConverted(dir.dirName))
      .sort((left, right) => right.items.length - left.items.length)[0]
      ?? subdirectories.sort((left, right) => right.items.length - left.items.length)[0];
    return preferred.items.sort((left, right) => left.index - right.index);
  }

  return candidates.sort((left, right) => left.index - right.index);
}

/**
 * Build the 53-entry manifest: 1.wav, 2.wav, 3.wav, 4-52.wav, then
 * split_004.wav .. split_052.wav (49 segments), in natural order.
 */
export async function buildManifest(inputDir) {
  const fixedNames = ['1.wav', '2.wav', '3.wav', '4-52.wav'];
  const standalone = fixedNames.map((name, index) => ({
    name,
    path: path.join(inputDir, name),
    group: index < 3 ? 'standalone' : 'aggregate',
  }));

  const splits = await discoverSplitEntries(inputDir);
  const splitByIndex = new Map(splits.map((entry) => [entry.index, entry]));
  const orderedSplits = [];
  for (let index = 4; index <= 52; index += 1) {
    const entry = splitByIndex.get(index);
    if (!entry) {
      throw new Error(`Missing split audio segment for index ${index} (expected ${splitLabel(index)})`);
    }
    orderedSplits.push({ name: entry.name, path: entry.path, group: 'split' });
  }

  return [...standalone, ...orderedSplits];
}

export function parseArgs(argv) {
  const options = { mode: 'full', inputDir: DEFAULT_INPUT_DIR, outputRoot: 'output' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--smoke') options.mode = 'smoke';
    else if (arg === '--input-dir' || arg === '--input') options.inputDir = argv[++index];
    else if (arg === '--output-root') options.outputRoot = argv[++index];
    else if (arg === '--help' || arg === '-h') return null;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function timestampTag(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function buildRunDirectory(outputRoot) {
  return path.join(path.resolve(outputRoot), `local-funasr-app-validation-${timestampTag()}`);
}

export async function healthCheck({ origin = LOCAL_FUNASR_ORIGIN, timeoutMs = 5_000 } = {}) {
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${origin}/health`, { method: 'GET', signal: controller.signal });
      const latencyMs = Date.now() - startedAt;
      let body = null;
      try {
        body = await response.json();
      } catch {
        // Non-JSON health response still proves reachability.
      }
      return {
        reachable: true,
        latencyMs,
        httpStatus: response.status,
        state: body?.state ?? null,
        status: body?.status ?? null,
        detail: body?.detail ?? null,
        requestCount: body?.request_count ?? null,
        successCount: body?.success_count ?? null,
        failureCount: body?.failure_count ?? null,
        error: null,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return {
      reachable: false,
      latencyMs: Date.now() - startedAt,
      httpStatus: null,
      state: null,
      status: null,
      detail: null,
      requestCount: null,
      successCount: null,
      failureCount: null,
      error: safeError(error),
    };
  }
}

/** Lazily load the compiled (dist-electron) App Provider so tests stay build-free. */
function loadProvider() {
  const dist = (name) => path.resolve(SCRIPT_DIR, `../dist-electron/electron/audio/${name}.js`);
  const { CaptureAudioTimeline } = require(dist('CaptureAudioTimeline'));
  const { LocalFunAsrSTT, requestLocalFunAsr } = require(dist('LocalFunAsrSTT'));
  return { CaptureAudioTimeline, LocalFunAsrSTT, requestLocalFunAsr };
}

/**
 * Feed PCM through the compiled LocalFunAsrSTT provider (write + notifySpeechEnded
 * + finalize). The injected transport wraps the provider's own requestLocalFunAsr
 * only to observe the service-reported inference_seconds/total_seconds; it never
 * bypasses the provider.
 */
async function transcribeThroughProvider({ pcm, chunkBytes, provider, monotonicNow }) {
  const { CaptureAudioTimeline, LocalFunAsrSTT, requestLocalFunAsr } = provider;
  const generation = 1;
  const originMs = monotonicNow();
  const timeline = new CaptureAudioTimeline();
  timeline.beginSession(generation, originMs);

  const metrics = { inferenceSeconds: null, totalSeconds: null, requestLatencyMs: null };
  const stt = new LocalFunAsrSTT({
    channel: 'interviewer',
    timeline,
    monotonicNow,
    requestTranscription: async (request) => {
      const startedAt = monotonicNow();
      const response = await requestLocalFunAsr(request);
      metrics.requestLatencyMs = monotonicNow() - startedAt;
      if (typeof response.inference_seconds === 'number') metrics.inferenceSeconds = response.inference_seconds;
      if (typeof response.total_seconds === 'number') metrics.totalSeconds = response.total_seconds;
      return response;
    },
  });

  const transcripts = [];
  const errors = [];
  stt.on('transcript', (segment) => transcripts.push(segment));
  stt.on('error', (error) => errors.push(error));

  const wallClockStartedAt = Date.now();
  try {
    stt.beginCaptureSession(generation, originMs);
    for (const chunk of chunkPcm(pcm, chunkBytes)) stt.write(chunk);
    stt.notifySpeechEnded();
    await stt.finalize();
  } finally {
    stt.stop();
  }
  return {
    text: transcripts.map((segment) => segment.text).join(''),
    segments: transcripts,
    metrics,
    wallClockMs: Date.now() - wallClockStartedAt,
    errors: errors.map((error) => (error instanceof Error ? error.message : String(error))),
  };
}

async function transcribeEntry({ entry, provider }) {
  const buffer = await fs.readFile(entry.path);
  const decoded = decodeAudio(buffer);
  const mono = resampleMono(decoded.samples, decoded.sampleRate, TARGET_SAMPLE_RATE);
  const pcm = float32ToS16le(mono);
  const result = await transcribeThroughProvider({
    pcm,
    chunkBytes: CHUNK_BYTES,
    provider,
    monotonicNow: () => performance.now(),
  });
  const error = result.errors[0] ?? null;
  const status = error ? 'failed' : (result.text ? 'ok' : 'empty');
  return {
    name: entry.name,
    path: entry.path,
    group: entry.group,
    status,
    requestSuccess: !error,
    transcriptNonEmpty: Boolean(result.text),
    transcript: result.text,
    durationSeconds: round(decoded.samples.length / decoded.sampleRate, 3),
    sourceSampleRate: decoded.sampleRate,
    sourceChannels: decoded.channels,
    sourceContainer: decoded.sourceContainer,
    inferenceSeconds: round(result.metrics.inferenceSeconds, 3),
    totalSeconds: round(result.metrics.totalSeconds ?? result.wallClockMs / 1000, 3),
    requestLatencyMs: round(result.metrics.requestLatencyMs, 1),
    wallClockMs: round(result.wallClockMs, 1),
    error,
  };
}

export function summarize(items) {
  const requestSucceeded = items.filter((item) => item.requestSuccess).length;
  const nonEmpty = items.filter((item) => item.requestSuccess && item.transcript).length;
  return {
    total: items.length,
    requestSucceeded,
    requestFailed: items.length - requestSucceeded,
    nonEmpty,
    empty: requestSucceeded - nonEmpty,
    totalAudioSeconds: round(items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0), 3),
    totalInferenceSeconds: round(items.reduce((sum, item) => sum + (item.inferenceSeconds ?? 0), 0), 3),
  };
}

function tableText(value, limit = 120) {
  const text = String(value ?? '').replaceAll('|', '\\|').replace(/\s+/gu, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function buildMarkdownReport(report) {
  const { meta, summary, items } = report;
  const lines = [
    '# Local FunASR App Benchmark',
    '',
    `- generatedAt: ${meta.generatedAt}`,
    `- mode: ${meta.mode}`,
    `- inputDir: ${meta.inputDir}`,
    `- targetSampleRate: ${meta.targetSampleRate}`,
    `- health: reachable=${meta.health.reachable} state=${meta.health.state ?? '-'} latency=${meta.health.latencyMs}ms${meta.health.error ? ` error=${meta.health.error}` : ''}`,
    '',
    `- total: ${summary.total}`,
    `- requestSucceeded: ${summary.requestSucceeded}`,
    `- requestFailed: ${summary.requestFailed}`,
    `- nonEmpty: ${summary.nonEmpty}`,
    `- empty: ${summary.empty}`,
    `- totalAudioSeconds: ${summary.totalAudioSeconds ?? '-'}`,
    `- totalInferenceSeconds: ${summary.totalInferenceSeconds ?? '-'}`,
    '',
    '| # | file | duration(s) | inference(s) | total(s) | status | transcript |',
    '|---:|---|---:|---:|---:|---|---|',
  ];
  items.forEach((item, index) => {
    lines.push(`| ${index + 1} | ${item.name} | ${item.durationSeconds ?? '-'} | ${item.inferenceSeconds ?? '-'} | ${item.totalSeconds ?? '-'} | ${item.status} | ${tableText(item.transcript)} |`);
  });
  lines.push('');
  for (const item of items.filter((entry) => entry.error)) {
    lines.push(`- ${item.name}: ${item.error}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const manifest = await buildManifest(options.inputDir);
  const entries = options.mode === 'smoke' ? manifest.slice(0, 3) : manifest;

  const health = await healthCheck();
  const provider = loadProvider();

  const startedAt = new Date().toISOString();
  const items = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    process.stdout.write(`[${index + 1}/${entries.length}] ${entry.name}\n`);
    try {
      const item = await transcribeEntry({ entry, provider });
      items.push(item);
      process.stdout.write(`  -> ${item.status} dur=${item.durationSeconds}s inf=${item.inferenceSeconds ?? '-'}s total=${item.totalSeconds ?? '-'}s\n`);
    } catch (error) {
      items.push({
        name: entry.name,
        path: entry.path,
        group: entry.group,
        status: 'failed',
        requestSuccess: false,
        transcriptNonEmpty: false,
        transcript: '',
        durationSeconds: null,
        sourceSampleRate: null,
        sourceChannels: null,
        sourceContainer: null,
        inferenceSeconds: null,
        totalSeconds: null,
        requestLatencyMs: null,
        wallClockMs: null,
        error: safeError(error),
      });
      process.stdout.write(`  -> failed: ${safeError(error)}\n`);
    }
  }

  const summary = summarize(items);
  const report = {
    meta: {
      generatedAt: startedAt,
      finishedAt: new Date().toISOString(),
      mode: options.mode,
      inputDir: options.inputDir,
      targetSampleRate: TARGET_SAMPLE_RATE,
      chunkBytes: CHUNK_BYTES,
      health,
    },
    summary,
    items,
  };

  const outputDir = buildRunDirectory(options.outputRoot);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(outputDir, 'report.md'), buildMarkdownReport(report), 'utf8');

  process.stdout.write(`\nCOMPLETE total=${summary.total} request_ok=${summary.requestSucceeded} non_empty=${summary.nonEmpty} empty=${summary.empty} failed=${summary.requestFailed}\n`);
  process.stdout.write(`OUTPUT=${outputDir}\n`);
  return summary.requestFailed > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`[local-funasr-app-benchmark] ${safeError(error)}`);
      process.exitCode = 1;
    },
  );
}
