import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
const credentialsSource = readFileSync(new URL('../../services/CredentialsManager.ts', import.meta.url), 'utf8');
const interfaceSource = readFileSync(new URL('../../../src/components/NativelyInterface.tsx', import.meta.url), 'utf8');

test('credentials persist local-funasr as an additive STT provider', () => {
  const occurrences = credentialsSource.match(/'local-funasr'/g) ?? [];
  assert.ok(occurrences.length >= 3, 'StoredCredentials, getter, and setter must all accept local-funasr');
});

test('main creates the two local channels from one provider pair', () => {
  assert.match(mainSource, /createLocalFunAsrProviderPair/);
  assert.match(mainSource, /private localFunAsrPair: LocalFunAsrProviderPair \| null = null/);
  assert.match(mainSource, /sttProvider === 'local-funasr'/);
  assert.match(mainSource, /return this\.localFunAsrPair!\[speaker\]/);
  assert.match(mainSource, /configureSTTProvider\(pair\.interviewer, 'interviewer', 'local-funasr'/);
  assert.match(mainSource, /configureSTTProvider\(pair\.user, 'user', 'local-funasr'/);
});

test('local service is made ready for startup, meeting start, resume, and reconfigure', () => {
  assert.match(mainSource, /localFunAsrServiceManager\.ensureReady/);
  assert.match(mainSource, /private async ensureLocalFunAsrReady/);
  assert.match(mainSource, /await this\.ensureLocalFunAsrReady\('meeting start'\)/);
  assert.match(mainSource, /await this\.ensureLocalFunAsrReady\('resume'\)/);
  assert.match(mainSource, /await this\.ensureLocalFunAsrReady\('provider reconfigure'\)/);
  assert.match(mainSource, /\[Init\] Local FunASR service prewarm failed/);
});

test('pair sessions are rebound after meeting generation, resume, and reconfigure', () => {
  const beginCalls = mainSource.match(/localFunAsrPair\?\.beginSession/g) ?? [];
  assert.ok(beginCalls.length >= 3, 'meeting start, resume, and reconfigure must begin pair sessions');
  const nullResets = mainSource.match(/this\.localFunAsrPair = null/g) ?? [];
  assert.ok(nullResets.length >= 3, 'failure, resume, reconfigure, and teardown paths must release the pair');
});

test('resume binds local FunASR before restarted microphone capture can emit PCM', () => {
  const resumeStart = mainSource.indexOf('public async restartCapturesAfterResume');
  const resumeEnd = mainSource.indexOf('private broadcastDeviceSelection', resumeStart);
  const resumeSource = mainSource.slice(resumeStart, resumeEnd);
  const bindIndex = resumeSource.indexOf("this.googleSTT = this.createSTTProvider('interviewer')");
  const beginIndex = resumeSource.indexOf('this.localFunAsrPair?.beginSession');
  const micStartIndex = resumeSource.indexOf('this.microphoneCapture.start()');
  assert.ok(bindIndex >= 0 && beginIndex >= 0 && micStartIndex >= 0);
  assert.ok(bindIndex < micStartIndex, 'provider must exist before microphone restart');
  assert.ok(beginIndex < micStartIndex, 'capture session must be open before microphone restart');
});

test('generic final drain remains Promise-aware for the local final-only provider', () => {
    assert.match(mainSource, /Promise\.resolve\(provider\.finalize\?\.\(\)\)/);
    assert.match(mainSource, /provider\.drainTimeoutMs/);
    assert.match(mainSource, /waitForSttDrain\(finishPromises, sttDrainTimeoutMs/);
});

test('manual answer flushes and awaits local final-only STT without closing its write gate', () => {
    assert.match(mainSource, /flush\?: \(\) => void \| Promise<void>/);
    assert.match(mainSource, /public async finalizeMicSTT\(\): Promise<void>/);
    assert.match(mainSource, /await this\.googleSTT_User\.flush\(\)/);
    assert.match(interfaceSource, /await window\.electronAPI\.finalizeMicSTT\(\)/);
});
