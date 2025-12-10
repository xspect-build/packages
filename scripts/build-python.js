#!/usr/bin/env node

/**
 * Build Python platform package.
 * Downloads prebuilt Python from python-build-standalone and packages it for npm.
 * 
 * Usage:
 *   node scripts/build-python.js <platform> [--release <release>]
 * 
 * Example:
 *   node scripts/build-python.js linux-x64 --release 1
 * 
 * Version format: <python_version>-<build_type>.<release>
 * Example: 3.9.13-install_only.1
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCOPE = '@xspect-build';
const PACKAGE_NAME = 'python';

// Python build standalone configuration
const PYTHON_VERSION = '3.9.13';
const BUILD_TYPE = 'install-only'; // npm semver doesn't allow underscores in prerelease
const BUILD_TYPE_FILE = 'install_only'; // original name in python-build-standalone releases
const BUILD_DATE = '20220528';

// Download sources
const MIRROR_BASE = 'https://registry.npmmirror.com/-/binary/python-build-standalone';
const GITHUB_BASE = 'https://github.com/astral-sh/python-build-standalone/releases/download';

// Platform to triple mapping
const PLATFORM_MAP = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
};

function run(cmd, options = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', ...options });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Recursively replace symlinks with copies of the target file
 * npm publish doesn't preserve symlinks, so we need to convert them
 */
function replaceSymlinks(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(fullPath);
      const targetPath = path.resolve(dir, target);
      
      // Remove the symlink
      fs.unlinkSync(fullPath);
      
      // Copy the target file/directory
      if (fs.existsSync(targetPath)) {
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
          fs.cpSync(targetPath, fullPath, { recursive: true });
        } else {
          fs.copyFileSync(targetPath, fullPath);
          // Preserve executable permission
          fs.chmodSync(fullPath, stat.mode);
        }
      }
    } else if (entry.isDirectory()) {
      replaceSymlinks(fullPath);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function buildPythonPackage(platform, release) {
  const triple = PLATFORM_MAP[platform];
  if (!triple) {
    console.error(`Unsupported platform: ${platform}`);
    console.error(`Supported platforms: ${Object.keys(PLATFORM_MAP).join(', ')}`);
    process.exit(1);
  }

  // Version format: 3.9.13-install_only.1
  const version = `${PYTHON_VERSION}-${BUILD_TYPE}.${release}`;

  const [os, cpu] = platform.split('-');
  const distDir = path.join(__dirname, '..', 'dist');
  const tempDir = path.join(__dirname, '..', '.tmp');

  console.log(`Using version: ${version}`);

  const platformPackageName = `${PACKAGE_NAME}-${platform}`;
  const platformPackageDir = path.join(distDir, platformPackageName);

  console.log(`\nBuilding ${platformPackageName} v${version}\n`);

  // Clean up
  ensureDir(distDir);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  ensureDir(tempDir);

  if (fs.existsSync(platformPackageDir)) {
    fs.rmSync(platformPackageDir, { recursive: true });
  }
  ensureDir(platformPackageDir);

  // Download Python
  const filename = `cpython-${PYTHON_VERSION}+${BUILD_DATE}-${triple}-${BUILD_TYPE_FILE}.tar.gz`;
  const tarPath = path.join(tempDir, filename);

  // Use GitHub if GITHUB_TOKEN is provided, otherwise use mirror
  let downloadUrl;
  if (process.env.GITHUB_TOKEN) {
    downloadUrl = `${GITHUB_BASE}/${BUILD_DATE}/${filename}`;
    console.log(`Downloading from GitHub: ${downloadUrl}...`);
    run(`curl -L -H "Authorization: token ${process.env.GITHUB_TOKEN}" -o "${tarPath}" "${downloadUrl}"`);
  } else {
    downloadUrl = `${MIRROR_BASE}/${BUILD_DATE}/${filename}`;
    console.log(`Downloading from mirror: ${downloadUrl}...`);
    run(`curl -L -o "${tarPath}" "${downloadUrl}"`);
  }

  // Extract to package directory
  const pythonDir = path.join(platformPackageDir, 'python');
  ensureDir(pythonDir);
  
  console.log(`Extracting to ${pythonDir}...`);
  run(`tar -xzf "${tarPath}" -C "${pythonDir}" --strip-components=1`);

  // Replace symlinks with real files (npm publish doesn't preserve symlinks)
  console.log('Replacing symlinks with real files...');
  replaceSymlinks(pythonDir);

  // Build bin entries dynamically from the bin directory
  const binDir = path.join(pythonDir, 'bin');
  const binEntries = {};
  if (fs.existsSync(binDir)) {
    const binFiles = fs.readdirSync(binDir);
    for (const file of binFiles) {
      const filePath = path.join(binDir, file);
      const stat = fs.statSync(filePath);
      // Only include executable files, skip *-config files
      if (stat.isFile() && (stat.mode & 0o111) && !file.endsWith('-config')) {
        binEntries[file] = `python/bin/${file}`;
      }
    }
  }
  console.log(`Found ${Object.keys(binEntries).length} bin entries: ${Object.keys(binEntries).join(', ')}`);

  // Create platform package.json
  const platformPackageJson = {
    name: `${SCOPE}/${platformPackageName}`,
    version: version,
    description: `Prebuilt Python ${PYTHON_VERSION} for ${platform}`,
    os: [os],
    cpu: [cpu],
    main: '',
    bin: binEntries,
    files: ['python'],
    repository: {
      type: 'git',
      url: 'git+https://github.com/xspect-build/packages.git',
    },
    keywords: ['python', 'python3', 'prebuilt', 'binary', os, cpu],
    author: 'xspect-build',
    license: 'MIT',
    bugs: {
      url: 'https://github.com/xspect-build/packages/issues',
    },
    homepage: 'https://github.com/xspect-build/packages#readme',
  };

  writeJson(path.join(platformPackageDir, 'package.json'), platformPackageJson);

  // Clean up temp directory
  fs.rmSync(tempDir, { recursive: true });

  console.log(`\n✅ Built ${platformPackageName} v${version}`);
  console.log(`   Output: ${platformPackageDir}`);
}

// Parse arguments
const args = process.argv.slice(2);
let platform = null;
let release = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--release' && args[i + 1]) {
    release = args[i + 1];
    i++;
  } else if (!args[i].startsWith('-')) {
    platform = args[i];
  }
}

if (!platform || !release) {
  console.log('Usage: node scripts/build-python.js <platform> --release <release>');
  console.log('');
  console.log(`Platforms: ${Object.keys(PLATFORM_MAP).join(', ')}`);
  console.log('');
  console.log('Example:');
  console.log('  node scripts/build-python.js linux-x64 --release 1');
  console.log('  -> Creates package version 3.9.13-install_only.1');
  process.exit(1);
}

buildPythonPackage(platform, release);
