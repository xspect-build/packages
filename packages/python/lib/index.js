"use strict";

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { gunzipSync } = require('zlib');
const { Archive } = require('@napi-rs/tar');

const platform = process.platform;
const arch = process.arch;

const SCOPE = '@xspect-build';
const CACHE_DIR = path.join(os.homedir(), '.xspect-build', 'python');

const platformPackageMap = {
  'linux-arm64': `${SCOPE}/python-linux-arm64`,
  'linux-x64': `${SCOPE}/python-linux-x64`,
};

/**
 * Get the platform package name for current platform
 */
function getPlatformPackageName() {
  const platformKey = `${platform}-${arch}`;
  return platformPackageMap[platformKey] || null;
}

/**
 * Download the Python package and return the tar archive
 * @param {string} version - Package version or dist-tag (e.g., 'python3.9.13'), required
 * @returns {Archive} The tar archive object
 */
function download(version) {
  if (!version) {
    throw new Error('version is required');
  }
  const packageName = getPlatformPackageName();
  if (!packageName) {
    throw new Error(`Unsupported platform: ${platform}-${arch}. Supported: ${Object.keys(platformPackageMap).join(', ')}`);
  }

  const cwd = os.tmpdir();
  
  console.log(`Downloading ${packageName}@${version}...`);
  
  // Download the package via npm pack
  execSync(`npm pack ${packageName}@${version}`, {
    stdio: 'inherit',
    cwd,
    env: process.env,
  });

  // Find the downloaded tgz file
  const files = fs.readdirSync(cwd);
  const tgzFileName = files.find(f => f.startsWith('xspect-build-python-') && f.endsWith('.tgz'));
  if (!tgzFileName) {
    throw new Error('Failed to find downloaded package');
  }
  const tgzFile = path.join(cwd, tgzFileName);
  
  // Read and decompress
  console.log(`Unpacking ${tgzFileName}...`);
  const tgzData = fs.readFileSync(tgzFile);
  const tarData = gunzipSync(tgzData);
  
  // Clean up tgz file
  fs.rmSync(tgzFile);
  
  return new Archive(tarData);
}

/**
 * Extract Python to destination directory
 * @param {string} dest - Destination directory
 * @param {Object} options - Options
 * @param {string} options.version - Package version or dist-tag (e.g., 'python3.9.13'), required
 * @returns {string} Path to the Python directory (containing bin, lib, etc.)
 */
function extract(dest, options = {}) {
  const version = options.version;
  if (!version) {
    throw new Error('options.version is required');
  }
  const destPath = dest || path.join(CACHE_DIR, version);
  const pythonDir = path.join(destPath, 'package', 'python');
  const markerFile = path.join(destPath, 'package.json');
  
  // Check if already extracted
  if (fs.existsSync(markerFile)) {
    console.log(`Python ${version} already exists at ${pythonDir}, skipping extraction`);
    return pythonDir;
  }
  
  const archive = download(version);
  
  fs.mkdirSync(destPath, { recursive: true });
  archive.unpack(destPath);
  
  // Fix permissions
  fixPermissions(path.join(pythonDir, 'bin'));
  
  return pythonDir;
}

/**
 * Get Python path, downloading if necessary
 * @param {object} options - Options
 * @param {string} options.version - Package version or dist-tag (e.g., 'python3.9.13'), required
 * @param {string} options.dest - Custom destination directory (optional)
 * @returns {string} Path to the Python directory
 */
function getPythonPath(options = {}) {
  if (!options.version) {
    throw new Error('options.version is required');
  }
  return extract(options.dest, { version: options.version });
}

/**
 * Fix executable permissions for files in a directory
 */
function fixPermissions(dir) {
  if (!fs.existsSync(dir)) return;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixPermissions(fullPath);
    } else if (entry.isFile()) {
      try {
        fs.chmodSync(fullPath, 0o755);
      } catch (e) {
        // Ignore permission errors
      }
    }
  }
}

module.exports = {
  download,
  extract,
  getPythonPath,
  getPlatformPackageName,
};
