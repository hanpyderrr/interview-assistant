import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCAL_FUNASR_ORIGIN,
  LocalFunAsrServiceManager,
  assertLoopbackFunAsrOrigin,
  parseLocalFunAsrHealth,
} from '../../../dist-electron/electron/audio/localFunAsrServiceManager.js';

test('accepts only the fixed loopback FunASR origin', () => {
  assert.equal(assertLoopbackFunAsrOrigin(LOCAL_FUNASR_ORIGIN), LOCAL_FUNASR_ORIGIN);
  assert.throws(() => assertLoopbackFunAsrOrigin('http://localhost:8765'), /127\.0\.0\.1/);
  assert.throws(() => assertLoopbackFunAsrOrigin('http://example.com'), /127\.0\.0\.1/);
});

test('rejects malformed optional health metrics before the renderer can format them', () => {
  assert.throws(
    () => parseLocalFunAsrHealth({
      state: 'ready', status: '已就绪', detail: '', cuda_memory_current_mib: '3339',
    }),
    /格式无效/,
  );
  assert.throws(
    () => parseLocalFunAsrHealth({
      state: 'ready', status: '已就绪', detail: '', request_count: -1,
    }),
    /格式无效/,
  );
});

test('returns immediately without launching when the service is ready', async () => {
  let launchCount = 0;
  const manager = new LocalFunAsrServiceManager({
    readHealth: async () => ({ state: 'ready', status: '已就绪', detail: '' }),
    launchService: () => { launchCount += 1; },
    sleep: async () => {},
    platform: 'win32',
  });

  const health = await manager.ensureReady();
  assert.equal(health.state, 'ready');
  assert.equal(launchCount, 0);
});

test('launches once on Windows, polls loading, and deduplicates concurrent callers', async () => {
  let launchCount = 0;
  let healthCount = 0;
  const manager = new LocalFunAsrServiceManager({
    readHealth: async () => {
      healthCount += 1;
      if (healthCount === 1) throw new Error('ECONNREFUSED');
      if (healthCount === 2) return { state: 'loading', status: '加载中', detail: '' };
      return { state: 'ready', status: '已就绪', detail: '' };
    },
    launchService: () => { launchCount += 1; },
    sleep: async () => {},
    platform: 'win32',
  });

  const [first, second] = await Promise.all([
    manager.ensureReady({ pollIntervalMs: 1, timeoutMs: 1000 }),
    manager.ensureReady({ pollIntervalMs: 1, timeoutMs: 1000 }),
  ]);

  assert.equal(first.state, 'ready');
  assert.equal(second.state, 'ready');
  assert.equal(launchCount, 1);
  assert.equal(healthCount, 3);
});

test('surfaces model load failures and does not relaunch an occupied failed service', async () => {
  let launchCount = 0;
  const manager = new LocalFunAsrServiceManager({
    readHealth: async () => ({ state: 'failed', status: '加载失败', detail: 'CUDA OOM' }),
    launchService: () => { launchCount += 1; },
    sleep: async () => {},
    platform: 'win32',
  });

  await assert.rejects(() => manager.ensureReady(), /CUDA OOM/);
  assert.equal(launchCount, 0);
});

test('does not attempt Windows launch on unsupported platforms', async () => {
  let launchCount = 0;
  const manager = new LocalFunAsrServiceManager({
    readHealth: async () => { throw new Error('ECONNREFUSED'); },
    launchService: () => { launchCount += 1; },
    sleep: async () => {},
    platform: 'linux',
  });

  await assert.rejects(() => manager.ensureReady(), /Windows/);
  assert.equal(launchCount, 0);
});
