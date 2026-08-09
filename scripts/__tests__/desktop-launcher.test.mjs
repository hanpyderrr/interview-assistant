import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const launcherUrl = new URL('../start-interview-assistant.ps1', import.meta.url);
const shortcutInstallerUrl = new URL('../create-desktop-shortcut.ps1', import.meta.url);

test('hidden project Electron process tree is recycled before relaunch', async () => {
  const source = await readFile(launcherUrl, 'utf8');

  assert.match(source, /Get-CimInstance\s+Win32_Process/);
  assert.match(source, /\.ExecutablePath\s+-eq\s+\$ElectronExe/);
  assert.match(source, /-notmatch\s+'--type='/);
  assert.match(source, /\.MainWindowHandle\s+-ne\s+0/);
  assert.match(source, /Stop-Process\s+-Id\s+\$projectTreeIds/);
  assert.match(source, /\$stopDeadline\s*=.*AddSeconds\(10\)/);
  assert.match(source, /Start-Sleep\s+-Milliseconds\s+250/);
});

test('shortcut installer is safe when Windows PowerShell 5.1 reads it as ANSI', async () => {
  const source = await readFile(shortcutInstallerUrl, 'utf8');

  assert.doesNotMatch(source, /[^\x00-\x7F]/);
  assert.match(source, /0x9762,\s*0x8BD5,\s*0x52A9,\s*0x624B/);
});
