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
    '../../../dist-electron/electron/services/CredentialsManager.js',
);
const FAKE_API_KEY = 'fake-alibaba-fun-asr-key-Task4-only';

let currentEnv;
const originalLoad = Module._load;

before(() => {
    Module._load = function patched(request, _parent, _isMain) {
        if (request === 'electron') {
            if (!currentEnv) throw new Error('No fake Electron environment active');
            return currentEnv.electron;
        }
        return originalLoad.apply(this, arguments);
    };
});

after(() => {
    Module._load = originalLoad;
    delete globalThis.__nativelyCredentialsManagerV1__;
});

function makeEnv(userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fun-asr-credentials-'))) {
    return {
        userData,
        logs: [],
        electron: {
            app: {
                getPath: () => userData,
                isPackaged: false,
                getVersion: () => '0.0.0-test',
            },
            safeStorage: {
                isEncryptionAvailable: () => true,
                encryptString: value => Buffer.from(value).map(byte => byte ^ 0xa5),
                decryptString: value => Buffer.from(value).map(byte => byte ^ 0xa5).toString('utf8'),
            },
        },
    };
}

function freshManager(env) {
    currentEnv = env;
    delete globalThis.__nativelyCredentialsManagerV1__;
    delete require.cache[require.resolve(COMPILED)];
    const { CredentialsManager } = require(COMPILED);
    const manager = CredentialsManager.getInstance();
    manager.init();
    return manager;
}

test('Fun-ASR API key persists through the encrypted credential store and survives restart', () => {
    const env = makeEnv();
    const originalLog = console.log;
    console.log = (...parts) => env.logs.push(parts.join(' '));
    try {
        const manager = freshManager(env);
        assert.equal(manager.setAlibabaFunAsrApiKey(`  ${FAKE_API_KEY}  `), true);
        assert.equal(manager.getAlibabaFunAsrApiKey(), FAKE_API_KEY);
        assert.equal(manager.getStoredSttKeyForProvider('alibaba-fun-asr'), FAKE_API_KEY);

        const encryptedPath = path.join(env.userData, 'credentials.enc');
        assert.equal(fs.existsSync(encryptedPath), true);
        assert.equal(fs.readFileSync(encryptedPath).includes(Buffer.from(FAKE_API_KEY)), false,
            'raw key material must not be present in the credential file');

        const restarted = freshManager(env);
        assert.equal(restarted.getAlibabaFunAsrApiKey(), FAKE_API_KEY);
        assert.equal(env.logs.some(line => line.includes(FAKE_API_KEY)), false,
            'credential logs must never contain raw key material');
    } finally {
        console.log = originalLog;
    }
});

test('Fun-ASR setter reports persistence failure with the same boolean contract as other STT setters', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'fun-asr-unwritable-'));
    const notDirectory = path.join(parent, 'not-a-directory');
    fs.writeFileSync(notDirectory, 'fake fixture');
    const env = makeEnv(notDirectory);
    const manager = freshManager(env);

    assert.equal(manager.setAlibabaFunAsrApiKey(FAKE_API_KEY), false);
});

test('Fun-ASR is a valid stored STT provider and empty input clears its key', () => {
    const env = makeEnv();
    const manager = freshManager(env);

    assert.equal(manager.setSttProvider('alibaba-fun-asr'), true);
    assert.equal(manager.getSttProvider(), 'alibaba-fun-asr');
    assert.equal(manager.setAlibabaFunAsrApiKey(FAKE_API_KEY), true);
    assert.equal(manager.setAlibabaFunAsrApiKey('   '), true);
    assert.equal(freshManager(env).getAlibabaFunAsrApiKey(), undefined);
});
