const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { CONFIG_DIR, CONFIG_PATH, loadLocalSigningConfig, assertIdentityAvailable } = require('./local-mac-signing.cjs');

function main() {
  if (process.platform !== 'darwin') throw new Error('Local macOS signing setup must run on macOS.');
  const existing = loadLocalSigningConfig();
  if (existing) {
    assertIdentityAvailable(existing);
    console.log('Existing local signing identity verified; no certificate was created.');
    return;
  }
  process.umask(0o077);
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const keychain = path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db');
  if (!fs.existsSync(keychain)) throw new Error('Login keychain not found; open Keychain Access before setup.');
  const certificatePath = path.join(CONFIG_DIR, 'certificate.pem');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-signing-setup-'));
  const run = (program, args, options = {}) => {
    try { return execFileSync(program, args, { stdio: 'inherit', ...options }); }
    catch (error) { throw new Error(`${path.basename(program)} failed (exit ${error.status}); see its output above.`); }
  };
  try {
    if (!fs.existsSync(certificatePath)) {
      const found = spawnSync('/usr/bin/security', ['find-certificate', '-c', 'Natively Local Signing', keychain], { stdio: 'ignore' });
      if (found.status === 0) throw new Error('A matching certificate already exists. Recover its configuration instead of creating another identity.');
      const configFile = path.join(temp, 'openssl.cnf');
      fs.writeFileSync(configFile, `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=signing\n[dn]\nCN=Natively Local Signing\n[signing]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\nsubjectKeyIdentifier=hash\n`);
      const privateKey = path.join(temp, 'private.key');
      const certificate = path.join(temp, 'certificate.pem');
      run('/usr/bin/openssl', ['req', '-new', '-newkey', 'rsa:3072', '-nodes', '-x509', '-sha256', '-days', '3650',
        '-config', configFile, '-keyout', privateKey, '-out', certificate]);
      const identityFile = path.join(temp, 'identity.p12');
      const transferPassword = randomBytes(32).toString('hex');
      run('/usr/bin/openssl', ['pkcs12', '-export', '-inkey', privateKey, '-in', certificate,
        '-name', 'Natively Local Signing', '-out', identityFile, '-passout', 'env:NATIVELY_SIGNING_TRANSFER_PASS'],
        { env: { ...process.env, NATIVELY_SIGNING_TRANSFER_PASS: transferPassword } });
      run('/usr/bin/security', ['import', identityFile, '-k', keychain, '-f', 'pkcs12', '-P', transferPassword, '-T', '/usr/bin/codesign']);
      fs.copyFileSync(certificate, certificatePath);
    }
    // User domain only; certificate is trusted for code signing, not SSL or other policies.
    console.log('Applying code-signing-only trust. macOS may ask for confirmation in its own dialog.');
    run('/usr/bin/security', ['add-trusted-cert', '-r', 'trustRoot', '-p', 'codeSign', '-k', keychain, certificatePath]);
    const output = execFileSync('/usr/bin/openssl', ['x509', '-in', certificatePath, '-noout', '-fingerprint', '-sha1'], { encoding: 'utf8' });
    const certificateSha1 = output.trim().split('=').pop().replaceAll(':', '').toUpperCase();
    if (!/^[A-F0-9]{40}$/.test(certificateSha1)) throw new Error('Could not read certificate fingerprint.');
    const config = { version: 1, certificateSha1, keychain, certificatePath, createdAt: new Date().toISOString() };
    assertIdentityAvailable(config);
    const probe = path.join(temp, 'signing-probe');
    fs.copyFileSync('/usr/bin/true', probe);
    run('/usr/bin/codesign', ['--force', '--sign', certificateSha1, '--keychain', keychain, '--timestamp=none', probe]);
    run('/usr/bin/codesign', ['--verify', '--strict', probe]);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    console.log(`Local signing is ready. Public configuration: ${CONFIG_PATH}`);
  } finally {
    // The permanent private key is in Keychain; no PEM/P12 key remains on disk.
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
