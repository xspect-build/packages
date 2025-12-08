/**
 * Get the path to the patchelf binary
 */
export declare function getPatchelfPath(): string;

/**
 * Check if patchelf is available and executable
 */
export declare function isPatchelfAvailable(): boolean;

/**
 * Get the directory containing the patchelf binary
 */
export declare function getBinDir(): string;

declare const _default: {
  getPatchelfPath: typeof getPatchelfPath;
  isPatchelfAvailable: typeof isPatchelfAvailable;
  getBinDir: typeof getBinDir;
};

export default _default;
