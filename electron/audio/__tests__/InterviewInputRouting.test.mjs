import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const stateClass = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'AppState');
const names = new Set(['wireMicCapture', 'setCandidateCaptureEnabled', 'setupSystemAudioPipeline', 'reconfigureAudio', 'getMicrophoneStt', 'startMeeting', 'normalizeDeviceId']);
const members = stateClass.members.filter(n => names.has(n.name?.getText(ast))).map(n => n.getText(ast)).join('\n');
const js = ts.transpileModule(`class TestState { ${members} }; globalThis.TestState = TestState;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function harness(mode = 'microphone', candidate = false) {
  const stats = { screenChecks: 0, systemCaptures: 0, stops: 0, starts: 0 };
  class Capture extends EventEmitter {
    constructor(id) { super(); this.id = id; }
    getSampleRate() { return 16000; }
    getNativeSampleRate() { return 44100; }
    start() { stats.starts++; }
    stop() { stats.stops++; }
    async destroy() { this.removeAllListeners(); }
    disablePreWarm() {}
  }
  const provider = () => ({ chunks: [], rates: [], ends: 0, write(c) { this.chunks.push(c); }, setSampleRate(r) { this.rates.push(r); }, setAudioChannelCount() {}, notifySpeechEnded() { this.ends++; } });
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, process: { platform: 'darwin' }, Buffer, Date,
    setTimeout, clearTimeout, setImmediate,
    MicrophoneCapture: Capture,
    SystemAudioCapture: class extends Capture { constructor() { super(); stats.systemCaptures++; } },
    CredentialsManager: { getInstance: () => ({ getSttProvider: () => 'none' }) },
    AudioDevices: { getInputDevices: () => [{ id: 'default', name: 'Default' }, { id: 'iPhone', name: 'iPhone' }] },
    resolveMacScreenCaptureCapability: async () => { stats.screenChecks++; return { effectiveDenied: false }; },
    require: () => ({ CredentialsManager: { getInstance: () => ({ getSttProvider: () => 'test' }) } }),
  });
  vm.runInContext(js, context);
  const state = Object.assign(new context.TestState(), {
    interviewerAudioSource: mode, candidateCaptureEnabled: candidate, isMeetingActive: false,
    _lastRequestedInputDeviceId: 'iPhone', googleSTT: provider(), googleSTT_User: provider(),
    setupMicRecoveryHandler() {}, wireSystemCapture() {}, broadcastDeviceSelection() {},
    sendAudioCaptureFailed() {}, normalizeDeviceId: id => id && id !== 'default' ? id : undefined,
  });
  const capture = new Capture('iPhone'); state.microphoneCapture = capture;
  return { state, capture, stats };
}

test('USB input reaches interviewer PCM/rate/end even with candidate capture off', () => {
  const { state, capture } = harness(); state.wireMicCapture(capture);
  assert.equal(capture.canStart(), true);
  const chunk = Buffer.alloc(3200); chunk.writeInt16LE(100, 0);
  capture.emit('data', chunk); capture.emit('sample_rate_changed', 16000); capture.emit('speech_ended');
  assert.equal(state.googleSTT.chunks[0], chunk);
  assert.deepEqual(state.googleSTT.rates, [16000, 16000]);
  assert.equal(state.googleSTT.ends, 1);
  assert.equal(state.googleSTT_User.chunks.length, 0);
});
test('system mode still sends enabled microphone to candidate only', () => {
  const { state, capture } = harness('system', true); state.wireMicCapture(capture);
  capture.emit('data', Buffer.alloc(3200)); capture.emit('speech_ended');
  assert.equal(state.googleSTT.chunks.length, 0); assert.equal(state.googleSTT_User.chunks.length, 1);
  assert.equal(state.googleSTT_User.ends, 1);
});
test('system mode candidate opt-out blocks microphone start and PCM', () => {
  const { state, capture } = harness('system'); state.wireMicCapture(capture);
  assert.equal(capture.canStart(), false); capture.emit('data', Buffer.alloc(3200));
  assert.equal(state.googleSTT_User.chunks.length, 0);
});
test('candidate switch cannot stop the input used for interviewer questions', async () => {
  const { state, stats } = harness(); await state.setCandidateCaptureEnabled(false);
  assert.equal(stats.stops, 0);
});
test('candidate switch still stops personal microphone in system mode', async () => {
  const { state, stats } = harness('system'); await state.setCandidateCaptureEnabled(false);
  assert.equal(stats.stops, 1);
});
test('input pipeline never requests screen access or constructs system loopback', async () => {
  const { state, stats } = harness(); state.microphoneCapture = null;
  await state.setupSystemAudioPipeline();
  assert.equal(stats.screenChecks, 0); assert.equal(stats.systemCaptures, 0);
  assert.equal(state.microphoneCapture.id, 'iPhone');
});
test('explicit USB device configuration stays input-only', async () => {
  const { state, stats } = harness(); await state.reconfigureAudio('iPhone', 'default');
  assert.equal(state.microphoneCapture.id, 'iPhone');
  assert.equal(stats.screenChecks, 0); assert.equal(stats.systemCaptures, 0);
});
test('disconnected explicit input fails without silently choosing another microphone', async () => {
  const { state } = harness(); await assert.rejects(() => state.reconfigureAudio('missing-phone'), /设备|device/i);
  assert.equal(state.microphoneCapture.id, 'iPhone');
});

test('meeting start selects the USB source before applying candidate opt-out', async () => {
  const { state, stats } = harness('system');
  await assert.rejects(() => state.startMeeting({source:'microphone', audio:{inputDeviceId:'iPhone'}, captureCandidate:false}), {code:'stt-not-configured'});
  assert.equal(state.interviewerAudioSource, 'microphone');
  assert.equal(state._lastRequestedInputDeviceId, 'iPhone');
  assert.equal(stats.stops, 0);
});
test('missing input rejects at meeting start before opening STT', async () => {
  const { state } = harness('system');
  await assert.rejects(() => state.startMeeting({source:'microphone', audio:{inputDeviceId:'unplugged'}}), /设备/);
  assert.equal(state.interviewerAudioSource, 'system');
});
