#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export function buildChatRequest(request, model) {
  if (!request?.system || !request?.user) throw new Error('request JSON must contain system and user');
  return {
    model,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    temperature: 0.2,
  };
}

export function extractAnswer(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('provider response did not contain an answer');
  return content.trim();
}

export async function generateAnswer(request, {
  baseUrl = DEFAULT_BASE_URL,
  apiKey,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
  signal,
} = {}) {
  if (!apiKey) throw new Error('INTERVIEW_LLM_API_KEY is required');
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildChatRequest(request, model)),
    signal,
  });
  if (!response.ok) throw new Error(`provider request failed (${response.status})`);
  const payload = await response.json();
  return { answer: extractAnswer(payload), model, endpoint: url };
}

async function main(argv) {
  const input = argv[0];
  if (!input) throw new Error('Usage: node scripts/generate-interview-answer.mjs <request.json> [output.json]');
  const requestText = await fs.readFile(path.resolve(input), 'utf8');
  const request = JSON.parse(requestText.replace(/^\uFEFF/, ''));
  const result = await generateAnswer(request, {
    baseUrl: process.env.INTERVIEW_LLM_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.INTERVIEW_LLM_API_KEY,
    model: process.env.INTERVIEW_LLM_MODEL || DEFAULT_MODEL,
  });
  const output = path.resolve(argv[1] || `${input.replace(/\.json$/i, '')}-answer.json`);
  await fs.writeFile(output, `${JSON.stringify({ ...result, question: request.user }, null, 2)}\n`, 'utf8');
  console.log(`Saved answer to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[generate-interview-answer] ${error.message}`);
    process.exitCode = 1;
  });
}
