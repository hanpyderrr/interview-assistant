import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot = path.resolve('local-funasr');

test('macOS FunASR bundle contains an executable bootstrap and a self-validating service', () => {
  assert.equal(existsSync(path.join(serviceRoot, 'start-service.sh')), true);
  const result = spawnSync('python3', [path.join(serviceRoot, 'service.py'), '--self-test'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /self-test ok/);
});

test('FunASR receives one waveform directly instead of a list interpreted as file paths', () => {
  const snippet = [
    'import pathlib, sys',
    `sys.path.insert(0, ${JSON.stringify(serviceRoot)})`,
    'import service',
    'class Model:',
    '  def __call__(self, value):',
    '    assert not isinstance(value, list)',
    '    return [{"preds": "参数正确"}]',
    'assert service.run_inference(Model(), object()) == "参数正确"',
  ].join('\n');
  const result = spawnSync('python3', ['-c', snippet], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('FunASR tuple predictions expose only the recognized sentence', () => {
  const snippet = [
    'import pathlib, sys',
    `sys.path.insert(0, ${JSON.stringify(serviceRoot)})`,
    'import service',
    `assert service.extract_text([{'preds': ('正确文本', ['正', '确'])}]) == '正确文本'`,
  ].join('\n');
  const result = spawnSync('python3', ['-c', snippet], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
