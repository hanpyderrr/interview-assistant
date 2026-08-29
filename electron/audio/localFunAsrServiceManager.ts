import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { LOCAL_FUNASR_ORIGIN } from './LocalFunAsrSTT';

const DEFAULT_SERVICE_ROOT = 'E:\\workspace\\funasr-local';
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const HEALTH_REQUEST_TIMEOUT_MS = 5_000;

export type LocalFunAsrHealthState = 'loading' | 'ready' | 'failed';

export interface LocalFunAsrHealth {
  state: LocalFunAsrHealthState;
  status: string;
  detail: string;
  model_load_seconds?: number | null;
  warmup_seconds?: number | null;
  request_count?: number;
  success_count?: number;
  failure_count?: number;
  cuda_memory_current_mib?: number | null;
  cuda_memory_peak_mib?: number | null;
}

export interface EnsureLocalFunAsrOptions {
  autoStart?: boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface LocalFunAsrServiceManagerDependencies {
  readHealth?: () => Promise<LocalFunAsrHealth>;
  launchService?: () => void | Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  platform?: NodeJS.Platform;
  now?: () => number;
  serviceRoot?: string;
}

export function assertLoopbackFunAsrOrigin(origin: string): string {
  if (origin !== LOCAL_FUNASR_ORIGIN) {
    throw new Error(`本地 FunASR 仅允许连接 ${LOCAL_FUNASR_ORIGIN}`);
  }
  return origin;
}

function isOptionalFiniteMetric(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isOptionalCount(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}

function isHealth(value: unknown): value is LocalFunAsrHealth {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    (record.state === 'loading' || record.state === 'ready' || record.state === 'failed')
    && typeof record.status === 'string'
    && typeof record.detail === 'string'
    && isOptionalFiniteMetric(record, 'model_load_seconds')
    && isOptionalFiniteMetric(record, 'warmup_seconds')
    && isOptionalFiniteMetric(record, 'cuda_memory_current_mib')
    && isOptionalFiniteMetric(record, 'cuda_memory_peak_mib')
    && isOptionalCount(record, 'request_count')
    && isOptionalCount(record, 'success_count')
    && isOptionalCount(record, 'failure_count')
  );
}

export function parseLocalFunAsrHealth(value: unknown): LocalFunAsrHealth {
  if (!isHealth(value)) {
    throw new Error('本地 FunASR /health 返回格式无效');
  }
  return value;
}

async function fetchLocalFunAsrHealth(): Promise<LocalFunAsrHealth> {
  const origin = assertLoopbackFunAsrOrigin(LOCAL_FUNASR_ORIGIN);
  const response = await fetch(`${origin}/health`, {
    method: 'GET',
    signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`本地 FunASR 健康检查失败：HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  return parseLocalFunAsrHealth(body);
}

function launchWindowsService(serviceRoot: string): void {
  const scriptPath = path.join(serviceRoot, 'start-service.ps1');
  if (!existsSync(scriptPath)) {
    throw new Error(`未找到本地 FunASR 启动脚本：${scriptPath}`);
  }
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-Port', '8765',
      '-WaitTimeoutSeconds', '240',
    ],
    {
      cwd: serviceRoot,
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  child.on('error', (error) => {
    console.error('[LocalFunASR] 启动 PowerShell 失败:', error);
  });
  child.unref();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class LocalFunAsrServiceManager {
  private readonly readHealth: () => Promise<LocalFunAsrHealth>;
  private readonly launchService: () => void | Promise<void>;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly platform: NodeJS.Platform;
  private readonly now: () => number;
  private readinessPromise: Promise<LocalFunAsrHealth> | null = null;

  constructor(dependencies: LocalFunAsrServiceManagerDependencies = {}) {
    const serviceRoot = dependencies.serviceRoot ?? DEFAULT_SERVICE_ROOT;
    this.readHealth = dependencies.readHealth ?? fetchLocalFunAsrHealth;
    this.launchService = dependencies.launchService ?? (() => launchWindowsService(serviceRoot));
    this.sleep = dependencies.sleep ?? delay;
    this.platform = dependencies.platform ?? process.platform;
    this.now = dependencies.now ?? Date.now;
  }

  getHealth(): Promise<LocalFunAsrHealth> {
    return this.readHealth();
  }

  ensureReady(options: EnsureLocalFunAsrOptions = {}): Promise<LocalFunAsrHealth> {
    if (this.readinessPromise) return this.readinessPromise;
    const readiness = this.ensureReadyOnce(options);
    const trackedReadiness = readiness.finally(() => {
      if (this.readinessPromise === trackedReadiness) this.readinessPromise = null;
    });
    this.readinessPromise = trackedReadiness;
    return trackedReadiness;
  }

  private async ensureReadyOnce(options: EnsureLocalFunAsrOptions): Promise<LocalFunAsrHealth> {
    const autoStart = options.autoStart ?? true;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline = this.now() + timeoutMs;
    let health: LocalFunAsrHealth | null = null;

    try {
      health = await this.readHealth();
    } catch (error) {
      if (!autoStart) throw error;
      if (this.platform !== 'win32') {
        throw new Error('本地 FunASR 自动启动目前仅支持 Windows', { cause: error });
      }
      await this.launchService();
    }

    if (health?.state === 'ready') return health;
    if (health?.state === 'failed') {
      throw new Error(`本地 FunASR 模型加载失败：${health.detail || health.status}`);
    }

    while (this.now() <= deadline) {
      if (health?.state === 'loading') await this.sleep(pollIntervalMs);
      try {
        health = await this.readHealth();
      } catch {
        health = null;
        await this.sleep(pollIntervalMs);
        continue;
      }
      if (health.state === 'ready') return health;
      if (health.state === 'failed') {
        throw new Error(`本地 FunASR 模型加载失败：${health.detail || health.status}`);
      }
    }

    throw new Error(`等待本地 FunASR 就绪超过 ${Math.ceil(timeoutMs / 1000)} 秒`);
  }
}

export { LOCAL_FUNASR_ORIGIN };

export const localFunAsrServiceManager = new LocalFunAsrServiceManager();
