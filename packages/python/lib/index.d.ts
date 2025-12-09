import { Archive } from '@napi-rs/tar';

/**
 * Get the platform package name for current platform
 */
export function getPlatformPackageName(): string | null;

/**
 * Download the Python package and return the tar archive
 * @param version - Package version or dist-tag (e.g., 'python3.9.13'), required
 * @returns The tar archive object
 */
export function download(version: string): Archive;

export interface ExtractOptions {
  /**
   * Package version or dist-tag (e.g., 'python3.9.13'), required
   */
  version: string;
}

/**
 * Extract Python to destination directory
 * @param dest - Destination directory (optional, defaults to ~/.xspect-build/python/{version})
 * @param options - Options
 * @returns Path to the Python directory (containing bin, lib, etc.)
 */
export function extract(dest?: string | null, options: ExtractOptions): string;

export interface GetPythonPathOptions {
  /**
   * Package version or dist-tag (e.g., 'python3.9.13'), required
   */
  version: string;
  /**
   * Custom destination directory (optional)
   */
  dest?: string;
}

/**
 * Get Python path, downloading if necessary
 * @param options - Options
 * @returns Path to the Python directory
 */
export function getPythonPath(options: GetPythonPathOptions): string;
