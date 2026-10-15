const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadLocalSigningConfig, assertIdentityAvailable } = require('./local-mac-signing.cjs');
try {
  if (process.platform !== 'darwin') throw new Error('This command builds the local macOS app; run it on the target Mac.');
  assertIdentityAvailable(loadLocalSigningConfig({ required: true }));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'package-app.js'), '--mac', 'dir', `--${process.arch}`,
    '--config.electronDist=node_modules/electron/dist'], {
    stdio: 'inherit', cwd: path.join(__dirname, '..'), env: { ...process.env, NATIVELY_LOCAL_SIGNING_REQUIRED: '1' },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
