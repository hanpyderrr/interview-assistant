const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CONFIG_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Natively Local Signing');
const CONFIG_PATH = path.join(CONFIG_DIR, 'identity.json');

function loadLocalSigningConfig({ configPath = CONFIG_PATH, required = false } = {}) {
  if (!fs.existsSync(configPath)) {
    if (required) throw new Error('Local signing is not configured. Run npm run setup:local-signing first.');
    return null;
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.version !== 1 || !/^[A-Fa-f0-9]{40}$/.test(config.certificateSha1 || '') ||
      typeof config.keychain !== 'string' || !path.isAbsolute(config.keychain)) {
    throw new Error(`Invalid local signing config: ${configPath}. Refusing ad-hoc fallback.`);
  }
  return { ...config, certificateSha1: config.certificateSha1.toUpperCase() };
}

function assertIdentityAvailable(config) {
  const identities = execFileSync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning', config.keychain], { encoding: 'utf8' });
  if (!identities.toUpperCase().includes(config.certificateSha1.toUpperCase())) {
    throw new Error('The pinned local code-signing identity is unavailable. Unlock/restore its keychain; do not generate a replacement certificate.');
  }
}

async function signLocalApp(appPath, projectDir, config) {
  assertIdentityAvailable(config);
  const { signAsync } = require('@electron/osx-sign');
  const mainEntitlements = path.join(projectDir, 'build', 'entitlements.mac.plist');
  const helperEntitlements = path.join(projectDir, 'build', 'entitlements.mac.inherit.plist');
  fs.writeFileSync(path.join(appPath, 'Contents', 'Resources', 'natively-local-signing.json'), JSON.stringify({
    version: 1, certificateSha1: config.certificateSha1, buildTimeUtc: new Date().toISOString(),
  }, null, 2) + '\n');
  console.log('[Local Signing] Signing nested code and app with the pinned local certificate...');
  await signAsync({
    app: appPath, platform: 'darwin', type: 'development',
    identity: config.certificateSha1, keychain: config.keychain,
    // Already validated above using the code-signing policy, not the generic policy.
    identityValidation: false,
    preAutoEntitlements: false, preEmbedProvisioningProfile: false,
    strictVerify: true,
    optionsForFile(filePath) {
      return {
        entitlements: filePath === appPath || filePath.includes('/native-module/') ? mainEntitlements : helperEntitlements,
        hardenedRuntime: false, timestamp: 'none',
      };
    },
  });
  // Pin the signer without weakening the default designated requirement.
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R',
    `=identifier "com.electron.meeting-notes" and anchor H"${config.certificateSha1}"`, appPath], { stdio: 'inherit' });
  console.log('[Local Signing] Signature and pinned certificate verified.');
}

module.exports = { CONFIG_DIR, CONFIG_PATH, loadLocalSigningConfig, assertIdentityAvailable, signLocalApp };
