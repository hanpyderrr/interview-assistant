#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { pipeline } from '@huggingface/transformers';

const TARGET_SAMPLE_RATE = 16_000;
const DEFAULT_MODEL = 'Xenova/whisper-tiny';

function readAscii(buffer, offset, length) {
  return buffer.toString('ascii', offset, offset + length);
}

/** Decode little-endian 16-bit PCM WAV into mono Float32 samples. */
export function decodePcmWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new Error('Input is not a valid WAV file: file is too short');
  }
  if (readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 4) !== 'WAVE') {
    throw new Error('Only RIFF/WAVE audio is supported');
  }

  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = readAscii(buffer, offset, 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) throw new Error('WAV chunk exceeds file length');
    if (id === 'fmt ') format = buffer.subarray(start, end);
    if (id === 'data') data = buffer.subarray(start, end);
    offset = end + (size % 2);
  }

  if (!format || format.length < 16 || !data) {
    throw new Error('WAV file must contain fmt and data chunks');
  }
  const audioFormat = format.readUInt16LE(0);
  const channels = format.readUInt16LE(2);
  const sampleRate = format.readUInt32LE(4);
  const bitsPerSample = format.readUInt16LE(14);
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new Error('Only uncompressed 16-bit PCM WAV is supported');
  }
  if (channels < 1 || channels > 2 || sampleRate < 1) {
    throw new Error('WAV must have one or two channels and a valid sample rate');
  }
  const bytesPerFrame = channels * 2;
  if (data.length % bytesPerFrame !== 0) throw new Error('WAV data is not frame-aligned');

  const frameCount = data.length / bytesPerFrame;
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += data.readInt16LE((frame * channels + channel) * 2) / 32768;
    }
    samples[frame] = sum / channels;
  }
  return { sampleRate, channels, samples };
}

/** Linear resampling, sufficient for speech preprocessing at this stage. */
export function resampleMono(samples, sourceRate, targetRate = TARGET_SAMPLE_RATE) {
  if (!(samples instanceof Float32Array) || samples.length === 0) return new Float32Array();
  if (sourceRate === targetRate) return samples.slice();
  const outputLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const output = new Float32Array(outputLength);
  const scale = sourceRate / targetRate;
  for (let i = 0; i < outputLength; i += 1) {
    const sourcePosition = i * scale;
    const left = Math.floor(sourcePosition);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = sourcePosition - left;
    output[i] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

export function buildTranscriptRecord({ input, model, language, text, durationSeconds }) {
  return { input, model, language, text, durationSeconds };
}

export function buildTranscriptionOptions(language) {
  return language === 'auto'
    ? { task: 'transcribe' }
    : { language, task: 'transcribe' };
}

function parseArgs(argv) {
  const options = { model: DEFAULT_MODEL, language: 'auto', outputDir: null, input: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--model') options.model = argv[++i];
    else if (arg === '--language') options.language = argv[++i];
    else if (arg === '--output-dir') options.outputDir = argv[++i];
    else if (!arg.startsWith('-') && !options.input) options.input = arg;
    else if (arg === '--help') return null;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.input) throw new Error('Usage: node scripts/transcribe-audio.mjs <file.wav> [--language zh] [--model MODEL] [--output-dir DIR]');
  return options;
}

async function transcribeFile(options) {
  const inputPath = path.resolve(options.input);
  const wav = decodePcmWav(await fs.readFile(inputPath));
  const audio = resampleMono(wav.samples, wav.sampleRate, TARGET_SAMPLE_RATE);
  const transcriber = await pipeline('automatic-speech-recognition', options.model);
  const generateKwargs = buildTranscriptionOptions(options.language);
  const result = await transcriber(audio, {
    sampling_rate: TARGET_SAMPLE_RATE,
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
    ...generateKwargs,
  });
  const text = typeof result === 'string' ? result : (result?.text ?? '');
  const durationSeconds = Number((wav.samples.length / wav.sampleRate).toFixed(3));
  const record = buildTranscriptRecord({
    input: path.basename(inputPath),
    model: options.model,
    language: options.language,
    text: text.trim(),
    durationSeconds,
  });
  const outputDir = path.resolve(options.outputDir ?? path.dirname(inputPath));
  await fs.mkdir(outputDir, { recursive: true });
  const stem = path.basename(inputPath, path.extname(inputPath));
  await fs.writeFile(path.join(outputDir, `${stem}.txt`), `${record.text}\n`, 'utf8');
  await fs.writeFile(path.join(outputDir, `${stem}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options) {
      console.log('Usage: node scripts/transcribe-audio.mjs <file.wav> [--language zh] [--model MODEL] [--output-dir DIR]');
      process.exit(0);
    }
    const record = await transcribeFile(options);
    console.log(JSON.stringify(record, null, 2));
  } catch (error) {
    console.error(`[transcribe-audio] ${error.message}`);
    process.exitCode = 1;
  }
}
