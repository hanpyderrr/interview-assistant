import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set([
  'latestSystemAudioPermissionWarning', 'screenCapabilityCache', 'SCREEN_CAPABILITY_CACHE_TTL_MS',
  'rememberSystemAudioPermissionWarning', 'clearSystemAudioPermissionWarning',
  'isDevTccBypassEnabled', 'getMacScreenCaptureStatus', 'resolveMacScreenCaptureCapability',
]);
const declarations = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(ast))))
).map(node => node.getText(ast)).join('\n');
const appState = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'AppState');
const startMeeting = appState.members.find(node => node.name?.getText(ast) === 'startMeeting');
const code = ts.transpileModule(`${declarations}\nclass TestState { ${appState.members.find(node => node.name?.getText(ast) === 'normalizeDeviceId').getText(ast)} ${startMeeting.getText(ast)} }
globalThis.resolveCapability = resolveMacScreenCaptureCapability;
globalThis.TestState = TestState;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function harness(initialStatus = 'denied', platform = 'darwin') {
  let status = initialStatus;
  let now = 0;
  let checks = 0;
  let probes = 0;
  const context = vm.createContext({
    process: { platform, env: {} }, app: { isPackaged: true },
    console: { log() {}, warn() {}, error() {} }, Date: { now: () => now },
    systemPreferences: { getMediaAccessStatus() { checks++; return status; } },
    desktopCapturer: { async getSources() { probes++; return [{ id: 'screen:1' }]; } },
    withTimeout: promise => promise,
    formatPermissionMessage: reason => reason, permissionTitleKey: reason => reason,
    logDevScreenTccBypassHint() {},
    CredentialsManager: { getInstance: () => ({ getSttProvider: () => 'none' }) },
  });
  vm.runInContext(code, context);
  return {
    resolve: options => context.resolveCapability('test', options),
    state: Object.assign(new context.TestState(), { isMeetingActive: false, _ambientChatEnabled: false, async setCandidateCaptureEnabled() {} }),
    setStatus(value) { status = value; }, advance(ms) { now += ms; },
    get checks() { return checks; }, get probes() { return probes; },
  };
}

for (const status of ['denied', 'restricted', 'not-determined']) {
  test(`${status} never invokes protected screen capture, including repeated checks`, async () => {
    const h = harness(status);
    for (let i = 0; i < 3; i++) {
      const result = await h.resolve({ bypassCache: true });
      assert.equal(result.effectiveDenied, true);
      assert.equal(result.capturable, false);
      h.advance(4000);
    }
    assert.equal(h.probes, 0, 'a permission status check must never open a capture consent dialog');
  });
}

test('cache avoids repeated status checks and refreshes after expiry', async () => {
  const h = harness('granted');
  assert.equal((await h.resolve()).capturable, true);
  h.setStatus('denied');
  assert.equal((await h.resolve()).capturable, true);
  assert.equal(h.checks, 1);
  h.advance(4000);
  assert.equal((await h.resolve()).effectiveDenied, true);
  assert.equal(h.checks, 2);
  assert.equal(h.probes, 0);
});

test('bypassCache observes a newly granted permission immediately', async () => {
  const h = harness();
  await h.resolve();
  h.setStatus('granted');
  assert.equal((await h.resolve({ bypassCache: true })).capturable, true);
  assert.equal(h.probes, 0);
});

test('non-mac platforms do not query macOS permission APIs', async () => {
  const h = harness('denied', 'win32');
  assert.equal((await h.resolve()).capturable, true);
  assert.equal(h.checks, 0);
  assert.equal(h.probes, 0);
});

for (const status of ['denied', 'restricted', 'not-determined']) {
  test(`system-source meeting rejects ${status} before opening STT`, async () => {
    const h = harness(status);
    await assert.rejects(h.state.startMeeting({ source: 'system' }), { code: 'screen-permission-denied' });
    assert.equal(h.state.isMeetingActive, false);
    assert.equal(h.probes, 0);
  });
}

test('microphone-source meeting is not blocked by denied screen permission', async () => {
  const h = harness('denied');
  await assert.rejects(h.state.startMeeting({ source: 'microphone' }), { code: 'stt-not-configured' });
  assert.equal(h.checks, 0);
});
