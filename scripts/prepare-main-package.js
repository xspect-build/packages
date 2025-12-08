#!/usr/bin/env node

/**
 * Prepare the main wrapper package after all platform packages are built.
 * This script is designed to run in CI after downloading all platform artifacts.
 * 
 * Usage:
 *   node scripts/prepare-main-package.js <package-name> [--version <version>]
 * 
 * Example:
 *   node scripts/prepare-main-package.js patchelf --version 0.18.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCOPE = '@xspect-build';

const PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm',
  'linux-x64',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function prepareMainPackage(packageName, version) {
  const distDir = path.join(__dirname, '..', 'dist');
  const sourcePackageDir = path.join(__dirname, '..', 'packages', packageName);
  const mainPackageDir = path.join(distDir, packageName);

  // Detect version from platform packages if not specified
  let baseVersion = version;
  if (!baseVersion) {
    for (const platform of PLATFORMS) {
      const versionFile = path.join(distDir, `${packageName}-${platform}`, '.version');
      if (fs.existsSync(versionFile)) {
        baseVersion = fs.readFileSync(versionFile, 'utf-8').trim();
        console.log(`Detected version from ${platform}: ${baseVersion}`);
        break;
      }
    }
  }

  if (!baseVersion) {
    // Fallback: get from npm
    baseVersion = execSync(`npm view @xpack-dev-tools/${packageName} version`, {
      encoding: 'utf-8',
    }).trim().split('-')[0];
    console.log(`Using version from npm: ${baseVersion}`);
  }

  console.log(`\nPreparing main package ${packageName} v${baseVersion}\n`);

  // Clean and create main package dir
  if (fs.existsSync(mainPackageDir)) {
    fs.rmSync(mainPackageDir, { recursive: true });
  }

  // Copy source package
  if (!fs.existsSync(sourcePackageDir)) {
    throw new Error(`Source package not found: ${sourcePackageDir}`);
  }

  fs.cpSync(sourcePackageDir, mainPackageDir, { recursive: true });

  // Update package.json
  const packageJsonPath = path.join(mainPackageDir, 'package.json');
  const packageJson = readJson(packageJsonPath);

  packageJson.version = baseVersion;

  // Update optionalDependencies versions
  if (packageJson.optionalDependencies) {
    for (const dep of Object.keys(packageJson.optionalDependencies)) {
      packageJson.optionalDependencies[dep] = baseVersion;
    }
  }

  writeJson(packageJsonPath, packageJson);

  console.log(`✅ Prepared main package ${packageName} v${baseVersion}`);
  console.log(`   Output: ${mainPackageDir}`);

  // List all packages in dist
  console.log('\nPackages ready for publishing:');
  const packages = fs.readdirSync(distDir).filter(f => {
    const stat = fs.statSync(path.join(distDir, f));
    return stat.isDirectory() && fs.existsSync(path.join(distDir, f, 'package.json'));
  });

  for (const pkg of packages) {
    const pkgJson = readJson(path.join(distDir, pkg, 'package.json'));
    console.log(`  - ${pkgJson.name}@${pkgJson.version}`);
  }
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
  console.log('Usage: node scripts/prepare-main-package.js <package-name> [--version <version>]');
  process.exit(1);
}

prepareMainPackage(packageName, version);
