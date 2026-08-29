import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_INPUT_DIR,
  TARGET_SAMPLE_RATE,
  buildManifest,
  chunkPcm,
  decodeAudio,
  decodeSpherePcm,
  decodeWavPcm,
  discoverSplitEntries,
  float32ToS16le,
  parseArgs,
  resampleMono,
  summarize,
} from '../run-local-funasr-app-benchmark.mjs';

function makePcmWav({ sampleRate = 8000, channels = 1, bits = 16, samples }) {
  const bytesPerSample = bits / 8;
  const frameCount = samples.length;
  const data = Buffer.alloc(frameCount * channels * bytesPerSample);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const values = Array.isArray(samples[frame]) ? samples[frame] : [samples[frame]];
    for (let channel = 0; channel < channels; channel += 1) {
      const offset = (frame * channels + channel) * bytesPerSample;
      const value = values[channel];
      if (bits === 8) data.writeUInt8(value, offset);
      else if (bits === 16) data.writeInt16LE(value, offset);
      else if (bits === 24) data.writeIntLE(value, offset, 3);
      else data.writeInt32LE(value, offset);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function makeSphere({ sampleRate = 8000, channels = 2, sampleBytes = 1, samples }) {
  const frameCount = samples.length;
  const data = Buffer.alloc(frameCount * channels * sampleBytes);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const values = Array.isArray(samples[frame]) ? samples[frame] : [samples[frame]];
    for (let channel = 0; channel < channels; channel += 1) {
      const offset = (frame * channels + channel) * sampleBytes;
      if (sampleBytes === 1) data.writeInt8(values[channel], offset);
      else data.writeInt16LE(values[channel], offset);
    }
  }
  const header = Buffer.alloc(1024);
  header.write(
    [
      'NIST_1A',
      '   1024',
      `channel_count -i ${channels}`,
      `sample_rate -i ${sampleRate}`,
      'sample_coding -s3 pcm',
      `sample_n_bytes -i ${sampleBytes}`,
      `sample_sig_bits -i ${sampleBytes * 8}`,
      `sample_count -i ${frameCount}`,
      'end_head',
      '',
    ].join('\n'),
    0,
    'ascii',
  );
  return Buffer.concat([header, data]);
}

async function withFixture(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'funasr-app-bench-'));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('buildManifest yields exactly 53 entries in natural order', async () => {
  await withFixture(async (dir) => {
    for (const name of ['1.wav', '2.wav', '3.wav', '4-52.wav']) {
      await fs.writeFile(path.join(dir, name), '');
    }
    const splitDir = path.join(dir, 'split_004_052');
    await fs.mkdir(splitDir);
    for (let index = 4; index <= 52; index += 1) {
      await fs.writeFile(path.join(splitDir, `${String(index).padStart(3, '0')}.wav`), '');
    }

    const manifest = await buildManifest(dir);

    assert.equal(manifest.length, 53);
    assert.deepEqual(
      manifest.slice(0, 4).map((entry) => entry.name),
      ['1.wav', '2.wav', '3.wav', '4-52.wav'],
    );
    assert.deepEqual(
      manifest.slice(4).map((entry) => entry.name),
      Array.from({ length: 49 }, (_, i) => `split_${String(i + 4).padStart(3, '0')}.wav`),
    );
    assert.ok(manifest.slice(4).every((entry) => entry.group === 'split'));
  });
});

test('discoverSplitEntries prefers the original (non-converted) split directory', async () => {
  await withFixture(async (dir) => {
    const original = path.join(dir, 'split_004_052');
    const converted = path.join(dir, 'split_004_052_16k_mono');
    await fs.mkdir(original);
    await fs.mkdir(converted);
    for (const container of [original, converted]) {
      for (let index = 4; index <= 8; index += 1) {
        await fs.writeFile(path.join(container, `${String(index).padStart(3, '0')}.wav`), '');
      }
    }

    const entries = await discoverSplitEntries(dir);

    assert.equal(entries.length, 5);
    assert.ok(entries.every((entry) => entry.path.startsWith(`${original}${path.sep}`)));
    assert.deepEqual(
      entries.map((entry) => entry.index),
      [4, 5, 6, 7, 8],
    );
  });
});

test('decodes stereo 16-bit RIFF WAV to mono', () => {
  const wav = makePcmWav({
    sampleRate: 8000,
    channels: 2,
    bits: 16,
    samples: [[1000, -1000], [2000, 0]],
  });
  const decoded = decodeWavPcm(wav);
  assert.equal(decoded.sampleRate, 8000);
  assert.equal(decoded.channels, 2);
  assert.equal(decoded.samples.length, 2);
  assert.equal(decoded.samples[0], 0);
  assert.equal(decoded.samples[1], 1000 / 32768);
});

test('decodes 8-bit unsigned RIFF WAV to mono float', () => {
  const wav = makePcmWav({ sampleRate: 8000, channels: 1, bits: 8, samples: [128, 0, 255] });
  const decoded = decodeWavPcm(wav);
  assert.equal(decoded.samples.length, 3);
  assert.equal(decoded.samples[0], 0);
  assert.equal(decoded.samples[1], -1);
  assert.equal(decoded.samples[2], 127 / 128);
});

test('decodes 8-bit NIST/SPHERE stereo to mono', () => {
  const sphere = makeSphere({
    sampleRate: 8000,
    channels: 2,
    sampleBytes: 1,
    samples: [[100, -100], [50, 50]],
  });
  const decoded = decodeSpherePcm(sphere);
  assert.equal(decoded.sampleRate, 8000);
  assert.equal(decoded.channels, 2);
  assert.equal(decoded.samples.length, 2);
  assert.equal(decoded.samples[0], 0);
  assert.equal(decoded.samples[1], 50 / 128);
});

test('decodeAudio dispatches RIFF/WAVE and NIST/SPHERE containers', () => {
  const wav = makePcmWav({ channels: 1, bits: 16, samples: [1000] });
  assert.equal(decodeAudio(wav).sourceContainer, 'RIFF/WAVE');
  const sphere = makeSphere({ channels: 1, sampleBytes: 1, samples: [[10]] });
  assert.equal(decodeAudio(sphere).sourceContainer, 'NIST/SPHERE');
});

test('resamples mono audio to the target sample rate', () => {
  const output = resampleMono(Float32Array.from([0, 1, 0, -1]), 4, 8);
  assert.equal(output.length, 8);
  assert.equal(output[0], 0);
  assert.ok(output.some((value) => value > 0.9));
  assert.ok(output.some((value) => value < -0.9));
  assert.equal(resampleMono(Float32Array.from([1, 2, 3]), 8000, 8000).length, 3);
});

test('converts float32 samples to s16le PCM', () => {
  const pcm = float32ToS16le(Float32Array.from([0, 1, -1, 0.5]));
  assert.equal(pcm.length, 8);
  assert.equal(pcm.readInt16LE(0), 0);
  assert.equal(pcm.readInt16LE(2), 32767);
  assert.equal(pcm.readInt16LE(4), -32768);
  assert.equal(pcm.readInt16LE(6), Math.round(0.5 * 32767));
});

test('chunks PCM into fixed-size slices that round-trip', () => {
  const pcm = Buffer.from([1, 2, 3, 4, 5, 6, 7]);
  const chunks = chunkPcm(pcm, 3);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [3, 3, 1]);
  assert.deepEqual(Buffer.concat(chunks), pcm);
});

test('parseArgs defaults to full mode and honours --smoke', () => {
  const full = parseArgs([]);
  assert.equal(full.mode, 'full');
  assert.equal(full.inputDir, DEFAULT_INPUT_DIR);
  const smoke = parseArgs(['--smoke']);
  assert.equal(smoke.mode, 'smoke');
  assert.equal(TARGET_SAMPLE_RATE, 16_000);
});

test('summary distinguishes a successful empty transcript from transport failure', () => {
  const summary = summarize([
    { requestSuccess: true, transcript: '问题', durationSeconds: 1, inferenceSeconds: 0.2 },
    { requestSuccess: true, transcript: '', durationSeconds: 1, inferenceSeconds: 0.1 },
    { requestSuccess: false, transcript: '', durationSeconds: 1, inferenceSeconds: null },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.requestSucceeded, 2);
  assert.equal(summary.nonEmpty, 1);
  assert.equal(summary.empty, 1);
  assert.equal(summary.requestFailed, 1);
});

test('real audio directory manifests to exactly 53 entries', { skip: !existsSync(DEFAULT_INPUT_DIR) }, async () => {
  const manifest = await buildManifest(DEFAULT_INPUT_DIR);
  assert.equal(manifest.length, 53);
});
