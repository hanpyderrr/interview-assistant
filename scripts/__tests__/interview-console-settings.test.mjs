import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const consoleSource = fs.readFileSync(
  path.join(repoRoot, 'src', 'interview-console', 'InterviewConsole.tsx'),
  'utf8',
);
const consoleStyles = fs.readFileSync(
  path.join(repoRoot, 'src', 'interview-console', 'InterviewConsole.css'),
  'utf8',
);
const appSource = fs.readFileSync(path.join(repoRoot, 'src', 'App.tsx'), 'utf8');
const mainSource = fs.readFileSync(path.join(repoRoot, 'electron', 'main.ts'), 'utf8');
const shortcutsSource = fs.readFileSync(
  path.join(repoRoot, 'src', 'hooks', 'useShortcuts.ts'),
  'utf8',
);
const credentialsSource = fs.readFileSync(
  path.join(repoRoot, 'electron', 'services', 'CredentialsManager.ts'),
  'utf8',
);

test('interview console delegates settings navigation to its host', () => {
  assert.match(consoleSource, /onOpenSettings\??:\s*\(tab:\s*string\)\s*=>\s*void/);
  assert.match(consoleSource, /onOpenSettings\('audio'\)/);
  assert.doesNotMatch(consoleSource, /toggleSettingsWindow/);
});

test('interview route mounts the full settings overlay', () => {
  const branch = appSource.match(
    /if \(isInterviewConsole && isDefault\) \{([\s\S]*?)\n\s*\}/,
  );
  assert.ok(branch, 'interview route branch should exist');
  assert.match(branch[1], /<InterviewConsole[\s\S]*onOpenSettings/);
  assert.match(branch[1], /<SettingsOverlay/);
});

test('interview console exposes a draggable top bar and keeps buttons no-drag', () => {
  assert.match(consoleSource, /<header className="console-topbar drag-region select-none">/);
  assert.match(consoleSource, /<div className="topbar-actions no-drag">/);
  assert.match(consoleSource, /className="icon-button"/);
  assert.match(consoleSource, /import WindowControls from '\.\.\/components\/WindowControls'/);
  assert.match(consoleSource, /<div className="topbar-actions no-drag">[\s\S]*<WindowControls \/>[\s\S]*<\/div><\/header>/);
  assert.doesNotMatch(consoleSource, /console-topbar">/);
  assert.match(consoleStyles, /\.console-topbar[^}]*-webkit-app-region:\s*drag/s);
  assert.match(consoleStyles, /\.topbar-actions[^}]*-webkit-app-region:\s*no-drag/s);
});

test('interview console ignores STT prewarm events until it starts a session', () => {
  assert.match(consoleSource, /const sessionActiveRef = useRef\(false\)/);
  assert.match(consoleSource, /onNativeAudioTranscript[\s\S]*if \(!sessionActiveRef\.current\) return/);
  assert.match(consoleSource, /onSttStatusChanged[\s\S]*if \(!sessionActiveRef\.current\) return/);
  assert.match(consoleSource, /sessionActiveRef\.current = true[\s\S]*startMeeting/);
});

test('interview session keeps the dedicated console visible', () => {
  assert.match(consoleSource, /startMeeting\(\{[\s\S]*stayOnLauncher:\s*true/);
  assert.match(mainSource, /const stayOnLauncher = metadata\?\.stayOnLauncher === true/);
  assert.match(mainSource, /if \(!stayOnLauncher\) \{[\s\S]*setWindowMode\('overlay'\)/);
});

test('answer state changes cannot turn an active session back into a start action', () => {
  assert.match(consoleSource, /const \[sessionActive, setSessionActive\] = useState\(false\)/);
  assert.match(consoleSource, /const isLive = sessionActive/);
  assert.match(consoleSource, /setSessionActive\(true\)[\s\S]*startMeeting/);
  assert.match(consoleSource, /stopSession[\s\S]*setSessionActive\(false\)/);
});

test('main process ignores duplicate meeting starts', () => {
  const startMeetingBody = mainSource.match(/public async startMeeting\(metadata\?: any\): Promise<void> \{([\s\S]*?)\n  public async endMeeting/);
  assert.ok(startMeetingBody, 'startMeeting implementation should exist');
  assert.match(startMeetingBody[1], /if \(this\.isMeetingActive\) \{[\s\S]*return/);
});

test('interim preview replacement + monotonic round coordinator', () => {
  // Preserved legacy behavior: committed refs and event.final commits interviewer
  assert.match(consoleSource, /const\s+committedInterviewerRef\s*=\s*useRef<InterviewTurn\[\]>\(\[\]\)/);
  assert.match(consoleSource, /const\s+committedCandidateRef\s*=\s*useRef<InterviewTurn\[\]>\(\[\]\)/);
  assert.match(consoleSource, /if\s*\(\s*event\.final\s*\)\s*\{[\s\S]*committedInterviewerRef\.current\s*=/);
  assert.doesNotMatch(consoleSource, /event\.final\s*&&\s*event\.text\?\.trim\(\).*requestCloudAnswer\(event\.text\.trim\(\)\)/);

  // New monotonic round coordinator architecture
  assert.match(consoleSource, /const\s+roundTickRef\s*=\s*useRef/);
  assert.match(consoleSource, /import\s*\{[^}]*createQuestionRoundCoordinator[^}]*\}\s*from\s*['"]\.\/questionRoundCoordinator['"]/);
  assert.match(consoleSource, /import\s*\{[\s\S]*shouldAcceptQuestionFinal[\s\S]*\}\s*from\s*['"]\.\/questionTiming['"]/);

  // Acceptance gate reads coordinator snapshot turns
  assert.match(consoleSource, /roundCoordinatorRef\.current\.getSnapshot\(\)\.turns/);

  // Accepted final calls acceptInterviewerFinal with arrivalMs: rendererReceiveMonotonicMs
  assert.match(consoleSource, /acceptInterviewerFinal\([\s\S]*arrivalMs:\s*rendererReceiveMonotonicMs/);

  // Scheduler calls tick and scheduleRoundTick
  assert.match(consoleSource, /\.tick\(\s*performance\.now\(\)\s*\)/);
  assert.match(consoleSource, /scheduleRoundTick\(\s*2500\s*\)/);

  // Old architecture must be removed
  assert.doesNotMatch(consoleSource, /createQuestionSettler\s*\(/);
  assert.doesNotMatch(consoleSource, /questionSettlerRef/);
  assert.doesNotMatch(consoleSource, /answerDebounceRef/);
  assert.doesNotMatch(consoleSource, /\.drain\(\s*Date\.now\(\)\s*\)/);
});

test('browser preview skips Electron-only shortcut synchronization', () => {
  assert.match(
    shortcutsSource,
    /if \(!api\?\.getKeybinds \|\| !api\?\.onKeybindsUpdate\) return/,
  );
});

test('settings provider contract accepts Alibaba without rendering a new audio option', () => {
  assert.match(credentialsSource, /getSttProvider\(\):[^\n]*'alibaba-fun-asr'/);
  assert.doesNotMatch(consoleSource, /value=["']alibaba-fun-asr["']/);
});

test('interview answers keep their retrieved context out of generic V3 rerouting', () => {
  assert.match(
    consoleSource,
    /streamGeminiChat\(prompt, undefined, context, \{ skipSystemPrompt: true, ignoreKnowledgeMode: true \}\)/,
  );
});

test('interview answer body hides the trailing GIST display marker', () => {
  assert.match(consoleSource, /import \{ splitGistLineStreaming \} from '\.\.\/lib\/displayMarkup'/);
  assert.match(consoleSource, /const spokenAnswer = demo \? DEMO_ANSWER\.spoken : splitGistLineStreaming\(answer\)\.body/);
  assert.match(consoleSource, /spokenAnswer \|\| '正在生成回答…'/);
});
