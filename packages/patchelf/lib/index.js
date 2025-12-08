"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBinDir = exports.isPatchelfAvailable = exports.getPatchelfPath = void 0;

const path = require("path");
const fs = require("fs");

const platform = process.platform;
const arch = process.arch;

const platformPackageMap = {
  'darwin-arm64': '@xspect-build/patchelf-darwin-arm64',
  'darwin-x64': '@xspect-build/patchelf-darwin-x64',
  'linux-arm64': '@xspect-build/patchelf-linux-arm64',
  'linux-arm': '@xspect-build/patchelf-linux-arm',
  'linux-x64': '@xspect-build/patchelf-linux-x64',
};

function findBinaryPath() {
  const platformKey = `${platform}-${arch}`;
  const packageName = platformPackageMap[platformKey];
  
  if (!packageName) {
    return null;
  }

  const possiblePaths = [
    path.join(__dirname, '..', 'node_modules', packageName, 'bin', 'patchelf'),
    path.join(__dirname, '..', '..', packageName, 'bin', 'patchelf'),
    path.join(__dirname, '..', '..', '.pnpm', 'node_modules', packageName, 'bin', 'patchelf'),
  ];

  for (const binPath of possiblePaths) {
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  }

  try {
    const packagePath = require.resolve(`${packageName}/package.json`);
    const binPath = path.join(path.dirname(packagePath), 'bin', 'patchelf');
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  } catch (e) {
    // Package not found
  }

  return null;
}

/**
 * Get the path to the patchelf binary
 */
function getPatchelfPath() {
  const binaryPath = findBinaryPath();
  
  if (!binaryPath) {
    throw new Error(
      `patchelf binary not found for platform ${platform}-${arch}. ` +
      'This may be because your platform is not supported or the optional dependency failed to install.'
    );
  }
  
  return binaryPath;
}
exports.getPatchelfPath = getPatchelfPath;

/**
 * Check if patchelf is available and executable
 */
function isPatchelfAvailable() {
  try {
    const binaryPath = getPatchelfPath();
    fs.accessSync(binaryPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
exports.isPatchelfAvailable = isPatchelfAvailable;

/**
 * Get the directory containing the patchelf binary
 */
function getBinDir() {
  const binaryPath = getPatchelfPath();
  return path.dirname(binaryPath);
}
exports.getBinDir = getBinDir;

exports.default = {
  getPatchelfPath,
  isPatchelfAvailable,
  getBinDir,
};
