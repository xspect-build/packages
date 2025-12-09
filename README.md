# @xspect-build/packages

Prebuilt [xPack](https://xpack.github.io/) binaries distributed via npm without requiring `xpm`.

## Why?

xPack provides excellent cross-platform prebuilt binaries for various development tools. However, using them requires installing `xpm` and following a specific workflow. This project repackages xPack binaries as standard npm packages with platform-specific optional dependencies, making them easier to use in:

- CI/CD pipelines
- Projects that don't want to depend on xpm
- npm-based build systems

## Available Packages

| Package | Description | Source |
|---------|-------------|--------|
| `@xspect-build/patchelf` | NixOS PatchELF | `@xpack-dev-tools/patchelf` |
| `@xspect-build/python` | Prebuilt Python | [python-build-standalone](https://github.com/astral-sh/python-build-standalone) |

## Usage

### patchelf

```bash
npm install @xspect-build/patchelf
```

The appropriate binary for your platform will be installed automatically via optional dependencies.

#### Via npx

```bash
npx patchelf --version
```

#### Via package.json scripts

```json
{
  "scripts": {
    "patch-binary": "patchelf --set-rpath '$ORIGIN/../lib' ./my-binary"
  }
}
```

#### Programmatic API

```javascript
const { getPatchelfPath, isPatchelfAvailable, getBinDir } = require('@xspect-build/patchelf');
const { execSync } = require('child_process');

if (isPatchelfAvailable()) {
  const patchelfPath = getPatchelfPath();
  const result = execSync(`${patchelfPath} --version`);
  console.log(result.toString());
}
```

### python

Download and use prebuilt Python binaries from [python-build-standalone](https://github.com/astral-sh/python-build-standalone).

```bash
npm install @xspect-build/python
```

#### Programmatic API

```javascript
const { getPythonPath } = require('@xspect-build/python');
const { execSync } = require('child_process');
const path = require('path');

// Download and extract Python (cached after first run)
const pythonDir = getPythonPath({ version: 'python3.9.13' });

// Get the Python executable
const pythonBin = path.join(pythonDir, 'bin', 'python3');

// Run Python
const result = execSync(`${pythonBin} --version`);
console.log(result.toString()); // Python 3.9.13
```

#### API

- `getPythonPath(options)` - Download and extract Python, returns path to Python directory
  - `options.version` (required) - npm dist-tag (e.g., `'python3.9.13'`)
  - `options.dest` (optional) - Custom destination directory
- `extract(dest, options)` - Extract Python to a specific directory
- `download(version)` - Download and return the tar archive

## Supported Platforms

- **macOS**: x64, arm64 (Apple Silicon)
- **Linux**: x64, arm64, arm

## How It Works

1. The main package (`@xspect-build/patchelf`) has `optionalDependencies` for each platform
2. Each platform package (`@xspect-build/patchelf-linux-x64`, etc.) contains the actual binary
3. When you `npm install`, npm automatically installs only the package matching your platform
4. The main package's bin script delegates to the platform-specific binary

### Package Structure

```
@xspect-build/patchelf              # Main wrapper package
├── bin/patchelf                    # Node.js wrapper script
├── lib/index.js                    # Programmatic API
└── optionalDependencies:
    ├── @xspect-build/patchelf-darwin-arm64
    ├── @xspect-build/patchelf-darwin-x64
    ├── @xspect-build/patchelf-linux-arm64
    ├── @xspect-build/patchelf-linux-arm
    └── @xspect-build/patchelf-linux-x64

@xspect-build/patchelf-<platform>   # Platform-specific package
└── bin/patchelf                    # Native binary
```

## Building Locally

### Prerequisites

- Node.js >= 16
- xpm (`npm install -g xpm`)

### Build for current platform

```bash
node scripts/build-platform.js patchelf linux-x64
```

### Build all platforms (requires each platform or cross-compilation)

The recommended way is to use the GitHub Actions workflow which builds on native runners for each platform.

## Contributing

To add support for a new xPack package:

1. Add the package configuration to `scripts/build-platform.js` in the `PACKAGES` object
2. Create the wrapper package in `packages/<package-name>/`
3. Update the GitHub workflow if needed

## Credits

- [NixOS PatchELF](https://github.com/NixOS/patchelf) - The original patchelf project
- [xPack Dev Tools](https://github.com/xpack-dev-tools) - For providing cross-platform prebuilt binaries
- [xpm](https://xpack.github.io/xpm/) - The xPack Package Manager

## License

MIT License

The binary distributions include the original software licenses. See the upstream projects for details.
