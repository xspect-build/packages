#!/usr/bin/env node

/**
 * Build script to generate platform-specific npm packages from xpack binaries.
 * 
 * Usage:
 *   node scripts/build.js <package-name> [--version <version>]
 * 
 * Example:
 *   node scripts/build.js patchelf --version 0.18.0
 * 
 * This script:
 * 1. Uses xpm to download the xpack binary for each platform
 * 2. Extracts the binary from the xpack
 * 3. Generates platform-specific npm packages
 * 4. Generates the main wrapper package
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Package configurations
const PACKAGES = {
  patchelf: {
    xpackName: '@xpack-dev-tools/patchelf',
    binaries: ['patchelf'],
    platforms: [
      { platform: 'darwin-arm64', os: 'darwin', cpu: 'arm64' },
      { platform: 'darwin-x64', os: 'darwin', cpu: 'x64' },
      { platform: 'linux-arm64', os: 'linux', cpu: 'arm64' },
      { platform: 'linux-arm', os: 'linux', cpu: 'arm' },
      { platform: 'linux-x64', os: 'linux', cpu: 'x64' },
    ],
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

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function buildPackage(packageName, version) {
  const config = PACKAGES[packageName];
  if (!config) {
    console.error(`Unknown package: ${packageName}`);
    console.error(`Available packages: ${Object.keys(PACKAGES).join(', ')}`);
    process.exit(1);
  }

  const distDir = path.join(__dirname, '..', 'dist');
  const tempDir = path.join(__dirname, '..', '.tmp');
  
  // Clean up
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  
  ensureDir(distDir);
  ensureDir(tempDir);

  // Get the xpack version if not specified
  let xpackVersion = version;
  if (!xpackVersion) {
    const npmInfo = runCapture(`npm view ${config.xpackName} version`);
    xpackVersion = npmInfo;
    console.log(`Using latest xpack version: ${xpackVersion}`);
  }

  // Extract base version (e.g., "0.18.0" from "0.18.0-1.1")
  const baseVersion = xpackVersion.split('-')[0];

  console.log(`\nBuilding ${packageName} v${baseVersion} from xpack v${xpackVersion}\n`);

  // Build platform-specific packages
  for (const { platform, os, cpu } of config.platforms) {
    console.log(`\n=== Building for ${platform} ===\n`);
    
    const platformPackageName = `${packageName}-${platform}`;
    const platformPackageDir = path.join(distDir, platformPackageName);
    const platformBinDir = path.join(platformPackageDir, 'bin');
    
    ensureDir(platformBinDir);

    // Create a temp project to install xpack
    const tempProjectDir = path.join(tempDir, platform);
    ensureDir(tempProjectDir);
    
    // Initialize xpm project
    writeJson(path.join(tempProjectDir, 'package.json'), {
      name: `temp-${platform}`,
      version: '1.0.0',
      xpacks: {},
    });

    // Install the xpack using xpm
    // Note: xpm install will download the platform-specific binary
    try {
      run(`xpm install ${config.xpackName}@${xpackVersion} --verbose`, {
        cwd: tempProjectDir,
        env: {
          ...process.env,
          // Force the platform for cross-platform builds
          npm_config_platform: os,
          npm_config_arch: cpu,
        },
      });
    } catch (error) {
      console.error(`Failed to install xpack for ${platform}:`, error.message);
      console.log('Skipping this platform...');
      continue;
    }

    // Find and copy binaries
    const xpackContentDir = path.join(
      tempProjectDir,
      'xpacks',
      config.xpackName.replace('/', '-').replace('@', ''),
      '.content',
      'bin'
    );

    // Alternative path structure
    const altXpackContentDir = path.join(
      tempProjectDir,
      'xpacks',
      '@xpack-dev-tools',
      packageName,
      '.content',
      'bin'
    );

    const binSourceDir = fs.existsSync(xpackContentDir) ? xpackContentDir : altXpackContentDir;

    if (!fs.existsSync(binSourceDir)) {
      console.error(`Binary directory not found: ${xpackContentDir} or ${altXpackContentDir}`);
      console.log('Skipping this platform...');
      continue;
    }

    for (const binary of config.binaries) {
      const srcBin = path.join(binSourceDir, binary);
      const destBin = path.join(platformBinDir, binary);
      
      if (fs.existsSync(srcBin)) {
        copyFile(srcBin, destBin);
        fs.chmodSync(destBin, 0o755);
        console.log(`Copied ${binary} to ${destBin}`);
      } else {
        console.error(`Binary not found: ${srcBin}`);
      }
    }

    // Create platform package.json
    const platformPackageJson = {
      name: `${SCOPE}/${platformPackageName}`,
      version: baseVersion,
      description: `Prebuilt NixOS PatchELF binary for ${platform}`,
      os: [os],
      cpu: [cpu],
      main: '',
      files: ['bin'],
      repository: {
        type: 'git',
        url: 'git+https://github.com/aspect-build/xpack-prebuilt.git',
      },
      keywords: ['xpack', 'nixos', packageName, 'prebuilt', 'binary', os, cpu],
      author: 'aspect-build',
      license: 'MIT',
      bugs: {
        url: 'https://github.com/aspect-build/xpack-prebuilt/issues',
      },
      homepage: 'https://github.com/aspect-build/xpack-prebuilt#readme',
    };

    writeJson(path.join(platformPackageDir, 'package.json'), platformPackageJson);
    console.log(`Created ${platformPackageName}/package.json`);
  }

  // Copy the main wrapper package
  const mainPackageDir = path.join(distDir, packageName);
  const sourcePackageDir = path.join(__dirname, '..', 'packages', packageName);
  
  if (fs.existsSync(sourcePackageDir)) {
    // Copy all files from source package
    fs.cpSync(sourcePackageDir, mainPackageDir, { recursive: true });
    
    // Update version in package.json
    const mainPackageJson = readJson(path.join(mainPackageDir, 'package.json'));
    mainPackageJson.version = baseVersion;
    
    // Update optionalDependencies versions
    if (mainPackageJson.optionalDependencies) {
      for (const dep of Object.keys(mainPackageJson.optionalDependencies)) {
        mainPackageJson.optionalDependencies[dep] = baseVersion;
      }
    }
    
    writeJson(path.join(mainPackageDir, 'package.json'), mainPackageJson);
    console.log(`\nCreated main package ${packageName}/package.json`);
  }

  // Clean up temp directory
  fs.rmSync(tempDir, { recursive: true });

  console.log(`\n✅ Build complete! Packages are in: ${distDir}`);
  console.log('\nTo publish:');
  console.log(`  cd ${distDir}`);
  console.log('  for pkg in */; do cd "$pkg" && npm publish --access public && cd ..; done');
}

// Parse arguments
const args = process.argv.slice(2);
let packageName = null;
let version = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--version' && args[i + 1]) {
    version = args[i + 1];
    i++;
  } else if (!args[i].startsWith('-')) {
    packageName = args[i];
  }
}

if (!packageName) {
  console.log('Usage: node scripts/build.js <package-name> [--version <version>]');
  console.log('');
  console.log('Available packages:');
  for (const name of Object.keys(PACKAGES)) {
    console.log(`  - ${name}`);
  }
  process.exit(1);
}

buildPackage(packageName, version);
