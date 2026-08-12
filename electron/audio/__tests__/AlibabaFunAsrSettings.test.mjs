import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const COMPILED = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../dist-electron/electron/services/SettingsManager.js',
);

let userData;
const originalLoad = Module._load;

before(() => {
    Module._load = function patched(request, _parent, _isMain) {
        if (request === 'electron') {
            return { app: { isReady: () => true, getPath: () => userData } };
        }
        return originalLoad.apply(this, arguments);
    };
});

after(() => {
    Module._load = originalLoad;
    delete globalThis.__nativelySettingsManagerV1__;
});

function freshManager(settings) {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fun-asr-settings-'));
    if (settings !== undefined) {
        fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify(settings));
    }
    delete globalThis.__nativelySettingsManagerV1__;
    delete require.cache[require.resolve(COMPILED)];
    const { SettingsManager } = require(COMPILED);
    return SettingsManager.getInstance();
}

function reloadManager() {
    delete globalThis.__nativelySettingsManagerV1__;
    delete require.cache[require.resolve(COMPILED)];
    const { SettingsManager } = require(COMPILED);
    return SettingsManager.getInstance();
}

test('Fun-ASR public config has safe defaults and contains no API key field', () => {
    const config = freshManager().getAlibabaFunAsrConfig();

    assert.deepEqual(config, {
        region: 'cn-beijing',
        workspaceId: '',
        vocabularyId: undefined,
        model: 'fun-asr-realtime',
    });
    assert.equal(Object.keys(config).some(key => /api.?key/i.test(key)), false);
});

test('Fun-ASR public config trims and returns only validated persisted values', () => {
    const config = freshManager({
        alibabaFunAsrRegion: 'ap-southeast-1',
        alibabaFunAsrWorkspaceId: '  workspace-42  ',
        alibabaFunAsrVocabularyId: '  vocabulary-7  ',
        alibabaFunAsrModel: 'fun-asr-realtime-2026-02-28',
    }).getAlibabaFunAsrConfig();

    assert.deepEqual(config, {
        region: 'ap-southeast-1',
        workspaceId: 'workspace-42',
        vocabularyId: 'vocabulary-7',
        model: 'fun-asr-realtime-2026-02-28',
    });
});

test('invalid persisted region, model, workspace, and blank vocabulary never pass through', () => {
    const config = freshManager({
        alibabaFunAsrRegion: 'https://attacker.invalid',
        alibabaFunAsrWorkspaceId: 'workspace.attacker.invalid/path',
        alibabaFunAsrVocabularyId: '   ',
        alibabaFunAsrModel: 'arbitrary-remote-model',
    }).getAlibabaFunAsrConfig();

    assert.deepEqual(config, {
        region: 'cn-beijing',
        workspaceId: '',
        vocabularyId: undefined,
        model: 'fun-asr-realtime',
    });
});

test('API key is not part of public settings even if hostile persisted JSON injects one', () => {
    const manager = freshManager({
        alibabaFunAsrApiKey: 'fake-key-that-must-not-be-forwarded',
    });

    assert.equal('apiKey' in manager.getAlibabaFunAsrConfig(), false);
    const settingsSource = fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../services/SettingsManager.ts'),
        'utf8',
    );
    assert.equal(settingsSource.includes('alibabaFunAsrApiKey'), false,
        'AppSettings must never gain an Alibaba API-key field');
});

test('Fun-ASR public config persists atomically and survives restart', () => {
    const manager = freshManager();
    assert.equal(manager.setAlibabaFunAsrConfig({
        region: 'ap-southeast-1',
        model: 'fun-asr-realtime-2026-02-28',
        workspaceId: 'workspace-atomic',
        vocabularyId: 'vocab-atomic',
    }), true);

    assert.deepEqual(reloadManager().getAlibabaFunAsrConfig(), {
        region: 'ap-southeast-1',
        model: 'fun-asr-realtime-2026-02-28',
        workspaceId: 'workspace-atomic',
        vocabularyId: 'vocab-atomic',
    });
});

test('Fun-ASR public config returns false and rolls back memory when persistence fails', () => {
    const manager = freshManager({
        alibabaFunAsrRegion: 'cn-beijing',
        alibabaFunAsrModel: 'fun-asr-realtime',
        alibabaFunAsrWorkspaceId: 'workspace-before',
        alibabaFunAsrVocabularyId: 'vocab-before',
    });
    const before = manager.getAlibabaFunAsrConfig();
    const originalRename = fs.renameSync;
    fs.renameSync = () => { throw new Error('simulated atomic rename failure'); };
    try {
        assert.equal(manager.setAlibabaFunAsrConfig({
            region: 'ap-southeast-1',
            model: 'fun-asr-realtime-2026-02-28',
            workspaceId: 'workspace-after',
            vocabularyId: undefined,
        }), false);
    } finally {
        fs.renameSync = originalRename;
    }

    assert.deepEqual(manager.getAlibabaFunAsrConfig(), before);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')), {
        alibabaFunAsrRegion: 'cn-beijing',
        alibabaFunAsrModel: 'fun-asr-realtime',
        alibabaFunAsrWorkspaceId: 'workspace-before',
        alibabaFunAsrVocabularyId: 'vocab-before',
    });
});
