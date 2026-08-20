import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compiledPath = path.resolve(
  __dirname,
  '../../../dist-electron/electron/audio/whisper/inferenceConfig.js',
);

test('NATIVELY_WHISPER_FORCE_CPU disables DirectML for local Whisper', async () => {
  const previous = process.env.NATIVELY_WHISPER_FORCE_CPU;
  process.env.NATIVELY_WHISPER_FORCE_CPU = '1';
  try {
    const moduleUrl = `${pathToFileURL(compiledPath).href}?force-cpu=${Date.now()}`;
    const { resolveInferenceConfig } = await import(moduleUrl);
    assert.deepEqual(resolveInferenceConfig().executionProviders, ['cpu']);
  } finally {
    if (previous === undefined) delete process.env.NATIVELY_WHISPER_FORCE_CPU;
    else process.env.NATIVELY_WHISPER_FORCE_CPU = previous;
  }
});
