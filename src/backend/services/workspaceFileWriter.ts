/**
 * SUSI AI — Restricted Workspace File Writer for LEX
 *
 * Enforces strict workspace boundary constraints, path traversal protection,
 * explicit approval gates for existing or sensitive files, and immediate read-back verification.
 */

import path from 'path';
import fs from 'fs';

export interface FileWriteResult {
  path: string;
  relativePath: string;
  success: boolean;
  verified: boolean;
  bytesWritten: number;
  operation: 'created' | 'modified' | 'rejected' | 'failed';
  error?: string;
}

export interface WorkspaceWriteOptions {
  allowOverwrite?: boolean;
  approvalConfirmed?: boolean;
  workspaceRoot?: string;
}

const FORBIDDEN_FILENAMES_OR_PREFIXES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.git',
  '.ssh',
  'node_modules',
  'package-lock.json',
  'id_rsa',
  'id_ed25519',
  'credential',
  'providerVault.ts',
  'desktopAuth.ts',
];

export class WorkspaceFileWriter {
  private readonly defaultWorkspaceRoot: string;

  constructor(customWorkspaceRoot?: string) {
    this.defaultWorkspaceRoot = path.resolve(customWorkspaceRoot || process.cwd());
  }

  /**
   * Validates that target path stays strictly inside workspace boundary and avoids forbidden files.
   */
  public resolveAndValidatePath(
    relativePath: string,
    workspaceRoot = this.defaultWorkspaceRoot
  ): { resolvedPath: string; cleanRelativePath: string } {
    if (!relativePath || typeof relativePath !== 'string') {
      throw new Error('File path must be a non-empty string.');
    }

    // Reject null bytes and illegal control characters
    if (relativePath.includes('\0')) {
      throw new Error('Security violation: Null byte detected in file path.');
    }

    // Verify boundary traversal
    const rootWithSep = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;

    let resolvedPath: string;
    let cleanRelativePath: string;

    if (path.isAbsolute(relativePath)) {
      resolvedPath = path.resolve(relativePath);
      if (!resolvedPath.startsWith(rootWithSep) && resolvedPath !== workspaceRoot) {
        throw new Error(
          `Security violation: Target path "${relativePath}" attempts to traverse outside authorized workspace root "${workspaceRoot}".`
        );
      }
      cleanRelativePath = path.relative(workspaceRoot, resolvedPath);
    } else {
      resolvedPath = path.resolve(workspaceRoot, relativePath);
      if (!resolvedPath.startsWith(rootWithSep) && resolvedPath !== workspaceRoot) {
        throw new Error(
          `Security violation: Target path "${relativePath}" attempts to traverse outside authorized workspace root "${workspaceRoot}".`
        );
      }
      cleanRelativePath = path.relative(workspaceRoot, resolvedPath);
    }

    // Check against protected/forbidden sensitive files
    const baseName = path.basename(resolvedPath).toLowerCase();
    const relativeLower = cleanRelativePath.toLowerCase().replace(/\\/g, '/');

    for (const forbidden of FORBIDDEN_FILENAMES_OR_PREFIXES) {
      if (
        baseName === forbidden.toLowerCase() ||
        baseName.startsWith(`${forbidden.toLowerCase()}.`) ||
        relativeLower.includes(`/${forbidden.toLowerCase()}/`) ||
        relativeLower.startsWith(`${forbidden.toLowerCase()}/`)
      ) {
        throw new Error(
          `Security violation: Access to sensitive file or directory "${forbidden}" is strictly prohibited.`
        );
      }
    }

    return { resolvedPath, cleanRelativePath: cleanRelativePath.replace(/\\/g, '/') };
  }

  /**
   * Safely writes a file to the workspace with read-back verification.
   */
  public async writeFile(
    relativePath: string,
    content: string,
    options: WorkspaceWriteOptions = {}
  ): Promise<FileWriteResult> {
    const workspaceRoot = path.resolve(options.workspaceRoot || this.defaultWorkspaceRoot);

    let resolvedPath: string;
    let cleanRelativePath: string;

    try {
      const validated = this.resolveAndValidatePath(relativePath, workspaceRoot);
      resolvedPath = validated.resolvedPath;
      cleanRelativePath = validated.cleanRelativePath;
    } catch (err: unknown) {
      return {
        path: relativePath,
        relativePath,
        success: false,
        verified: false,
        bytesWritten: 0,
        operation: 'rejected',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const fileExists = fs.existsSync(resolvedPath);

    // If file exists, require explicit approval
    if (fileExists && !options.allowOverwrite && !options.approvalConfirmed) {
      return {
        path: resolvedPath,
        relativePath: cleanRelativePath,
        success: false,
        verified: false,
        bytesWritten: 0,
        operation: 'rejected',
        error: `Explicit user approval is required to overwrite existing file: "${cleanRelativePath}".`,
      };
    }

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(resolvedPath);
      await fs.promises.mkdir(parentDir, { recursive: true });

      // Write content
      await fs.promises.writeFile(resolvedPath, content, 'utf8');

      // Immediate Read-Back Verification
      const readBack = await fs.promises.readFile(resolvedPath, 'utf8');
      if (readBack !== content) {
        return {
          path: resolvedPath,
          relativePath: cleanRelativePath,
          success: false,
          verified: false,
          bytesWritten: 0,
          operation: 'failed',
          error: `Read-back verification failed for "${cleanRelativePath}". Content mismatch on disk.`,
        };
      }

      const bytesWritten = Buffer.byteLength(content, 'utf8');

      return {
        path: resolvedPath,
        relativePath: cleanRelativePath,
        success: true,
        verified: true,
        bytesWritten,
        operation: fileExists ? 'modified' : 'created',
      };
    } catch (err: unknown) {
      return {
        path: resolvedPath,
        relativePath: cleanRelativePath,
        success: false,
        verified: false,
        bytesWritten: 0,
        operation: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const workspaceFileWriter = new WorkspaceFileWriter();
