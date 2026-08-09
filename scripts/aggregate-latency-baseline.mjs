#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateLatencyRecords } from './lib/latency-baseline.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argValue(argv, name, fallback) {
  const index = argv.indexOf(`--${name}`);
  const value = argv[index + 1];
  return index >= 0 && value && !value.startsWith('--') ? value : fallback;
}

export function aggregateBaselineFile(inputPath, outputPath) {
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const summary = aggregateLatencyRecords(payload.records);
  const result = { source: path.resolve(inputPath), generatedAt: new Date().toISOString(), ...summary };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = path.resolve(argValue(process.argv.slice(2), 'input', path.resolve(repoRoot, 'reports', 'latency', 'latency-baseline.json')));
  const output = path.resolve(argValue(process.argv.slice(2), 'output', path.resolve(repoRoot, 'reports', 'latency', 'latency-summary.json')));
  try {
    console.log(JSON.stringify(aggregateBaselineFile(input, output), null, 2));
  } catch (error) {
    console.error('[aggregate-latency-baseline]', error?.stack || error?.message || error);
    process.exit(1);
  }
}
