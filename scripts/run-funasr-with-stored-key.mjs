import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { app } from 'electron';

const require = createRequire(import.meta.url);
const command = process.argv.find(value => ['probe', 'vocabulary', 'benchmark'].includes(value));
if (!['probe', 'vocabulary', 'benchmark'].includes(command)) {
  throw new Error('usage: electron run-funasr-with-stored-key.mjs <probe|vocabulary|benchmark> [args]');
}

const configuredUserData = path.join(process.env.APPDATA || '', 'natively');
app.disableHardwareAcceleration();
app.setName('Natively');
app.setPath('userData', configuredUserData);
process.stdout.write('[stored-key-runner] starting\n');
await Promise.race([
  app.whenReady(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Electron app readiness timed out')), 15_000)),
]);

try {
  const { CredentialsManager } = require('../dist-electron/electron/services/CredentialsManager.js');
  const manager = CredentialsManager.getInstance();
  manager.init();
  const storedKey = manager.getStoredSttKeyForProvider('alibaba-fun-asr');
  if (!storedKey?.trim()) throw new Error('No Alibaba Fun-ASR key is stored in the App');

  if (command === 'probe') {
    const envKey = process.env.DASHSCOPE_API_KEY?.trim() || '';
    const digest = value => createHash('sha256').update(value).digest('hex');
    process.stdout.write(`${JSON.stringify({ storedKeyPresent: true, sameAsEnvironment: Boolean(envKey) && digest(envKey) === digest(storedKey) })}\n`);
  } else {
    process.env.DASHSCOPE_API_KEY = storedKey.trim();
    process.argv.splice(process.argv.indexOf(command), 1);
    if (command === 'vocabulary') {
      const { main } = await import('./alibaba-funasr-vocabulary.mjs');
      await main();
    } else {
      const { main } = await import('./run-funasr-audio-benchmark.mjs');
      await main();
    }
  }
} finally {
  app.exit(0);
}
