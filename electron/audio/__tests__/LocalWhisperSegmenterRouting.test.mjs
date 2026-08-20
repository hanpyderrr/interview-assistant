import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..', '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

test('baseline and candidate share the 14 second segment limit', () => {
  const vad = read('electron/audio/whisper/vadProcessor.ts');
  const local = read('electron/audio/LocalWhisperSTT.ts');
  assert.match(vad, /MAX_SPEECH_MS\s*=\s*14000/);
  assert.match(local, /MAX_SEGMENT_MS\s*=\s*14000/);
});

test('LocalWhisperSTT has a selectable candidate segmenter and speech-ended flush', () => {
  const local = read('electron/audio/LocalWhisperSTT.ts');
  assert.match(local, /MeetilyVadProcessor/);
  assert.match(local, /notifySpeechEnded\s*\(/);
  assert.match(local, /segmenterMode/);
});

test('the persisted segmenter profile is exposed through the existing channel config', () => {
  const settings = read('electron/services/SettingsManager.ts');
  const ipc = read('electron/ipcHandlers.ts');
  const preload = read('electron/preload.ts');
  const rendererTypes = read('src/types/electron.d.ts');
  assert.match(settings, /localWhisperSegmenter/);
  assert.match(ipc, /segmenterMode/);
  assert.match(preload, /segmenterMode/);
  assert.match(rendererTypes, /localWhisperGetChannelConfig|localWhisperSetChannelConfig|audioStartMs/);
});

test('transcript IPC keeps optional segment timing metadata', () => {
  const main = read('electron/main.ts');
  const rendererTypes = read('src/types/electron.d.ts');
  assert.match(main, /audioStartMs/);
  assert.match(main, /audioEndMs/);
  assert.match(rendererTypes, /audioStartMs/);
});

test('records each PCM chunk before dispatching mapped segments from a write', () => {
  const local = read('electron/audio/LocalWhisperSTT.ts');
  assert.match(
    local,
    /const chunkDurationMs = \(f32\.length \/ 16000\) \* 1000;\s*this\.captureTimeline\?\.appendChunk\(chunkDurationMs, performance\.now\(\)\);\s*const segs[\s\S]{0,120}?this\.sessionAudioMs \+= chunkDurationMs;\s*segs\.forEach\(s => this\.dispatchSegment\(s\)\)/,
  );
});

test('prunes the capture ledger only after every segment from the write is mapped', () => {
  const local = read('electron/audio/LocalWhisperSTT.ts');
  const dispatchIndex = local.indexOf('segs.forEach(s => this.dispatchSegment(s))');
  const pruneIndex = local.indexOf('this.captureTimeline?.pruneBefore(');
  assert.ok(dispatchIndex >= 0);
  assert.ok(pruneIndex > dispatchIndex);
});

test('old worker lifecycle callbacks cannot mutate a replacement worker', () => {
  const local = read('electron/audio/LocalWhisperSTT.ts');
  assert.match(local, /const worker = this\.worker;/);
  assert.match(local, /if \(this\.worker !== worker(?: \|\| this\.sessionGeneration !== sessionId)?\) return;/);
  assert.match(local, /w\.removeAllListeners\('exit'\)/);
});

test('finals and worker callbacks are isolated by session generation', () => {
  const local = read('electron/audio/LocalWhisperSTT.ts');
  assert.match(local, /private sessionGeneration = 0/);
  assert.match(local, /beginSession\(meetingGeneration: number, originMonotonicMs: number\)/);
  assert.match(local, /const sessionId = this\.sessionGeneration/);
  assert.match(local, /sessionId: this\.sessionGeneration/);
  assert.match(local, /metadata\.sessionId !== this\.sessionGeneration/);
  assert.match(local, /filter\(\(\{ metadata \}\) => metadata\.sessionId === this\.sessionGeneration\)/);
  assert.match(local, /spawnWorker\(sessionId\)/);
  assert.match(local, /attachWorkerListeners\(sessionId\)/);
});

test('starting a new session disposes stale workers and pending finals', () => {
  const local = read('electron/audio/LocalWhisperSTT.ts');
  assert.match(local, /const staleWorker = this\.worker/);
  assert.match(local, /this\.beginWorkerTermination\(staleWorker, true\)/);
  assert.match(local, /this\.pendingAudio = \[\]/);
});

test('worker termination timers are tracked per worker and release slots after termination', () => {
  const local = read('electron/audio/LocalWhisperSTT.ts');
  assert.match(local, /workerTerminateTimers = new Map<Worker/);
  assert.match(local, /await w\.terminate\(\)/);
  assert.match(local, /release\?\.\(\)/);
});
