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

function prepareMainPackage(packageName) {
  const distDir = path.join(__dirname, '..', 'dist');
  const sourcePackageDir = path.join(__dirname, '..', 'packages', packageName);
  const mainPackageDir = path.join(distDir, packageName);

  // Read version from main package
  const sourcePackageJson = readJson(path.join(sourcePackageDir, 'package.json'));
  const baseVersion = sourcePackageJson.version;
  console.log(`Using version from main package: ${baseVersion}`);

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

  // Inject optionalDependencies for all platforms
  packageJson.optionalDependencies = {};
  for (const platform of PLATFORMS) {
    packageJson.optionalDependencies[`${SCOPE}/${packageName}-${platform}`] = baseVersion;
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

for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('-')) {
    packageName = args[i];
  }
}

if (!packageName) {
  console.log('Usage: node scripts/prepare-main-package.js <package-name>');
  process.exit(1);
}

prepareMainPackage(packageName);
