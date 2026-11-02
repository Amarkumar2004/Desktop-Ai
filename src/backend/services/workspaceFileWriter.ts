/**
 * SUSI AI — Restricted Workspace File Writer for LEX
 *
 * Enforces strict workspace boundary constraints, realpath & symlink traversal protection,
 * explicit cryptographically bound approval gates for existing files, and immediate read-back verification.
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export interface FileWriteResult {
  path: string;
  relativePath: string;
  success: boolean;
  verified: boolean;
  bytesWritten: number;
  operation: 'created' | 'modified' | 'rejected' | 'failed';
  error?: string;
}

export interface TrustedOverwriteApproval {
  approvalId: string;
  userId?: string | null;
  taskId: string;
  filePath: string;
  operation: 'OVERWRITE';
  issuedAt: number;
  expiresAt: number;
}

export interface WorkspaceWriteOptions {
  workspaceRoot?: string;
  taskId?: string;
  userId?: string | null;
  trustedApproval?: TrustedOverwriteApproval;
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
  private activeApprovals = new Map<string, TrustedOverwriteApproval>();

  constructor(customWorkspaceRoot?: string) {
    this.defaultWorkspaceRoot = path.resolve(customWorkspaceRoot || process.cwd());
  }

  /**
   * Issues a cryptographically unique, time-bound approval token bound to a specific user, task, and file path.
   */
  public issueOverwriteApproval(params: {
    taskId: string;
    filePath: string;
    userId?: string | null;
    ttlMs?: number;
  }): TrustedOverwriteApproval {
    const { taskId, filePath, userId = null, ttlMs = 5 * 60 * 1000 } = params;
    const now = Date.now();
    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const approvalId = `appr_${crypto.randomBytes(16).toString('hex')}`;

    const approval: TrustedOverwriteApproval = {
      approvalId,
      userId,
      taskId,
      filePath: cleanPath,
      operation: 'OVERWRITE',
      issuedAt: now,
      expiresAt: now + ttlMs,
    };

    this.activeApprovals.set(approvalId, approval);
    return approval;
  }

  /**
   * Validates and immediately consumes an approval token (single-use).
   */
  public validateAndConsumeApproval(
    approval: TrustedOverwriteApproval,
    target: { taskId: string; cleanRelativePath: string; userId?: string | null }
  ): { valid: boolean; error?: string } {
    if (!approval || !approval.approvalId) {
      return { valid: false, error: 'Approval token is missing or malformed.' };
    }

    const recorded = this.activeApprovals.get(approval.approvalId);
    if (!recorded) {
      return { valid: false, error: 'Approval token is invalid, unrecognized, or has already been consumed.' };
    }

    // Single-use: remove immediately to prevent reuse
    this.activeApprovals.delete(approval.approvalId);

    // Verify expiration
    if (Date.now() > recorded.expiresAt) {
      return { valid: false, error: 'Approval token has expired.' };
    }

    // Verify task binding
    if (recorded.taskId !== target.taskId) {
      return {
        valid: false,
        error: `Approval token task mismatch: expected "${recorded.taskId}", got "${target.taskId}".`,
      };
    }

    // Verify file path binding (normalized)
    const normalizedRecordedPath = recorded.filePath.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
    const normalizedTargetPath = target.cleanRelativePath.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalizedRecordedPath !== normalizedTargetPath) {
      return {
        valid: false,
        error: `Approval token path mismatch: approved for "${recorded.filePath}", requested for "${target.cleanRelativePath}".`,
      };
    }

    // Verify user binding if specified in approval
    if (recorded.userId && target.userId && recorded.userId !== target.userId) {
      return {
        valid: false,
        error: `Approval token user mismatch: approved by "${recorded.userId}", executed by "${target.userId}".`,
      };
    }

    // Verify operation
    if (recorded.operation !== 'OVERWRITE') {
      return { valid: false, error: 'Approval token is not valid for OVERWRITE operations.' };
    }

    return { valid: true };
  }

  /**
   * Validates that target path stays strictly inside workspace boundary, checking both lexical and real filesystem paths,
   * rejecting symlink traversal escapes and forbidden files.
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

    // Get canonical workspace root resolving any root symlinks
    const canonicalRoot = fs.existsSync(workspaceRoot)
      ? fs.realpathSync(workspaceRoot)
      : path.resolve(workspaceRoot);
    const canonicalRootWithSep = canonicalRoot.endsWith(path.sep) ? canonicalRoot : `${canonicalRoot}${path.sep}`;

    // 1. Lexical Path Resolution
    let resolvedPath: string;
    let cleanRelativePath: string;

    if (path.isAbsolute(relativePath)) {
      resolvedPath = path.resolve(relativePath);
      if (!resolvedPath.startsWith(canonicalRootWithSep) && resolvedPath !== canonicalRoot) {
        throw new Error(
          `Security violation: Target path "${relativePath}" attempts to traverse outside authorized workspace root "${canonicalRoot}".`
        );
      }
      cleanRelativePath = path.relative(canonicalRoot, resolvedPath);
    } else {
      resolvedPath = path.resolve(canonicalRoot, relativePath);
      if (!resolvedPath.startsWith(canonicalRootWithSep) && resolvedPath !== canonicalRoot) {
        throw new Error(
          `Security violation: Target path "${relativePath}" attempts to traverse outside authorized workspace root "${canonicalRoot}".`
        );
      }
      cleanRelativePath = path.relative(canonicalRoot, resolvedPath);
    }

    // 2. Realpath & Symlink Protection:
    // If the file itself exists, check whether it is a symlink or points outside canonical root
    if (fs.existsSync(resolvedPath)) {
      const realTarget = fs.realpathSync(resolvedPath);
      if (!realTarget.startsWith(canonicalRootWithSep) && realTarget !== canonicalRoot) {
        throw new Error(
          `Security violation: Symlink "${relativePath}" points outside authorized workspace root ("${realTarget}").`
        );
      }
      const lstat = fs.lstatSync(resolvedPath);
      if (lstat.isSymbolicLink()) {
        const linkTarget = fs.realpathSync(resolvedPath);
        if (!linkTarget.startsWith(canonicalRootWithSep) && linkTarget !== canonicalRoot) {
          throw new Error(
            `Security violation: Symbolic link "${relativePath}" escapes workspace boundary to "${linkTarget}".`
          );
        }
      }
    }

    // 3. Check ancestor path components for symlink directory escapes
    let ancestor = path.dirname(resolvedPath);
    while (ancestor && ancestor !== canonicalRoot && ancestor !== path.dirname(ancestor)) {
      if (fs.existsSync(ancestor)) {
        const realAncestor = fs.realpathSync(ancestor);
        if (!realAncestor.startsWith(canonicalRootWithSep) && realAncestor !== canonicalRoot) {
          throw new Error(
            `Security violation: Ancestor path "${ancestor}" is a symlink resolving to "${realAncestor}" outside authorized workspace root.`
          );
        }
      }
      ancestor = path.dirname(ancestor);
    }

    // 4. Check against protected/forbidden sensitive files
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
   * Safely writes a file to the workspace with symlink protection, explicit trusted approval for overwrites,
   * and read-back verification.
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

    // If file exists, require explicit trusted approval bound to task and file
    if (fileExists) {
      if (!options.trustedApproval) {
        return {
          path: resolvedPath,
          relativePath: cleanRelativePath,
          success: false,
          verified: false,
          bytesWritten: 0,
          operation: 'rejected',
          error: `Explicit trusted user approval is required to overwrite existing file: "${cleanRelativePath}". Arbitrary task flags are rejected.`,
        };
      }

      const validation = this.validateAndConsumeApproval(options.trustedApproval, {
        taskId: options.taskId || '',
        cleanRelativePath,
        userId: options.userId,
      });

      if (!validation.valid) {
        return {
          path: resolvedPath,
          relativePath: cleanRelativePath,
          success: false,
          verified: false,
          bytesWritten: 0,
          operation: 'rejected',
          error: `Security violation: ${validation.error}`,
        };
      }
    }

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(resolvedPath);
      await fs.promises.mkdir(parentDir, { recursive: true });

      // Write content
      await fs.promises.writeFile(resolvedPath, content, 'utf8');

      // Post-Write Realpath Verification (guards against symlink races during write)
      const canonicalRoot = fs.realpathSync(workspaceRoot);
      const canonicalRootWithSep = canonicalRoot.endsWith(path.sep) ? canonicalRoot : `${canonicalRoot}${path.sep}`;
      const realWritten = fs.realpathSync(resolvedPath);
      if (!realWritten.startsWith(canonicalRootWithSep) && realWritten !== canonicalRoot) {
        // Attempt immediate cleanup of escaped write
        try {
          await fs.promises.unlink(resolvedPath);
        } catch {}
        return {
          path: resolvedPath,
          relativePath: cleanRelativePath,
          success: false,
          verified: false,
          bytesWritten: 0,
          operation: 'failed',
          error: `Security violation: Post-write realpath "${realWritten}" is outside authorized workspace root.`,
        };
      }

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
