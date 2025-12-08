#!/usr/bin/env node

/**
 * Build a single platform package.
 * This script is designed to run in CI on the target platform.
 * 
 * Usage:
 *   node scripts/build-platform.js <package-name> <platform>
 * 
 * Example:
 *   node scripts/build-platform.js patchelf linux-x64
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Package configurations
const PACKAGES = {
  patchelf: {
    xpackName: '@xpack-dev-tools/patchelf',
    xpackVersion: '0.18.0-1.1',
    binaries: ['patchelf'],
  },
  // Add more packages here as needed
};

const SCOPE = '@xspect-build';

function run(cmd, options = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', ...options });
}

function runCapture(cmd, options = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', ...options }).trim();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(srcPath);
      fs.symlinkSync(linkTarget, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      // Preserve executable permissions
      const stats = fs.statSync(srcPath);
      fs.chmodSync(destPath, stats.mode);
    }
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getMainPackageVersion(packageName) {
  const mainPackageJsonPath = path.join(__dirname, '..', 'packages', packageName, 'package.json');
  if (!fs.existsSync(mainPackageJsonPath)) {
    throw new Error(`Main package not found: ${mainPackageJsonPath}`);
  }
  const packageJson = readJson(mainPackageJsonPath);
  return packageJson.version;
}

async function buildPlatformPackage(packageName, platform) {
  const config = PACKAGES[packageName];
  if (!config) {
    console.error(`Unknown package: ${packageName}`);
    console.error(`Available packages: ${Object.keys(PACKAGES).join(', ')}`);
    process.exit(1);
  }

  // Parse platform
  const [os, cpu] = platform.split('-');
  if (!os || !cpu) {
    console.error(`Invalid platform format: ${platform}`);
    console.error('Expected format: <os>-<cpu> (e.g., linux-x64, darwin-arm64)');
    process.exit(1);
  }

  const distDir = path.join(__dirname, '..', 'dist');
  const tempDir = path.join(__dirname, '..', '.tmp');

  // Clean up
  ensureDir(distDir);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  ensureDir(tempDir);

  // Get version from main package
  const baseVersion = getMainPackageVersion(packageName);
  console.log(`Using version from main package: ${baseVersion}`);

  console.log(`\nBuilding ${packageName} v${baseVersion} for ${platform}\n`);

  const platformPackageName = `${packageName}-${platform}`;
  const platformPackageDir = path.join(distDir, platformPackageName);
  const platformBinDir = path.join(platformPackageDir, 'bin');

  // Clean existing platform package
  if (fs.existsSync(platformPackageDir)) {
    fs.rmSync(platformPackageDir, { recursive: true });
  }
  ensureDir(platformBinDir);

  // Initialize xpm project
  writeJson(path.join(tempDir, 'package.json'), {
    name: 'temp-build',
    version: '1.0.0',
    xpacks: {},
  });

  // Also create xpm init marker
  run(`npx xpm init`, {
    cwd: tempDir,
  });

  // Install the xpack using xpm
  run(`npx xpm install ${config.xpackName}@${config.xpackVersion} --verbose`, {
    cwd: tempDir,
  });

  // Find the binary - try different path patterns
  const possiblePaths = [
    path.join(tempDir, 'xpacks', '@xpack-dev-tools', packageName, '.content', 'bin'),
    path.join(tempDir, 'xpacks', 'xpack-dev-tools-' + packageName, '.content', 'bin'),
  ];

  let binSourceDir = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      binSourceDir = p;
      break;
    }
  }

  if (!binSourceDir) {
    // List what's in xpacks to help debug
    console.log('Contents of xpacks directory:');
    const xpacksDir = path.join(tempDir, 'xpacks');
    if (fs.existsSync(xpacksDir)) {
      run(`find ${xpacksDir} -type d -maxdepth 4`);
    }
    throw new Error(`Binary directory not found. Tried: ${possiblePaths.join(', ')}`);
  }

  console.log(`Found binaries in: ${binSourceDir}`);

  // Copy binaries
  for (const binary of config.binaries) {
    const srcBin = path.join(binSourceDir, binary);
    const destBin = path.join(platformBinDir, binary);

    if (fs.existsSync(srcBin)) {
      copyFile(srcBin, destBin);
      fs.chmodSync(destBin, 0o755);
      console.log(`Copied ${binary} to ${destBin}`);
    } else {
      throw new Error(`Binary not found: ${srcBin}`);
    }
  }

  // Copy libexec directory (contains dynamic libraries)
  const contentDir = path.dirname(binSourceDir); // .content directory
  const libexecSrcDir = path.join(contentDir, 'libexec');
  const libexecDestDir = path.join(platformPackageDir, 'libexec');

  if (fs.existsSync(libexecSrcDir)) {
    copyDir(libexecSrcDir, libexecDestDir);
    console.log(`Copied libexec to ${libexecDestDir}`);
  } else {
    console.log(`No libexec directory found at ${libexecSrcDir}, skipping...`);
  }

  // Create platform package.json
  const platformPackageJson = {
    name: `${SCOPE}/${platformPackageName}`,
    version: baseVersion,
    description: `Prebuilt NixOS PatchELF binary for ${platform}`,
    os: [os],
    cpu: [cpu],
    main: '',
    files: ['bin', 'libexec'],
    repository: {
      type: 'git',
      url: 'git+https://github.com/xspect-build/packages.git',
    },
    keywords: ['xpack', 'nixos', packageName, 'prebuilt', 'binary', os, cpu],
    author: 'xspect-build',
    license: 'MIT',
    bugs: {
      url: 'https://github.com/xspect-build/packages/issues',
    },
    homepage: 'https://github.com/xspect-build/packages#readme',
  };

  writeJson(path.join(platformPackageDir, 'package.json'), platformPackageJson);

  // Write version file for later use
  fs.writeFileSync(path.join(platformPackageDir, '.version'), baseVersion);

  // Clean up temp directory
  fs.rmSync(tempDir, { recursive: true });

  console.log(`\n✅ Built ${platformPackageName} v${baseVersion}`);
  console.log(`   Output: ${platformPackageDir}`);
}

// Parse arguments
const args = process.argv.slice(2);
let packageName = null;
let platform = null;

for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('-')) {
    if (!packageName) {
      packageName = args[i];
    } else if (!platform) {
      platform = args[i];
    }
  }
}

if (!packageName || !platform) {
  console.log('Usage: node scripts/build-platform.js <package-name> <platform>');
  console.log('');
  console.log('Available packages:');
  for (const name of Object.keys(PACKAGES)) {
    console.log(`  - ${name}`);
  }
  console.log('');
  console.log('Platforms: linux-x64, linux-arm64, linux-arm, darwin-x64, darwin-arm64');
  process.exit(1);
}

buildPlatformPackage(packageName, platform);
