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
const SOURCE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../services/CredentialsManager.ts',
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

function captureConsole(callback) {
    const calls = [];
    const originals = {};
    for (const channel of ['log', 'warn', 'error']) {
        originals[channel] = console[channel];
        console[channel] = (...parts) => calls.push({ channel, text: parts.map(String).join(' ') });
    }
    try {
        return { result: callback(), calls };
    } finally {
        for (const channel of ['log', 'warn', 'error']) console[channel] = originals[channel];
    }
}

function assertNoRawKeyInConsole(calls) {
    assert.equal(
        calls.some(call => call.text.includes(FAKE_API_KEY)),
        false,
        `console output must not expose the fake key: ${JSON.stringify(calls)}`,
    );
}

test('Fun-ASR API key persists through the encrypted credential store and survives restart', () => {
    const env = makeEnv();
    const { calls } = captureConsole(() => {
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
    });
    assertNoRawKeyInConsole(calls);
});

test('Fun-ASR setter reports persistence failure with the same boolean contract as other STT setters', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'fun-asr-unwritable-'));
    const notDirectory = path.join(parent, 'not-a-directory');
    fs.writeFileSync(notDirectory, 'fake fixture');
    const env = makeEnv(notDirectory);
    const { calls } = captureConsole(() => {
        const manager = freshManager(env);
        assert.equal(manager.setAlibabaFunAsrApiKey(FAKE_API_KEY), false);
    });
    assertNoRawKeyInConsole(calls);
});

test('Fun-ASR setter logging is metadata-only and never interpolates key variables', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    const setter = source.match(/public setAlibabaFunAsrApiKey[\s\S]*?^    }/m)?.[0];
    assert.ok(setter, 'Fun-ASR setter must exist');
    const consoleCalls = [...setter.matchAll(/console\.(?:log|warn|error)\(([^;]*)\);/g)];
    assert.ok(consoleCalls.length > 0, 'setter should retain a metadata-only status log');
    for (const [, args] of consoleCalls) {
        assert.doesNotMatch(args, /\b(?:key|trimmed)\b/,
            'console calls must not reference raw or normalized key variables');
    }
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
