#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_VOICE = 'alloy';
const DEFAULT_FORMAT = 'wav';
const AICODEMIRROR_OPENAI_BASE_URL = 'https://api.aicodemirror.ai/api/codex/backend-api/codex/v1';

function parseArgs(argv) {
  const options = {
    input: path.resolve('realtime_audio/humanized_questions_10.txt'),
    outputDir: path.resolve('realtime_audio/gpt-tts-recordings'),
    prefix: 'gpt-tts',
    model: process.env.OPENAI_TTS_MODEL || DEFAULT_MODEL,
    voice: process.env.OPENAI_TTS_VOICE || DEFAULT_VOICE,
    format: process.env.OPENAI_TTS_FORMAT || DEFAULT_FORMAT,
    provider: 'openai',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = path.resolve(argv[++index]);
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--prefix') options.prefix = argv[++index] || options.prefix;
    else if (arg === '--model') options.model = argv[++index] || options.model;
    else if (arg === '--voice') options.voice = argv[++index] || options.voice;
    else if (arg === '--format') options.format = argv[++index] || options.format;
    else if (arg === '--provider') options.provider = argv[++index] || options.provider;
    else if (arg === '--help') return null;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function getClient(options) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_TTS_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY or OPENAI_TTS_API_KEY is required');
  }
  const providerBaseUrl = options.provider === 'aicodemirror' ? AICODEMIRROR_OPENAI_BASE_URL : undefined;
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL
      || process.env.OPENAI_TTS_BASE_URL
      || providerBaseUrl
      || (process.env.OPENAI_TTS_PROVIDER === 'aicodemirror' ? AICODEMIRROR_OPENAI_BASE_URL : undefined),
  });
}

async function readQuestions(inputPath) {
  const text = await fs.readFile(inputPath, 'utf8');
  const questions = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!questions.length) throw new Error(`No questions found in ${inputPath}`);
  return questions;
}

function buildInstructions() {
  return [
    'Speak in natural Mandarin Chinese as a real technical interviewer.',
    'Use a conversational but clear tone.',
    'Keep technical terms clear: RK3568, C++, Qt, SPI, CRC32, POSIX, Buildroot Linux, UART, PWM, DMA.',
    'Avoid exaggerated acting, background noise, music, or dramatic emotion.',
    'Use mild natural pauses between clauses.',
  ].join(' ');
}

export async function generateGptTtsAudio(options) {
  const client = getClient(options);
  const questions = await readQuestions(options.input);
  await fs.mkdir(options.outputDir, { recursive: true });

  const manifest = [];
  for (let index = 0; index < questions.length; index += 1) {
    const input = questions[index];
    const fileName = `${options.prefix}-${String(index + 1).padStart(2, '0')}.${options.format}`;
    const outputPath = path.join(options.outputDir, fileName);
    const response = await client.audio.speech.create({
      model: options.model,
      voice: options.voice,
      input,
      response_format: options.format,
      instructions: buildInstructions(),
    });
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length === 0) throw new Error(`TTS returned empty audio for ${fileName}`);
    await fs.writeFile(outputPath, audio);
    manifest.push({
      file: fileName,
      model: options.model,
      voice: options.voice,
      format: options.format,
      input,
      bytes: audio.length,
    });
    console.log(`created ${fileName} (${audio.length} bytes)`);
  }

  const manifestPath = path.join(options.outputDir, `${options.prefix}-manifest.json`);
  await fs.writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), items: manifest }, null, 2)}\n`, 'utf8');
  console.log(`manifest ${manifestPath}`);
  return { manifestPath, items: manifest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    console.log('Usage: node scripts/generate-gpt-tts-audio.mjs [--input questions.txt] [--output-dir dir] [--prefix gpt-tts] [--model gpt-4o-mini-tts] [--voice alloy] [--provider openai|aicodemirror]');
    process.exit(0);
  }
  generateGptTtsAudio(options).catch((error) => {
    console.error(`[generate-gpt-tts-audio] ${error.message}`);
    process.exitCode = 1;
  });
}
