"use strict";

const fs = require('fs');
const path = require('path');

const platform = process.platform;
const arch = process.arch;

const platformPackageMap = {
  'darwin-arm64': '@xspect-build/patchelf-darwin-arm64',
  'darwin-x64': '@xspect-build/patchelf-darwin-x64',
  'linux-arm64': '@xspect-build/patchelf-linux-arm64',
  'linux-arm': '@xspect-build/patchelf-linux-arm',
  'linux-x64': '@xspect-build/patchelf-linux-x64',
};

function findPackageDir() {
  const platformKey = `${platform}-${arch}`;
  const packageName = platformPackageMap[platformKey];
  
  if (!packageName) {
    return null;
  }

  try {
    const packagePath = require.resolve(`${packageName}/package.json`);
    return path.dirname(packagePath);
  } catch (e) {
    return null;
  }
}

function fixPermissions(dir) {
  if (!fs.existsSync(dir)) return;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixPermissions(fullPath);
    } else if (entry.isFile()) {
      // Make files executable
      try {
        fs.chmodSync(fullPath, 0o755);
      } catch (e) {
        // Ignore permission errors
      }
    }
  }
}

const packageDir = findPackageDir();
if (packageDir) {
  // Fix permissions for bin directory
  const binDir = path.join(packageDir, 'bin');
  fixPermissions(binDir);
  
  // Fix permissions for libexec directory
  const libexecDir = path.join(packageDir, 'libexec');
  fixPermissions(libexecDir);
  
  console.log('@xspect-build/patchelf: Installation complete');
} else {
  console.log('@xspect-build/patchelf: Platform package not found, skipping permission fix');
}
