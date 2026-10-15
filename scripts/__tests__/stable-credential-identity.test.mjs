import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const source = fs.readFileSync(new URL('../../electron/main.ts', import.meta.url), 'utf8');
const body = source.match(/function configureStableUserDataPath\(\): void \{([\s\S]*?)\n\}\n\nconfigureStableUserDataPath\(\);/)[1];
const javascript = body.replace(/\(err as Error\)/g, 'err');
for (const isPackaged of [true, false]) {
  test(`credential identity is Natively before ready (packaged=${isPackaged})`, () => {
    const paths = { appData: '/profile', userData: '/profile/natively' };
    let name = isPackaged ? 'natively' : 'Electron';
    const app = { isPackaged, getPath: key => paths[key], setPath: (key,value) => paths[key]=value, setName: value => name=value };
    vm.runInNewContext(`(function(){${javascript}})()`, {app, path, fs: {mkdirSync(){}}, process: {env:{}}, console});
    assert.equal(name, 'Natively');
    assert.equal(paths.userData, '/profile/natively');
  });
}
