import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePcmWav,
  resampleMono,
  buildTranscriptRecord,
  buildTranscriptionOptions,
} from '../transcribe-audio.mjs';

function makePcmWav({ sampleRate = 8000, channels = 1, samples }) {
  const data = Buffer.from(samples.flatMap((sample) => {
    const values = Array.isArray(sample) ? sample : [sample];
    return values.flatMap((value) => [value & 0xff, (value >> 8) & 0xff]);
  }));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('decodes 16-bit PCM WAV and mixes stereo to mono', () => {
  const wav = makePcmWav({
    sampleRate: 8000,
    channels: 2,
    samples: [[1000, -1000], [2000, 0]],
  });

  const decoded = decodePcmWav(wav);

  assert.equal(decoded.sampleRate, 8000);
  assert.deepEqual(Array.from(decoded.samples), [0, 1000 / 32768]);
});

test('resamples mono audio to the target sample rate', () => {
  const output = resampleMono(Float32Array.from([0, 1, 0, -1]), 4, 8);
  assert.equal(output.length, 8);
  assert.equal(output[0], 0);
  assert.ok(output.some((value) => value > 0.9));
  assert.ok(output.some((value) => value < -0.9));
});

test('builds a stable transcript record for later question retrieval', () => {
  const record = buildTranscriptRecord({
    input: 'question.wav',
    model: 'Xenova/whisper-tiny',
    language: 'zh',
    text: '请解释 SPI 的 CRC32 校验。',
    durationSeconds: 2.5,
  });

  assert.deepEqual(record, {
    input: 'question.wav',
    model: 'Xenova/whisper-tiny',
    language: 'zh',
    text: '请解释 SPI 的 CRC32 校验。',
    durationSeconds: 2.5,
  });
});

test('passes the requested Whisper language directly to the pipeline', () => {
  assert.deepEqual(buildTranscriptionOptions('zh'), { language: 'zh', task: 'transcribe' });
  assert.deepEqual(buildTranscriptionOptions('auto'), { task: 'transcribe' });
});
