import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const source = fs.readFileSync(path.join(repoRoot, 'electron', 'main.ts'), 'utf8');

test('main imports and creates the tested dual-channel Alibaba provider factory once', () => {
    assert.match(source, /import\s+\{\s*createAlibabaFunAsrProviderPair[^}]*\}\s+from\s+["']\.\/audio\/alibabaFunAsrProviderFactory["']/);
    assert.match(source, /createAlibabaFunAsrProviderPair\(\{[\s\S]*?apiKey[\s\S]*?\.\.\.publicConfig[\s\S]*?\}\)/);
    assert.doesNotMatch(source, /new\s+AlibabaFunAsrStreamingSTT/);
});

test('Alibaba selection reads secure credentials and public settings and fails explicitly without fallback', () => {
    const branch = source.match(/if \(sttProv === 'alibaba-fun-asr'\) \{([\s\S]*?)\n\s*\}\s*else\s*\{/);
    assert.ok(branch, 'dedicated Alibaba pair initialization branch should exist');
    const initializer = source.match(/private initializeAlibabaFunAsrProviderPair\(\): void \{([\s\S]*?)\n\s*\}\n\n\s*\/\*\*/);
    assert.ok(initializer, 'Alibaba pair initializer should exist');
    assert.match(initializer[1], /getAlibabaFunAsrApiKey\(\)/);
    assert.match(initializer[1], /getAlibabaFunAsrConfig\(\)/);
    assert.match(initializer[1], /throw new Error\(/);
    assert.doesNotMatch(branch[1], /new\s+GoogleSTT|falling back/i);
    assert.doesNotMatch(initializer[1], /new\s+GoogleSTT|falling back/i);
});

test('createSTTProvider reuses the already-configured Alibaba channel without wiring listeners twice', () => {
    const method = source.match(/private createSTTProvider\(speaker:[\s\S]*?\n\s*}\n\n\s*private configureSTTProvider/);
    assert.ok(method, 'createSTTProvider implementation should exist');
    const branch = method[0].match(/else if \(sttProvider === 'alibaba-fun-asr'\) \{([\s\S]*?)\n\s*}\s*else\s*\{/);
    assert.ok(branch, 'Alibaba createSTTProvider branch should exist');
    assert.match(branch[1], /return this\.alibabaFunAsrPair!\[speaker\]/);
    assert.doesNotMatch(branch[1], /stt\s*=\s*this\.alibabaFunAsrPair/);
});

test('meeting start uses one monotonic origin and pair beginSession after session id advances', () => {
    const body = source.match(/public async startMeeting\(metadata\?: any\): Promise<void> \{([\s\S]*?)\n\s*public async endMeeting/);
    assert.ok(body, 'startMeeting implementation should exist');
    assert.match(body[1], /this\._transcriptSessionId \+= 1[\s\S]*const captureOriginMonotonicMs = performance\.now\(\)/);
    assert.match(body[1], /this\.alibabaFunAsrPair\?\.beginSession\(\s*this\._transcriptSessionId,\s*captureOriginMonotonicMs,?\s*\)/);
    assert.equal((body[1].match(/captureOriginMonotonicMs = performance\.now\(\)/g) ?? []).length, 1);
});

test('system and microphone audio stay on separate providers and transcript timing metadata is preserved', () => {
    assert.match(source, /this\.googleSTT\?\.write\(chunk\)/);
    assert.match(source, /this\.googleSTT_User\?\.write\(chunk\)/);
    assert.match(source, /typeof resolvedSegmentId === 'number'[\s\S]*?segmentId: resolvedSegmentId/);
    for (const field of ['audioStartMs', 'audioEndMs']) {
        assert.match(source, new RegExp(`typeof segment\\.${field} === 'number'[\\s\\S]*?${field}: segment\\.${field}`));
    }
});
