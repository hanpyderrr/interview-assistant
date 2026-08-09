import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sttPath = path.resolve(__dirname, '../../audio/LocalWhisperSTT.ts');
const onnxPath = path.resolve(__dirname, '../../utils/onnxThreadConfig.ts');
const sttSource = fs.readFileSync(sttPath, 'utf8');
const dispatchStart = sttSource.indexOf('    private dispatchFinal(audio: Float32Array, metadata: FinalSegmentMetadata): void {');
const dispatchEnd = sttSource.indexOf('    private sendTranscribe(audio: Float32Array, streaming: boolean, taskId?: string): void {', dispatchStart);
const dispatchSource = dispatchStart >= 0 && dispatchEnd > dispatchStart ? sttSource.slice(dispatchStart, dispatchEnd) : sttSource;
const onnxSource = fs.readFileSync(onnxPath, 'utf8');
const mainPath = path.resolve(__dirname, '../../main.ts');
const mainSource = fs.readFileSync(mainPath, 'utf8');
const startMeetingStart = mainSource.indexOf('          // Start Microphone FIRST.');
const startMeetingEnd = mainSource.indexOf('        // Start JIT RAG live indexing', startMeetingStart);
const startOrderSource = startMeetingStart >= 0 && startMeetingEnd > startMeetingStart
  ? mainSource.slice(startMeetingStart, startMeetingEnd)
  : mainSource;

test('LocalWhisperSTT diagnostic logs identify channel, slot wait, worker readiness, and pending finals', () => {
  assert.match(sttSource, /getOnnxGateSnapshot/, 'STT should import ONNX gate snapshot diagnostics');
  assert.match(sttSource, /onnx slot request[\s\S]*this\.diagnosticLabel\(\)/, 'slot request log should include the STT channel label');
  assert.match(sttSource, /onnx slot acquired[\s\S]*waitMs[\s\S]*snapshot/, 'slot acquisition log should include wait time and gate snapshot');
  assert.match(sttSource, /worker ready[\s\S]*pendingFinals/, 'worker ready log should include queued final count');
  assert.match(sttSource, /final queued[\s\S]*pendingFinals/, 'final queue log should include the pending final count');
  assert.match(sttSource, /final dispatch[\s\S]*samples/, 'final dispatch log should include audio size before worker postMessage');
});

test('ONNX gate exposes a read-only snapshot for runtime diagnostics', () => {
  assert.match(onnxSource, /export interface OnnxGateSnapshot/);
  assert.match(onnxSource, /export function getOnnxGateSnapshot\(\): OnnxGateSnapshot/);
  assert.doesNotMatch(onnxSource, /getOnnxGateSnapshot\(\)[\s\S]{0,240}\+\+/, 'snapshot helper must not mutate semaphore counters');
});

test('LocalWhisperSTT preserves finals that arrive before worker construction completes', () => {
  assert.ok(dispatchStart >= 0, 'dispatchFinal should exist');
  assert.doesNotMatch(dispatchSource, /if \(!this\.worker\) return;/, 'finals must not be dropped when the worker is still spawning');
  assert.match(dispatchSource, /if \(!this\.worker \|\| !this\.workerReady\) \{[\s\S]*?this\.pendingAudio\.push\(\{\s*audio: audio\.slice\(\),\s*metadata\s*\}\);/, 'pre-worker finals should be buffered into pendingAudio with metadata');
});

test('startMeeting starts system STT before user STT so interviewer audio can claim the ONNX slot first', () => {
  assert.ok(startMeetingStart >= 0, 'startMeeting audio init block should exist');
  const systemSttIdx = startOrderSource.indexOf('this.googleSTT?.start();');
  const userSttIdx = startOrderSource.indexOf('this.googleSTT_User?.start();');
  assert.ok(systemSttIdx >= 0, 'system STT start should exist');
  assert.ok(userSttIdx >= 0, 'user STT start should exist');
  assert.ok(systemSttIdx < userSttIdx, 'system STT must start before user STT');
});
