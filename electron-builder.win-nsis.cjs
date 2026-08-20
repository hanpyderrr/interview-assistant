/**
 * Windows x64 NSIS installer configuration.
 *
 * NSIS installers, like portable builds, do not strictly need executable
 * resource editing or code signing for local use. Disabling that step avoids
 * electron-builder's winCodeSign bundle, whose macOS payload contains symlinks
 * that require elevated Windows rights when the cache is extracted on this machine.
 */
const base = require('./package.json').build;

module.exports = {
  ...base,
  directories: {
    ...base.directories,
    output: 'release-nsis',
  },
  win: {
    ...base.win,
    target: [{ target: 'nsis', arch: ['x64'] }],
    signAndEditExecutable: false,
  },
};
