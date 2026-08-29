import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(
  path.join(repoRoot, 'src', 'components', 'SettingsOverlay.tsx'),
  'utf8',
);

test('Alibaba Fun-ASR is selectable and exposes only the confirmed public configuration', () => {
  assert.match(source, /id:\s*'alibaba-fun-asr'/);
  assert.match(source, /label:\s*'Alibaba Fun-ASR Realtime'/);
  assert.match(
    source,
    /sttProvider !== 'google'[\s\S]{0,300}sttProvider !== 'alibaba-fun-asr'/,
  );
  assert.match(source, /cn-beijing/);
  assert.match(source, /ap-southeast-1/);
  assert.match(source, /fun-asr-realtime-2026-02-28/);
  assert.match(source, /Workspace ID/);
  assert.match(source, /Vocabulary ID/);
  assert.doesNotMatch(source, /Inline (?:Hotword|Vocabulary)|Technical Term List/);

  const regionSelect = source.match(
    /<select\s+id="alibaba-fun-asr-region"([\s\S]*?)<\/select>/,
  );
  assert.ok(regionSelect, 'Alibaba Region select should exist');
  assert.deepEqual(
    [...regionSelect[1].matchAll(/<option value="([^"]+)">/g)].map((match) => match[1]),
    ['cn-beijing', 'ap-southeast-1'],
  );

  const modelSelect = source.match(
    /<select\s+id="alibaba-fun-asr-model"([\s\S]*?)<\/select>/,
  );
  assert.ok(modelSelect, 'Alibaba Model select should exist');
  assert.deepEqual(
    [...modelSelect[1].matchAll(/<option value="([^"]+)">/g)].map((match) => match[1]),
    ['fun-asr-realtime', 'fun-asr-realtime-2026-02-28'],
  );
});

test('stored Alibaba credentials hydrate only a boolean badge and never the raw key input', () => {
  assert.match(source, /const \[sttAlibabaKey, setSttAlibabaKey\] = useState\(''\)/);
  assert.match(source, /setHasStoredAlibabaKey\(creds\.hasAlibabaFunAsrKey \|\| false\)/);
  assert.match(source, /getAlibabaFunAsrConfig/);
  assert.doesNotMatch(source, /setSttAlibabaKey\(creds\./);
  assert.doesNotMatch(source, /value=\{creds\.[^}]*Alibaba/i);
});

test('Alibaba Save, Test, and Remove use the existing secure IPC contract', () => {
  assert.match(source, /setAlibabaFunAsrApiKey\?\.\(sttAlibabaKey\.trim\(\)\)/);
  assert.match(source, /setAlibabaFunAsrConfig\?\.\(alibabaConfig\)/);
  assert.match(
    source,
    /const providerResult = await window\.electronAPI\?\.setSttProvider\?\.\('alibaba-fun-asr'\)/,
  );
  assert.match(
    source,
    /if \(!providerResult\?\.success\) \{[\s\S]{0,300}throw new Error\(providerResult\?\.error/,
  );
  assert.match(source, /testSttConnection\?\.\([\s\S]*'alibaba-fun-asr'[\s\S]*apiKeyToSend[\s\S]*alibabaConfig/);
  assert.match(source, /hasStoredAlibabaKey \? '__USE_STORED__' : ''/);
  assert.match(source, /setAlibabaFunAsrApiKey\?\.\(''\)/);
  assert.match(source, /if \(!alibabaWorkspaceId\.trim\(\)\)/);
  assert.match(source, /onClick=\{handleSaveAlibabaSettings\}/);
  assert.match(source, /onClick=\{handleTestSttConnection\}/);
  assert.match(source, /onClick=\{handleRemoveAlibabaKey\}/);
});

test('selecting Alibaba defers provider persistence until its settings save succeeds', () => {
  const handler = source.match(
    /const handleSttProviderChange = async \([^)]*\) => \{([\s\S]*?)\n\s*\};/,
  );
  assert.ok(handler, 'handleSttProviderChange should exist');
  assert.match(
    handler[1],
    /setSttProvider\(provider\)[\s\S]*if \(provider === 'alibaba-fun-asr'\) return;[\s\S]*setSttProvider\?\.\(provider\)/,
  );
});

test('Alibaba save clears shared Saved state before work and again before reporting errors', () => {
  const handler = source.match(
    /const handleSaveAlibabaSettings = async \(\) => \{([\s\S]*?)\n\s*\};/,
  );
  assert.ok(handler, 'handleSaveAlibabaSettings should exist');

  const body = handler[1];
  const finalValidationIndex = body.indexOf(
    "if (!sttAlibabaKey.trim() && !hasStoredAlibabaKey)",
  );
  const clearSavedIndex = body.indexOf('setSttSaved(false)');
  const savingIndex = body.indexOf('setSttSaving(true)');
  const firstIpcIndex = body.indexOf('window.electronAPI');
  assert.ok(finalValidationIndex >= 0, 'local API-key validation should exist');
  assert.ok(clearSavedIndex > finalValidationIndex, 'Saved state clears after local validation');
  assert.ok(clearSavedIndex < savingIndex, 'Saved state clears before entering saving state');
  assert.ok(clearSavedIndex < firstIpcIndex, 'Saved state clears before the first IPC');

  assert.match(
    body,
    /catch \(error: any\) \{\s*setSttSaved\(false\);\s*setSttTestStatus\('error'\)/,
  );
});

test('Alibaba operations hold a synchronous lock across save IPCs', () => {
  assert.match(source, /const alibabaSaveInFlightRef = useRef\(false\);/);

  const saveHandler = source.match(
    /const handleSaveAlibabaSettings = async \(\) => \{([\s\S]*?)\n\s*\};/,
  );
  assert.ok(saveHandler, 'handleSaveAlibabaSettings should exist');
  const saveBody = saveHandler[1];
  const finalValidationIndex = saveBody.indexOf(
    "if (!sttAlibabaKey.trim() && !hasStoredAlibabaKey)",
  );
  const guardIndex = saveBody.indexOf('if (alibabaSaveInFlightRef.current) return;');
  const lockIndex = saveBody.indexOf('alibabaSaveInFlightRef.current = true;');
  const firstIpcIndex = saveBody.indexOf('window.electronAPI');
  assert.ok(guardIndex > finalValidationIndex, 'save lock guard follows local validation');
  assert.ok(lockIndex > guardIndex, 'save acquires lock immediately after its guard');
  assert.ok(lockIndex < firstIpcIndex, 'save acquires lock before its first IPC');
  assert.match(
    saveBody,
    /finally \{\s*alibabaSaveInFlightRef\.current = false;\s*setSttSaving\(false\);\s*\}/,
  );

  const providerHandler = source.match(
    /const handleSttProviderChange = async \([^)]*\) => \{([\s\S]*?)\n\s*\};/,
  );
  assert.ok(providerHandler, 'handleSttProviderChange should exist');
  const providerBody = providerHandler[1];
  const providerGuardIndex = providerBody.indexOf('if (alibabaSaveInFlightRef.current) return;');
  const providerSavedIndex = providerBody.indexOf('setSttSaved(false);');
  const providerFirstIpcIndex = providerBody.indexOf('window.electronAPI');
  assert.ok(providerGuardIndex >= 0, 'provider change checks the synchronous save lock');
  assert.ok(providerSavedIndex > providerGuardIndex, 'provider state changes only after the lock guard');
  assert.ok(providerFirstIpcIndex > providerGuardIndex, 'provider lock guard runs before its first IPC');

  const testHandler = source.match(
    /const handleTestSttConnection = async \(\) => \{([\s\S]*?)\n\s*\};/,
  );
  assert.ok(testHandler, 'handleTestSttConnection should exist');
  assert.match(testHandler[1], /^\s*if \(alibabaSaveInFlightRef\.current\) return;/);

  const removeHandler = source.match(
    /const handleRemoveAlibabaKey = async \(\) => \{([\s\S]*?)\n\s*\};/,
  );
  assert.ok(removeHandler, 'handleRemoveAlibabaKey should exist');
  assert.match(removeHandler[1], /^\s*if \(alibabaSaveInFlightRef\.current\) return;/);
});

test('provider and Alibaba operation controls disable while a save is active', () => {
  const providerProps = source.match(/interface ProviderSelectProps \{([\s\S]*?)\n\}/);
  assert.ok(providerProps, 'ProviderSelectProps should exist');
  assert.match(providerProps[1], /disabled\?: boolean;/);
  const providerTrigger = source.match(
    /const ProviderSelect: React\.FC<ProviderSelectProps> = \(\{([^}]*)\}\) => \{([\s\S]*?)<AnimatePresence>/,
  );
  assert.ok(providerTrigger, 'ProviderSelect trigger should exist');
  assert.match(providerTrigger[1], /disabled/);
  assert.match(
    providerTrigger[2],
    /<button[\s\S]{0,200}onClick=\{\(\) => setIsOpen\(!isOpen\)\}[\s\S]{0,300}disabled=\{disabled\}/,
  );

  const providerUsage = source.match(/<ProviderSelect\s+([\s\S]*?)\/>/);
  assert.ok(providerUsage, 'Speech Provider selector should exist');
  assert.match(providerUsage[1], /disabled=\{sttSaving\}/);
  assert.match(
    source,
    /onClick=\{handleTestSttConnection\}\s*disabled=\{sttSaving \|\| sttTestStatus === 'testing'\}/,
  );
  assert.match(
    source,
    /onClick=\{handleRemoveAlibabaKey\}\s*disabled=\{sttSaving\}/,
  );
});

test('Alibaba fields are labelled, responsive, and announce errors', () => {
  const card = source.match(
    /\{sttProvider === 'alibaba-fun-asr' && \(([\s\S]*?)\n\s*\)\}\s*\n\s*\{\/\* Groq Model Selector \*\//,
  );
  assert.ok(card, 'dedicated Alibaba card should exist');

  for (const id of [
    'alibaba-fun-asr-region',
    'alibaba-fun-asr-model',
    'alibaba-fun-asr-workspace-id',
    'alibaba-fun-asr-vocabulary-id',
    'alibaba-fun-asr-api-key',
  ]) {
    assert.equal((card[1].match(new RegExp(`htmlFor="${id}"`, 'g')) || []).length, 1);
    assert.equal((card[1].match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }

  assert.equal(
    (card[1].match(/className="grid grid-cols-1 sm:grid-cols-2 gap-3"/g) || []).length,
    2,
  );
  assert.match(
    card[1],
    /<span role="alert" aria-live="polite" className="text-xs text-red-400">/,
  );
});

test('Alibaba controls show saved-key state without placing credential text in the DOM', () => {
  assert.match(source, /hasStoredAlibabaKey \? '••••••••••••' : t\('Enter Alibaba Cloud API key'\)/);
  assert.match(source, /type="password"[\s\S]*value=\{sttAlibabaKey\}/);
  assert.match(source, /setSttAlibabaKey\(''\)/);
  assert.doesNotMatch(source, /alibabaFunAsrApiKey/);
});
